import hashlib
import os
import hmac
import logging
import pymupdf

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Header,
)

from api_errors import register_error_handlers

from pydantic import BaseModel

from contextlib import asynccontextmanager

from reminder_scheduler import (
    process_due_reminders,
    start_reminder_scheduler,
    stop_reminder_scheduler,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from contract_summary import build_contract_summary, summary_filename
from contract_presentation import current_contract_countdowns

from contract_ai import (
    ContractData,
    RenewalAIInsight,
    extract_contract_data,
    generate_renewal_ai_insight,
)

from renewal_engine import calculate_renewal_intelligence
from reminder_delivery import deliver_due_reminders, delivery_health
from uuid import uuid4

from database import (
    verify_access_token,
    get_user_organization,
    save_contract,
    update_contract_ai_insight,
    update_contract_ai_analysis_status,
    create_contract_reminders,
    get_contracts,
    get_contract_by_id,
    find_contract_by_hash,
    archive_contract,
    get_archived_contracts,
    restore_contract,
    delete_contract_permanently,
    get_reminders,
    get_upcoming_reminders,
    get_due_reminders,
    get_contract_reminders,
    backfill_contract_reminders,
    update_contract_decision,
    get_contract_decision_history,
)

@asynccontextmanager
async def lifespan(app: FastAPI):

    scheduler_enabled = (
        os.getenv(
            "ENABLE_REMINDER_SCHEDULER",
            "true",
        ).lower()
        == "true"
    )

    if scheduler_enabled:
        start_reminder_scheduler()

    yield

    if scheduler_enabled:
        stop_reminder_scheduler()


app = FastAPI(
    title="RenewAI API",

    description=(
        "Backend API for RenewAI "
        "contract renewal intelligence"
    ),

    version="0.6.0",

    lifespan=lifespan,
)


register_error_handlers(app)

default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


configured_origins = os.getenv(
    "ALLOWED_ORIGINS",
    ""
)


if configured_origins:
    origins = [
        origin.strip().rstrip("/")
        for origin in configured_origins.split(",")
        if origin.strip()
    ]
else:
    origins = default_origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


def get_authenticated_context(
    authorization: str | None
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header.",
        )

    access_token = (
        authorization
        .replace(
            "Bearer ",
            "",
            1
        )
        .strip()
    )

    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Missing access token.",
        )

    try:
        user = verify_access_token(
            access_token
        )

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session.",
        )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session.",
        )

    organization = get_user_organization(
        str(user.id)
    )

    if not organization:
        raise HTTPException(
            status_code=403,
            detail=(
                "You do not belong to "
                "a RenewAI organization."
            ),
        )

    return {
        "user": user,
        "organization": organization,
        "organization_id": organization["id"],
    }

class RenewalDecisionRequest(
    BaseModel
):
    renewal_decision: str
    renewal_status: str

    decision_owner: str | None = None
    decision_notes: str | None = None


@app.get("/")
def root():
    return {
        "message":
            "RenewAI API is running"
    }


@app.get("/health")
def health():
    return {
        "status":
            "healthy"
    }


@app.post("/internal/process-reminders")
def process_reminders_from_cron(
    x_cron_secret: str | None = Header(
        default=None,
        alias="X-Cron-Secret",
    )
):
    configured_secret = os.getenv(
        "CRON_SECRET"
    )


    if not configured_secret:

        raise HTTPException(
            status_code=503,
            detail=(
                "Cron processing is not configured."
            ),
        )


    if (
        not x_cron_secret
        or
        not hmac.compare_digest(
            x_cron_secret,
            configured_secret,
        )
    ):

        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid cron credentials."
            ),
        )


    try:

        result = (
            process_due_reminders()
        )


        if (
            result.get(
                "status"
            )
            in {"failed", "partial"}
        ):

            raise HTTPException(
                status_code=500,
                detail={
                    "message":
                        "Reminder processing failed.",

                    "run":
                        result,
                },
            )


        return {
            "status":
                result[
                    "status"
                ],

            "message":
                (
                    "Due reminder processing "
                    "completed."
                ),

            "run":
                result,
        }


    except HTTPException:
        raise


    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Reminder processing failed: "
                f"{str(exc)}"
            ),
        )


@app.get("/me")
def current_user(
    authorization: str | None = Header(
        default=None
    )
):
    context = get_authenticated_context(
        authorization
    )

    user = context["user"]
    organization = context["organization"]

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
        },
        "organization":
            organization,
    }


@app.get("/contracts")
def list_contracts(
    archived: bool = False,

    authorization: str | None = Header(
        default=None
    ),
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    try:

        if archived:
            contracts = (
                get_archived_contracts(
                    organization_id
                )
            )

        else:
            contracts = (
                get_contracts(
                    organization_id
                )
            )

        return {
            "contracts":
                current_contract_countdowns(contracts),

            "count":
                len(contracts),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load contracts: "
                f"{str(exc)}"
            ),
        )


@app.get("/contracts/{contract_id}")
def get_single_contract(
    contract_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    try:
        contract = get_contract_by_id(
            organization_id,
            contract_id,
        )

        if not contract:
            raise HTTPException(
                status_code=404,
                detail="Contract not found.",
            )

        return {
            "contract":
                current_contract_countdowns([contract])[0]
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load contract: "
                f"{str(exc)}"
            ),
        )


@app.get("/contracts/{contract_id}/summary.pdf")
async def download_contract_summary(
    contract_id: str,
    authorization: str | None = Header(default=None),
):
    context = get_authenticated_context(authorization)
    organization_id = context["organization_id"]
    contract = get_contract_by_id(organization_id, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found.")
    reminders = get_contract_reminders(organization_id, contract_id)
    pdf = build_contract_summary(contract, reminders)
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{summary_filename(contract)}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


@app.patch(
    "/contracts/{contract_id}/archive"
)
def archive_single_contract(
    contract_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    existing = get_contract_by_id(
        organization_id,
        contract_id,
    )

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    try:
        archived = archive_contract(
            organization_id,
            contract_id,
        )

        return {
            "contract":
                archived,
            "message":
                "Contract archived successfully",
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not archive contract: "
                f"{str(exc)}"
            ),
        )


@app.patch(
    "/contracts/{contract_id}/restore"
)
def restore_single_contract(
    contract_id: str,

    authorization: str | None = Header(
        default=None
    ),
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    existing = get_contract_by_id(
        organization_id,
        contract_id,
    )

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    if not existing.get(
        "archived",
        False,
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Contract is not archived."
            ),
        )

    try:

        restored = restore_contract(
            organization_id,
            contract_id,
        )

        if not restored:
            raise HTTPException(
                status_code=404,
                detail="Contract not found.",
            )

        return {
            "contract":
                restored,

            "message":
                "Contract restored successfully.",
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not restore contract: "
                f"{str(exc)}"
            ),
        )


@app.delete("/contracts/{contract_id}")
def delete_single_contract(
    contract_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    existing = get_contract_by_id(
        organization_id,
        contract_id,
    )

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    try:
        deleted = delete_contract_permanently(
            organization_id,
            contract_id,
        )

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Contract not found.",
            )

        return {
            "message":
                "Contract permanently deleted.",
            "contract_id":
                contract_id,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not permanently delete contract: "
                f"{str(exc)}"
            ),
        )


@app.patch(
    "/contracts/{contract_id}/decision"
)
def update_single_contract_decision(
    contract_id: str,

    payload: RenewalDecisionRequest,

    authorization: str | None = Header(
        default=None
    ),
):
    context = (
        get_authenticated_context(
            authorization
        )
    )

    organization_id = (
        context["organization_id"]
    )

    user = (
        context["user"]
    )

    existing = (
        get_contract_by_id(
            organization_id,
            contract_id,
        )
    )

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    allowed_decisions = {
        "undecided",
        "renew",
        "renegotiate",
        "cancel",
    }

    allowed_statuses = {
        "under_review",
        "decision_made",
        "completed",
    }

    if (
        payload.renewal_decision
        not in allowed_decisions
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid renewal decision."
            ),
        )

    if (
        payload.renewal_status
        not in allowed_statuses
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid renewal status."
            ),
        )

    try:
        updated_contract = (
            update_contract_decision(
                organization_id=
                    organization_id,

                contract_id=
                    contract_id,

                renewal_decision=
                    payload
                    .renewal_decision,

                renewal_status=
                    payload
                    .renewal_status,

                decision_owner=
                    payload
                    .decision_owner,

                decision_notes=
                    payload
                    .decision_notes,

                changed_by_user_id=
                    str(
                        user.id
                    ),

                changed_by_email=
                    getattr(
                        user,
                        "email",
                        None,
                    ),
            )
        )

        if not updated_contract:
            raise HTTPException(
                status_code=404,
                detail="Contract not found.",
            )

        return {
            "contract":
                updated_contract,

            "message":
                (
                    "Renewal decision "
                    "updated successfully."
                ),
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not update renewal "
                "decision: "
                f"{str(exc)}"
            ),
        )


@app.get(
    "/contracts/{contract_id}/decision-history"
)
def get_single_contract_decision_history(
    contract_id: str,

    authorization: str | None = Header(
        default=None
    ),
):
    context = (
        get_authenticated_context(
            authorization
        )
    )

    organization_id = (
        context["organization_id"]
    )

    existing = (
        get_contract_by_id(
            organization_id,
            contract_id,
        )
    )

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    try:
        history = (
            get_contract_decision_history(
                organization_id=
                    organization_id,

                contract_id=
                    contract_id,
            )
        )

        return {
            "history":
                history,

            "count":
                len(
                    history
                ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load decision "
                "history: "
                f"{str(exc)}"
            ),
        )


@app.get("/reminders")
def list_reminders(
    authorization: str | None = Header(
        default=None
    )
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    try:
        reminders = get_reminders(
            organization_id
        )

        return {
            "reminders":
                reminders,
            "count":
                len(reminders),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load reminders: "
                f"{str(exc)}"
            ),
        )


@app.get("/reminders/upcoming")
def list_upcoming_reminders(
    authorization: str | None = Header(
        default=None
    )
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    try:
        reminders = get_upcoming_reminders(
            organization_id
        )

        return {
            "reminders":
                reminders,
            "count":
                len(reminders),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load upcoming reminders: "
                f"{str(exc)}"
            ),
        )


@app.get("/reminders/due")
def list_due_reminders(
    authorization: str | None = Header(
        default=None
    )
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    try:
        reminders = get_due_reminders(
            organization_id
        )

        return {
            "reminders":
                reminders,
            "count":
                len(reminders),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load due reminders: "
                f"{str(exc)}"
            ),
        )


@app.post("/reminders/backfill")
def backfill_reminders(
    authorization: str | None = Header(
        default=None
    )
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    try:
        result = backfill_contract_reminders(
            organization_id
        )

        return {
            "message":
                "Reminder backfill completed.",
            "contracts_processed":
                result["contracts_processed"],
            "reminders_created":
                result["reminders_created"],
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not backfill reminders: "
                f"{str(exc)}"
            ),
        )


@app.post("/reminders/send-due")
def send_due_reminders(authorization: str | None = Header(default=None)):
    context = get_authenticated_context(authorization)
    result = deliver_due_reminders(context["organization_id"], uuid4().hex[:12])
    return {"message": "Due reminder delivery completed.", **result}


@app.get("/reminders/delivery-health")
def reminder_delivery_health(authorization: str | None = Header(default=None)):
    context = get_authenticated_context(authorization)
    return delivery_health(context["organization_id"])


@app.get(
    "/contracts/{contract_id}/reminders"
)
def list_contract_reminders(
    contract_id: str,
    authorization: str | None = Header(
        default=None
    ),
):
    context = get_authenticated_context(
        authorization
    )

    organization_id = (
        context["organization_id"]
    )

    contract = get_contract_by_id(
        organization_id,
        contract_id,
    )

    if not contract:
        raise HTTPException(
            status_code=404,
            detail="Contract not found.",
        )

    try:
        reminders = get_contract_reminders(
            organization_id,
            contract_id,
        )

        return {
            "reminders":
                reminders,
            "count":
                len(reminders),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load contract reminders: "
                f"{str(exc)}"
            ),
        )


def extract_pdf_text(
    content: bytes,
):
    try:
        document = pymupdf.open(
            stream=content
        )

        extracted_pages = []

        for page in document:
            page_text = (
                page.get_text()
            )

            if page_text:
                extracted_pages.append(
                    page_text
                )

        document.close()

        extracted_text = "\n".join(
            extracted_pages
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not process PDF: "
                f"{str(exc)}"
            ),
        )

    if not extracted_text.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "No readable text was found. "
                "This document may require OCR."
            ),
        )

    return extracted_text


def validate_pdf_content(
    file: UploadFile,
    content: bytes,
):
    if (
        file.content_type
        != "application/pdf"
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Only PDF files are supported."
            ),
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded PDF is empty.",
        )

    if not content.startswith(
        b"%PDF"
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "The uploaded file does not "
                "appear to be a valid PDF."
            ),
        )


def get_file_hash(
    content: bytes,
):
    return (
        hashlib
        .sha256(content)
        .hexdigest()
    )


def ensure_contract_not_duplicate(
    organization_id: str,
    file_hash: str,
):
    try:
        existing_contract = (
            find_contract_by_hash(
                organization_id,
                file_hash,
            )
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Duplicate check failed: "
                f"{str(exc)}"
            ),
        )

    if existing_contract:
        raise HTTPException(
            status_code=409,
            detail={
                "message":
                    (
                        "This contract has "
                        "already been saved."
                    ),

                "existing_contract_id":
                    existing_contract["id"],

                "vendor_name":
                    existing_contract.get(
                        "vendor_name"
                    ),
            },
        )


@app.post("/contracts/analyze")
async def analyze_contract(
    file: UploadFile = File(...),

    authorization: str | None = Header(
        default=None
    ),
):
    context = (
        get_authenticated_context(
            authorization
        )
    )

    organization_id = (
        context["organization_id"]
    )

    content = await file.read()

    validate_pdf_content(
        file,
        content,
    )

    file_hash = get_file_hash(
        content
    )

    ensure_contract_not_duplicate(
        organization_id,
        file_hash,
    )

    extracted_text = extract_pdf_text(
        content
    )

    try:
        contract_data = (
            extract_contract_data(
                extracted_text
            )
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "AI contract analysis failed: "
                f"{str(exc)}"
            ),
        )

    try:
        renewal_intelligence = (
            calculate_renewal_intelligence(
                contract_data
            )
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Renewal analysis failed: "
                f"{str(exc)}"
            ),
        )

    return {
        "filename":
            file.filename,

        "character_count":
            len(extracted_text),

        "contract":
            contract_data.model_dump(),

        "renewal_intelligence":
            renewal_intelligence,

        "message":
            (
                "Contract analyzed successfully. "
                "Review the extracted information "
                "before saving."
            ),
    }


@app.post("/contracts/save")
async def save_reviewed_contract(
    file: UploadFile = File(...),

    contract_json: str = Form(...),

    authorization: str | None = Header(
        default=None
    ),
):
    context = (
        get_authenticated_context(
            authorization
        )
    )

    organization_id = (
        context["organization_id"]
    )

    content = await file.read()

    validate_pdf_content(
        file,
        content,
    )

    file_hash = get_file_hash(
        content
    )

    # Repeat the duplicate check here.
    #
    # The analysis and save steps are separate,
    # so another copy of the contract could
    # theoretically be saved between them.
    ensure_contract_not_duplicate(
        organization_id,
        file_hash,
    )

    extracted_text = extract_pdf_text(
        content
    )

    try:
        reviewed_contract = (
            ContractData
            .model_validate_json(
                contract_json
            )
        )

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Some reviewed contract details are invalid. Review them and try again."
            ),
        )

    # Important:
    # always recalculate renewal intelligence
    # after the user edits the AI result.
    try:
        renewal_intelligence = (
            calculate_renewal_intelligence(
                reviewed_contract
            )
        )

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "We couldn't calculate renewal dates. Review the dates and notice terms, then try again."
            ),
        )

    # --------------------------------------------------
    # Save reviewed contract + intelligence
    # --------------------------------------------------

    try:
        saved_contract = save_contract(
            organization_id=
                organization_id,

            filename=
                file.filename,

            file_hash=
                file_hash,

            character_count=
                len(extracted_text),

            contract=
                reviewed_contract,

            renewal_intelligence=
                renewal_intelligence,

        )

    except Exception as exc:
        logging.getLogger("renewai.contracts").warning(
            "Contract persistence failed (%s)", type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                "Contract could not be saved. Please try again."
            ),
        )

    # Reminder errors must not turn a confirmed insert into a failed save.
    reminders = []
    reminder_status = "not_applicable"
    reminder_warning = None
    cancellation_deadline = renewal_intelligence.get("cancellation_deadline")

    if cancellation_deadline:
        try:
            reminders = create_contract_reminders(
                organization_id=organization_id,
                contract_id=saved_contract["id"],
                cancellation_deadline=cancellation_deadline,
            )
            reminder_status = "created"
        except Exception as exc:
            reminder_status = "failed"
            reminder_warning = (
                "Your contract is saved, but reminders could not be created. "
                "Use Generate Missing Alerts on the Reminders page."
            )
            logging.getLogger("renewai.contracts").warning(
                "Reminder creation failed for saved contract %s (%s)",
                saved_contract["id"], type(exc).__name__,
            )

    # --------------------------------------------------
    # Response
    # --------------------------------------------------

    return {
        "filename":
            file.filename,

        "character_count":
            len(extracted_text),

        "contract":
            reviewed_contract.model_dump(),

        "renewal_intelligence":
            renewal_intelligence,

        "ai_insight":
            None,

        "ai_analysis_status": saved_contract["ai_analysis_status"],
        "contract_saved": True,
        "ai_analysis_message": (
            "Contract saved. AI analysis is pending; request analysis separately."
        ),

        "database_id":
            saved_contract["id"],

        "organization_id":
            organization_id,

        "reminders":
            reminders,

        "reminder_count":
            len(reminders) if reminder_status != "failed" else None,

        "reminder_status": reminder_status,
        "reminder_warning": reminder_warning,

        "message":
            (
                "Contract saved successfully."
            ),
    }



@app.post("/contracts/{contract_id}/ai-insight")
def analyze_saved_contract_renewal(
    contract_id: str,
    authorization: str | None = Header(default=None),
):
    """Generate or retry advisory insights without saving a contract again."""
    context = get_authenticated_context(authorization)
    organization_id = context["organization_id"]

    try:
        saved_contract = get_contract_by_id(organization_id, contract_id)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="AI analysis temporarily unavailable. Please try again.",
        )

    if not saved_contract or saved_contract.get("archived"):
        raise HTTPException(status_code=404, detail="Contract not found.")

    try:
        # Reuse a completed result, including after a response was lost.
        if (
            saved_contract.get("ai_action")
            and saved_contract.get("ai_summary")
            and saved_contract.get("ai_confidence") is not None
        ):
            ai_insight = RenewalAIInsight.model_validate({
                "action": saved_contract["ai_action"],
                "confidence": saved_contract["ai_confidence"],
                "summary": saved_contract["ai_summary"],
                "key_findings": saved_contract.get("ai_key_findings") or [],
                "commercial_flags": saved_contract.get("ai_commercial_flags") or [],
            })
        else:
            update_contract_ai_analysis_status(
                organization_id, contract_id, "pending",
            )
            reviewed_contract = ContractData.model_validate({
                name: saved_contract.get(name)
                for name in ContractData.model_fields
            })
            # Use saved deterministic outputs; this endpoint does no date math.
            renewal_intelligence = {
                name: saved_contract.get(name)
                for name in (
                    "effective_start_date", "effective_end_date",
                    "effective_renewal_date", "derived_end_date",
                    "derived_renewal_date", "notice_window_open_date",
                    "notice_window_close_date", "cancellation_deadline",
                    "days_until_cancellation_deadline", "risk_level", "recommendation",
                )
            }
            ai_insight = generate_renewal_ai_insight(
                reviewed_contract, renewal_intelligence,
            )
            updated_contract = update_contract_ai_insight(
                organization_id, contract_id, ai_insight,
            )
            if not updated_contract:
                raise HTTPException(status_code=404, detail="Contract not found.")

    except HTTPException:
        raise
    except Exception as exc:
        logging.getLogger("renewai.contracts").warning(
            "AI insight generation or persistence failed for contract %s (%s)",
            contract_id, type(exc).__name__,
        )
        # A status-write failure must not hide the saved record or expose internals.
        # Conditional writes also keep a late failed attempt from undoing success.
        try:
            update_contract_ai_analysis_status(
                organization_id, contract_id, "failed",
            )
        except Exception as status_exc:
            logging.getLogger("renewai.contracts").warning(
                "AI failure status could not be persisted for contract %s (%s)",
                contract_id, type(status_exc).__name__,
            )
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Contract saved; AI analysis is temporarily unavailable. "
                    "Please retry AI analysis."
                ),
                "database_id": contract_id,
                "contract_saved": True,
                "ai_insight": None,
                "ai_analysis_status": "failed",
                "retryable": True,
            },
        )

    return {
        "database_id": contract_id,
        "ai_insight": ai_insight.model_dump(),
        "ai_analysis_status": "completed",
        "contract_saved": True,
        "message": "AI analysis completed successfully.",
    }
