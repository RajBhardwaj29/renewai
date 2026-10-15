"""PDF coverage, privacy, and organization-scoped export regressions."""
from copy import deepcopy
from datetime import datetime, timezone
import unittest
from unittest.mock import patch

import pymupdf
from fastapi.testclient import TestClient
import test_contract_save_flow as save_flow
from contract_summary import build_contract_summary, summary_filename

main = save_flow.main
NOW = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)


def sample_contract():
    return {
        "id": "qa-summary-1", "organization_id": "org-a", "archived": False,
        "vendor_name": "Orion Software Private Limited", "contract_title": "Enterprise Software Subscription Agreement",
        "contract_value": 7200000, "currency": "INR", "filename": "synthetic-agreement.pdf",
        "start_date": "2025-03-01", "end_date": "2026-02-28", "renewal_date": "2026-03-01",
        "effective_start_date": "2025-03-01", "effective_end_date": "2027-02-28",
        "effective_renewal_date": "2027-03-01", "cancellation_deadline": "2026-12-01",
        "days_until_cancellation_deadline": 999,  # stale stored countdown must not be reused
        "initial_term_months": 12, "renewal_term_months": 12,
        "renewal_structure": "fixed_term_auto_renewal", "auto_renewal": True,
        "notice_period_value": 90, "notice_period_unit": "days", "notice_period_anchor": "renewal_date",
        "risk_level": "attention", "recommendation": "Begin renewal review.",
        "renewal_clause": "Automatically renews for successive fixed terms of 12 calendar months unless 90 days' notice is given.",
        "termination_clause": "No general termination for convenience. Material breach has a 30-day cure period.",
        "payment_terms": "INR 7,200,000 per year, invoiced annually in advance.",
        "pricing_clause": "Renewal price increases up to 6% without additional consent.",
        "minimum_commitment": "At least 300 named-user licenses per term.",
        "refund_clause": "Fees are non-refundable once the term begins.",
        "ai_analysis_status": "completed", "ai_action": "renegotiate", "ai_confidence": 0.8,
        "ai_summary": "Review the renewal pricing and minimum license commitment.",
        "ai_key_findings": ["300 licenses remain payable even if usage falls."],
        "ai_commercial_flags": ["6% renewal price increase exposure."],
        "renewal_decision": "undecided", "renewal_status": "under_review",
        "decision_owner": "PRIVATE OWNER", "decision_notes": "PRIVATE NEGOTIATION STRATEGY",
        "decision_updated_at": "2026-10-15T12:00:00Z", "created_at": "2026-10-15T11:00:00Z",
        "file_hash": "PRIVATE HASH", "extra_private_field": "PRIVATE EXTRA DATA",
    }


REMINDERS = [{"reminder_type": "30_day", "remind_on": "2026-11-01", "status": "pending",
              "organization_id": "org-a", "contract_id": "qa-summary-1", "recipient": "PRIVATE RECIPIENT"}]


def pdf_text(pdf):
    with pymupdf.open(stream=pdf, filetype="pdf") as doc:
        return "\n".join(page.get_text() for page in doc)


class SummaryDocumentTests(unittest.TestCase):
    def test_saved_facts_clauses_ai_human_decision_and_reminders_are_present(self):
        contract = sample_contract()
        original = deepcopy(contract)
        pdf = build_contract_summary(contract, REMINDERS, generated_at=NOW)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        content = pdf_text(pdf)
        for expected in ["Orion Software", "INR 7,200,000.00", "1 Mar 2027", "1 Dec 2026",
                         "47 calendar days", "300 named-user", "30-day cure", "non-refundable",
                         "increases up to 6%", "annually in advance", "90 calendar days",
                         "Renegotiate", "80%", "Undecided", "Under review", "1 Nov 2026", "Pending"]:
            self.assertIn(expected, content)
        self.assertNotIn("999 calendar days", content)
        self.assertNotIn("PRIVATE", content)
        self.assertEqual(contract, original)

    def test_unknowns_and_failed_ai_do_not_prevent_export(self):
        content = pdf_text(build_contract_summary({"ai_analysis_status": "failed"}, [], generated_at=NOW))
        self.assertIn("Not recorded", content)
        self.assertIn("AI insight is unavailable", content)
        self.assertIn("No non-cancelled reminders", content)
        self.assertNotIn("None", content)

    def test_calendar_months_notice_window_and_zero_values_are_preserved(self):
        content = pdf_text(build_contract_summary({"contract_value": 0, "currency": "USD", "auto_renewal": False,
            "notice_period_value": 3, "notice_period_unit": "months", "notice_window_start_value": 6,
            "notice_window_start_unit": "months", "notice_window_open_date": "2026-06-01",
            "notice_window_close_date": "2026-09-01"}, [], generated_at=NOW))
        for expected in ["USD 0.00", "3 months", "6 months", "1 Jun 2026", "1 Sep 2026", "No"]:
            self.assertIn(expected, content)

    def test_past_deadline_is_not_presented_as_future(self):
        content = pdf_text(build_contract_summary({"cancellation_deadline": "2026-10-14"}, [], generated_at=NOW))
        self.assertIn("1 calendar day past the saved deadline", content)
        self.assertNotIn("days remaining", content)

    def test_unicode_and_markup_are_plain_text_and_long_clauses_are_not_cut_off(self):
        contract = sample_contract()
        contract["vendor_name"] = 'Café 東京 <script>literal</script>'
        contract["renewal_clause"] = "Long clause evidence. " * 650 + "END OF COMPLETE CLAUSE"
        contract["filename"] = "longfilename" * 60 + ".pdf"
        pdf = build_contract_summary(contract, [], generated_at=NOW)
        content = pdf_text(pdf)
        for expected in ["Café", "東京", "<script>literal</script>", "END OF COMPLETE CLAUSE"]:
            self.assertIn(expected, content)
        with pymupdf.open(stream=pdf, filetype="pdf") as doc:
            self.assertGreater(len(doc), 3)
            for page in doc:
                self.assertIn(f"of {len(doc)}", page.get_text())
                self.assertEqual(page.get_links(), [])
                for block in page.get_text("dict")["blocks"]:
                    for line in block.get("lines", []):
                        for span in line["spans"]:
                            x0, y0, x1, y1 = span["bbox"]
                            self.assertGreaterEqual(x0, 40)
                            self.assertLessEqual(x1, page.rect.width - 40)
                            self.assertGreaterEqual(y0, 12)
                            self.assertLessEqual(y1, page.rect.height - 12)

    def test_download_filename_is_bounded_and_header_safe(self):
        name = summary_filename({"vendor_name": '../東京/\r\n"<bad>' * 50})
        self.assertRegex(name, r"^RenewAI-[a-zA-Z0-9-]+-summary\.pdf$")
        self.assertLess(len(name), 100)


class SummaryRouteTests(unittest.TestCase):
    def setUp(self):
        self.db = save_flow.MemoryDatabase()
        self.db.rows["contracts"] = [sample_contract()]
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        for patcher in [patch.object(save_flow.database, "supabase", self.db),
                        patch.object(main, "get_authenticated_context", return_value={"organization_id": "org-a"})]:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_export_is_org_scoped_private_non_mutating_and_ai_independent(self):
        with patch.object(main, "get_contract_reminders", return_value=REMINDERS) as reminders, \
             patch.object(main, "generate_renewal_ai_insight") as ai:
            response = self.client.get("/contracts/qa-summary-1/summary.pdf", headers={"Origin": "http://localhost:3000"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertIn("attachment; filename=", response.headers["content-disposition"])
        self.assertIn("no-store", response.headers["cache-control"])
        self.assertIn("Content-Disposition", response.headers["access-control-expose-headers"])
        self.assertNotIn("PRIVATE", pdf_text(response.content))
        reminders.assert_called_once_with("org-a", "qa-summary-1")
        ai.assert_not_called()
        self.assertTrue(all(operation == "select" for _, operation, _ in self.db.calls))

    def test_missing_or_foreign_record_is_unavailable_before_reminders_are_read(self):
        self.db.rows["contracts"][0]["organization_id"] = "org-b"
        with patch.object(main, "get_contract_reminders") as reminders:
            response = self.client.get("/contracts/qa-summary-1/summary.pdf")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("Orion", response.text)
        reminders.assert_not_called()

    def test_auth_is_required(self):
        with patch.object(main, "get_authenticated_context", side_effect=main.HTTPException(status_code=401, detail="Authentication required.")):
            response = self.client.get("/contracts/qa-summary-1/summary.pdf")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.db.calls, [])

    def test_reminder_read_failure_does_not_export_a_misleading_empty_schedule(self):
        with patch.object(main, "get_contract_reminders", side_effect=RuntimeError("PRIVATE DATABASE TRACE")):
            response = self.client.get("/contracts/qa-summary-1/summary.pdf")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("PRIVATE", response.text)
        self.assertIn("generate this summary", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
