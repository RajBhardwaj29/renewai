"""Content-free stage timings correlated with existing workflow request logs."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
from time import monotonic

from pilot_observability import request_reference, revision

logger = logging.getLogger("renewai.latency")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.propagate = False

STAGES = frozenset({
    "auth_verify", "workspace_lookup", "duplicate_lookup", "portfolio_read",
    "contract_write", "reminder_generation", "upload_receive", "ai_insight",
})


@contextmanager
def latency_stage(name):
    started = monotonic()
    outcome = "success"
    try:
        yield
    except BaseException:
        outcome = "failure"
        raise
    finally:
        try:
            if name in STAGES:
                entry = {
                    "schema": "renewai.latency.v1", "stage": name,
                    "at": datetime.now(timezone.utc).isoformat(),
                    "duration_ms": max(0, round((monotonic() - started) * 1000)),
                    "outcome": outcome,
                }
                if request_reference():
                    entry["request_ref"] = request_reference()
                if revision():
                    entry["revision"] = revision()
                logger.info(json.dumps(entry, separators=(",", ":")))
        except Exception:
            # A logging failure must never hide a failed request or turn a
            # confirmed database write into an uncertain response.
            pass
