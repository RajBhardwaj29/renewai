import hashlib
import os

import pymupdf

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    Header,
)

from contextlib import asynccontextmanager

from reminder_scheduler import (
    start_reminder_scheduler,
    stop_reminder_scheduler,
)

from fastapi.middleware.cors import CORSMiddleware

from contract_ai import extract_contract_data
from renewal_engine import calculate_renewal_intelligence
from email_service import send_renewal_reminder_email

from database import (
    verify_access_token,
    get_user_organization,
    save_contract,
    get_contracts,
    get_contract_by_id,
    find_contract_by_hash,
    archive_contract,
    get_reminders,
    get_upcoming_reminders,
    get_due_reminders,
    get_contract_reminders,
    backfill_contract_reminders,
    get_pending_due_reminders_for_delivery,
    mark_reminder_sent,
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
        contracts = get_contracts(
            organization_id
        )

        return {
            "contracts":
                contracts,
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
                contract
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
def send_due_reminders(
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

    user = context["user"]

    recipient_email = (
        user.email
    )

    if not recipient_email:
        raise HTTPException(
            status_code=400,
            detail=(
                "Authenticated user does not "
                "have an email address."
            ),
        )

    try:
        reminders = (
            get_pending_due_reminders_for_delivery(
                organization_id
            )
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not load due reminders "
                f"for delivery: {str(exc)}"
            ),
        )

    sent = []
    failed = []

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
                    reminder["reminder_type"],

                remind_on=
                    reminder["remind_on"],

                cancellation_deadline=
                    contract.get(
                        "cancellation_deadline"
                    ),

                renewal_date=
                    contract.get(
                        "effective_renewal_date"
                    ),
            )

            updated = mark_reminder_sent(
                organization_id,
                reminder["id"],
            )

            sent.append({
                "reminder_id":
                    reminder["id"],

                "vendor_name":
                    vendor_name,

                "reminder_type":
                    reminder["reminder_type"],

                "recipient":
                    recipient_email,

                "status":
                    updated.get("status")
                    if updated
                    else "sent",
            })

        except Exception as exc:
            failed.append({
                "reminder_id":
                    reminder["id"],

                "vendor_name":
                    vendor_name,

                "reminder_type":
                    reminder["reminder_type"],

                "error":
                    str(exc),
            })

    return {
        "message":
            "Due reminder delivery completed.",

        "due_found":
            len(reminders),

        "sent_count":
            len(sent),

        "failed_count":
            len(failed),

        "sent":
            sent,

        "failed":
            failed,
    }


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


@app.post("/contracts/upload")
async def upload_contract(
    file: UploadFile = File(...),
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

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded PDF is empty.",
        )

    if not content.startswith(b"%PDF"):
        raise HTTPException(
            status_code=400,
            detail=(
                "The uploaded file does not "
                "appear to be a valid PDF."
            ),
        )

    file_hash = (
        hashlib
        .sha256(content)
        .hexdigest()
    )

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
                        "already been analyzed."
                    ),
                "existing_contract_id":
                    existing_contract["id"],
                "vendor_name":
                    existing_contract.get(
                        "vendor_name"
                    ),
            },
        )

    try:
        document = pymupdf.open(
            stream=content
        )

        extracted_pages = []

        for page in document:
            page_text = page.get_text()

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

    try:
        contract_data = extract_contract_data(
            extracted_text
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
                contract_data,

            renewal_intelligence=
                renewal_intelligence,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Database save failed: "
                f"{str(exc)}"
            ),
        )

    try:
        reminders = get_contract_reminders(
            organization_id,
            saved_contract["id"],
        )

    except Exception:
        reminders = []

    return {
        "filename":
            file.filename,

        "character_count":
            len(extracted_text),

        "contract":
            contract_data.model_dump(),

        "renewal_intelligence":
            renewal_intelligence,

        "database_id":
            saved_contract["id"],

        "organization_id":
            organization_id,

        "reminders":
            reminders,

        "reminder_count":
            len(reminders),

        "message":
            (
                "Contract analyzed, saved "
                "and reminders created successfully"
            ),
    }