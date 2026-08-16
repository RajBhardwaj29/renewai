import os

import resend

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


def send_renewal_reminder_email(
    recipient_email: str,
    vendor_name: str,
    contract_title: str,
    reminder_type: str,
    remind_on: str,
    cancellation_deadline: str | None,
    renewal_date: str | None,
):
    if not RESEND_API_KEY:
        raise RuntimeError(
            "RESEND_API_KEY is missing."
        )

    resend.api_key = (
        RESEND_API_KEY
    )

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

    try:
        response = resend.Emails.send(
            {
                "from":
                    EMAIL_FROM,

                "to": [
                    recipient_email
                ],

                "subject":
                    subject,

                "text":
                    body,
            }
        )

        return response

    except Exception as exc:
        raise RuntimeError(
            f"Email send failed: {str(exc)}"
        )