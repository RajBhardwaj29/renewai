"""Deterministic source attribution for extracted/reviewed clause candidates.

Matching proves textual occurrence, never that a clause is current, complete,
legally controlling or correctly interpreted. Signals are review prompts, not a
legal/commercial risk score. Untrusted PDF instructions cannot configure rules.
"""
import hashlib
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

ClauseField = Literal["renewal_clause", "termination_clause", "payment_terms",
                      "pricing_clause", "minimum_commitment", "refund_clause"]
CLAUSE_FIELDS = ("renewal_clause", "termination_clause", "payment_terms",
                 "pricing_clause", "minimum_commitment", "refund_clause")


class EvidenceModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SourceSpan(EvidenceModel):
    page: int = Field(ge=1)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    quote: str


class ClauseEvidence(EvidenceModel):
    field: ClauseField
    text: str | None
    status: Literal["missing", "grounded", "ambiguous", "unverified"]
    source_spans: list[SourceSpan]


class RiskEvidence(EvidenceModel):
    rule: Literal["clause_review_required", "source_verification_required"]
    clause_field: ClauseField
    priority: Literal["review", "unknown"]
    explanation: str


class ContractEvidence(EvidenceModel):
    schema_version: Literal["renewai.evidence.v1"] = "renewai.evidence.v1"
    method: Literal["literal-whitespace-v1"] = "literal-whitespace-v1"
    document_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    text_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    stage: Literal["extracted_draft", "reviewed_submission"]
    original_cancellation_deadline: str | None
    clauses: list[ClauseEvidence]
    risk_evidence: list[RiskEvidence]
    requires_human_review: Literal[True] = True


def _normalized_source(pages):
    # Map normalized character positions back to original page-local offsets.
    # Only whitespace is normalized. No case folding, fuzzy or semantic match.
    tokens, locations = [], []
    for page_number, page in enumerate(pages, 1):
        for match in re.finditer(r"\S+", page):
            if tokens:
                tokens.append(" ")
                locations.append(None)
            word = match.group()
            tokens.append(word)
            locations.extend((page_number, offset) for offset in range(match.start(), match.end()))
    return "".join(tokens), locations


def build_contract_evidence(pages: list[str], document_sha256: str, contract, *, stage: str) -> ContractEvidence:
    source, locations = _normalized_source(pages)
    clauses, signals = [], []
    for field in CLAUSE_FIELDS:
        text = getattr(contract, field)
        needle = " ".join((text or "").split())
        spans = []
        status = "missing"
        if needle:
            first = source.find(needle)
            if first < 0:
                status = "unverified"
            elif source.find(needle, first + 1) >= 0:
                status = "ambiguous"
            else:
                # Reject partial words: e.g. 'refundable' inside 'nonrefundable'.
                end = first + len(needle)
                partial_word = ((first > 0 and source[first - 1].isalnum() and needle[0].isalnum())
                                or (end < len(source) and source[end].isalnum() and needle[-1].isalnum()))
                status = "unverified" if partial_word else "grounded"
                if status == "grounded":
                    bounds = {}
                    for location in locations[first:end]:
                        if location is not None:
                            page, offset = location
                            bounds.setdefault(page, [offset, offset + 1])[1] = offset + 1
                    spans = [SourceSpan(page=page, start=start, end=end,
                                        quote=pages[page - 1][start:end])
                             for page, (start, end) in bounds.items()]
        clauses.append(ClauseEvidence(field=field, text=text, status=status, source_spans=spans))
        signals.append(RiskEvidence(
            rule="clause_review_required" if status == "grounded" else "source_verification_required",
            clause_field=field, priority="review" if status == "grounded" else "unknown",
            explanation=("Review the quoted clause, adjacent qualifications and any amendments. Textual grounding does not establish applicability."
                         if status == "grounded" else
                         "Source support is missing, ambiguous or unverified. Confirm against the PDF before relying on this term."),
        ))
    return ContractEvidence(
        document_sha256=document_sha256,
        text_sha256=hashlib.sha256("\n".join(pages).encode()).hexdigest(),
        stage=stage, original_cancellation_deadline=contract.cancellation_deadline,
        clauses=clauses, risk_evidence=signals,
    )
