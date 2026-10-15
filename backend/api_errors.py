"""Public API errors contain recovery guidance, never exception/provider text."""
import logging

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


logger = logging.getLogger("renewai.api")


def temporary_failure(request: Request, exc: Exception, status_code: int = 500):
    route = getattr(request.scope.get("route"), "path", "unknown")
    cause = exc.__cause__ or exc.__context__ or exc
    logger.warning("API request failed", extra={
        "operation": route, "status_code": status_code,
        "error_type": type(cause).__name__,
    })
    message = "RenewAI is temporarily unavailable. Please try again."
    code = "service_unavailable"
    retryable = request.method in {"GET", "HEAD"}
    if route == "/contracts/analyze":
        message = "We couldn't analyze this PDF right now. Please try again."
    elif route == "/contracts/save":
        message = ("We couldn't confirm whether your contract was saved. "
                   "Check Contracts before trying again.")
        code = "save_status_unknown"
    elif route == "/contracts/{contract_id}":
        message = "We couldn't load this contract right now. Please try again."
    elif route == "/contracts/{contract_id}/summary.pdf":
        message = "We couldn't generate this summary right now. Please try again."
    elif route == "/contracts/{contract_id}/ai-insight":
        message = "AI analysis is temporarily unavailable. Your contract is saved. Please retry AI analysis."
        retryable = True
    return JSONResponse(status_code=status_code, content={
        "detail": message, "code": code, "retryable": retryable,
    })


def register_error_handlers(app):
    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        if exc.status_code >= 500:
            return temporary_failure(request, exc, exc.status_code)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail},
                            headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _exc: RequestValidationError):
        # Pydantic's default response may echo private input values.
        return JSONResponse(status_code=422, content={
            "detail": "Some details are missing or invalid. Review them and try again.",
            "code": "invalid_request", "retryable": False,
        })

    @app.middleware("http")
    async def unexpected_error(request: Request, call_next):
        # Inside CORS, so even unexpected dependency failures remain readable
        # by the browser. Do not re-raise private exception text into access logs.
        try:
            return await call_next(request)
        except Exception as exc:
            return temporary_failure(request, exc)
