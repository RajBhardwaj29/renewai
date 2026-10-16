"""Read-time countdowns; saved renewal cycles and records stay unchanged."""
from datetime import date, datetime, timezone


def current_contract_countdowns(contracts, *, today=None):
    """Use a single UTC calendar day for the whole response."""
    today = today if today is not None else datetime.now(timezone.utc).date()
    result = []
    for contract in contracts:
        deadline = contract.get("cancellation_deadline")
        try:
            parsed = date.fromisoformat(deadline) if isinstance(deadline, str) else None
        except ValueError:
            parsed = None
        result.append({**contract, "days_until_cancellation_deadline":
                       (parsed - today).days if parsed else None})
    return result
