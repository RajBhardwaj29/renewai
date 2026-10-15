"""Cron processing and the optional development scheduler share one safe dispatcher."""
import logging
from datetime import datetime, timezone
from uuid import uuid4

from apscheduler.schedulers.background import BackgroundScheduler
import database
from reminder_delivery import deliver_due_reminders

logger = logging.getLogger("renewai.reminder_scheduler")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
logger.propagate = False
scheduler = BackgroundScheduler()


def finish_run_summary(summary, started_at):
    finished_at = datetime.now(timezone.utc)
    summary.update(finished_at=finished_at.isoformat(), duration_ms=int((finished_at-started_at).total_seconds()*1000))
    if summary["status"] != "failed" and (summary["failed"] or summary["processing_errors"]):
        summary["status"] = "partial"
    logger.info(
        "REMINDER_RUN_COMPLETE run_id=%s status=%s organizations_checked=%s organizations_with_due=%s "
        "reminders_found=%s sent=%s failed=%s skipped=%s in_progress=%s needs_review=%s processing_errors=%s duration_ms=%s",
        summary["run_id"], summary["status"], summary["organizations_checked"], summary["organizations_with_due_reminders"],
        summary["reminders_found"], summary["sent"], summary["failed"], summary["skipped"], summary["in_progress"],
        summary["needs_review"], summary["processing_errors"], summary["duration_ms"],
    )
    return summary


def process_due_reminders():
    started_at = datetime.now(timezone.utc)
    summary = {"run_id": uuid4().hex[:12], "status": "success", "started_at": started_at.isoformat(),
               "finished_at": None, "duration_ms": 0, "organizations_checked": 0,
               "organizations_with_due_reminders": 0, "reminders_found": 0,
               "sent": 0, "failed": 0, "skipped": 0, "in_progress": 0, "needs_review": 0, "processing_errors": 0}
    logger.info("REMINDER_RUN_START run_id=%s", summary["run_id"])
    try:
        organizations = database.supabase.table("organizations").select("id").execute().data or []
    except Exception as exc:
        summary.update(status="failed", processing_errors=1)
        logger.warning("REMINDER_RUN_ERROR run_id=%s stage=load_organizations error_type=%s", summary["run_id"], type(exc).__name__)
        return finish_run_summary(summary, started_at)
    for organization in organizations:
        organization_id = organization["id"]
        summary["organizations_checked"] += 1
        try:
            result = deliver_due_reminders(organization_id, summary["run_id"])
            summary["organizations_with_due_reminders"] += result["due_found"] > 0
            summary["reminders_found"] += result["due_found"]
            for source, target in (("sent_count", "sent"), ("failed_count", "failed"), ("skipped_count", "skipped"),
                                   ("in_progress_count", "in_progress"), ("needs_review_count", "needs_review"),
                                   ("processing_errors", "processing_errors")):
                summary[target] += result[source]
        except Exception as exc:
            summary["processing_errors"] += 1
            logger.warning("REMINDER_ORG_ERROR run_id=%s organization_id=%s error_type=%s",
                           summary["run_id"], organization_id, type(exc).__name__)
    return finish_run_summary(summary, started_at)


def start_reminder_scheduler():
    """Development fallback only; production keeps ENABLE_REMINDER_SCHEDULER=false."""
    if scheduler.running:
        return
    scheduler.add_job(process_due_reminders, trigger="interval", hours=1,
                      id="renewai_due_reminders", replace_existing=True, max_instances=1)
    scheduler.start()
    logger.info("REMINDER_SCHEDULER_STARTED interval_hours=1")


def stop_reminder_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("REMINDER_SCHEDULER_STOPPED")
