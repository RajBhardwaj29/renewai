"""Bound upload work before FastAPI's multipart parser touches the body."""
import asyncio
import re

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from latency_observability import latency_stage

MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = 12 * 1024 * 1024  # Includes multipart fields and framing.
MAX_PDF_PAGES = 200
MAX_TEXT_CHARACTERS = 500_000
MAX_REVIEW_JSON_BYTES = 128 * 1024
UPLOAD_TIMEOUT_SECONDS = 30


class PrivateResponseHeaders:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        async def private_send(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "private, no-store"
                headers["X-Content-Type-Options"] = "nosniff"
            await send(message)

        await self.app(scope, receive, private_send if scope["type"] == "http" else send)


class ContractUploadGuard:
    """Authenticate once and bound even chunked/misdeclared requests.

    Buffer at most the request budget, then replay to the normal multipart
    parser. This intentionally trades a bounded copy for stopping unbounded
    temporary-file writes before routing/dependency resolution. Hosting ingress
    still needs its own connection/concurrency and request limits.
    """
    def __init__(self, app, authenticate, authorize_assistant=None):
        self.app, self.authenticate = app, authenticate
        self.authorize_assistant = authorize_assistant

    async def __call__(self, scope, receive, send):
        assistant = (re.fullmatch(r"/contracts/([^/]+)/ask/?", scope.get("path", ""))
                     if scope["type"] == "http" else None)
        if (scope["type"] != "http" or scope["method"] != "POST"
                or (not assistant and scope["path"].rstrip("/") not in {"/contracts/analyze", "/contracts/save"})):
            return await self.app(scope, receive, send)

        async def reject(status, detail):
            await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)

        headers = Headers(scope=scope)
        try:
            context = await run_in_threadpool(self.authenticate, headers.get("authorization"))
            if assistant:
                if self.authorize_assistant is None:
                    raise HTTPException(503, "Ask RenewAI is unavailable.")
                contract = await run_in_threadpool(self.authorize_assistant, context, assistant[1])
                scope.setdefault("state", {})["assistant_contract"] = contract
        except HTTPException as exc:
            return await reject(exc.status_code, exc.detail if exc.status_code < 500
                                else "RenewAI is temporarily unavailable. Please try again.")
        except Exception:
            return await reject(503, "RenewAI is temporarily unavailable. Please try again.")

        if headers.get("content-encoding", "identity").lower() != "identity":
            return await reject(415, "Upload an uncompressed multipart PDF request.")
        declared = headers.get("content-length")
        if declared is not None:
            if not declared.isascii() or not declared.isdecimal():
                return await reject(400, "Invalid upload length.")
            # Bound decimal length before converting an attacker-supplied int.
            if len(declared) > 10 or int(declared) > MAX_REQUEST_BYTES:
                return await reject(413, "Upload request exceeds the 12 MiB limit.")

        body = bytearray()
        try:
            with latency_stage("upload_receive"):
                async with asyncio.timeout(UPLOAD_TIMEOUT_SECONDS):
                    while True:
                        message = await receive()
                        if message["type"] == "http.disconnect":
                            return
                        chunk = message.get("body", b"")
                        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                            return await reject(413, "Upload request exceeds the 12 MiB limit.")
                        body.extend(chunk)
                        if not message.get("more_body", False):
                            break
        except TimeoutError:
            return await reject(408, "Upload took too long. Please try again.")

        scope.setdefault("state", {})["contract_upload_context"] = context
        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
