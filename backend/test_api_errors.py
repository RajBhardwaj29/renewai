"""Boundary tests: dependency/provider errors must not expose private details."""
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import test_contract_save_flow as save_flow

main = save_flow.main


PRIVATE = "Server disconnected; provider=private-host; secret=do-not-display"


class ApiErrorTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        auth = patch.object(main, "get_authenticated_context", return_value={"organization_id": "org-a"})
        auth.start()
        self.addCleanup(auth.stop)

    def test_database_errors_are_friendly_and_recoverable(self):
        with patch.object(main, "get_contract_by_id", side_effect=RuntimeError(PRIVATE)):
            response = self.client.get("/contracts/test-contract")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn(PRIVATE, response.text)
        self.assertNotIn("Server disconnected", response.text)
        self.assertIn("try again", response.json()["detail"])
        self.assertTrue(response.json()["retryable"])

    def test_unhandled_error_outside_route_try_block_is_sanitized(self):
        with patch.object(main, "get_contract_by_id", side_effect=RuntimeError(PRIVATE)):
            response = self.client.get("/contracts/test-contract/reminders", headers={
                "Origin": "http://localhost:3000",
            })
        self.assertEqual(response.status_code, 500)
        self.assertNotIn(PRIVATE, response.text)
        self.assertEqual(response.json()["code"], "service_unavailable")
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")

    def test_validation_does_not_echo_private_request_input(self):
        response = self.client.post("/contracts/save", data={"contract_json": PRIVATE})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(PRIVATE, response.text)
        self.assertFalse(response.json()["retryable"])

    def test_missing_contract_remains_unavailable(self):
        with patch.object(main, "get_contract_by_id", return_value=None):
            response = self.client.get("/contracts/foreign-contract")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Contract not found.")


class SaveErrorTests(unittest.TestCase):
    # Reuse the isolated fixture without rediscovering its test methods.
    setUp = save_flow.ContractSaveFlowTests.setUp
    def test_extraction_provider_failure_is_sanitized(self):
        with patch.object(main, "extract_contract_data", side_effect=RuntimeError(PRIVATE)):
            response = self.client.post("/contracts/analyze", files={
                "file": ("synthetic.pdf", self.pdf, "application/pdf"),
            })
        self.assertEqual(response.status_code, 500)
        self.assertNotIn(PRIVATE, response.text)
        self.assertIn("analyze this PDF", response.json()["detail"])
        self.assertEqual(self.db.rows["contracts"], [])

    def test_invalid_review_does_not_echo_the_contract_or_exception(self):
        response = self.client.post("/contracts/save", files={
            "file": ("synthetic.pdf", self.pdf, "application/pdf"),
        }, data={"contract_json": json.dumps({"private_field": PRIVATE})})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn(PRIVATE, response.text)
        self.assertNotIn("ValidationError", response.text)
        self.assertEqual(self.db.rows["contracts"], [])


if __name__ == "__main__":
    unittest.main()
