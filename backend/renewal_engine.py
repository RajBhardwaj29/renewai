from datetime import date, datetime, timedelta

from dateutil.relativedelta import relativedelta


# =========================================================
# DATE HELPERS
# =========================================================


def parse_date(
    value: str | date | datetime | None,
) -> date | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    if isinstance(value, str):
        value = value.strip()

        if not value:
            return None

        try:
            return date.fromisoformat(value)
        except ValueError:
            return None

    return None


def format_date(
    value: date | None,
) -> str | None:
    if value is None:
        return None

    return value.isoformat()


# =========================================================
# NOTICE PERIOD CALCULATION
# =========================================================


def subtract_notice_period(
    anchor_date: date | None,
    value: int | None,
    unit: str | None,
) -> date | None:
    """
    Subtract a contractual notice period from an anchor date.

    Supported units:
    - days
    - months
    - business_days

    Business-day deadlines are deliberately NOT calculated because
    RenewAI currently does not have a reliable jurisdiction-specific
    holiday/business-day calendar.
    """

    if (
        anchor_date is None
        or value is None
        or value < 0
    ):
        return None

    normalized_unit = (
        unit.strip().lower()
        if isinstance(unit, str)
        else None
    )

    if normalized_unit == "days":
        return (
            anchor_date
            - timedelta(days=value)
        )

    if normalized_unit == "months":
        return (
            anchor_date
            - relativedelta(months=value)
        )

    if normalized_unit == "business_days":
        return None

    return None


# =========================================================
# RISK HELPERS
# =========================================================


def calculate_deadline_risk(
    cancellation_deadline: date | None,
) -> tuple[
    str,
    int | None,
    str,
]:
    if cancellation_deadline is None:
        return (
            "unknown",
            None,
            (
                "Renewal risk cannot yet be determined because "
                "required contract dates or notice terms are missing."
            ),
        )

    today = date.today()

    days_remaining = (
        cancellation_deadline
        - today
    ).days

    if days_remaining < 0:
        return (
            "critical",
            days_remaining,
            (
                "The contractual cancellation or non-renewal "
                "deadline has already passed."
            ),
        )

    if days_remaining <= 14:
        return (
            "critical",
            days_remaining,
            (
                "The contractual cancellation or non-renewal "
                "deadline is imminent. Immediate review is required."
            ),
        )

    if days_remaining <= 30:
        return (
            "urgent",
            days_remaining,
            (
                "The contractual cancellation or non-renewal "
                "deadline is approaching. Review promptly."
            ),
        )

    if days_remaining <= 90:
        return (
            "attention",
            days_remaining,
            (
                "The contractual cancellation or non-renewal "
                "deadline is within the next 90 days."
            ),
        )

    return (
        "safe",
        days_remaining,
        (
            "No immediate action required. "
            "Continue monitoring."
        ),
    )


# =========================================================
# CURRENT AUTO-RENEWAL CYCLE
# =========================================================


def advance_fixed_term_auto_renewal_cycle(
    initial_end_date: date | None,
    first_renewal_date: date | None,
    renewal_term_months: int | None,
    today: date | None = None,
) -> tuple[date | None, date | None]:
    """
    Advance a fixed-term auto-renewing agreement to the renewal cycle
    that is operationally current as of today.

    The stored/extracted dates describe the initial term and first
    renewal. For successive fixed renewal terms, RenewAI must calculate
    the current term end and the next renewal date rather than continuing
    to surface a historical first-cycle deadline.

    Returns:
        (current_term_end_date, next_renewal_date)

    If the first renewal has not yet started, the original initial end
    and first renewal date are returned unchanged.
    """
    if (
        initial_end_date is None
        or first_renewal_date is None
        or renewal_term_months is None
        or renewal_term_months <= 0
    ):
        return (
            initial_end_date,
            first_renewal_date,
        )

    if today is None:
        today = date.today()

    if today < first_renewal_date:
        return (
            initial_end_date,
            first_renewal_date,
        )

    current_term_start = first_renewal_date

    while True:
        next_renewal_date = (
            current_term_start
            + relativedelta(
                months=renewal_term_months
            )
        )

        current_term_end_date = (
            next_renewal_date
            - timedelta(days=1)
        )

        if today <= current_term_end_date:
            return (
                current_term_end_date,
                next_renewal_date,
            )

        current_term_start = (
            next_renewal_date
        )


# =========================================================
# MAIN RENEWAL ENGINE
# =========================================================


def calculate_renewal_intelligence(
    contract,
) -> dict:
    """
    Deterministically calculate renewal dates, cancellation deadlines,
    notice windows and time-based renewal risk.

    AI interprets contractual meaning.
    This engine performs date arithmetic only from reviewed structured
    contract data.

    Supported renewal structures:

    fixed_term
        A contract that ends without automatic renewal.

    fixed_term_auto_renewal
        A contract that renews into defined subsequent terms.

    evergreen_indefinite
        A contract that continues indefinitely after the initial term
        without successive fixed renewal periods.

    Older contracts may have renewal_structure = None. Those contracts
    continue to use the legacy auto_renewal behavior for backwards
    compatibility.
    """

    # -----------------------------------------------------
    # SOURCE FIELDS
    # -----------------------------------------------------

    start_date = parse_date(
        getattr(
            contract,
            "start_date",
            None,
        )
    )

    explicit_end_date = parse_date(
        getattr(
            contract,
            "end_date",
            None,
        )
    )

    explicit_renewal_date = parse_date(
        getattr(
            contract,
            "renewal_date",
            None,
        )
    )

    initial_term_months = getattr(
        contract,
        "initial_term_months",
        None,
    )

    renewal_term_months = getattr(
        contract,
        "renewal_term_months",
        None,
    )

    auto_renewal = getattr(
        contract,
        "auto_renewal",
        None,
    )

    renewal_structure = getattr(
        contract,
        "renewal_structure",
        None,
    )

    notice_period_days = getattr(
        contract,
        "notice_period_days",
        None,
    )

    notice_period_value = getattr(
        contract,
        "notice_period_value",
        None,
    )

    notice_period_unit = getattr(
        contract,
        "notice_period_unit",
        None,
    )

    notice_period_anchor = getattr(
        contract,
        "notice_period_anchor",
        None,
    )

    notice_window_start_value = getattr(
        contract,
        "notice_window_start_value",
        None,
    )

    notice_window_start_unit = getattr(
        contract,
        "notice_window_start_unit",
        None,
    )

    notice_window_end_value = getattr(
        contract,
        "notice_window_end_value",
        None,
    )

    notice_window_end_unit = getattr(
        contract,
        "notice_window_end_unit",
        None,
    )

    # -----------------------------------------------------
    # NORMALIZE RENEWAL STRUCTURE
    # -----------------------------------------------------

    if isinstance(
        renewal_structure,
        str,
    ):
        renewal_structure = (
            renewal_structure
            .strip()
            .lower()
        )

    valid_structures = {
        "fixed_term",
        "fixed_term_auto_renewal",
        "evergreen_indefinite",
    }

    if (
        renewal_structure
        not in valid_structures
    ):
        renewal_structure = None

    is_evergreen = (
        renewal_structure
        == "evergreen_indefinite"
    )

    is_fixed_term = (
        renewal_structure
        == "fixed_term"
    )

    is_fixed_auto_renewal = (
        renewal_structure
        == "fixed_term_auto_renewal"
    )

    # -----------------------------------------------------
    # EFFECTIVE START
    # -----------------------------------------------------

    effective_start_date = start_date

    # -----------------------------------------------------
    # EFFECTIVE / DERIVED END DATE
    # -----------------------------------------------------

    derived_end_date = None

    if explicit_end_date:
        effective_end_date = (
            explicit_end_date
        )

    elif (
        start_date
        and initial_term_months
        and initial_term_months > 0
    ):
        derived_end_date = (
            start_date
            + relativedelta(
                months=initial_term_months
            )
            - timedelta(days=1)
        )

        effective_end_date = (
            derived_end_date
        )

    else:
        effective_end_date = None

    # -----------------------------------------------------
    # EFFECTIVE / DERIVED RENEWAL DATE
    # -----------------------------------------------------

    derived_renewal_date = None

    if is_evergreen:
        # Evergreen continuation does not create a fixed renewal date.
        effective_renewal_date = None

    elif is_fixed_term:
        # A non-renewing fixed-term agreement has no renewal date.
        effective_renewal_date = None

    elif explicit_renewal_date:
        effective_renewal_date = (
            explicit_renewal_date
        )

    else:
        should_derive_renewal = False

        # New explicit lifecycle model.
        if is_fixed_auto_renewal:
            should_derive_renewal = True

        # Backward compatibility for existing records created before
        # renewal_structure existed.
        elif (
            renewal_structure is None
            and auto_renewal is True
        ):
            should_derive_renewal = True

        if (
            should_derive_renewal
            and effective_end_date
        ):
            derived_renewal_date = (
                effective_end_date
                + timedelta(days=1)
            )

            effective_renewal_date = (
                derived_renewal_date
            )

        else:
            effective_renewal_date = None

    # -----------------------------------------------------
    # CURRENT FIXED-TERM AUTO-RENEWAL CYCLE
    # -----------------------------------------------------

    # Extraction preserves the original contractual dates. Operational
    # renewal intelligence, however, must point at the next actionable
    # cycle.
    #
    # There are two ways the initial cycle can stop being actionable:
    #
    # 1. The first renewal term has already started.
    # 2. The first-cycle non-renewal deadline has already passed, even
    #    though the renewal term itself has not started yet.
    #
    # Case (2) matters because once the contractual notice deadline has
    # passed, the customer is already committed to the upcoming renewal
    # term. RenewAI should therefore surface that committed term and its
    # next non-renewal opportunity instead of showing a historical
    # deadline as the primary operational state.
    #
    # Business-day deadlines are intentionally excluded from this
    # pre-renewal advancement because RenewAI cannot calculate them
    # reliably without a jurisdiction-specific holiday calendar.

    today = date.today()

    should_advance_auto_renewal_cycle = False

    if (
        is_fixed_auto_renewal
        and effective_end_date
        and effective_renewal_date
        and renewal_term_months
        and renewal_term_months > 0
    ):
        # The renewal term has already begun.
        if today >= effective_renewal_date:
            should_advance_auto_renewal_cycle = True

        # The renewal term has not begun, but the current-cycle notice
        # deadline may already have passed.
        else:
            normalized_pre_cycle_anchor = (
                notice_period_anchor.strip().lower()
                if isinstance(notice_period_anchor, str)
                else None
            )

            if normalized_pre_cycle_anchor == "end_date":
                pre_cycle_notice_anchor_date = (
                    effective_end_date
                )
            elif normalized_pre_cycle_anchor == "renewal_date":
                pre_cycle_notice_anchor_date = (
                    effective_renewal_date
                )
            else:
                pre_cycle_notice_anchor_date = None

            pre_cycle_deadline = None

            pre_cycle_has_notice_window = (
                notice_window_start_value is not None
                or notice_window_end_value is not None
            )

            if pre_cycle_has_notice_window:
                # The close boundary is the last valid date for notice.
                if (
                    notice_window_end_value is not None
                    and notice_window_end_unit is not None
                ):
                    pre_cycle_deadline = (
                        subtract_notice_period(
                            pre_cycle_notice_anchor_date,
                            notice_window_end_value,
                            notice_window_end_unit,
                        )
                    )
            else:
                pre_cycle_notice_value = (
                    notice_period_value
                )

                pre_cycle_notice_unit = (
                    notice_period_unit
                )

                # Backward compatibility for records that only have
                # notice_period_days.
                if (
                    pre_cycle_notice_value is None
                    and notice_period_days is not None
                ):
                    pre_cycle_notice_value = (
                        notice_period_days
                    )
                    pre_cycle_notice_unit = "days"

                if (
                    pre_cycle_notice_value is not None
                    and pre_cycle_notice_unit is not None
                ):
                    pre_cycle_deadline = (
                        subtract_notice_period(
                            pre_cycle_notice_anchor_date,
                            pre_cycle_notice_value,
                            pre_cycle_notice_unit,
                        )
                    )

            # Strictly greater than: on the contractual deadline itself,
            # the notice opportunity is still treated as actionable.
            if (
                pre_cycle_deadline is not None
                and today > pre_cycle_deadline
            ):
                should_advance_auto_renewal_cycle = True

    if should_advance_auto_renewal_cycle:
        # If the first renewal has not started yet but its notice
        # deadline has passed, advance as though that committed renewal
        # term is the operationally current cycle.
        cycle_reference_date = (
            today
            if today >= effective_renewal_date
            else effective_renewal_date
        )

        (
            current_cycle_end_date,
            next_cycle_renewal_date,
        ) = advance_fixed_term_auto_renewal_cycle(
            initial_end_date=effective_end_date,
            first_renewal_date=effective_renewal_date,
            renewal_term_months=renewal_term_months,
            today=cycle_reference_date,
        )

        effective_end_date = (
            current_cycle_end_date
        )

        effective_renewal_date = (
            next_cycle_renewal_date
        )

    # -----------------------------------------------------
    # EVERGREEN CONTRACT
    # -----------------------------------------------------

    if is_evergreen:
        return {
            "effective_start_date":
                format_date(
                    effective_start_date
                ),

            "effective_end_date":
                format_date(
                    effective_end_date
                ),

            "effective_renewal_date":
                None,

            "derived_end_date":
                format_date(
                    derived_end_date
                ),

            "derived_renewal_date":
                None,

            "notice_window_open_date":
                None,

            "notice_window_close_date":
                None,

            "cancellation_deadline":
                None,

            "days_until_cancellation_deadline":
                None,

            "risk_level":
                "unknown",

            "recommendation":
                (
                    "This contract continues on an evergreen basis "
                    "without a fixed renewal date or cancellation "
                    "deadline. Termination may be exercised on a "
                    "rolling basis subject to the contractual "
                    "notice period."
                ),
        }

    # -----------------------------------------------------
    # NOTICE ANCHOR
    # -----------------------------------------------------

    normalized_anchor = (
        notice_period_anchor
        .strip()
        .lower()
        if isinstance(
            notice_period_anchor,
            str,
        )
        else None
    )

    if normalized_anchor == "end_date":
        notice_anchor_date = (
            effective_end_date
        )

    elif normalized_anchor == "renewal_date":
        notice_anchor_date = (
            effective_renewal_date
        )

    else:
        notice_anchor_date = None

    # -----------------------------------------------------
    # NOTICE WINDOW
    # -----------------------------------------------------

    has_notice_window = (
        notice_window_start_value
        is not None
        or notice_window_end_value
        is not None
    )

    notice_window_open_date = None
    notice_window_close_date = None

    cancellation_deadline = None

    if has_notice_window:
        notice_window_open_date = (
            subtract_notice_period(
                notice_anchor_date,
                notice_window_start_value,
                notice_window_start_unit,
            )
        )

        notice_window_close_date = (
            subtract_notice_period(
                notice_anchor_date,
                notice_window_end_value,
                notice_window_end_unit,
            )
        )

        # The final valid date in the contractual window functions
        # operationally as the cancellation/non-renewal deadline.
        cancellation_deadline = (
            notice_window_close_date
        )

    # -----------------------------------------------------
    # ORDINARY NOTICE PERIOD
    # -----------------------------------------------------

    else:
        effective_notice_value = (
            notice_period_value
        )

        effective_notice_unit = (
            notice_period_unit
        )

        # Legacy compatibility:
        # older contracts only stored notice_period_days.
        if (
            effective_notice_value
            is None
            and notice_period_days
            is not None
        ):
            effective_notice_value = (
                notice_period_days
            )

            effective_notice_unit = (
                "days"
            )

        if (
            effective_notice_value
            is not None
            and effective_notice_unit
            is not None
        ):
            cancellation_deadline = (
                subtract_notice_period(
                    notice_anchor_date,
                    effective_notice_value,
                    effective_notice_unit,
                )
            )

    # -----------------------------------------------------
    # BUSINESS-DAY SAFETY
    # -----------------------------------------------------

    normalized_notice_unit = (
        notice_period_unit
        .strip()
        .lower()
        if isinstance(
            notice_period_unit,
            str,
        )
        else None
    )

    normalized_window_start_unit = (
        notice_window_start_unit
        .strip()
        .lower()
        if isinstance(
            notice_window_start_unit,
            str,
        )
        else None
    )

    normalized_window_end_unit = (
        notice_window_end_unit
        .strip()
        .lower()
        if isinstance(
            notice_window_end_unit,
            str,
        )
        else None
    )

    ordinary_business_days = (
        not has_notice_window
        and normalized_notice_unit
        == "business_days"
    )

    window_has_business_days = (
        has_notice_window
        and (
            normalized_window_start_unit
            == "business_days"
            or normalized_window_end_unit
            == "business_days"
        )
    )

    if ordinary_business_days:
        risk_level = "unknown"

        days_until_cancellation_deadline = (
            None
        )

        recommendation = (
            "The notice period is expressed in business days. "
            "A reliable cancellation deadline cannot be "
            "calculated without a defined business-day and "
            "holiday calendar."
        )

    elif window_has_business_days:
        risk_level = "unknown"

        days_until_cancellation_deadline = (
            None
        )

        recommendation = (
            "The contractual notice window uses business days. "
            "Reliable notice-window dates cannot be calculated "
            "without a defined business-day and holiday calendar."
        )

    # -----------------------------------------------------
    # INCOMPLETE NOTICE WINDOW
    # -----------------------------------------------------

    elif (
        has_notice_window
        and (
            notice_window_start_value
            is None
            or notice_window_start_unit
            is None
            or notice_window_end_value
            is None
            or notice_window_end_unit
            is None
            or notice_anchor_date
            is None
        )
    ):
        risk_level = "unknown"

        days_until_cancellation_deadline = (
            None
        )

        recommendation = (
            "The contract contains a notice window, but the "
            "window cannot be calculated reliably because one "
            "or more required notice terms or anchor dates are "
            "unknown."
        )

    # -----------------------------------------------------
    # NORMAL DEADLINE RISK
    # -----------------------------------------------------

    else:
        (
            risk_level,
            days_until_cancellation_deadline,
            recommendation,
        ) = calculate_deadline_risk(
            cancellation_deadline
        )

    # -----------------------------------------------------
    # RESULT
    # -----------------------------------------------------

    return {
        "effective_start_date":
            format_date(
                effective_start_date
            ),

        "effective_end_date":
            format_date(
                effective_end_date
            ),

        "effective_renewal_date":
            format_date(
                effective_renewal_date
            ),

        "derived_end_date":
            format_date(
                derived_end_date
            ),

        "derived_renewal_date":
            format_date(
                derived_renewal_date
            ),

        "notice_window_open_date":
            format_date(
                notice_window_open_date
            ),

        "notice_window_close_date":
            format_date(
                notice_window_close_date
            ),

        "cancellation_deadline":
            format_date(
                cancellation_deadline
            ),

        "days_until_cancellation_deadline":
            days_until_cancellation_deadline,

        "risk_level":
            risk_level,

        "recommendation":
            recommendation,
    }