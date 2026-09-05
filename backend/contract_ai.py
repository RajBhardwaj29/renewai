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
    notice_period_value: int | None
    notice_period_unit: str | None
    notice_period_anchor: str | None
    auto_renewal: bool | None

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
6. Preserve the notice period exactly as expressed by the contract.

   notice_period_value must contain the numeric amount of the notice period.

   notice_period_unit must use exactly one of:
   - "days"
   - "months"
   - null

   notice_period_days exists for backward compatibility.

   When the contract explicitly expresses the notice period in days:
   - set notice_period_value to the number of days
   - set notice_period_unit to "days"
   - set notice_period_days to the same number

   Example:
   "Customer must give notice at least 90 days before expiration."
   -> notice_period_value = 90
   -> notice_period_unit = "days"
   -> notice_period_days = 90

   When the contract explicitly expresses the notice period in calendar months
   or months:
   - set notice_period_value to the number of months
   - set notice_period_unit to "months"
   - set notice_period_days = null

   Example:
   "Customer must provide notice at least 3 calendar months before
   the applicable renewal date."
   -> notice_period_value = 3
   -> notice_period_unit = "months"
   -> notice_period_days = null

   Never convert months into days.
   Never convert days into months.
   Never approximate a calendar month as 30 days.

7. notice_period_anchor identifies the explicit contractual date from which
   the notice period must be counted backwards.

   Use exactly one of these values:
   - "end_date"
   - "renewal_date"
   - null

   Return "end_date" when the notice clause explicitly measures notice before
   the end, expiration, or expiry of the current contractual term.

   Example:
   "Customer must give notice at least 90 days before the end of the current term."
   -> notice_period_value = 90
   -> notice_period_unit = "days"
   -> notice_period_days = 90
   -> notice_period_anchor = "end_date"

   Return "renewal_date" when the notice clause explicitly measures notice
   before the renewal date, automatic renewal date, or commencement of the
   renewal term.

   Example:
   "Customer must provide written notice of non-renewal no later than
   60 calendar days before the applicable renewal date."
   -> notice_period_value = 60
   -> notice_period_unit = "days"
   -> notice_period_days = 60
   -> notice_period_anchor = "renewal_date"

   Example:
   "Customer must provide notice at least 3 calendar months before
   the applicable renewal date."
   -> notice_period_value = 3
   -> notice_period_unit = "months"
   -> notice_period_days = null
   -> notice_period_anchor = "renewal_date"

   Determine the anchor from the wording of the notice requirement itself.
   Do not substitute end_date merely because an end date exists.

   If the notice clause does not clearly identify the date against which
   notice must be measured, return null.

   Never infer an anchor from dates alone.
   
8. auto_renewal should only be true if the contract explicitly states
   that the agreement renews automatically.
9. initial_term_months means the duration of the ORIGINAL contract term.
10. renewal_term_months means the duration of EACH subsequent renewal period.
11. Never confuse initial_term_months with renewal_term_months.
12. renewal_clause should contain language specifically related to renewal.
13. termination_clause should contain language specifically related to
    termination or cancellation rights.
14. Do not invent vendors, dates, prices, notice periods, or clauses.
15. If the contract provides a start date and duration but does not explicitly
    state an end date, leave end_date as null.
16. If the contract does not explicitly state a renewal date, leave
    renewal_date as null. Another system will calculate derived dates.
17. pricing_clause should contain contract language describing renewal
    price increases, price escalation, price adjustment rights, discounts,
    or other pricing changes relevant to renewal.
18. minimum_commitment should contain any minimum licence, seat, purchase,
    spend, volume, usage, or similar contractual commitment.
19. refund_clause should contain language describing whether prepaid fees
    or other payments are refundable or non-refundable.
20. Preserve commercially important details such as percentages, quantities,
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

You analyze a HUMAN-REVIEWED contract together with
DETERMINISTIC renewal calculations already produced by RenewAI.

Your job is to identify renewal-related contractual and commercial
exposure and recommend an appropriate next action.

You are NOT a general business advisor.
You are NOT a legal advisor.
You must remain strictly grounded in the supplied contract data.

IMPORTANT GROUNDING RULES:

1. Never invent facts.

2. Never infer facts about the customer's company that are not
   explicitly provided.

3. Do NOT assume:
   - company size
   - employee count
   - procurement process
   - budget cycle
   - business priorities
   - product usage
   - customer satisfaction
   - vendor performance
   - market alternatives
   - negotiation leverage
   - implementation difficulty
   - switching costs
   unless explicitly supported by the supplied contract.

4. Do not use hypothetical external context such as:
   "large companies usually..."
   "industry standards suggest..."
   "most businesses need..."
   unless that information is explicitly present in the contract.

5. Never state that a notice period is too short, too long,
   sufficient or insufficient unless the contract itself provides
   a basis for that conclusion.

6. You MAY explain the direct contractual consequence of a term.

Good:
"A 90-day notice requirement means the non-renewal decision must
be made at least 90 days before the renewal date."

Bad:
"A 90-day notice period may be insufficient for large organizations
to adjust their budgets."

7. You MAY explain direct commercial exposure supported by the term.

Good:
"A 12% renewal price increase right creates potential cost exposure
at renewal."

Bad:
"The vendor is likely to exercise the full 12% increase."

8. You MAY explain contractual lock-in.

Good:
"No termination-for-convenience right reduces flexibility during
the renewal term."

Bad:
"The customer will be trapped with the vendor."

9. Key findings must be FACTS.

10. Commercial flags must be FACT + DIRECT IMPLICATION.

11. Do not exaggerate risk.

12. Do not make legal conclusions.

13. Do not claim the customer should definitely renew or cancel.

14. Never recalculate dates.

15. Never contradict RenewAI's deterministic renewal calculations.

16. confidence must be between 0 and 1.

17. If the evidence is incomplete, reflect that uncertainty
    in the confidence score.

18. The deterministic risk level describes TIME URGENCY.

19. The AI action describes CONTRACTUAL AND COMMERCIAL EXPOSURE.

These are separate concepts.

ALLOWED ACTIONS:

"monitor"

Use only when there is no meaningful contractual or commercial
renewal concern based on the supplied information.


"review"

Use when the contract contains terms that deserve review before renewal.

Examples:
- automatic renewal
- meaningful notice requirements
- limited termination flexibility
- non-refundable commitments
- material contractual obligations


"renegotiate"

Use when the supplied contract creates a reasonable contractual or
commercial basis for seeking improved terms before renewal.

Examples:
- renewal price increase rights
- minimum licence or spend commitments
- non-refundable prepaid commitments
- automatic renewal combined with limited termination flexibility
- restrictive renewal provisions
- commercially one-sided contractual terms


"consider_cancellation"

Use only where the supplied contract contains unusually restrictive
renewal or termination provisions that create significant contractual
exposure.

Do NOT select this merely because:
- the contract value is high
- the deadline is close
- the agreement automatically renews


ACTION SELECTION GUIDANCE:

auto-renewal only
→ usually "review"

auto-renewal + notice requirement
→ usually "review"

auto-renewal + no convenience termination
→ at least "review"

auto-renewal + no convenience termination + non-refundable fees
→ consider "renegotiate"

renewal price escalation rights
→ consider "renegotiate"

minimum licence / spend / purchase commitment
→ consider "renegotiate"

multiple lock-in terms combined
→ strongly consider "renegotiate"

extremely restrictive renewal + termination structure
→ may justify "consider_cancellation"

Do NOT choose "monitor" simply because the cancellation deadline
is far away.

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

Notice period anchor:
{contract.notice_period_anchor}

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


SUMMARY:

Write 1-3 concise sentences.

Explain why the selected action is appropriate based ONLY on the
supplied contract.

Do not include unsupported assumptions.


KEY_FINDINGS:

Return 3-6 factual renewal-relevant findings when supported.

Each finding must be directly traceable to the reviewed contract.

Good:
"Vendor may increase renewal pricing by up to 12%."

Bad:
"Vendor pricing is likely to become expensive."


COMMERCIAL_FLAGS:

Return 0-5 commercially meaningful concerns.

Each commercial flag must:

1. identify a supported contract term
2. explain its direct commercial or contractual implication

Good:
"No termination-for-convenience right reduces flexibility during
the contract term."

Good:
"The 400-user minimum commitment keeps minimum fees payable even
if actual active-user count falls."

Good:
"Non-refundable prepaid fees reduce financial flexibility after
the renewal term begins."

Good:
"A renewal price increase right of up to 12% creates potential
cost exposure at renewal."

Good:
"A 90-day non-renewal notice requirement requires the renewal
decision to be made at least 90 days before the renewal date."

Bad:
"90 days may not be enough for a large organization."

Bad:
"The vendor will probably raise prices."

Bad:
"The customer may regret renewing."

Bad:
"The software may not be worth the price."

If no meaningful commercial concerns are supported by the contract,
return an empty list.
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