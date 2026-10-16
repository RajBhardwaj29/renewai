import unittest

from contract_ai import (
    ContractData,
    build_prompt,
    reconcile_grounded_payment_terms,
)


def make_contract(**updates):
    values = {
        field_name: None
        for field_name in ContractData.model_fields
    }
    values.update(updates)
    return ContractData(**values)


class PaymentTermsReconciliationTests(unittest.TestCase):
    def test_recovers_annual_advance_payment_term(self):
        contract = make_contract(
            contract_value=48000,
            currency="USD",
            pricing_clause=(
                "The Annual Fee is USD 48,000, payable annually in advance."
            ),
        )

        reconciled = reconcile_grounded_payment_terms(
            contract,
            "The Annual Fee is USD 48,000, payable annually in advance.",
        )

        self.assertEqual(
            reconciled.payment_terms,
            "The Annual Fee is USD 48,000, payable annually in advance.",
        )

    def test_preserves_existing_payment_terms(self):
        contract = make_contract(
            payment_terms="Invoices are due within 30 days.",
            pricing_clause="The Annual Fee is USD 48,000.",
        )

        reconciled = reconcile_grounded_payment_terms(
            contract,
            "Fees are payable annually in advance.",
        )

        self.assertEqual(
            reconciled.payment_terms,
            "Invoices are due within 30 days.",
        )

    def test_does_not_invent_payment_terms(self):
        contract = make_contract(
            pricing_clause="The Annual Fee is USD 48,000.",
        )

        reconciled = reconcile_grounded_payment_terms(
            contract,
            "The subscription renews for one year.",
        )

        self.assertIsNone(
            reconciled.payment_terms
        )

    def test_prompt_explicitly_covers_annual_advance_terms(self):
        prompt = build_prompt(
            "Example contract"
        )

        self.assertIn(
            '"payable annually in advance" is a payment term',
            prompt,
        )


if __name__ == "__main__":
    unittest.main()


class CustomerExtractionTests(unittest.TestCase):
    def test_customer_is_separate_nullable_and_prompt_does_not_infer_workspace(self):
        contract = make_contract(vendor_name="Provider Ltd", customer_name="Buyer Ltd")
        self.assertEqual(contract.customer_name, "Buyer Ltd")
        self.assertEqual(contract.vendor_name, "Provider Ltd")
        legacy = contract.model_dump()
        legacy.pop("customer_name")
        self.assertIsNone(ContractData.model_validate(legacy).customer_name)
        prompt = build_prompt("Provider Ltd supplies software to Buyer Ltd (Customer).")
        self.assertIn("customer_name", prompt)
        self.assertIn("Do not substitute the workspace name", prompt)

    def test_strict_provider_schema_requires_nullable_customer(self):
        import json
        from types import SimpleNamespace
        from unittest.mock import patch
        import contract_ai
        payload = make_contract(customer_name="Buyer Ltd").model_dump_json()
        provider = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=None)))
        from unittest.mock import Mock
        provider.chat.completions.create = Mock(return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=payload))]))
        with patch.object(contract_ai, "GROQ_API_KEY", "synthetic-key"), patch("groq.Groq", return_value=provider):
            extracted = contract_ai.extract_with_groq("synthetic parties")
        self.assertEqual(extracted.customer_name, "Buyer Ltd")
        schema = provider.chat.completions.create.call_args.kwargs["response_format"]["json_schema"]["schema"]
        self.assertIn("customer_name", schema["required"])
        self.assertIn({"type": "null"}, schema["properties"]["customer_name"]["anyOf"])
