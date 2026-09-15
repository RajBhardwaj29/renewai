import logging

from datetime import (
    datetime,
    timezone,
)

from uuid import uuid4

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


# =========================================================
# LOGGING
# =========================================================


logger = logging.getLogger(
    "renewai.reminder_scheduler"
)

logger.setLevel(
    logging.INFO
)


# Ensure reminder logs are visible in Render even when
# the application logging configuration does not include
# this custom logger.
if not logger.handlers:

    handler = logging.StreamHandler()

    handler.setLevel(
        logging.INFO
    )

    handler.setFormatter(
        logging.Formatter(
            (
                "%(asctime)s "
                "%(levelname)s "
                "%(name)s "
                "%(message)s"
            )
        )
    )

    logger.addHandler(
        handler
    )


logger.propagate = False


scheduler = BackgroundScheduler()


# =========================================================
# HELPERS
# =========================================================


def finish_run_summary(
    summary: dict,
    started_at: datetime,
):
    finished_at = (
        datetime.now(
            timezone.utc
        )
    )

    duration_ms = int(
        (
            finished_at
            -
            started_at
        ).total_seconds()
        * 1000
    )

    summary[
        "finished_at"
    ] = finished_at.isoformat()

    summary[
        "duration_ms"
    ] = duration_ms


    if (
        summary["status"]
        != "failed"
        and (
            summary["failed"] > 0
            or
            summary["processing_errors"] > 0
        )
    ):
        summary[
            "status"
        ] = "partial"


    logger.info(
        (
            "REMINDER_RUN_COMPLETE "
            "run_id=%s "
            "status=%s "
            "organizations_checked=%s "
            "organizations_with_due=%s "
            "reminders_found=%s "
            "sent=%s "
            "failed=%s "
            "processing_errors=%s "
            "duration_ms=%s"
        ),
        summary["run_id"],
        summary["status"],
        summary["organizations_checked"],
        summary["organizations_with_due_reminders"],
        summary["reminders_found"],
        summary["sent"],
        summary["failed"],
        summary["processing_errors"],
        summary["duration_ms"],
    )

    return summary


# =========================================================
# PROCESS DUE REMINDERS
# =========================================================


def process_due_reminders():
    """
    Process pending due reminders for every organization.

    Returns a structured summary so scheduled runs can be
    observed through both API responses and production logs.
    """

    started_at = (
        datetime.now(
            timezone.utc
        )
    )

    run_id = (
        uuid4()
        .hex[:12]
    )


    summary = {
        "run_id":
            run_id,

        "status":
            "success",

        "started_at":
            started_at.isoformat(),

        "finished_at":
            None,

        "duration_ms":
            0,

        "organizations_checked":
            0,

        "organizations_with_due_reminders":
            0,

        "reminders_found":
            0,

        "sent":
            0,

        "failed":
            0,

        "processing_errors":
            0,
    }


    logger.info(
        (
            "REMINDER_RUN_START "
            "run_id=%s"
        ),
        run_id,
    )


    # -----------------------------------------------------
    # Load organizations
    # -----------------------------------------------------

    try:

        organizations_response = (
            supabase
            .table(
                "organizations"
            )
            .select(
                "id"
            )
            .execute()
        )


        organizations = (
            organizations_response.data
            or []
        )


    except Exception as exc:

        summary[
            "status"
        ] = "failed"

        summary[
            "processing_errors"
        ] += 1


        logger.exception(
            (
                "REMINDER_RUN_ERROR "
                "run_id=%s "
                "stage=load_organizations "
                "error=%s"
            ),
            run_id,
            exc,
        )


        return finish_run_summary(
            summary,
            started_at,
        )


    # -----------------------------------------------------
    # Process each organization
    # -----------------------------------------------------

    for organization in organizations:

        organization_id = (
            organization[
                "id"
            ]
        )


        summary[
            "organizations_checked"
        ] += 1


        # -------------------------------------------------
        # Load due reminders
        # -------------------------------------------------

        try:

            reminders = (
                get_pending_due_reminders_for_delivery(
                    organization_id
                )
            )


        except Exception as exc:

            summary[
                "processing_errors"
            ] += 1


            logger.exception(
                (
                    "REMINDER_ORG_ERROR "
                    "run_id=%s "
                    "organization_id=%s "
                    "stage=load_reminders "
                    "error=%s"
                ),
                run_id,
                organization_id,
                exc,
            )


            continue


        if not reminders:
            continue


        summary[
            "organizations_with_due_reminders"
        ] += 1

        summary[
            "reminders_found"
        ] += len(
            reminders
        )


        # -------------------------------------------------
        # Find organization owner
        # -------------------------------------------------

        try:

            members_response = (
                supabase
                .table(
                    "organization_members"
                )
                .select(
                    "user_id, role"
                )
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

            summary[
                "failed"
            ] += len(
                reminders
            )

            summary[
                "processing_errors"
            ] += 1


            logger.exception(
                (
                    "REMINDER_ORG_ERROR "
                    "run_id=%s "
                    "organization_id=%s "
                    "stage=load_members "
                    "reminders_affected=%s "
                    "error=%s"
                ),
                run_id,
                organization_id,
                len(reminders),
                exc,
            )


            continue


        if not members:

            summary[
                "failed"
            ] += len(
                reminders
            )


            logger.warning(
                (
                    "REMINDER_ORG_SKIPPED "
                    "run_id=%s "
                    "organization_id=%s "
                    "reason=no_members "
                    "reminders_affected=%s"
                ),
                run_id,
                organization_id,
                len(reminders),
            )


            continue


        owner = next(
            (
                member
                for member
                in members
                if (
                    member.get(
                        "role"
                    )
                    ==
                    "owner"
                )
            ),
            members[0],
        )


        user_id = (
            owner[
                "user_id"
            ]
        )


        # -------------------------------------------------
        # Load recipient
        # -------------------------------------------------

        try:

            user_response = (
                supabase
                .auth
                .admin
                .get_user_by_id(
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

            summary[
                "failed"
            ] += len(
                reminders
            )

            summary[
                "processing_errors"
            ] += 1


            logger.exception(
                (
                    "REMINDER_ORG_ERROR "
                    "run_id=%s "
                    "organization_id=%s "
                    "stage=load_recipient "
                    "reminders_affected=%s "
                    "error=%s"
                ),
                run_id,
                organization_id,
                len(reminders),
                exc,
            )


            continue


        if not recipient_email:

            summary[
                "failed"
            ] += len(
                reminders
            )


            logger.warning(
                (
                    "REMINDER_ORG_SKIPPED "
                    "run_id=%s "
                    "organization_id=%s "
                    "reason=no_recipient_email "
                    "reminders_affected=%s"
                ),
                run_id,
                organization_id,
                len(reminders),
            )


            continue


        # -------------------------------------------------
        # Send reminders
        # -------------------------------------------------

        for reminder in reminders:

            contract = (
                reminder.get(
                    "contracts"
                )
                or {}
            )


            vendor_name = (
                contract.get(
                    "vendor_name"
                )
                or
                "Unknown Vendor"
            )


            contract_title = (
                contract.get(
                    "contract_title"
                )
                or
                "Contract"
            )


            reminder_id = (
                reminder[
                    "id"
                ]
            )


            reminder_type = (
                reminder[
                    "reminder_type"
                ]
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
                        reminder_type,

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


                updated_reminder = (
                    mark_reminder_sent(
                        organization_id,
                        reminder_id,
                    )
                )


                if not updated_reminder:

                    raise RuntimeError(
                        (
                            "Email was sent but "
                            "reminder status could "
                            "not be updated."
                        )
                    )


                summary[
                    "sent"
                ] += 1


                logger.info(
                    (
                        "REMINDER_SENT "
                        "run_id=%s "
                        "organization_id=%s "
                        "reminder_id=%s "
                        "reminder_type=%s "
                        "vendor=%s"
                    ),
                    run_id,
                    organization_id,
                    reminder_id,
                    reminder_type,
                    vendor_name,
                )


            except Exception as exc:

                summary[
                    "failed"
                ] += 1


                logger.exception(
                    (
                        "REMINDER_SEND_FAILED "
                        "run_id=%s "
                        "organization_id=%s "
                        "reminder_id=%s "
                        "reminder_type=%s "
                        "vendor=%s "
                        "error=%s"
                    ),
                    run_id,
                    organization_id,
                    reminder_id,
                    reminder_type,
                    vendor_name,
                    exc,
                )


    return finish_run_summary(
        summary,
        started_at,
    )


# =========================================================
# BACKGROUND SCHEDULER
# =========================================================


def start_reminder_scheduler():
    """
    Start automatic reminder processing.

    Development fallback:
    check once every hour.

    Production delivery is also triggered externally by
    Supabase Cron.
    """

    if scheduler.running:
        return


    scheduler.add_job(
        process_due_reminders,

        trigger=
            "interval",

        hours=
            1,

        id=
            "renewai_due_reminders",

        replace_existing=
            True,

        max_instances=
            1,
    )


    scheduler.start()


    logger.info(
        "REMINDER_SCHEDULER_STARTED interval_hours=1"
    )


def stop_reminder_scheduler():

    if scheduler.running:

        scheduler.shutdown(
            wait=False
        )


        logger.info(
            "REMINDER_SCHEDULER_STOPPED"
        )