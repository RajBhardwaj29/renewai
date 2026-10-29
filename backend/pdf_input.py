"""Supported text-PDF input; no durable original-document storage."""
import pymupdf
from fastapi import HTTPException
from upload_security import MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_TEXT_CHARACTERS


def extract_pdf_pages(content: bytes) -> list[str]:
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(413, "PDF exceeds the 10 MiB limit.")
    try:
        with pymupdf.open(stream=content, filetype="pdf") as document:
            if document.needs_pass:
                raise HTTPException(400, "This PDF is password-protected. Upload an unlocked copy.")
            if document.page_count > MAX_PDF_PAGES:
                raise HTTPException(413, "PDF exceeds the 200-page limit.")
            pages, count = [], 0
            for page in document:
                text = page.get_text()
                count += len(text) + (1 if pages else 0)
                if count > MAX_TEXT_CHARACTERS:
                    raise HTTPException(413, "PDF exceeds the 500,000-character text limit.")
                pages.append(text)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "This PDF could not be read. It may be damaged. Export a new PDF and try again.")
    if not any(page.strip() for page in pages):
        raise HTTPException(400, "No readable text was found. This document may require OCR.")
    return pages


def extract_pdf_text(content: bytes) -> str:
    return "\n".join(extract_pdf_pages(content))
