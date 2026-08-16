import os
import smtplib
import logging

from email.message import EmailMessage

from dotenv import load_dotenv


load_dotenv()

logger = logging.getLogger(
    "renewai.email"
)


SMTP_HOST = os.getenv(
    "SMTP_HOST",
    "localhost",
)

SMTP_PORT = int(
    os.getenv(
        "SMTP_PORT",
        "1025",
    )
)

SMTP_USERNAME = os.getenv(
    "SMTP_USERNAME"
)

SMTP_PASSWORD = os.getenv(
    "SMTP_PASSWORD"
)

SMTP_USE_TLS = (
    os.getenv(
        "SMTP_USE_TLS",
        "false",
    ).lower()
    == "true"
)

EMAIL_FROM = os.getenv(
    "EMAIL_FROM",
    "renewai@localhost",
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
    subject = (
        f"RenewAI: "
        f"{format_reminder_type(reminder_type)} "
        f"for {vendor_name}"
    )

    message = EmailMessage()

    message["From"] = EMAIL_FROM
    message["To"] = recipient_email
    message["Subject"] = subject

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

    message.set_content(
        body
    )

    try:
        with smtplib.SMTP(
            SMTP_HOST,
            SMTP_PORT,
            timeout=15,
        ) as smtp:

            if SMTP_USE_TLS:
                smtp.starttls()

            if (
                SMTP_USERNAME
                and SMTP_PASSWORD
            ):
                smtp.login(
                    SMTP_USERNAME,
                    SMTP_PASSWORD,
                )

            smtp.send_message(
                message
            )

    except Exception as exc:
    logger.exception(
        "Email send failed. "
        "Host=%s Port=%s Recipient=%s Error=%s",
        SMTP_HOST,
        SMTP_PORT,
        recipient_email,
        exc,
    )

    raise RuntimeError(
        f"Email send failed: {str(exc)}"
    )