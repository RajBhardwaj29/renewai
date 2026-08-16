import logging

from apscheduler.schedulers.background import (
    BackgroundScheduler,
)

from database import (
    supabase,
    get_pending_due_reminders_for_delivery,
    mark_reminder_sent,
)

from email_service import (
    send_renewal_reminder_email,
)


logger = logging.getLogger(
    "renewai.reminder_scheduler"
)


scheduler = BackgroundScheduler()


def process_due_reminders():
    """
    Process pending due reminders for
    every organization.

    This runs automatically from the scheduler.
    """

    logger.info(
        "Checking for due RenewAI reminders..."
    )

    try:
        organizations_response = (
            supabase
            .table("organizations")
            .select("id")
            .execute()
        )

        organizations = (
            organizations_response.data
            or []
        )

    except Exception as exc:
        logger.exception(
            "Could not load organizations: %s",
            exc,
        )

        return


    for organization in organizations:

        organization_id = (
            organization["id"]
        )

        try:
            reminders = (
                get_pending_due_reminders_for_delivery(
                    organization_id
                )
            )

        except Exception as exc:
            logger.exception(
                "Could not load reminders for "
                "organization %s: %s",
                organization_id,
                exc,
            )

            continue


        if not reminders:
            continue


        try:
            members_response = (
                supabase
                .table("organization_members")
                .select("user_id, role")
                .eq(
                    "organization_id",
                    organization_id
                )
                .execute()
            )

            members = (
                members_response.data
                or []
            )

        except Exception as exc:
            logger.exception(
                "Could not load members for "
                "organization %s: %s",
                organization_id,
                exc,
            )

            continue


        if not members:
            logger.warning(
                "Organization %s has no members.",
                organization_id,
            )

            continue


        # MVP:
        # send reminder to organization owner first
        owner = next(
            (
                member
                for member in members
                if member.get("role") == "owner"
            ),
            members[0],
        )


        user_id = (
            owner["user_id"]
        )


        try:
            user_response = (
                supabase.auth.admin.get_user_by_id(
                    user_id
                )
            )

            user = (
                user_response.user
            )

            recipient_email = (
                user.email
                if user
                else None
            )

        except Exception as exc:
            logger.exception(
                "Could not load user %s: %s",
                user_id,
                exc,
            )

            continue


        if not recipient_email:
            logger.warning(
                "User %s has no email.",
                user_id,
            )

            continue


        for reminder in reminders:

            contract = (
                reminder.get("contracts")
                or {}
            )


            vendor_name = (
                contract.get("vendor_name")
                or "Unknown Vendor"
            )


            contract_title = (
                contract.get("contract_title")
                or "Contract"
            )


            try:
                send_renewal_reminder_email(
                    recipient_email=
                        recipient_email,

                    vendor_name=
                        vendor_name,

                    contract_title=
                        contract_title,

                    reminder_type=
                        reminder[
                            "reminder_type"
                        ],

                    remind_on=
                        reminder[
                            "remind_on"
                        ],

                    cancellation_deadline=
                        contract.get(
                            "cancellation_deadline"
                        ),

                    renewal_date=
                        contract.get(
                            "effective_renewal_date"
                        ),
                )


                mark_reminder_sent(
                    organization_id,
                    reminder["id"],
                )


                logger.info(
                    "Sent %s reminder for %s "
                    "to %s",
                    reminder[
                        "reminder_type"
                    ],
                    vendor_name,
                    recipient_email,
                )


            except Exception as exc:

                logger.exception(
                    "Failed sending reminder "
                    "%s: %s",
                    reminder["id"],
                    exc,
                )


def start_reminder_scheduler():
    """
    Start automatic reminder processing.

    Development setting:
    check once every hour.
    """

    if scheduler.running:
        return


    scheduler.add_job(
        process_due_reminders,

        trigger="interval",

        hours=1,

        id="renewai_due_reminders",

        replace_existing=True,

        max_instances=1,
    )


    scheduler.start()


    logger.info(
        "RenewAI reminder scheduler started."
    )


def stop_reminder_scheduler():

    if scheduler.running:

        scheduler.shutdown(
            wait=False
        )


        logger.info(
            "RenewAI reminder scheduler stopped."
        )