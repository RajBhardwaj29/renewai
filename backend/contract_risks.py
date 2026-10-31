"""Bounded commercial review prompts, never completeness or legal judgments."""
import hashlib
import json
import re
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from contract_evidence import build_contract_evidence
from contract_ai import ContractData
from risk_policy import POLICY, rate_term

RULES = {
    'pricing_clause': ('pricing', 'Renewal pricing increase', r'\b(increas\w*|uplift\w*|escalat\w*)\b', 'Check the permitted increase, cap, notice and consent conditions before agreeing renewal pricing.'),
    'minimum_commitment': ('commitment', 'Minimum commitment', r'\b(minimum|commit\w*|at least|take.or.pay)\b', 'Check the committed quantity, spend and duration against your approved needs. Usage and savings are not assessed.'),
    'refund_clause': ('refund', 'Refund restrictions', r'\b(non.refund\w*|not refundable|no refunds?|refund\w*)\b', 'Check refund eligibility, exclusions and credits with the full agreement before committing prepaid fees.'),
}

class RiskReview(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    fingerprint: str = Field(pattern=r'^[a-f0-9]{64}$')
    status: Literal['confirmed', 'dismissed', 'needs_context']
    rationale: str = Field(min_length=1, max_length=1000)
    expected_revision: int = Field(ge=0)


def findings(contract, pages):
    """Rebuild attribution from trusted source, not client or saved badges."""
    if pages is None:
        return []
    data = ContractData.model_validate({k: contract.get(k) for k in ContractData.model_fields})
    evidence = build_contract_evidence(pages, contract['file_hash'], data, stage='reviewed_submission')
    context_requires_review = any(re.search(r'\b(?:amendment|addendum|supersed\w*|order of precedence)\b', page, re.I) for page in pages)
    result = []
    for clause in evidence.clauses:
        if clause.field not in RULES:
            continue
        category, title, pattern, action = RULES[clause.field]
        grounded = clause.status == 'grounded'
        detected = grounded and bool(re.search(pattern, clause.text or '', re.I))
        identity = json.dumps(['commercial-review-v2', POLICY, evidence.document_sha256, evidence.text_sha256,
                               clause.field, clause.text], ensure_ascii=False)
        rating = rate_term(category, clause.text, grounded)
        if context_requires_review:
            rating = {'severity': 'not_assessed', 'severity_reason': 'The source mentions amendments or precedence. Confirm which wording governs before applying the policy.'}
        result.append({'category': category, 'title': title,
            'fingerprint': hashlib.sha256(identity.encode()).hexdigest(),
            'status': 'review_required' if detected else 'not_assessed',
            **rating,
            'grounding': clause.status,
            'explanation': action if detected else 'No supported review signal established. This does not establish that the term is absent or acceptable.',
            'citations': [s.model_dump() for s in clause.source_spans] if grounded else [],
            'review': None})
    return result


def load_review(contract, organization_id, pages):
    import database
    items = findings(contract, pages)
    rows = database.supabase.table('contract_risk_reviews').select('*').eq('organization_id', organization_id).eq('contract_id', contract['id']).execute().data
    by_key = {row['fingerprint']: row for row in rows}
    for item in items:
        row = by_key.get(item['fingerprint'])
        if row:
            item['review'] = {key: row[key] for key in ('status', 'rationale', 'revision', 'reviewed_at')}
    return {'version': 'commercial-review-v2', 'policy': POLICY, 'coverage': 'Three saved clause candidates only; other clauses, amendments and missing terms require manual review.', 'items': items}
