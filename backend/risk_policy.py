"""Conservative deterministic ratings of quoted terms under a demo policy.

These rules are product defaults, not market standards, legal judgments or an
organization-approved playbook. Unsupported grammar fails closed for manual review.
"""
from decimal import Decimal
import re

POLICY = {
    'id': 'renewai-demo-procurement-v1',
    'name': 'RenewAI demo procurement policy v1',
    'summary': 'Per-renewal price cap: up to 5% Low; above 5% to 10% Medium; above 10% High. Minimum duration: up to 12 months Low; 13 to 24 months Medium; above 24 months High. Refund: express pro-rata convenience refund Low; non-refundable with an explicit provider-breach exception Medium; express no-exceptions restriction High. Unsupported or unresolved wording: Not assessed.',
    'pricing_low_max_percent': 5,
    'pricing_medium_max_percent': 10,
    'commitment_low_max_months': 12,
    'commitment_medium_max_months': 24,
    'refund_rules': 'Low: explicit pro-rata unused prepaid fee refund; Medium: explicit non-refundability with a stated breach exception; High: explicit non-refundability without exceptions.',
    'qualification': 'Provisional rating of the cited term only. Demo defaults, not your approved policy, a contract approval or a complete risk assessment. Check surrounding terms and amendments.',
}


def rate_term(category, text, grounded):
    def result(level, reason):
        return {'severity': level, 'severity_reason': reason}

    if not grounded:
        return result('not_assessed', 'An exact, unique source match is required before applying the policy.')
    wording = ' '.join((text or '').split()).lower()
    if re.search(r'\d{5}', wording):
        return result('not_assessed', 'A numeric value exceeds the supported policy parser range; review the wording manually.')
    # Do not resolve precedence or incorporated qualifications through keywords.
    if re.search(r'\b(?:amend\w*|supersed\w*|subject to|unless|provided that|notwithstanding|section\s+\d|clause\s+\d|express provision|other provision|elsewhere)\b', wording):
        return result('not_assessed', 'The wording contains a qualification or reference requiring context review before rating.')

    if category == 'pricing':
        caps = re.findall(r'\bmay (?:increase|raise)\b[^.!?;%]{0,100}?\b(?:up to|by no more than)\s*(\d+(?:\.\d+)?)\s*%', wording)
        percentages = re.findall(r'(\d+(?:\.\d+)?)\s*%', wording)
        if (len(caps) != 1 or not re.search(r'\brenew\w*\b', wording)
                or any(Decimal(p) != Decimal(caps[0]) for p in percentages)
                or re.search(r'\b(?:except|index\w*|cpi|compound\w*|minimum|monthly|daily|greater|lesser|additional|plus|unlimited|uncapped|without limit)\b', wording)):
            return result('not_assessed', 'No single supported per-renewal percentage cap was established; formulas, frequencies and qualifications require manual review.')
        value = Decimal(caps[0])
        low, medium = POLICY['pricing_low_max_percent'], POLICY['pricing_medium_max_percent']
        level = 'low' if value <= low else 'medium' if value <= medium else 'high'
        band = f'at or below {low}%' if level == 'low' else f'above {low}% and at or below {medium}%' if level == 'medium' else f'above {medium}%'
        return result(level, f'The cited term permits an increase capped at {value}% per renewal, {band} under this demo policy. Consent requirements and other quoted qualifications still apply; this is not a prediction of the actual increase.')

    if category == 'commitment':
        durations = re.findall(r'(?<![\w.-])(\d+)\s*[- ]?\s*(month|year)s?\s+minimum commitment\b|\bminimum commitment\s+(?:is|of)\s+(\d+)\s*[- ]?\s*(month|year)s?\b', wording)
        if len(durations) != 1 or re.search(r'\b(?:except|renew\w*|extend\w*|additional|evergreen|notice|no|not|never|optional|may|maximum|up to|at most)\b', wording):
            return result('not_assessed', 'No single explicit minimum commitment duration was established. Quantities, spend and renewal obligations are not converted into duration.')
        if len(re.findall(r'\d+(?:\.\d+)?\s*[- ]?\s*(?:month|year)s?\b', wording)) != 1:
            return result('not_assessed', 'Multiple or qualified durations require manual review before applying the commitment thresholds.')
        a, unit_a, b, unit_b = durations[0]
        months = int(a or b) * (12 if (unit_a or unit_b) == 'year' else 1)
        if months <= 0:
            return result('not_assessed', 'The minimum commitment duration must be positive.')
        low, medium = POLICY['commitment_low_max_months'], POLICY['commitment_medium_max_months']
        level = 'low' if months <= low else 'medium' if months <= medium else 'high'
        band = f'at or below {low} months' if level == 'low' else f'above {low} and at or below {medium} months' if level == 'medium' else f'above {medium} months'
        return result(level, f'The explicit minimum commitment is {months} months, {band} under this demo policy. The rating does not assess seat utilization, affordability or savings.')

    if category == 'refund':
        # Full matches deliberately bound supported grammar. A familiar keyword
        # inside a more complicated remedy must not manufacture a definitive rating.
        if re.fullmatch(r'(?:fees|prepaid fees) are non-refundable(?: once the term begins)?(?: without exceptions| in all circumstances)\.', wording):
            return result('high', 'The cited term expressly makes fees non-refundable without a stated exception in this supported wording. The demo policy rates this restriction High; other agreement remedies still require review.')
        if re.fullmatch(r'(?:fees|prepaid fees) are non-refundable(?: once the term begins)?,? except for (?:a )?(?:material |uncured material )?breach by (?:the )?(?:provider|supplier)\.', wording):
            return result('medium', 'The cited term restricts refunds but expressly preserves a provider-breach exception. The demo policy rates this combination Medium; check how the exception operates.')
        if re.fullmatch(r'(?:customer|the customer) (?:may|can) (?:terminate|cancel) for convenience and (?:receive|obtain) a pro-rata refund of unused prepaid fees\.', wording):
            return result('low', 'The cited term expressly permits convenience termination with a pro-rata refund of unused prepaid fees. This meets the demo policy Low refund-restriction rule; it does not rate other charges or clauses.')
        return result('not_assessed', 'Refund entitlement, exceptions or scope cannot be established by the supported rules. Check the cited wording and linked remedies; no missing refund right is inferred.')
    return result('not_assessed', 'This category is outside the selected policy.')
