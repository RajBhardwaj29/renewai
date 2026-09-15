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
