"""Small, content-free workflow signals in the existing hosting logs.

This is best-effort operational telemetry, not an audit ledger or billing source.
No request bodies, raw paths, exception strings or user identifiers are accepted.
"""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
import re
from time import monotonic
from uuid import uuid4


logger = logging.getLogger("renewai.pilot")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.propagate = False

# A fresh mutable dict per request lets sync routes running in a copied thread
# context attach the verified workspace without sharing state between requests.
_context = ContextVar("pilot_context", default=None)
OPERATIONS = {
    ("POST", "/contracts/analyze"): "analyze",
    ("POST", "/contracts/save"): "save",
    ("POST", "/contracts/{contract_id}/ai-insight"): "ai_insight",
    ("PATCH", "/contracts/{contract_id}/decision"): "decision",
    ("GET", "/contracts"): "portfolio",
}
EVENTS = {
    "workflow_request", "pdf_text", "extraction", "contract_saved",
    "decision_saved", "portfolio_loaded", "reminder_generation_failed",
}


def revision():
    value = os.getenv("RENDER_GIT_COMMIT", "")
    return value if re.fullmatch(r"[0-9a-f]{40}", value) else None


def request_reference():
    return (_context.get() or {}).get("request_ref")


def _reference(kind, value):
    return hashlib.sha256(f"renewai-pilot-v1:{kind}:{value}".encode()).hexdigest()[:24]


def identify_workspace(organization_id):
    context = _context.get()
    if context is not None:
        context["workspace_ref"] = _reference("workspace", organization_id)


def emit(event, *, organization_id=None, contract_id=None, operation=None,
         outcome=None, status_code=None, duration_ms=None, decision_recorded=None):
    """Telemetry must never change the outcome of a customer operation."""
    try:
        if event not in EVENTS:
            return
        entry = {
            "schema": "renewai.pilot.v1", "event": event,
            "at": datetime.now(timezone.utc).isoformat(),
            **(_context.get() or {}),
        }
        if revision():
            entry["revision"] = revision()
        if organization_id is not None:
            entry["workspace_ref"] = _reference("workspace", organization_id)
        if contract_id is not None:
            entry["contract_ref"] = _reference("contract", contract_id)
        if operation in OPERATIONS.values():
            entry["operation"] = operation
        if outcome in {"success", "rejected", "failure"}:
            entry["outcome"] = outcome
        if type(status_code) is int and 100 <= status_code <= 599:
            entry["status_code"] = status_code
        if type(duration_ms) is int:
            entry["duration_ms"] = max(0, duration_ms)
        if type(decision_recorded) is bool:
            entry["decision_recorded"] = decision_recorded
        level = logging.WARNING if outcome == "failure" else logging.INFO
        logger.log(level, json.dumps(entry, separators=(",", ":")))
    except Exception:
        # In particular, a log sink failure must not turn a committed save into
        # an uncertain save, or hide an original provider/database failure.
        pass


@contextmanager
def stage(event, organization_id):
    started = monotonic()
    try:
        yield
    except Exception as exc:
        status = getattr(exc, "status_code", 500)
        emit(event, organization_id=organization_id,
             outcome="failure" if status >= 500 else "rejected",
             duration_ms=round((monotonic() - started) * 1000))
        raise
    else:
        emit(event, organization_id=organization_id, outcome="success",
             duration_ms=round((monotonic() - started) * 1000))


def register_pilot_observability(app):
    @app.middleware("http")
    async def workflow_request(request, call_next):
        token = _context.set({"request_ref": uuid4().hex})
        started = monotonic()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            # Public commit identifier lets operators verify Render's revision
            # without credentials or a customer-data request.
            if revision():
                response.headers["X-RenewAI-Revision"] = revision()
            return response
        finally:
            route = getattr(request.scope.get("route"), "path", None)
            # Upload authentication/budget failures occur before routing.
            if route is None and request.method == "POST" and request.url.path.rstrip("/") in {"/contracts/analyze", "/contracts/save"}:
                route = request.url.path.rstrip("/")
            operation = OPERATIONS.get((request.method, route))
            if operation:
                emit("workflow_request", operation=operation, status_code=status,
                     outcome="failure" if status >= 500 else "rejected" if status >= 400 else "success",
                     duration_ms=round((monotonic() - started) * 1000))
            _context.reset(token)
