"""Exercise the real ASGI boundary before multipart parsing, plus PDF budgets."""
import asyncio
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch, AsyncMock

from fastapi import HTTPException
import pymupdf
import test_contract_save_flow as fixture
from test_contract_data_safety import TwoWorkspaces
from fastapi.testclient import TestClient
import pdf_input
import upload_security as security

main, database = fixture.main, fixture.database


class UploadBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def run_request(self, chunks, *, headers=(), authenticate=None, downstream=None, path="/contracts/save"):
        self.receives, self.messages = 0, []
        async def receive():
            index = self.receives
            self.receives += 1
            return {"type": "http.request", "body": chunks[index], "more_body": index < len(chunks)-1}
        async def send(message):
            self.messages.append(message)
        scope = {"type": "http", "method": "POST", "path": path, "headers": list(headers)}
        self.downstream = downstream or AsyncMock()
        app = security.ContractUploadGuard(self.downstream, authenticate or (lambda _: {"organization_id": "org-a"}))
        await app(scope, receive, send)
        return scope

    async def test_unauthorized_body_is_never_consumed_or_parsed(self):
        for status in (401, 403):
            def deny(_):
                raise HTTPException(status, "Access denied.")
            await self.run_request([b"private oversized malformed multipart"], authenticate=deny)
            self.assertEqual(self.receives, 0)
            self.assertEqual(self.messages[0]["status"], status)
            self.downstream.assert_not_called()

    async def test_membership_outage_is_private_and_body_is_not_consumed(self):
        def fail(_):
            raise RuntimeError("private credentials")
        await self.run_request([b"secret PDF"], authenticate=fail)
        self.assertEqual(self.receives, 0)
        self.assertEqual(self.messages[0]["status"], 503)
        self.assertNotIn("private credentials", str(self.messages))

    async def test_declared_oversize_and_invalid_lengths_fail_before_receiving(self):
        for length, status in [(str(security.MAX_REQUEST_BYTES+1), 413), ("x", 400), ("-1", 400), ("9"*5000, 413)]:
            await self.run_request([b"body"], headers=[(b"content-length", length.encode())])
            self.assertEqual(self.receives, 0)
            self.assertEqual(self.messages[0]["status"], status)
            self.downstream.assert_not_called()

    async def test_chunked_or_underdeclared_excess_is_rejected_without_parser(self):
        with patch.object(security, "MAX_REQUEST_BYTES", 5):
            for headers in ([], [(b"content-length", b"1")]):
                await self.run_request([b"123", b"456"], headers=headers)
                self.assertEqual(self.messages[0]["status"], 413)
                self.downstream.assert_not_called()

    async def test_exact_budget_is_replayed_unchanged_and_context_is_attached(self):
        seen = []
        async def parse(scope, receive, send):
            seen.append((scope["state"]["contract_upload_context"], await receive()))
        with patch.object(security, "MAX_REQUEST_BYTES", 6):
            await self.run_request([b"123", b"456"], downstream=parse)
        self.assertEqual(seen, [({"organization_id": "org-a"},
                               {"type": "http.request", "body": b"123456", "more_body": False})])

    async def test_slow_upload_times_out_and_compressed_input_is_denied(self):
        async def slow_receive():
            await asyncio.sleep(1)
        scope = {"type": "http", "method": "POST", "path": "/contracts/analyze", "headers": []}
        messages = []
        async def send(message): messages.append(message)
        downstream = AsyncMock()
        with patch.object(security, "UPLOAD_TIMEOUT_SECONDS", 0.001):
            await security.ContractUploadGuard(downstream, lambda _: {})(scope, slow_receive, send)
        self.assertEqual(messages[0]["status"], 408)
        downstream.assert_not_called()
        await self.run_request([b"compressed"], headers=[(b"content-encoding", b"gzip")])
        self.assertEqual(self.messages[0]["status"], 415)
        self.assertEqual(self.receives, 0)


class UploadApiTests(unittest.TestCase):
    def setUp(self):
        self.db = TwoWorkspaces()
        p = patch.object(database, "supabase", self.db)
        p.start(); self.addCleanup(p.stop)
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        self.auth = {"Authorization": "Bearer token-a"}

    def test_both_upload_routes_authenticate_before_malformed_multipart(self):
        for path in ("/contracts/analyze", "/contracts/save", "/contracts/save/"):
            for token, status in [(None, 401), ("invalid", 401), ("token-no-workspace", 403)]:
                response = self.client.post(path, content=b"malformed", headers={
                    "Content-Type": "multipart/form-data; boundary=missing",
                    **({"Authorization": f"Bearer {token}"} if token else {}),
                })
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.headers["cache-control"], "private, no-store")

    def test_pdf_and_review_json_limits_stop_before_ai_or_persistence(self):
        with patch.object(main, "extract_contract_data") as ai, patch.object(main, "save_contract") as save:
            for path in ("/contracts/analyze", "/contracts/save"):
                with patch.object(main, "MAX_PDF_BYTES", 5):
                    response = self.client.post(path, headers=self.auth,
                        files={"file": ("test.pdf", b"%PDF-over-budget", "application/pdf")},
                        data={"contract_json": "{}"})
                self.assertEqual(response.status_code, 413)
            response = self.client.post("/contracts/save", headers=self.auth,
                files={"file": ("test.pdf", b"%PDF", "application/pdf")},
                data={"contract_json": " "*(security.MAX_REVIEW_JSON_BYTES+1)})
            self.assertEqual(response.status_code, 413)
            ai.assert_not_called(); save.assert_not_called()

    def test_private_headers_cover_success_errors_and_preflight(self):
        for response in (self.client.get("/contracts", headers=self.auth),
                         self.client.get("/contracts/contract-b", headers=self.auth),
                         self.client.get("/contracts")):
            self.assertEqual(response.headers["cache-control"], "private, no-store")
            self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        response = self.client.post("/contracts/save", content=b"invalid", headers={
            "Origin": main.origins[0], "Content-Type": "multipart/form-data; boundary=x"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["access-control-allow-origin"], main.origins[0])

    def test_two_accounts_save_same_bytes_with_verified_scope_and_private_duplicates(self):
        with pymupdf.open() as document:
            document.new_page().insert_text((72,72), "Synthetic renewal wording.")
            pdf = document.tobytes()
        values = {field: None for field in main.ContractData.model_fields}
        identifiers = []
        for account in ("a", "b"):
            headers = {"Authorization": f"Bearer token-{account}"}
            with patch.object(main, "verify_access_token", wraps=main.verify_access_token) as verify:
                response = self.client.post("/contracts/save", headers=headers,
                    files={"file":("test.pdf",pdf,"application/pdf")},
                    data={"contract_json":json.dumps(values),"organization_id":"org-forged"})
                self.assertEqual(response.status_code, 200)
                verify.assert_called_once()
            body=response.json(); identifiers.append(body["database_id"])
            self.assertEqual(body["organization_id"], f"org-{account}")
            self.assertEqual(body["source_evidence"]["stage"], "reviewed_submission")
            duplicate=self.client.post("/contracts/save",headers=headers,
                files={"file":("test.pdf",pdf,"application/pdf")},data={"contract_json":json.dumps(values)})
            self.assertEqual(duplicate.status_code,409)
            self.assertEqual(duplicate.json()["detail"]["existing_contract_id"],identifiers[-1])
        self.assertNotEqual(*identifiers)


class PdfBudgetTests(unittest.TestCase):
    def test_page_budget_rejects_real_pdf_before_text_or_ai(self):
        with pymupdf.open() as document:
            for _ in range(3): document.new_page().insert_text((72,72), "Synthetic text")
            pdf = document.tobytes()
        with patch.object(pdf_input, "MAX_PDF_PAGES", 2), self.assertRaises(HTTPException) as caught:
            pdf_input.extract_pdf_pages(pdf)
        self.assertEqual(caught.exception.status_code, 413)

    def test_text_budget_counts_page_separators_and_closes_parser(self):
        with pymupdf.open() as document:
            for _ in range(2): document.new_page().insert_text((72,72), "Synthetic content")
            pdf = document.tobytes()
        pages=pdf_input.extract_pdf_pages(pdf)
        without_separator=sum(map(len,pages))
        with patch.object(pdf_input, "MAX_TEXT_CHARACTERS", without_separator), self.assertRaises(HTTPException) as caught:
            pdf_input.extract_pdf_pages(pdf)
        self.assertEqual(caught.exception.status_code, 413)
        self.assertTrue(pdf_input.extract_pdf_pages(pdf)[0].startswith("Synthetic"))
