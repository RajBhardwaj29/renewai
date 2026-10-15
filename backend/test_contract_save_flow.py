"""Save/AI failure regressions against an isolated, in-memory database client."""
import json
import os
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
import pymupdf

# Never connect to a configured production service while importing the app.
with patch.dict(os.environ, {
    "SUPABASE_URL": "http://127.0.0.1:9",
    "SUPABASE_SECRET_KEY": "test-key",
    "ENABLE_REMINDER_SCHEDULER": "false",
}):
    import database
    import main

from contract_ai import ContractData, RenewalAIInsight
from renewal_engine import calculate_renewal_intelligence


class MemoryQuery:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.filters = []
        self.in_filters = []
        self.operation, self.payload = "select", None

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _count):
        return self

    def in_(self, column, values):
        self.in_filters.append((column, values))
        return self

    def insert(self, payload):
        self.operation, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.operation, self.payload = "update", payload
        return self

    def execute(self):
        self.db.calls.append((self.table, self.operation, deepcopy(self.filters)))
        if self.db.fail == (self.table, self.operation):
            raise RuntimeError("private provider/database error must not reach users")
        rows = self.db.rows[self.table]
        if self.operation == "insert":
            if self.db.empty_insert == self.table:
                return SimpleNamespace(data=[])
            values = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for value in values:
                row = deepcopy(value)
                row["id"] = f"{self.table}-{len(rows) + 1}"
                rows.append(row)
                inserted.append(deepcopy(row))
            return SimpleNamespace(data=inserted)
        matched = [row for row in rows
                   if all(row.get(k) == v for k, v in self.filters)
                   and all(row.get(k) in values for k, values in self.in_filters)]
        if self.operation == "update":
            self.db.updates.append(deepcopy(self.payload))
            for row in matched:
                row.update(self.payload)
        return SimpleNamespace(data=deepcopy(matched))


class MemoryDatabase:
    def __init__(self):
        self.rows = {"contracts": [], "contract_reminders": []}
        self.calls, self.updates = [], []
        self.fail = self.empty_insert = None

    def table(self, name):
        return MemoryQuery(self, name)


class ContractSaveFlowTests(unittest.TestCase):
    def setUp(self):
        self.db = MemoryDatabase()
        self.context = {"organization_id": "org-a"}
        self.contract = {name: None for name in ContractData.model_fields}
        self.contract.update(vendor_name="Synthetic vendor", notice_period_value=30)
        self.renewal = {
            "cancellation_deadline": "2030-12-01",
            "effective_renewal_date": "2031-01-01",
            "risk_level": "low",
            "recommendation": "Review before the deadline.",
        }
        self.insight = RenewalAIInsight(
            action="investigate", confidence=0.8, summary="Review commercial terms.",
            key_findings=["Renewal requires notice."], commercial_flags=[],
        )
        doc = pymupdf.open()
        doc.new_page().insert_text((72, 72), "Synthetic renewal contract for testing.")
        self.pdf = doc.tobytes()
        doc.close()
        self.patchers = [
            patch.object(database, "supabase", self.db),
            patch.object(main, "get_authenticated_context", return_value=self.context),
            patch.object(main, "calculate_renewal_intelligence", return_value=self.renewal),
            patch.object(main, "generate_renewal_ai_insight", return_value=self.insight),
        ]
        self.mocks = [p.start() for p in self.patchers]
        for p in self.patchers:
            self.addCleanup(p.stop)
        self.provider = self.mocks[-1]
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def save(self):
        return self.client.post(
            "/contracts/save", headers={"Authorization": "Bearer test-token"},
            files={"file": ("synthetic.pdf", self.pdf, "application/pdf")},
            data={"contract_json": json.dumps(self.contract)},
        )

    def analyze(self, contract_id):
        return self.client.post(
            f"/contracts/{contract_id}/ai-insight",
            headers={"Authorization": "Bearer test-token"},
        )

    def load(self, contract_id):
        response = self.client.get(
            f"/contracts/{contract_id}",
            headers={"Authorization": "Bearer test-token"},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["contract"]

    def test_save_persists_without_calling_failing_ai(self):
        self.provider.side_effect = RuntimeError("Groq structured output failed")
        response = self.save()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reminder_count"], 5)
        self.assertIsNone(response.json()["ai_insight"])
        self.assertTrue(response.json()["contract_saved"])
        self.assertEqual(response.json()["ai_analysis_status"], "pending")
        self.provider.assert_not_called()
        row = self.db.rows["contracts"][0]
        self.assertEqual(self.load(row["id"])["ai_analysis_status"], "pending")
        self.assertIsNone(row["ai_action"])
        self.assertEqual(row["ai_key_findings"], [])
        self.assertEqual(row["ai_commercial_flags"], [])
        self.assertEqual(row["cancellation_deadline"], self.renewal["cancellation_deadline"])
        self.mocks[-2].assert_called_once()
        self.assertEqual(self.mocks[-2].call_args.args[0].notice_period_value, 30)

    def test_failed_ai_then_retry_updates_only_ai_fields(self):
        saved = self.save().json()
        before = deepcopy(self.db.rows)
        self.provider.side_effect = RuntimeError("private AI error")
        failed = self.analyze(saved["database_id"])
        self.assertEqual(failed.status_code, 503)
        self.assertNotIn("private AI error", failed.text)
        self.assertTrue(failed.json()["contract_saved"])
        self.assertTrue(failed.json()["retryable"])
        self.assertEqual(failed.json()["database_id"], saved["database_id"])
        self.assertEqual(failed.json()["ai_analysis_status"], "failed")
        self.assertIn("Contract saved", failed.json()["detail"])
        self.assertEqual(self.load(saved["database_id"])["ai_analysis_status"], "failed")
        after_failure = deepcopy(before)
        after_failure["contracts"][0]["ai_analysis_status"] = "failed"
        self.assertEqual(self.db.rows, after_failure)

        def retry_after_persistence(*_args):
            self.assertEqual(self.load(saved["database_id"])["ai_analysis_status"], "pending")
            self.assertEqual(self.db.rows["contract_reminders"], before["contract_reminders"])
            return self.insight
        self.provider.side_effect = retry_after_persistence
        completed = self.analyze(saved["database_id"])
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.json()["ai_insight"], self.insight.model_dump())
        self.assertEqual(completed.json()["ai_analysis_status"], "completed")
        self.assertEqual(self.load(saved["database_id"])["ai_analysis_status"], "completed")
        self.assertEqual(self.db.rows["contract_reminders"], before["contract_reminders"])
        self.assertEqual(len(self.db.rows["contracts"]), 1)
        ai_fields = {"ai_action", "ai_confidence", "ai_summary", "ai_key_findings",
                     "ai_commercial_flags", "ai_analysis_status"}
        self.assertEqual(set(self.db.updates[-1]), ai_fields)
        for field, value in before["contracts"][0].items():
            if field not in ai_fields:
                self.assertEqual(self.db.rows["contracts"][0][field], value)
        reviewed, calculated = self.provider.call_args.args
        self.assertEqual(reviewed.vendor_name, self.contract["vendor_name"])
        self.assertEqual(calculated["cancellation_deadline"], self.renewal["cancellation_deadline"])
        self.mocks[-2].assert_called_once()

    def test_completed_analysis_is_reused_on_retry(self):
        contract_id = self.save().json()["database_id"]
        self.assertEqual(self.analyze(contract_id).status_code, 200)
        self.assertEqual(self.analyze(contract_id).status_code, 200)
        self.provider.assert_called_once()
        self.assertEqual(len(self.db.updates), 2)

    def test_real_calculations_and_reminders_survive_ai_failure(self):
        self.contract.update(end_date="2031-01-01", renewal_date="2031-01-02",
                             notice_period_unit="days", notice_period_anchor="end_date",
                             auto_renewal=True, renewal_term_months=12)
        self.mocks[-2].side_effect = calculate_renewal_intelligence
        self.provider.side_effect = RuntimeError("Provider unavailable")
        response = self.save()
        self.assertEqual(response.status_code, 200)
        saved = response.json()
        self.assertEqual(saved["renewal_intelligence"]["cancellation_deadline"], "2030-12-02")
        self.assertEqual(saved["reminder_count"], 5)
        before_reminders = deepcopy(self.db.rows["contract_reminders"])
        self.assertEqual(self.analyze(saved["database_id"]).status_code, 503)
        self.assertEqual(self.load(saved["database_id"])["cancellation_deadline"], "2030-12-02")
        self.assertEqual(self.db.rows["contract_reminders"], before_reminders)
        self.mocks[-2].assert_called_once()

    def test_analysis_preserves_existing_human_decision(self):
        contract_id = self.save().json()["database_id"]
        decision = {"renewal_decision": "cancel", "decision_owner": "Human reviewer",
                    "decision_notes": "Decision already made", "renewal_status": "decision_made"}
        self.db.rows["contracts"][0].update(decision)
        self.assertEqual(self.analyze(contract_id).status_code, 200)
        for name, value in decision.items():
            self.assertEqual(self.db.rows["contracts"][0][name], value)

    def test_archive_during_generation_prevents_ai_write(self):
        contract_id = self.save().json()["database_id"]
        def archive_while_analyzing(*_args):
            self.db.rows["contracts"][0]["archived"] = True
            return self.insight
        self.provider.side_effect = archive_while_analyzing
        self.assertEqual(self.analyze(contract_id).status_code, 404)
        self.assertIsNone(self.db.rows["contracts"][0]["ai_action"])

    def test_reminder_insert_failure_does_not_fail_save(self):
        self.db.fail = ("contract_reminders", "insert")
        response = self.save()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reminder_status"], "failed")
        self.assertIsNone(response.json()["reminder_count"])
        self.assertTrue(response.json()["reminder_warning"])
        self.assertEqual(len(self.db.rows["contracts"]), 1)
        duplicate = self.save()
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["detail"]["existing_contract_id"], response.json()["database_id"])

    def test_missing_reminder_insert_response_does_not_claim_success(self):
        self.db.empty_insert = "contract_reminders"
        response = self.save()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reminder_status"], "failed")

    def test_no_deadline_skips_reminders_and_still_saves(self):
        self.renewal["cancellation_deadline"] = None
        response = self.save()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reminder_status"], "not_applicable")
        self.assertEqual(response.json()["reminder_count"], 0)
        self.assertFalse(any(t == "contract_reminders" for t, _, _ in self.db.calls))

    def test_failed_insert_never_starts_reminders_or_ai(self):
        self.db.fail = ("contracts", "insert")
        response = self.save()
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private provider", response.text)
        self.assertEqual(self.db.rows["contract_reminders"], [])
        self.provider.assert_not_called()

    def test_ai_update_failure_keeps_saved_contract_and_reminders(self):
        contract_id = self.save().json()["database_id"]
        before = deepcopy(self.db.rows)
        with patch.object(main, "update_contract_ai_insight", side_effect=RuntimeError("write failed")):
            response = self.analyze(contract_id)
        self.assertEqual(response.status_code, 503)
        before["contracts"][0]["ai_analysis_status"] = "failed"
        self.assertEqual(self.db.rows, before)
        self.assertEqual(self.analyze(contract_id).status_code, 200)
        self.assertEqual(self.load(contract_id)["ai_analysis_status"], "completed")

    def test_status_write_failure_still_returns_friendly_retry_response(self):
        contract_id = self.save().json()["database_id"]
        before = deepcopy(self.db.rows)
        self.db.fail = ("contracts", "update")
        response = self.analyze(contract_id)
        self.assertEqual(response.status_code, 503)
        self.assertTrue(response.json()["contract_saved"])
        self.assertTrue(response.json()["retryable"])
        self.assertNotIn("private provider", response.text)
        self.assertEqual(self.db.rows, before)
        self.provider.assert_not_called()

    def test_late_failed_attempt_does_not_overwrite_completed_status(self):
        contract_id = self.save().json()["database_id"]
        def complete_concurrently(*_args):
            database.update_contract_ai_insight("org-a", contract_id, self.insight)
            raise RuntimeError("Another attempt failed after concurrent success")
        self.provider.side_effect = complete_concurrently
        self.assertEqual(self.analyze(contract_id).status_code, 503)
        self.assertEqual(self.load(contract_id)["ai_analysis_status"], "completed")
        self.assertEqual(self.analyze(contract_id).status_code, 200)
        self.provider.assert_called_once()

    def test_status_helper_cannot_change_foreign_or_archived_contracts(self):
        contract_id = self.save().json()["database_id"]
        for organization_id, archived in (("org-b", False), ("org-a", True)):
            self.db.rows["contracts"][0]["archived"] = archived
            before = deepcopy(self.db.rows)
            self.assertIsNone(database.update_contract_ai_analysis_status(
                organization_id, contract_id, "failed",
            ))
            self.assertEqual(self.db.rows, before)

    def test_completed_status_cannot_be_reset_by_stale_attempt(self):
        contract_id = self.save().json()["database_id"]
        self.analyze(contract_id)
        before = deepcopy(self.db.rows)
        self.assertIsNone(database.update_contract_ai_analysis_status("org-a", contract_id, "pending"))
        self.assertEqual(self.db.rows, before)

    def test_foreign_and_archived_contracts_do_not_call_ai(self):
        contract_id = self.save().json()["database_id"]
        self.context["organization_id"] = "org-b"
        self.assertEqual(self.analyze(contract_id).status_code, 404)
        self.context["organization_id"] = "org-a"
        self.db.rows["contracts"][0]["archived"] = True
        self.assertEqual(self.analyze(contract_id).status_code, 404)
        self.provider.assert_not_called()
        self.assertEqual(self.db.updates, [])

    def test_update_helper_scopes_both_organization_and_contract(self):
        contract_id = self.save().json()["database_id"]
        before = deepcopy(self.db.rows)
        self.assertIsNone(database.update_contract_ai_insight("org-b", contract_id, self.insight))
        self.assertEqual(self.db.rows, before)
        self.assertEqual(self.db.calls[-1][2], [
            ("organization_id", "org-b"), ("id", contract_id), ("archived", False),
        ])

    def test_ai_endpoint_requires_authentication(self):
        contract_id = self.save().json()["database_id"]
        self.patchers[1].stop()
        response = self.client.post(f"/contracts/{contract_id}/ai-insight")
        self.assertEqual(response.status_code, 401)
        self.provider.assert_not_called()


if __name__ == "__main__":
    unittest.main()
