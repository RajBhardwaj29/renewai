"""Bounded recovery for read-only chat inference; never log prompts or errors."""
import json
import logging
import time

from groq import APIConnectionError, APIStatusError

logger = logging.getLogger(__name__)


class ChatProviderUnavailable(RuntimeError):
    pass


def completion(client, *, stage, **kwargs):
    for attempt in range(2):
        try:
            return client.chat.completions.create(**kwargs)
        except (APIConnectionError, APIStatusError) as exc:
            status = getattr(exc, "status_code", None)
            body = getattr(exc, "body", None)
            error = body.get("error", body) if isinstance(body, dict) else {}
            code = error.get("code") if isinstance(error, dict) else None
            recoverable = (isinstance(exc, APIConnectionError) or status in (408, 429)
                           or (isinstance(status, int) and status >= 500)
                           or (status == 400 and code == "json_validate_failed"))
            # Fixed stage names and exception classes only: no exception strings,
            # provider bodies, contract text, questions, identifiers or secrets.
            logger.warning(json.dumps({"event": "chat_provider_failure", "stage": stage,
                "error_type": type(exc).__name__, "status": status,
                "attempt": attempt + 1, "recoverable": recoverable}))
            if not recoverable:
                raise
            if attempt == 1:
                raise ChatProviderUnavailable("Chat inference unavailable") from None
            time.sleep(0.25)
