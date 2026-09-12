import os
import json

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

    renewal_structure: str | None

    notice_period_days: int | None
    notice_period_value: int | None
    notice_period_unit: str | None

    notice_window_start_value: int | None
    notice_window_start_unit: str | None
    notice_window_end_value: int | None
    notice_window_end_unit: str | None

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


6. NOTICE REQUIREMENTS

Preserve the notice requirement exactly as expressed by the contract.

notice_period_value must contain the numeric amount of a single notice
period when the contract defines one ordinary notice period.

notice_period_unit must use exactly one of:
- "days"
- "months"
- "business_days"
- null

notice_period_days exists for backward compatibility.


ORDINARY SINGLE NOTICE PERIOD

When the contract explicitly expresses the notice period in days:

- set notice_period_value to the number of days
- set notice_period_unit to "days"
- set notice_period_days to the same number

Example:

"Customer must give notice at least 90 days before expiration."

-> notice_period_value = 90
-> notice_period_unit = "days"
-> notice_period_days = 90


When the contract explicitly expresses the notice period in calendar
months or months:

- set notice_period_value to the number of months
- set notice_period_unit to "months"
- set notice_period_days = null

Example:

"Customer must provide notice at least 3 calendar months before
the applicable renewal date."

-> notice_period_value = 3
-> notice_period_unit = "months"
-> notice_period_days = null


When the contract explicitly expresses the notice period in business days:

- set notice_period_value to the number of business days
- set notice_period_unit = "business_days"
- set notice_period_days = null

Example:

"Customer must provide written notice at least 30 business days before
the applicable renewal date."

-> notice_period_value = 30
-> notice_period_unit = "business_days"
-> notice_period_days = null


NOTICE WINDOWS

Some contracts define a valid notice window rather than one single notice
period.

A notice window exists when the contract specifies both:

- the earliest time notice may validly be delivered
- the latest time notice may validly be delivered

Use these fields:

- notice_window_start_value
- notice_window_start_unit
- notice_window_end_value
- notice_window_end_unit

Allowed units:

- "days"
- "months"
- "business_days"
- null

notice_window_start_* represents the boundary at which the valid
notice window opens.

notice_window_end_* represents the boundary at which the valid
notice window closes and therefore the latest valid notice date.

Example:

"Customer must provide notice no earlier than 120 calendar days and
no later than 90 calendar days before expiration of the current term."

-> notice_window_start_value = 120
-> notice_window_start_unit = "days"
-> notice_window_end_value = 90
-> notice_window_end_unit = "days"

-> notice_period_value = null
-> notice_period_unit = null
-> notice_period_days = null

Do not collapse a notice window into one ordinary notice period.

Do not choose only the earlier boundary.

Do not choose only the later boundary.

Preserve both contractual boundaries.

If the contract contains an ordinary single notice period and does not
contain a notice window:

- notice_window_start_value = null
- notice_window_start_unit = null
- notice_window_end_value = null
- notice_window_end_unit = null

If the contract contains a notice window:

- notice_period_value = null
- notice_period_unit = null
- notice_period_days = null


UNIT PRESERVATION RULES

Never convert months into days.

Never convert days into months.

Never convert business days into calendar days.

Never approximate business days using weekdays only.

Never infer a holiday calendar or jurisdiction unless explicitly provided.

Never approximate a calendar month as 30 days.

Preserve the unit exactly as the contract expresses it.


7. NOTICE PERIOD ANCHOR

notice_period_anchor identifies the explicit contractual date from which
the notice period must be counted backwards.

Use exactly one of:

- "end_date"
- "renewal_date"
- null

Return "end_date" when the notice clause explicitly measures notice before:

- the end of the current term
- expiration
- expiry
- termination of the current fixed term

Example:

"Customer must give notice at least 90 days before the end of the
current term."

-> notice_period_value = 90
-> notice_period_unit = "days"
-> notice_period_days = 90
-> notice_period_anchor = "end_date"


Return "renewal_date" when the notice clause explicitly measures notice
before:

- the renewal date
- automatic renewal date
- commencement of the renewal term

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


8. RENEWAL STRUCTURE

renewal_structure must use exactly one of:

- "fixed_term"
- "fixed_term_auto_renewal"
- "evergreen_indefinite"
- null


"fixed_term"

Use when the agreement has a fixed contractual term and does not
automatically continue or renew after that term.

Typical examples:

- agreement ends on a stated date
- renewal requires a new signed agreement
- renewal requires mutual written agreement
- no automatic renewal exists

For fixed_term:

- auto_renewal = false
- renewal_term_months = null unless an explicit future term is stated
- renewal_date = null unless explicitly stated for some separate reason


"fixed_term_auto_renewal"

Use when the agreement automatically renews into defined subsequent
fixed periods.

Examples:

- renews automatically for successive 12-month terms
- renews annually
- renews month-to-month
- renews for successive 3-month periods

For fixed_term_auto_renewal:

- auto_renewal = true
- renewal_term_months should represent the defined recurring term
  when supported by the contract
- renewal_date should only contain an explicitly stated renewal date
- if the renewal date is not explicit, leave renewal_date = null;
  RenewAI's deterministic engine may derive it


"evergreen_indefinite"

Use when the agreement continues indefinitely without separate
successive fixed renewal periods.

Examples:

- continues indefinitely after the initial term
- continues on an evergreen basis
- continues until terminated
- remains in effect until either party terminates it
- explicitly states there are no fixed renewal terms

An evergreen or indefinite continuation is NOT the same as automatic
renewal into successive fixed terms.

For evergreen_indefinite:

- auto_renewal = false
- renewal_term_months = null
- renewal_date = null
- do not create or infer a renewal commencement date
- do not treat the day after the initial term as a renewal date
- do not interpret the indefinite continuation as a recurring 12-month
  or annual renewal unless the contract explicitly says so


ROLLING TERMINATION NOTICE

An evergreen agreement may allow termination by giving notice at any
time.

Example:

"After the initial term, either party may terminate at any time by
providing 90 calendar days written notice."

This is a rolling termination notice.

For this structure:

- notice_period_value = 90
- notice_period_unit = "days"
- notice_period_days = 90
- notice_period_anchor = null

Do NOT anchor the notice period to:

- end_date
- anniversary date
- renewal date

unless the contract explicitly requires that.

A rolling notice period does NOT create a fixed cancellation deadline.


VERY IMPORTANT EVERGREEN EXAMPLE

If the contract says:

"Following the initial term, the agreement continues automatically on
an evergreen basis for an indefinite duration. There are no fixed
renewal terms."

Return:

renewal_structure = "evergreen_indefinite"
auto_renewal = false
renewal_term_months = null
renewal_date = null

The word "automatically" in this situation describes continuation,
not automatic renewal into fixed renewal terms.


9. AUTO RENEWAL

auto_renewal should only be true when the contract automatically renews
into a subsequent FIXED renewal term.

Do not set auto_renewal = true merely because the agreement continues
automatically on an indefinite evergreen basis.

If renewal_structure = "fixed_term_auto_renewal":

auto_renewal = true

If renewal_structure = "fixed_term":

auto_renewal = false

If renewal_structure = "evergreen_indefinite":

auto_renewal = false


10. initial_term_months means the duration of the ORIGINAL contract term.

If an amendment changes the initial term before the first renewal occurs,
use the effective amended initial term.

Do not preserve a superseded duration merely because it appears earlier
in the document.


11. renewal_term_months means the duration of EACH subsequent fixed
renewal period.

Do not populate renewal_term_months for an evergreen indefinite
continuation.


12. Never confuse initial_term_months with renewal_term_months.


13. renewal_clause should contain language specifically related to:

- renewal
- automatic renewal
- evergreen continuation
- indefinite continuation
- continuation after the initial term


14. termination_clause should contain language specifically related to:

- termination
- cancellation
- non-renewal
- termination for convenience
- rolling termination rights


15. Do not invent vendors, dates, prices, notice periods, renewal terms,
termination rights or clauses.


16. DATE EXTRACTION

If the contract provides a start date and duration but does not explicitly
state an end date, leave end_date = null.

Another deterministic system may derive the end date.


17. RENEWAL DATE EXTRACTION

If the contract does not explicitly state a renewal date, leave
renewal_date = null.

Another deterministic system may derive a renewal date only where the
renewal structure supports one.

For evergreen_indefinite:

renewal_date must remain null.


18. AMENDMENTS AND PRECEDENCE

When an amendment, addendum or later clause explicitly changes,
replaces or supersedes an earlier contractual term:

- use the currently effective amended term
- do not retain the superseded value as the structured result

If the document explicitly states that an amendment controls in case
of conflict, apply the amendment.

This applies to:

- start dates
- end dates
- renewal dates
- term lengths
- notice periods
- notice anchors
- renewal structures
- commercial terms


19. pricing_clause should contain contract language describing:

- renewal price increases
- price escalation
- price adjustment rights
- discounts
- renewal pricing
- commercially relevant pricing changes


20. minimum_commitment should contain any minimum:

- licence commitment
- seat commitment
- purchase commitment
- spend commitment
- volume commitment
- usage commitment
- similar contractual commitment


21. refund_clause should contain language describing whether:

- prepaid fees are refundable
- prepaid fees are non-refundable
- payments are cancellable
- payments are non-cancellable
- credits or refunds are available


22. Preserve commercially important details such as:

- percentages
- quantities
- monetary values
- conditions
- limitations
- exceptions

Do not simplify away commercially meaningful terms.


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


def _extract_json_object(
    content: str
) -> str:
    """
    Extract the first complete JSON object from a model response.

    This is used only by the Groq JSON-object fallback. The returned
    object is still validated strictly by ContractData, so this helper
    does not weaken RenewAI's data model or grounding rules.
    """
    cleaned = content.strip()

    if cleaned.startswith("```"):
        lines = cleaned.splitlines()

        if lines:
            lines = lines[1:]

        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]

        cleaned = "\n".join(lines).strip()

    decoder = json.JSONDecoder()

    for index, character in enumerate(cleaned):
        if character != "{":
            continue

        try:
            _, end = decoder.raw_decode(
                cleaned[index:]
            )

            return cleaned[
                index:
                index + end
            ]

        except json.JSONDecodeError:
            continue

    raise RuntimeError(
        "Groq did not return a valid JSON object."
    )


def _extract_with_groq_json_object(
    client,
    prompt: str,
) -> ContractData:
    """
    Fallback for provider-side json_schema generation failures.

    Groq can occasionally reject a generation before returning it with
    json_validate_failed. In that case we request a plain JSON object,
    then run the exact same strict Pydantic validation locally.
    """
    fallback_prompt = f"""
{prompt}

FINAL OUTPUT RULES:

Return exactly one JSON object.

Use exactly these keys:

- vendor_name
- contract_title
- contract_value
- currency
- start_date
- end_date
- renewal_date
- initial_term_months
- renewal_term_months
- renewal_structure
- notice_period_days
- notice_period_value
- notice_period_unit
- notice_window_start_value
- notice_window_start_unit
- notice_window_end_value
- notice_window_end_unit
- notice_period_anchor
- auto_renewal
- renewal_clause
- termination_clause
- payment_terms
- pricing_clause
- minimum_commitment
- refund_clause

Every key must be present.

Use null for unsupported or unavailable values.

Do not add keys.

Do not wrap the JSON in markdown.

Do not include commentary before or after the JSON.
""".strip()

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
                        "You extract structured contract data. "
                        "Return exactly one valid JSON object "
                        "containing only facts supported by the "
                        "contract. Every requested key must be "
                        "present. Use null when a value is not "
                        "supported."
                    ),
                },
                {
                    "role": "user",
                    "content": fallback_prompt,
                },
            ],

            temperature=0,
            reasoning_effort="low",
            include_reasoning=False,
            max_completion_tokens=4096,

            response_format={
                "type": "json_object",
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
            "Groq returned an empty fallback response."
        )

    json_content = _extract_json_object(
        content
    )

    return (
        ContractData
        .model_validate_json(
            json_content
        )
    )


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

    try:
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
                reasoning_effort="low",
                include_reasoning=False,
                max_completion_tokens=4096,

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

    except Exception as exc:
        error_text = str(exc).lower()

        if (
            "json_validate_failed" not in error_text
            and
            "failed to validate json" not in error_text
        ):
            raise

        return _extract_with_groq_json_object(
            client,
            prompt,
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


20. RENEWAL STRUCTURE MATTERS.

Use the supplied renewal_structure exactly as reviewed.

If renewal_structure is "evergreen_indefinite":

- do not describe the contract as automatically renewing into fixed terms
- do not invent a renewal date
- do not invent a cancellation deadline
- distinguish rolling termination notice from non-renewal notice
- explain that the contract continues until terminated when supported
- treat flexibility and commercial exposure based on the actual
  termination and pricing terms

If renewal_structure is "fixed_term":

- do not imply that a renewal will occur automatically

If renewal_structure is "fixed_term_auto_renewal":

- analyze the automatic renewal and associated notice obligations normally


ALLOWED ACTIONS:


"monitor"

Use only when there is no meaningful contractual or commercial
renewal concern based on the supplied information.


"review"

Use when the contract contains terms that deserve review.

Examples:

- automatic renewal
- meaningful notice requirements
- evergreen continuation
- limited termination flexibility
- non-refundable commitments
- material contractual obligations


"renegotiate"

Use when the supplied contract creates a reasonable contractual or
commercial basis for seeking improved terms.

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


fixed-term automatic renewal only
-> usually "review"


fixed-term automatic renewal + notice requirement
-> usually "review"


automatic renewal + no convenience termination
-> at least "review"


automatic renewal + no convenience termination + non-refundable fees
-> consider "renegotiate"


evergreen indefinite + rolling termination right
-> usually "review" or "monitor" depending on the commercial terms


evergreen indefinite + pricing escalation + material minimum commitment
-> consider "renegotiate"


renewal price escalation rights
-> consider "renegotiate"


minimum licence / spend / purchase commitment
-> consider "renegotiate"


multiple lock-in terms combined
-> strongly consider "renegotiate"


extremely restrictive renewal + termination structure
-> may justify "consider_cancellation"


Do NOT choose "monitor" simply because a cancellation deadline
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


Renewal structure:
{contract.renewal_structure}


Notice period value:
{contract.notice_period_value}


Notice period unit:
{contract.notice_period_unit}


Legacy notice period days:
{contract.notice_period_days}


Notice window start value:
{contract.notice_window_start_value}


Notice window start unit:
{contract.notice_window_start_unit}


Notice window end value:
{contract.notice_window_end_value}


Notice window end unit:
{contract.notice_window_end_unit}


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


Notice window open date:
{renewal_intelligence.get("notice_window_open_date")}


Notice window close date:
{renewal_intelligence.get("notice_window_close_date")}


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


For evergreen contracts, factual findings may include:

"The agreement continues indefinitely after the initial term."

"Either party may terminate after the initial term with 90 calendar
days' written notice."

"There is no fixed renewal date."


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


Good evergreen example:

"The 90-day rolling termination notice means the agreement remains
active for the contractual notice period after valid termination
notice is delivered."


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
            reasoning_effort="low",
            include_reasoning=False,
            max_completion_tokens=4096,

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