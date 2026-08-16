import logging
import sys

from reminder_scheduler import (
    process_due_reminders,
)


logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s "
        "%(levelname)s "
        "%(name)s "
        "%(message)s"
    ),
)


logger = logging.getLogger(
    "renewai.reminder_job"
)


def main():
    logger.info(
        "Starting RenewAI due reminder job."
    )

    try:
        process_due_reminders()

    except Exception:
        logger.exception(
            "RenewAI reminder job failed."
        )

        sys.exit(1)

    logger.info(
        "RenewAI due reminder job completed."
    )


if __name__ == "__main__":
    main()