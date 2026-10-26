import json
import unittest

from tools.summarize_pilot_events import summarize


def row(name, request, **fields):
    return json.dumps({"schema": "renewai.pilot.v1", "event": name,
                       "at": "2026-10-26T10:00:00+00:00", "request_ref": request * 32,
                       "workspace_ref": "a" * 24, **fields}, separators=(",", ":"))


class PilotSummaryTests(unittest.TestCase):
    def test_deduplicates_exports_and_counts_confirmed_records_not_requests(self):
        saved = row("contract_saved", "1", contract_ref="b" * 24)
        lines = [saved, "hosting-prefix " + saved,
                 row("workflow_request", "1", operation="save", outcome="success"),
                 row("decision_saved", "2", contract_ref="b" * 24, decision_recorded=False),
                 row("decision_saved", "3", contract_ref="b" * 24, decision_recorded=True),
                 row("decision_saved", "4", contract_ref="b" * 24, decision_recorded=True),
                 row("workflow_request", "5", operation="save", outcome="failure"),
                 row("portfolio_loaded", "6"),
                 row("portfolio_loaded", "7", at="2026-10-27T10:00:00+00:00")]
        result = summarize(lines)
        self.assertEqual(result["unique_saved_contracts"], 1)
        self.assertEqual(result["unique_contracts_with_recorded_decision"], 1)
        self.assertEqual(result["observed_saved_contracts_also_with_recorded_decision"], 1)
        self.assertEqual(result["workflow_requests"]["save:failure"], 1)
        self.assertEqual(result["workspaces_loading_portfolio_on_multiple_utc_days"], 1)
        self.assertEqual(summarize(lines, ["a" * 24])["unique_saved_contracts"], 0)

    def test_ignores_non_events_malformed_rows_and_missing_identifiers(self):
        result = summarize(["private irrelevant log", '{"schema":"renewai.pilot.v1",',
                            row("contract_saved", "1"),
                            row("contract_saved", "2", contract_ref="private-contract"),
                            row("contract_saved", "3", at="invalid", contract_ref="b" * 24)])
        self.assertEqual(result["unique_saved_contracts"], 0)
        self.assertNotIn("private", json.dumps(result))
