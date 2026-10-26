"""Operational signals must preserve privacy, isolation and write semantics."""
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import test_contract_save_flow as fixture
import pilot_observability as signals

main = fixture.main


def events(captured):
    return [json.loads(record.getMessage()) for record in captured.records]


class PilotSignalsTests(unittest.TestCase):
    setUp = fixture.ContractSaveFlowTests.setUp
    save = fixture.ContractSaveFlowTests.save

    def test_confirmed_save_precedes_reminder_failure_without_ai_or_duplicate_write(self):
        with patch.object(main, "create_contract_reminders", side_effect=RuntimeError("private")), \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.save()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["contract_saved"])
        self.assertEqual(response.json()["reminder_status"], "failed")
        self.assertEqual(len(self.db.rows["contracts"]), 1)
        self.provider.assert_not_called()
        recorded = events(captured)
        self.assertEqual([e["event"] for e in recorded], [
            "pdf_text", "contract_saved", "reminder_generation_failed", "workflow_request",
        ])
        self.assertEqual(recorded[-1]["outcome"], "success")
        self.assertEqual(len({e["request_ref"] for e in recorded}), 1)
        self.assertNotIn("private", captured.output[0])

    def test_failed_or_duplicate_save_never_records_activation(self):
        self.db.fail = ("contracts", "insert")
        with self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.save()
        self.assertEqual(response.status_code, 500)
        self.assertFalse(any(e["event"] == "contract_saved" for e in events(captured)))
        self.db.fail = None
        self.save()
        with self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.save()
        self.assertEqual(response.status_code, 409)
        self.assertEqual([e["event"] for e in events(captured)], ["workflow_request"])
        self.assertEqual(events(captured)[0]["outcome"], "rejected")

    def test_extraction_failure_has_no_private_error_filename_or_payload(self):
        private = "sensitive-token-contract-text.pdf"
        with patch.object(main, "extract_contract_data", side_effect=RuntimeError(private)), \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.client.post("/contracts/analyze?secret=" + private, files={
                "file": (private, self.pdf, "application/pdf"),
            }, headers={"Authorization": "Bearer " + private})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn(private, "".join(captured.output))
        recorded = events(captured)
        self.assertEqual(recorded[1]["event"], "extraction")
        self.assertEqual(recorded[1]["outcome"], "failure")
        self.assertEqual(recorded[-1]["operation"], "analyze")

    def test_invalid_pdf_is_rejected_without_extraction_or_activation(self):
        with self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.client.post("/contracts/analyze", files={
                "file": ("private.pdf", b"not a PDF", "application/pdf"),
            })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(events(captured)), 1)
        self.assertEqual(events(captured)[0]["outcome"], "rejected")

    def test_decision_events_require_a_confirmed_update_and_do_not_include_notes(self):
        self.context["user"] = SimpleNamespace(id="private-user", email="private@example.com")
        payload = {"renewal_decision": "renew", "renewal_status": "decision_made",
                   "decision_notes": "private commercial plan"}
        with patch.object(main, "get_contract_by_id", return_value={"id": "private-contract"}), \
                patch.object(main, "update_contract_decision", return_value={"id": "private-contract"}), \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.client.patch("/contracts/private-contract/decision", json=payload)
        self.assertEqual(response.status_code, 200)
        recorded = events(captured)
        self.assertEqual(recorded[0]["event"], "decision_saved")
        self.assertTrue(recorded[0]["decision_recorded"])
        self.assertNotIn("private", "".join(captured.output))
        with patch.object(main, "get_contract_by_id", return_value=None), \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.client.patch("/contracts/foreign/decision", json=payload)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(events(captured)), 1)

    def test_logging_failure_cannot_change_a_confirmed_save(self):
        with patch.object(signals.logger, "log", side_effect=RuntimeError("sink unavailable")):
            response = self.save()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.db.rows["contracts"]), 1)

    def test_failed_decision_persistence_has_no_activation(self):
        self.context["user"] = SimpleNamespace(id="user", email="private@example.com")
        with patch.object(main, "get_contract_by_id", return_value={"id": "contract"}), \
                patch.object(main, "update_contract_decision", side_effect=RuntimeError("private")), \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.client.patch("/contracts/contract/decision", json={
                "renewal_decision": "renew", "renewal_status": "decision_made",
            })
        self.assertEqual(response.status_code, 500)
        self.assertEqual(len(events(captured)), 1)
        self.assertEqual(events(captured)[0]["outcome"], "failure")

    def test_successful_extraction_is_observed_without_a_save_or_advisory_call(self):
        with patch.object(main, "extract_contract_data", return_value=fixture.ContractData(**self.contract)), \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            response = self.client.post("/contracts/analyze", files={
                "file": ("synthetic.pdf", self.pdf, "application/pdf"),
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual([e["event"] for e in events(captured)], [
            "pdf_text", "extraction", "workflow_request",
        ])
        self.assertEqual(events(captured)[1]["outcome"], "success")
        self.assertEqual(self.db.rows["contracts"], [])
        self.provider.assert_not_called()

    def test_revision_header_only_accepts_host_commit_and_preserves_cors(self):
        with patch.dict(os.environ, {"RENDER_GIT_COMMIT": "a" * 40}):
            response = self.client.get("/health", headers={"Origin": "http://localhost:3000"})
        self.assertEqual(response.json(), {"status": "healthy"})
        self.assertEqual(response.headers["x-renewai-revision"], "a" * 40)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")
        with patch.dict(os.environ, {"RENDER_GIT_COMMIT": "private\ninvalid"}):
            response = self.client.get("/health")
        self.assertNotIn("x-renewai-revision", response.headers)


class WorkspaceIsolationTests(unittest.TestCase):
    def test_concurrent_sync_routes_keep_independent_workspace_and_request_context(self):
        barrier = Barrier(2)

        def read(_organization_id):
            barrier.wait(timeout=5)
            return []

        def request(workspace):
            with TestClient(main.app) as client:
                return client.get("/contracts", headers={"Authorization": "Bearer " + workspace})

        with patch.dict(os.environ, {"ENABLE_REMINDER_SCHEDULER": "false"}), \
                patch.object(main, "verify_access_token", side_effect=lambda token: SimpleNamespace(id=token)), \
                patch.object(main, "get_user_organization", side_effect=lambda user: {"id": user}), \
                patch.object(main, "get_contracts", side_effect=read), \
                self.assertLogs(signals.logger, logging.INFO) as captured, \
                ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(request, ["org-a", "org-b"]))
        self.assertEqual([response.status_code for response in responses], [200, 200])
        grouped = {}
        for event in events(captured):
            grouped.setdefault(event["request_ref"], set()).add(event["workspace_ref"])
        self.assertEqual(len(grouped), 2)
        self.assertTrue(all(len(refs) == 1 for refs in grouped.values()))
        self.assertEqual(len(set.union(*grouped.values())), 2)

    def test_verified_workspace_is_scoped_and_request_context_does_not_leak(self):
        client = TestClient(main.app)
        self.addCleanup(client.close)
        with patch.object(main, "verify_access_token", return_value=SimpleNamespace(id="user")), \
                patch.object(main, "get_user_organization", side_effect=[{"id": "org-a"}, {"id": "org-b"}]), \
                patch.object(main, "get_contracts", return_value=[]) as read, \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            for _ in range(2):
                self.assertEqual(client.get("/contracts", headers={"Authorization": "Bearer test"}).status_code, 200)
            self.assertEqual(client.post("/contracts/save").status_code, 422)
        recorded = events(captured)
        self.assertEqual(read.call_args_list[0].args, ("org-a",))
        self.assertEqual(read.call_args_list[1].args, ("org-b",))
        self.assertNotEqual(recorded[0]["workspace_ref"], recorded[2]["workspace_ref"])
        self.assertEqual(recorded[0]["workspace_ref"], recorded[1]["workspace_ref"])
        self.assertNotIn("workspace_ref", recorded[-1])
        self.assertEqual(len({e["request_ref"] for e in recorded}), 3)
        self.assertIsNone(signals._context.get())
