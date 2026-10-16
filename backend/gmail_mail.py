"""Send through one operator-authorized Gmail mailbox over HTTPS, never SMTP."""
import base64
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import parseaddr
import hashlib
import os
import re
from threading import Lock
import time

import requests

SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
ALLOWED_SCOPES = {SEND_SCOPE, "openid", "email", "https://www.googleapis.com/auth/userinfo.email"}
TOKEN_URL = "https://oauth2.googleapis.com/token"
IDENTITY_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
_token_lock = Lock()
_cached_token = None


class GmailNotReady(RuntimeError):
    """A friendly pre-dispatch error; never retain Google response text."""


@dataclass(frozen=True, repr=False)
class PreparedGmail:
    token: str
    raw: str


def configuration():
    return tuple(os.getenv(name, "").strip() for name in (
        "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_SENDER_ADDRESS"))


def configured():
    values = configuration()
    return all(values) and bool(re.fullmatch(r"[^\s<>@]+@[^\s<>@]+", values[3]))


def _access_token():
    global _cached_token
    config = configuration()
    if not configured():
        raise GmailNotReady("The Gmail sender is not connected. Ask the service administrator to complete setup.")
    with _token_lock:
        if _cached_token and _cached_token[0] == config and time.monotonic() < _cached_token[2]:
            return _cached_token[1]
        try:
            response = requests.post(TOKEN_URL, data={
                "client_id": config[0], "client_secret": config[1],
                "refresh_token": config[2], "grant_type": "refresh_token",
            }, timeout=(5, 20), allow_redirects=False)
            if response.status_code != 200:
                raise ValueError("Token refresh rejected")
            data = response.json()
            token = data["access_token"]
            lifetime = int(data["expires_in"])
            if not isinstance(token, str) or not token or lifetime <= 60:
                raise ValueError("Invalid token response")
            scopes = set(data.get("scope", "").split())
            if SEND_SCOPE not in scopes or not scopes.issubset(ALLOWED_SCOPES):
                raise ValueError("Send permission missing")
            identity = requests.get(IDENTITY_URL, headers={"Authorization": f"Bearer {token}"},
                                    timeout=(5, 20), allow_redirects=False)
            if identity.status_code != 200:
                raise ValueError("Sender identity unavailable")
            account = identity.json()
            if account.get("email_verified") is not True or account.get("email", "").lower() != config[3].lower():
                raise ValueError("Sender does not match authorized account")
        except Exception:
            raise GmailNotReady("The Gmail connection could not be verified. Ask the service administrator to reconnect it.") from None
        _cached_token = (config, token, time.monotonic() + min(lifetime - 60, 3000))
        return token


def prepare(payload, idempotency_key):
    """Complete auth and MIME validation before reserving the single send attempt."""
    expected = configuration()[3].lower()
    if parseaddr(payload.get("from", ""))[1].lower() != expected or not expected:
        raise GmailNotReady("The saved Gmail sender has changed. This delivery needs administrator review.")
    try:
        if not isinstance(payload["to"], list) or len(payload["to"]) != 1:
            raise ValueError("One recipient required")
        message = EmailMessage()
        message["From"] = payload["from"]
        message["To"] = payload["to"][0]
        message["Subject"] = payload["subject"]
        event = hashlib.sha256(idempotency_key.encode()).hexdigest()
        message["Message-ID"] = f"<renewai-{event}@{expected.split('@')[1]}>"
        message["X-RenewAI-Event"] = event
        message.set_content(payload["text"])
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    except Exception:
        raise GmailNotReady("This reminder could not be prepared for email delivery.") from None
    return PreparedGmail(token=_access_token(), raw=raw)


def send(prepared):
    """Exactly one HTTP attempt. The dispatcher journals authorization first."""
    try:
        response = requests.post(SEND_URL, headers={"Authorization": f"Bearer {prepared.token}"},
                                 json={"raw": prepared.raw}, timeout=(5, 30), allow_redirects=False)
        if response.status_code != 200:
            raise ValueError("Gmail did not confirm acceptance")
        provider_id = response.json().get("id")
        if not isinstance(provider_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", provider_id):
            raise ValueError("Invalid Gmail acceptance receipt")
        return {"id": f"gmail:{provider_id}"}
    except Exception:
        raise RuntimeError("Gmail delivery is unconfirmed. Check the sender's Sent folder before sending again.") from None
