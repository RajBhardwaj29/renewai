import os

from dotenv import load_dotenv

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)


load_dotenv()


AI_PROVIDER = os.getenv(
    "AI_PROVIDER",
    "ollama",
).lower()


OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "qwen3:8b",
)


GROQ_API_KEY = os.getenv(
    "GROQ_API_KEY",
)


GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b",
)


# =========================================================
# CONTRACT EXTRACTION MODEL
# =========================================================


class ContractData(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    vendor_name: str | None
    contract_title: str | None

    contract_value: float | None
    currency: str | None

    start_date: str | None
    end_date: str | None
    renewal_date: str | None

    initial_term_months: int | None
    renewal_term_months: int | None

    notice_period_days: int | None
    auto_renewal: bool | None

    renewal_clause: str | None
    termination_clause: str | None
    payment_terms: str | None

    renewal_clause: str | None
    termination_clause: str | None
    payment_terms: str | None

    pricing_clause: str | None
    minimum_commitment: str | None
    refund_clause: str | None


# =========================================================
# AI RENEWAL INTELLIGENCE MODEL
# =========================================================


class RenewalAIInsight(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    action: str

    confidence: float = Field(
        ge=0,
        le=1,
    )

    summary: str

    key_findings: list[str]
    commercial_flags: list[str]


# =========================================================
# CONTRACT EXTRACTION PROMPT
# =========================================================


def build_prompt(
    contract_text: str
) -> str:
    return f"""
You are a contract extraction system for RenewAI,
an AI-powered SaaS renewal management platform.

Your job is to extract structured information from SaaS and vendor contracts.

IMPORTANT RULES:

1. Extract only information explicitly supported by the contract.
2. Never guess missing information.
3. If information is unavailable, return null.
4. Dates should use YYYY-MM-DD whenever possible.
5. contract_value must be numeric only.
6. notice_period_days must be an integer.
7. auto_renewal should only be true if the contract explicitly states
   that the agreement renews automatically.
8. initial_term_months means the duration of the ORIGINAL contract term.
9. renewal_term_months means the duration of EACH subsequent renewal period.
10. Never confuse initial_term_months with renewal_term_months.
11. renewal_clause should contain language specifically related to renewal.
12. termination_clause should contain language specifically related to
    termination or cancellation rights.
13. Do not invent vendors, dates, prices, notice periods, or clauses.
14. If the contract provides a start date and duration but does not explicitly
    state an end date, leave end_date as null.
15. If the contract does not explicitly state a renewal date, leave
    renewal_date as null. Another system will calculate derived dates.
16. pricing_clause should contain contract language describing renewal
    price increases, price escalation, price adjustment rights, discounts,
    or other pricing changes relevant to renewal.
17. minimum_commitment should contain any minimum licence, seat, purchase,
    spend, volume, usage, or similar contractual commitment.
18. refund_clause should contain language describing whether prepaid fees
    or other payments are refundable or non-refundable.
19. Preserve commercially important details such as percentages, quantities,
    conditions and limitations when extracting these clauses.
CONTRACT TEXT:

{contract_text}
""".strip()


# =========================================================
# CONTRACT EXTRACTION — OLLAMA
# =========================================================


def extract_with_ollama(
    prompt: str
) -> ContractData:
    from ollama import chat

    response = chat(
        model=OLLAMA_MODEL,

        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],

        format=(
            ContractData
            .model_json_schema()
        ),

        options={
            "temperature": 0,
        },
    )

    return (
        ContractData
        .model_validate_json(
            response.message.content
        )
    )


# =========================================================
# CONTRACT EXTRACTION — GROQ
# =========================================================


def extract_with_groq(
    prompt: str
) -> ContractData:
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is missing."
        )

    from groq import Groq

    client = Groq(
        api_key=GROQ_API_KEY
    )

    schema = (
        ContractData
        .model_json_schema()
    )

    response = (
        client
        .chat
        .completions
        .create(
            model=GROQ_MODEL,

            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract structured "
                        "contract data. "
                        "Return only information "
                        "supported by the contract."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],

            temperature=0,

            response_format={
                "type": "json_schema",

                "json_schema": {
                    "name": "contract_data",

                    "strict": True,

                    "schema": schema,
                },
            },
        )
    )

    content = (
        response
        .choices[0]
        .message
        .content
    )

    if not content:
        raise RuntimeError(
            "Groq returned an empty response."
        )

    return (
        ContractData
        .model_validate_json(
            content
        )
    )


# =========================================================
# CONTRACT EXTRACTION ROUTER
# =========================================================


def extract_contract_data(
    contract_text: str
) -> ContractData:
    prompt = build_prompt(
        contract_text
    )

    if AI_PROVIDER == "ollama":
        return extract_with_ollama(
            prompt
        )

    if AI_PROVIDER == "groq":
        return extract_with_groq(
            prompt
        )

    raise RuntimeError(
        (
            "Unsupported AI_PROVIDER: "
            f"{AI_PROVIDER}. "
            "Use 'ollama' or 'groq'."
        )
    )


# =========================================================
# AI RENEWAL INTELLIGENCE PROMPT
# =========================================================


def build_renewal_insight_prompt(
    contract: ContractData,
    renewal_intelligence: dict,
) -> str:
    return f"""
You are the renewal intelligence layer for RenewAI.

Your job is to analyze a HUMAN-REVIEWED contract together with
DETERMINISTIC renewal calculations already produced by RenewAI.

Your goal is NOT to summarize the contract.

Your goal is to identify contractual and commercial renewal risk
and recommend the most appropriate next action.

IMPORTANT RULES:

1. Never recalculate dates.
2. Never contradict the supplied deterministic renewal calculations.
3. Never invent facts.
4. Use only information supported by the reviewed contract.
5. Do not assume product usage, business value, market alternatives,
   vendor performance, or internal company priorities.
6. Do not recommend definite renewal or definite cancellation based
   only on the contract.
7. Focus on contractual lock-in, pricing exposure, renewal mechanics,
   notice obligations, termination flexibility and commercial leverage.
8. confidence must be between 0 and 1.
9. key_findings must contain important factual observations.
10. commercial_flags must explain commercially meaningful concerns,
    not merely repeat contract fields.

ALLOWED ACTIONS:

"monitor"

Use only when the contract creates no meaningful renewal concern
and no important commercial review issue is identified.

"review"

Use when the contract contains terms that deserve review before renewal,
including automatic renewal, meaningful notice requirements, limited
termination flexibility, non-refundable commitments, or material
commercial obligations.

"renegotiate"

Use when the contract contains terms that create a reasonable basis
to seek better commercial or contractual terms before renewal.

Examples include:

- automatic renewal combined with limited termination flexibility
- non-refundable prepaid commitments
- price increase rights
- minimum purchase or licence commitments
- restrictive renewal provisions
- commercially one-sided termination rights
- contractual lock-in risk

"consider_cancellation"

Use only when the contract contains unusually restrictive renewal or
termination conditions that create significant exposure.

Do NOT use this merely because:

- the contract is expensive
- the deadline is close
- the agreement automatically renews

ACTION SELECTION GUIDANCE:

If there is:

- auto-renewal only -> usually "review"
- auto-renewal + notice period -> usually "review"
- auto-renewal + no convenience termination -> usually at least "review"
- auto-renewal + no convenience termination + non-refundable fees
  -> strongly consider "renegotiate"
- price escalation rights -> consider "renegotiate"
- minimum commitments -> consider "renegotiate"
- highly restrictive termination + strong lock-in
  -> consider "consider_cancellation"

Do not choose "monitor" simply because the cancellation deadline
is far away.

The action should reflect CONTRACT QUALITY AND COMMERCIAL EXPOSURE,
while the deterministic risk level reflects TIME URGENCY.

These are separate concepts.

REVIEWED CONTRACT:

Vendor:
{contract.vendor_name}

Contract title:
{contract.contract_title}

Contract value:
{contract.contract_value}

Currency:
{contract.currency}

Start date:
{contract.start_date}

End date:
{contract.end_date}

Explicit renewal date:
{contract.renewal_date}

Initial term months:
{contract.initial_term_months}

Renewal term months:
{contract.renewal_term_months}

Notice period days:
{contract.notice_period_days}

Auto renewal:
{contract.auto_renewal}

Renewal clause:
{contract.renewal_clause}

Termination clause:
{contract.termination_clause}

Payment terms:
{contract.payment_terms}

Pricing clause:
{contract.pricing_clause}

Minimum commitment:
{contract.minimum_commitment}

Refund clause:
{contract.refund_clause}

DETERMINISTIC RENEWAI CALCULATIONS:

Effective start date:
{renewal_intelligence.get("effective_start_date")}

Effective end date:
{renewal_intelligence.get("effective_end_date")}

Effective renewal date:
{renewal_intelligence.get("effective_renewal_date")}

Cancellation deadline:
{renewal_intelligence.get("cancellation_deadline")}

Days until cancellation deadline:
{renewal_intelligence.get("days_until_cancellation_deadline")}

Risk level:
{renewal_intelligence.get("risk_level")}

Operational recommendation:
{renewal_intelligence.get("recommendation")}

OUTPUT REQUIREMENTS:

Return:

- action
- confidence
- summary
- key_findings
- commercial_flags

summary:

Explain the renewal recommendation in 1-3 concise sentences.

key_findings:

Return 3-6 factual renewal-relevant findings when supported.

commercial_flags:

Return 0-5 commercially meaningful concerns.
Each item should explain WHY the term matters.

Good commercial flag:

"No convenience termination creates lock-in if the renewal window is missed."

Bad commercial flag:

"No convenience termination."

Good commercial flag:

"Non-refundable prepaid fees reduce flexibility after renewal."

Bad commercial flag:

"Prepaid fees non-refundable."

If there are no meaningful commercial concerns, return an empty list.
""".strip()


# =========================================================
# AI RENEWAL INTELLIGENCE — OLLAMA
# =========================================================


def generate_with_ollama(
    prompt: str
) -> RenewalAIInsight:
    from ollama import chat

    response = chat(
        model=OLLAMA_MODEL,

        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],

        format=(
            RenewalAIInsight
            .model_json_schema()
        ),

        options={
            "temperature": 0,
        },
    )

    return (
        RenewalAIInsight
        .model_validate_json(
            response.message.content
        )
    )


# =========================================================
# AI RENEWAL INTELLIGENCE — GROQ
# =========================================================


def generate_with_groq(
    prompt: str
) -> RenewalAIInsight:
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is missing."
        )

    from groq import Groq

    client = Groq(
        api_key=GROQ_API_KEY
    )

    schema = (
        RenewalAIInsight
        .model_json_schema()
    )

    response = (
        client
        .chat
        .completions
        .create(
            model=GROQ_MODEL,

            messages=[
                {
                    "role": "system",

                    "content": (
                        "You are a contract renewal "
                        "intelligence system. "
                        "Use only the supplied reviewed "
                        "contract facts and deterministic "
                        "RenewAI calculations."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],

            temperature=0,

            response_format={
                "type": "json_schema",

                "json_schema": {
                    "name": "renewal_ai_insight",

                    "strict": True,

                    "schema": schema,
                },
            },
        )
    )

    content = (
        response
        .choices[0]
        .message
        .content
    )

    if not content:
        raise RuntimeError(
            "Groq returned an empty response."
        )

    return (
        RenewalAIInsight
        .model_validate_json(
            content
        )
    )


# =========================================================
# AI RENEWAL INTELLIGENCE ROUTER
# =========================================================


def generate_renewal_ai_insight(
    contract: ContractData,
    renewal_intelligence: dict,
) -> RenewalAIInsight:

    prompt = (
        build_renewal_insight_prompt(
            contract,
            renewal_intelligence,
        )
    )

    if AI_PROVIDER == "ollama":
        return generate_with_ollama(
            prompt
        )

    if AI_PROVIDER == "groq":
        return generate_with_groq(
            prompt
        )

    raise RuntimeError(
        (
            "Unsupported AI_PROVIDER: "
            f"{AI_PROVIDER}. "
            "Use 'ollama' or 'groq'."
        )
    )