"""Private retained page text; never include this row in contract-list responses."""
import hashlib
import hmac
from fastapi import HTTPException
import database
from upload_security import MAX_PDF_PAGES, MAX_TEXT_CHARACTERS


def text_hash(pages):
    if (not isinstance(pages, list) or not 1 <= len(pages) <= MAX_PDF_PAGES
            or any(not isinstance(page, str) for page in pages)
            or sum(map(len, pages)) > MAX_TEXT_CHARACTERS):
        raise ValueError("Invalid retained source")
    return hashlib.sha256("\n".join(pages).encode()).hexdigest()


def get_source(organization_id, contract):
    rows = (database.supabase.table("contract_source_documents").select("*")
            .eq("organization_id", organization_id).eq("contract_id", contract["id"])
            .limit(1).execute()).data
    if not rows:
        return None
    source = rows[0]
    try:
        valid = (source["organization_id"] == organization_id
                 and source["contract_id"] == contract["id"]
                 and hmac.compare_digest(source["document_sha256"], contract["file_hash"])
                 and hmac.compare_digest(text_hash(source["pages"]), source["text_sha256"]))
        expected = (contract.get("source_evidence") or {}).get("text_sha256")
        if expected:
            valid = valid and hmac.compare_digest(expected, source["text_sha256"])
        if not valid:
            raise ValueError("Invalid retained source")
    except (KeyError, TypeError, ValueError):
        raise HTTPException(503, "Ask RenewAI is temporarily unavailable. Please try again.")
    return source["pages"]


def attach_source(organization_id, contract, pages):
    database.supabase.rpc("attach_contract_source", {
        "p_organization_id": organization_id, "p_contract_id": contract["id"],
        "p_document_sha256": contract["file_hash"], "p_pages": pages,
    }).execute()
