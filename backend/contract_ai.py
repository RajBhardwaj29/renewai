from pydantic import BaseModel
from ollama import chat


class ContractData(BaseModel):
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


def extract_contract_data(contract_text: str) -> ContractData:
    prompt = f"""
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

CONTRACT TEXT:

{contract_text}
"""

    response = chat(
        model="qwen3:8b",
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        format=ContractData.model_json_schema(),
        options={
            "temperature": 0,
        },
    )

    return ContractData.model_validate_json(
        response.message.content
    )