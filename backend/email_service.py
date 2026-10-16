import os

import resend
from email.utils import parseaddr

from dotenv import load_dotenv
import gmail_mail


load_dotenv()


RESEND_API_KEY = os.getenv(
    "RESEND_API_KEY"
)

EMAIL_FROM = os.getenv(
    "EMAIL_FROM",
    "RenewAI <onboarding@resend.dev>",
)
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "resend").strip().lower()


def format_reminder_type(
    reminder_type: str
):
    mapping = {
        "90_day":
            "90-day renewal alert",

        "60_day":
            "60-day renewal alert",

        "30_day":
            "30-day renewal alert",

        "14_day":
            "14-day renewal alert",

        "7_day":
            "7-day renewal alert",
    }

    return mapping.get(
        reminder_type,
        reminder_type,
    )


def build_renewal_reminder_payload(
    recipient_email: str,
    vendor_name: str,
    contract_title: str,
    reminder_type: str,
    remind_on: str,
    cancellation_deadline: str | None,
    renewal_date: str | None,
    reminder_id: str | None = None,
):
    subject = (
        f"RenewAI: "
        f"{format_reminder_type(reminder_type)} "
        f"for {vendor_name}"
    )

    body = f"""
RenewAI Renewal Alert

Vendor:
{vendor_name}

Contract:
{contract_title}

Reminder:
{format_reminder_type(reminder_type)}

Reminder Date:
{remind_on}

Cancellation Deadline:
{cancellation_deadline or "Not available"}

Renewal Date:
{renewal_date or "Not available"}

Recommended Action:
Review this contract before the cancellation window closes.

--
RenewAI
Contract Renewal Intelligence
""".strip()

    if EMAIL_PROVIDER not in {"resend", "gmail"}:
        raise RuntimeError("The reminder sender is not configured.")
    if EMAIL_PROVIDER == "gmail" and not gmail_mail.configured():
        raise gmail_mail.GmailNotReady("The Gmail sender is not connected.")
    sender = f"RenewAI <{gmail_mail.configuration()[3]}>" if EMAIL_PROVIDER == "gmail" else EMAIL_FROM
    payload = {"from": sender, "to": [recipient_email], "subject": subject, "text": body}
    if EMAIL_PROVIDER == "gmail":
        payload["_provider"] = "gmail"
    if reminder_id:
        payload["tags"] = [{"name": "renewai_reminder_id", "value": reminder_id}]
    return payload


def sender_uses_test_domain():
    return EMAIL_PROVIDER == "resend" and parseaddr(EMAIL_FROM)[1].lower().endswith("@resend.dev")


def sender_status():
    ready = gmail_mail.configured() if EMAIL_PROVIDER == "gmail" else bool(RESEND_API_KEY) if EMAIL_PROVIDER == "resend" else False
    return {"provider": EMAIL_PROVIDER if EMAIL_PROVIDER in {"gmail", "resend"} else "unavailable",
            "sender_configured": ready}


def send_reminder_payload(payload: dict, idempotency_key: str, *, gmail_prepared=None):
    """Only send a previously reserved, frozen payload with its stable key."""
    if not idempotency_key:
        raise ValueError("A reminder idempotency key is required.")
    provider = payload.get("_provider", "resend")
    if provider == "gmail":
        if not isinstance(gmail_prepared, gmail_mail.PreparedGmail):
            raise RuntimeError("Gmail requires an authorized delivery reservation.")
        return gmail_mail.send(gmail_prepared)
    if provider != "resend" or not RESEND_API_KEY:
        raise RuntimeError("Reminder email provider is not configured.")
    resend.api_key = RESEND_API_KEY
    return resend.Emails.send(payload, options={"idempotency_key": idempotency_key})
