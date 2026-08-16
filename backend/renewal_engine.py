from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta


def parse_date(value: str | None):
    if not value:
        return None

    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def calculate_renewal_intelligence(contract):
    start_date = parse_date(contract.start_date)
    end_date = parse_date(contract.end_date)
    renewal_date = parse_date(contract.renewal_date)

    derived_end_date = None
    derived_renewal_date = None
    cancellation_deadline = None

    # --------------------------------------------------
    # 1. Derive the end date from:
    #    start date + initial contract term
    # --------------------------------------------------

    if (
        not end_date
        and start_date
        and contract.initial_term_months
    ):
        derived_end_date = (
            start_date
            + relativedelta(months=contract.initial_term_months)
            - timedelta(days=1)
        )

    effective_end_date = end_date or derived_end_date

    # --------------------------------------------------
    # 2. Determine renewal date
    # --------------------------------------------------

    if renewal_date:
        effective_renewal_date = renewal_date

    elif contract.auto_renewal and effective_end_date:
        derived_renewal_date = (
            effective_end_date + timedelta(days=1)
        )

        effective_renewal_date = derived_renewal_date

    else:
        effective_renewal_date = None

    # --------------------------------------------------
    # 3. Calculate cancellation deadline
    # --------------------------------------------------

    if (
        effective_renewal_date
        and contract.notice_period_days is not None
    ):
        cancellation_deadline = (
            effective_renewal_date
            - timedelta(days=contract.notice_period_days)
        )

    # --------------------------------------------------
    # 4. Calculate days remaining
    # --------------------------------------------------

    today = date.today()

    days_until_deadline = None

    if cancellation_deadline:
        days_until_deadline = (
            cancellation_deadline - today
        ).days

    # --------------------------------------------------
    # 5. Risk scoring
    # --------------------------------------------------

    if not cancellation_deadline:
        risk_level = "unknown"

    elif days_until_deadline < 0:
        risk_level = "critical"

    elif days_until_deadline <= 7:
        risk_level = "critical"

    elif days_until_deadline <= 30:
        risk_level = "urgent"

    elif days_until_deadline <= 90:
        risk_level = "attention"

    else:
        risk_level = "safe"

    # --------------------------------------------------
    # 6. Recommendation
    # --------------------------------------------------

    if risk_level == "critical":
        if (
            days_until_deadline is not None
            and days_until_deadline < 0
        ):
            recommendation = (
                "The cancellation deadline appears to have passed. "
                "Review the agreement immediately and contact the vendor."
            )
        else:
            recommendation = (
                "Immediate action required. "
                "The cancellation deadline is extremely close."
            )

    elif risk_level == "urgent":
        recommendation = (
            "Review this contract immediately before the "
            "cancellation window closes."
        )

    elif risk_level == "attention":
        recommendation = (
            "Begin renewal review and evaluate usage, "
            "pricing and alternatives."
        )

    elif risk_level == "safe":
        recommendation = (
            "No immediate action required. Continue monitoring."
        )

    else:
        recommendation = (
            "Renewal risk cannot yet be determined because "
            "required contract dates are missing."
        )

    return {
        "effective_start_date": (
            start_date.isoformat()
            if start_date else None
        ),

        "effective_end_date": (
            effective_end_date.isoformat()
            if effective_end_date else None
        ),

        "effective_renewal_date": (
            effective_renewal_date.isoformat()
            if effective_renewal_date else None
        ),

        "derived_end_date": (
            derived_end_date.isoformat()
            if derived_end_date else None
        ),

        "derived_renewal_date": (
            derived_renewal_date.isoformat()
            if derived_renewal_date else None
        ),

        "cancellation_deadline": (
            cancellation_deadline.isoformat()
            if cancellation_deadline else None
        ),

        "days_until_cancellation_deadline":
            days_until_deadline,

        "risk_level": risk_level,

        "recommendation": recommendation,
    }