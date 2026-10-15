import os

import resend
from email.utils import parseaddr

from dotenv import load_dotenv


load_dotenv()


RESEND_API_KEY = os.getenv(
    "RESEND_API_KEY"
)

EMAIL_FROM = os.getenv(
    "EMAIL_FROM",
    "RenewAI <onboarding@resend.dev>",
)


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

    payload = {"from": EMAIL_FROM, "to": [recipient_email], "subject": subject, "text": body}
    if reminder_id:
        payload["tags"] = [{"name": "renewai_reminder_id", "value": reminder_id}]
    return payload


def sender_uses_test_domain():
    return parseaddr(EMAIL_FROM)[1].lower().endswith("@resend.dev")


def send_reminder_payload(payload: dict, idempotency_key: str):
    """Only send a previously reserved, frozen payload with its stable key."""
    if not RESEND_API_KEY:
        raise RuntimeError("Reminder email provider is not configured.")
    if not idempotency_key:
        raise ValueError("A reminder idempotency key is required.")
    resend.api_key = RESEND_API_KEY
    return resend.Emails.send(payload, options={"idempotency_key": idempotency_key})
