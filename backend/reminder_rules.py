"""Shared delivery eligibility. Calendar checks use UTC, matching Cron."""
from datetime import date, datetime, timedelta, timezone

REMINDER_OFFSETS = {"90_day": 90, "60_day": 60, "30_day": 30, "14_day": 14, "7_day": 7}


def utc_today():
    return datetime.now(timezone.utc).date()


def delivery_reason(reminder: dict, today: date | None = None):
    """An eligible overdue checkpoint still has a current, actionable deadline."""
    today = today or utc_today()
    contract = reminder.get("contracts")
    if not contract or contract.get("id") != reminder.get("contract_id"):
        return "unavailable"
    if contract.get("organization_id") != reminder.get("organization_id"):
        return "unavailable"
    if contract.get("archived") is not False:
        return "archived"
    if reminder.get("status") != "pending":
        return "inactive"
    try:
        deadline = date.fromisoformat(contract["cancellation_deadline"])
        remind_on = date.fromisoformat(reminder["remind_on"])
    except (KeyError, ValueError, TypeError):
        return "invalid_dates"
    offset = REMINDER_OFFSETS.get(reminder.get("reminder_type"))
    if deadline < today:
        return "past_deadline"
    if offset is None or remind_on != deadline - timedelta(days=offset):
        return "obsolete_checkpoint"
    return "not_due" if remind_on > today else "eligible"
