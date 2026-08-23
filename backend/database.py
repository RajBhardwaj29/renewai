import os

from datetime import date, datetime, timedelta

from dotenv import load_dotenv
from supabase import create_client, Client


load_dotenv()


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")


if not SUPABASE_URL:
    raise RuntimeError(
        "SUPABASE_URL is missing from .env"
    )


if not SUPABASE_SECRET_KEY:
    raise RuntimeError(
        "SUPABASE_SECRET_KEY is missing from .env"
    )


supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
)


# =========================================================
# AUTHENTICATION
# =========================================================


def verify_access_token(
    access_token: str
):
    response = (
        supabase.auth.get_user(
            access_token
        )
    )

    if not response.user:
        return None

    return response.user


# =========================================================
# ORGANIZATIONS
# =========================================================


def get_user_organization(
    user_id: str
):
    membership_response = (
        supabase
        .table("organization_members")
        .select("organization_id, role")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not membership_response.data:
        return None

    membership = (
        membership_response.data[0]
    )

    organization_id = (
        membership["organization_id"]
    )

    organization_response = (
        supabase
        .table("organizations")
        .select(
            "id, name, created_at"
        )
        .eq(
            "id",
            organization_id
        )
        .limit(1)
        .execute()
    )

    if not organization_response.data:
        return None

    organization = (
        organization_response.data[0]
    )

    return {
        "id":
            organization["id"],

        "name":
            organization["name"],

        "role":
            membership["role"],

        "created_at":
            organization["created_at"],
    }


# =========================================================
# DUPLICATE CONTRACT DETECTION
# =========================================================


def find_contract_by_hash(
    organization_id: str,
    file_hash: str,
):
    response = (
        supabase
        .table("contracts")
        .select("*")
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "file_hash",
            file_hash
        )
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


# =========================================================
# SAVE CONTRACT
# =========================================================


def save_contract(
    organization_id: str,
    filename: str,
    file_hash: str,
    character_count: int,
    contract,
    renewal_intelligence: dict,
    ai_insight,
):
    record = {
        "organization_id":
            organization_id,

        "filename":
            filename,

        "file_hash":
            file_hash,

        "vendor_name":
            contract.vendor_name,

        "contract_title":
            contract.contract_title,

        "contract_value":
            contract.contract_value,

        "currency":
            contract.currency,

        "start_date":
            contract.start_date,

        "end_date":
            contract.end_date,

        "renewal_date":
            contract.renewal_date,

        "initial_term_months":
            contract.initial_term_months,

        "renewal_term_months":
            contract.renewal_term_months,

        "notice_period_days":
            contract.notice_period_days,

        "auto_renewal":
            contract.auto_renewal,

        "renewal_clause":
            contract.renewal_clause,

        "termination_clause":
            contract.termination_clause,

        "payment_terms":
            contract.payment_terms,

        "pricing_clause":
            contract.pricing_clause,

        "minimum_commitment":
            contract.minimum_commitment,

        "refund_clause":
            contract.refund_clause,

        "effective_start_date":
            renewal_intelligence.get(
                "effective_start_date"
            ),

        "effective_end_date":
            renewal_intelligence.get(
                "effective_end_date"
            ),

        "effective_renewal_date":
            renewal_intelligence.get(
                "effective_renewal_date"
            ),

        "derived_end_date":
            renewal_intelligence.get(
                "derived_end_date"
            ),

        "derived_renewal_date":
            renewal_intelligence.get(
                "derived_renewal_date"
            ),

        "cancellation_deadline":
            renewal_intelligence.get(
                "cancellation_deadline"
            ),

        "days_until_cancellation_deadline":
            renewal_intelligence.get(
                "days_until_cancellation_deadline"
            ),

        "risk_level":
            renewal_intelligence.get(
                "risk_level"
            ),

        "recommendation":
            renewal_intelligence.get(
                "recommendation"
            ),

        "ai_action":
            ai_insight.action,

        "ai_confidence":
            ai_insight.confidence,

        "ai_summary":
            ai_insight.summary,

        "ai_key_findings":
            ai_insight.key_findings,

        "ai_commercial_flags":
            ai_insight.commercial_flags,

        "character_count":
            character_count,

        "archived":
            False,
    }

    response = (
        supabase
        .table("contracts")
        .insert(record)
        .execute()
    )

    if not response.data:
        raise RuntimeError(
            "Contract could not be saved."
        )

    saved_contract = (
        response.data[0]
    )

    # -----------------------------------------------------
    # Automatically create reminders
    # -----------------------------------------------------

    cancellation_deadline = (
        renewal_intelligence.get(
            "cancellation_deadline"
        )
    )

    if cancellation_deadline:
        create_contract_reminders(
            organization_id=organization_id,
            contract_id=saved_contract["id"],
            cancellation_deadline=(
                cancellation_deadline
            ),
        )

    return saved_contract


# =========================================================
# GET CONTRACTS
# =========================================================


def get_contracts(
    organization_id: str
):
    response = (
        supabase
        .table("contracts")
        .select("*")
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "archived",
            False
        )
        .order(
            "created_at",
            desc=True
        )
        .execute()
    )

    return response.data


# =========================================================
# GET SINGLE CONTRACT
# =========================================================


def get_contract_by_id(
    organization_id: str,
    contract_id: str,
):
    response = (
        supabase
        .table("contracts")
        .select("*")
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "id",
            contract_id
        )
        .limit(1)
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


# =========================================================
# ARCHIVE CONTRACT
# =========================================================


def archive_contract(
    organization_id: str,
    contract_id: str,
):
    response = (
        supabase
        .table("contracts")
        .update({
            "archived":
                True
        })
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "id",
            contract_id
        )
        .execute()
    )

    if not response.data:
        return None

    # Cancel pending reminders when contract is archived
    (
        supabase
        .table("contract_reminders")
        .update({
            "status":
                "cancelled"
        })
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "contract_id",
            contract_id
        )
        .eq(
            "status",
            "pending"
        )
        .execute()
    )

    return response.data[0]


# =========================================================
# UPDATE RENEWAL DECISION
# =========================================================


def update_contract_decision(
    organization_id: str,
    contract_id: str,
    renewal_decision: str,
    renewal_status: str,
    decision_owner: str | None,
    decision_notes: str | None,
):
    from datetime import (
        datetime,
        timezone,
    )

    update_data = {
        "renewal_decision":
            renewal_decision,

        "renewal_status":
            renewal_status,

        "decision_owner":
            decision_owner,

        "decision_notes":
            decision_notes,

        "decision_updated_at":
            datetime.now(
                timezone.utc
            ).isoformat(),
    }

    response = (
        supabase
        .table("contracts")
        .update(
            update_data
        )
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "id",
            contract_id
        )
        .eq(
            "archived",
            False
        )
        .execute()
    )

    if not response.data:
        return None

    return response.data[0]


# =========================================================
# DATE HELPER
# =========================================================


def parse_iso_date(
    value: str | None
):
    if not value:
        return None

    try:
        return datetime.strptime(
            value,
            "%Y-%m-%d"
        ).date()

    except ValueError:
        return None


# =========================================================
# CREATE CONTRACT REMINDERS
# =========================================================


def create_contract_reminders(
    organization_id: str,
    contract_id: str,
    cancellation_deadline: str,
):
    """
    Creates default RenewAI reminders:

    90 days before deadline
    60 days before deadline
    30 days before deadline
    14 days before deadline
    7 days before deadline

    Existing reminders are not duplicated.
    """

    deadline = parse_iso_date(
        cancellation_deadline
    )

    if not deadline:
        return []


    reminder_rules = [
        {
            "type":
                "90_day",

            "days_before":
                90,
        },
        {
            "type":
                "60_day",

            "days_before":
                60,
        },
        {
            "type":
                "30_day",

            "days_before":
                30,
        },
        {
            "type":
                "14_day",

            "days_before":
                14,
        },
        {
            "type":
                "7_day",

            "days_before":
                7,
        },
    ]


    existing_response = (
        supabase
        .table("contract_reminders")
        .select(
            "reminder_type"
        )
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "contract_id",
            contract_id
        )
        .execute()
    )


    existing_types = {
        row["reminder_type"]
        for row
        in (
            existing_response.data
            or []
        )
    }


    records_to_create = []


    for rule in reminder_rules:
        reminder_type = (
            rule["type"]
        )

        days_before = (
            rule["days_before"]
        )


        if (
            reminder_type
            in existing_types
        ):
            continue


        remind_on = (
            deadline
            - timedelta(
                days=days_before
            )
        )


        records_to_create.append({
            "organization_id":
                organization_id,

            "contract_id":
                contract_id,

            "reminder_type":
                reminder_type,

            "remind_on":
                remind_on.isoformat(),

            "status":
                "pending",
        })


    if not records_to_create:
        return []


    response = (
        supabase
        .table("contract_reminders")
        .insert(
            records_to_create
        )
        .execute()
    )


    return (
        response.data
        or []
    )


# =========================================================
# GET ALL ACTIVE REMINDERS
# =========================================================


def get_reminders(
    organization_id: str
):
    response = (
        supabase
        .table("contract_reminders")
        .select(
            """
            *,
            contracts (
                id,
                vendor_name,
                contract_title,
                cancellation_deadline,
                effective_renewal_date,
                risk_level,
                archived
            )
            """
        )
        .eq(
            "organization_id",
            organization_id
        )
        .neq(
            "status",
            "cancelled"
        )
        .order(
            "remind_on"
        )
        .execute()
    )

    return (
        response.data
        or []
    )


# =========================================================
# GET UPCOMING REMINDERS
# =========================================================


def get_upcoming_reminders(
    organization_id: str
):
    today = (
        date.today()
        .isoformat()
    )


    response = (
        supabase
        .table("contract_reminders")
        .select(
            """
            *,
            contracts (
                id,
                vendor_name,
                contract_title,
                cancellation_deadline,
                effective_renewal_date,
                risk_level,
                archived
            )
            """
        )
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "status",
            "pending"
        )
        .gte(
            "remind_on",
            today
        )
        .order(
            "remind_on"
        )
        .execute()
    )


    return (
        response.data
        or []
    )


# =========================================================
# GET DUE / OVERDUE REMINDERS
# =========================================================


def get_due_reminders(
    organization_id: str
):
    today = (
        date.today()
        .isoformat()
    )


    response = (
        supabase
        .table("contract_reminders")
        .select(
            """
            *,
            contracts (
                id,
                vendor_name,
                contract_title,
                cancellation_deadline,
                effective_renewal_date,
                risk_level,
                archived
            )
            """
        )
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "status",
            "pending"
        )
        .lte(
            "remind_on",
            today
        )
        .order(
            "remind_on"
        )
        .execute()
    )


    return (
        response.data
        or []
    )


# =========================================================
# GET REMINDERS FOR ONE CONTRACT
# =========================================================


def get_contract_reminders(
    organization_id: str,
    contract_id: str,
):
    response = (
        supabase
        .table("contract_reminders")
        .select("*")
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "contract_id",
            contract_id
        )
        .neq(
            "status",
            "cancelled"
        )
        .order(
            "remind_on"
        )
        .execute()
    )


    return (
        response.data
        or []
    )


# =========================================================
# MARK REMINDER AS SENT
# =========================================================


def mark_reminder_sent(
    organization_id: str,
    reminder_id: str,
):
    response = (
        supabase
        .table("contract_reminders")
        .update({
            "status":
                "sent",

            "sent_at":
                datetime.now()
                .astimezone()
                .isoformat(),
        })
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "id",
            reminder_id
        )
        .execute()
    )


    if not response.data:
        return None


    return response.data[0]

# =========================================================
# BACKFILL REMINDERS FOR EXISTING CONTRACTS
# =========================================================


def backfill_contract_reminders(
    organization_id: str
):
    """
    Creates missing reminders for existing active contracts.

    This is useful for contracts that were created before
    the automatic reminder engine was added.

    The function is safe to run more than once because
    create_contract_reminders() checks existing reminder
    types before inserting new rows.
    """

    contracts = get_contracts(
        organization_id
    )

    created_total = 0
    processed = 0
    skipped_no_deadline = 0

    for contract in contracts:

        processed += 1

        cancellation_deadline = (
            contract.get(
                "cancellation_deadline"
            )
        )

        if not cancellation_deadline:

            skipped_no_deadline += 1

            continue

        created = create_contract_reminders(
            organization_id=
                organization_id,

            contract_id=
                contract["id"],

            cancellation_deadline=
                cancellation_deadline,
        )

        created_total += len(
            created
        )

    return {
        "contracts_processed":
            processed,

        "reminders_created":
            created_total,

        "contracts_without_deadline":
            skipped_no_deadline,
    }

    # =========================================================
# GET DUE REMINDERS FOR EMAIL DELIVERY
# =========================================================


def get_pending_due_reminders_for_delivery(
    organization_id: str
):
    today = (
        date.today()
        .isoformat()
    )

    response = (
        supabase
        .table("contract_reminders")
        .select(
            """
            *,
            contracts (
                id,
                vendor_name,
                contract_title,
                cancellation_deadline,
                effective_renewal_date,
                archived
            )
            """
        )
        .eq(
            "organization_id",
            organization_id
        )
        .eq(
            "status",
            "pending"
        )
        .lte(
            "remind_on",
            today
        )
        .order(
            "remind_on"
        )
        .execute()
    )

    reminders = (
        response.data
        or []
    )

    return [
        reminder
        for reminder
        in reminders
        if not (
            reminder.get("contracts")
            or {}
        ).get(
            "archived",
            False
        )
    ]