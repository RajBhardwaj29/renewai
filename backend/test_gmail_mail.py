"""Synthetic Gmail authorization/delivery tests. No Google requests or emails."""
import base64
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
import os
import io
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import requests
import test_contract_save_flow
from test_reminder_delivery import claim, candidate
import database
import email_service
import gmail_mail
import reminder_delivery as delivery
from tools.connect_gmail import authorization_url, callback_code
from tools import connect_gmail as setup

CONFIG = {"GMAIL_CLIENT_ID": "synthetic.apps.googleusercontent.com", "GMAIL_CLIENT_SECRET": "PRIVATE-client",
          "GMAIL_REFRESH_TOKEN": "PRIVATE-refresh", "GMAIL_SENDER_ADDRESS": "renewai@example.test"}


def payload():
    return {"_provider": "gmail", "from": "RenewAI <renewai@example.test>",
            "to": ["owner@example.test"], "subject": "Renewal • ₹7,200,000", "text": "Reviewed contract facts"}


def response(code, data):
    return SimpleNamespace(status_code=code, json=lambda: data)


class GmailTransportTests(unittest.TestCase):
    def setUp(self):
        gmail_mail._cached_token = None
        env = patch.dict(os.environ, CONFIG)
        env.start(); self.addCleanup(env.stop)

    def test_mime_supports_unicode_and_stable_trace_id(self):
        with patch.object(gmail_mail, "_access_token", return_value="PRIVATE-access"):
            prepared = gmail_mail.prepare(payload(), "stable-event")
            second = gmail_mail.prepare(payload(), "stable-event")
        message = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(prepared.raw))
        other = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(second.raw))
        self.assertEqual(message["Subject"], payload()["subject"])
        self.assertIn(payload()["text"], message.get_content())
        self.assertEqual(message["Message-ID"], other["Message-ID"])
        self.assertNotIn("PRIVATE", repr(prepared))

    def test_header_injection_and_wrong_frozen_sender_stop_before_auth(self):
        with patch.object(gmail_mail, "_access_token") as auth:
            for field, value in (("subject", "Renewal\r\nBcc: private@example.test"),
                                 ("from", "Former <former@example.test>")):
                data = payload(); data[field] = value
                with self.assertRaises(gmail_mail.GmailNotReady):gmail_mail.prepare(data, "key")
        auth.assert_not_called()

    def test_refresh_verifies_account_and_caches_token_without_redirects(self):
        token = response(200, {"access_token": "PRIVATE-access", "expires_in": 3600, "scope": gmail_mail.SEND_SCOPE})
        identity = response(200, {"email": CONFIG["GMAIL_SENDER_ADDRESS"], "email_verified": True})
        with patch.object(gmail_mail.requests, "post", return_value=token) as refresh, patch.object(gmail_mail.requests, "get", return_value=identity) as account:
            self.assertEqual(gmail_mail._access_token(), "PRIVATE-access")
            self.assertEqual(gmail_mail._access_token(), "PRIVATE-access")
        refresh.assert_called_once(); account.assert_called_once()
        self.assertEqual(refresh.call_args.args[0], gmail_mail.TOKEN_URL)
        self.assertFalse(refresh.call_args.kwargs["allow_redirects"])
        self.assertFalse(account.call_args.kwargs["allow_redirects"])

    def test_revocation_wrong_account_and_missing_scope_are_private_preflight_errors(self):
        for token, identity in (
            (response(400, {"error": "PRIVATE revoked credentials"}), response(200, {})),
            (response(200, {"access_token": "PRIVATE", "expires_in": 3600, "scope": "openid"}), response(200, {})),
            (response(200, {"access_token": "PRIVATE", "expires_in": 3600, "scope": gmail_mail.SEND_SCOPE}), response(200, {"email": "wrong@example.test", "email_verified": True})),
            (response(200, {"access_token": "PRIVATE", "expires_in": 3600, "scope": gmail_mail.SEND_SCOPE+" https://www.googleapis.com/auth/gmail.readonly"}), response(200, {})),
        ):
            with patch.object(gmail_mail.requests,"post",return_value=token), patch.object(gmail_mail.requests,"get",return_value=identity):
                with self.assertRaises(gmail_mail.GmailNotReady) as error:gmail_mail._access_token()
            self.assertNotIn("PRIVATE", str(error.exception))
        self.assertIsNone(gmail_mail._cached_token)

    def test_missing_config_never_requests_a_token(self):
        with patch.dict(os.environ, {"GMAIL_REFRESH_TOKEN": ""}), patch.object(gmail_mail.requests, "post") as post:
            with self.assertRaises(gmail_mail.GmailNotReady):gmail_mail._access_token()
        post.assert_not_called()

    def test_single_https_send_returns_namespaced_receipt(self):
        prepared = gmail_mail.PreparedGmail("PRIVATE-access", "encoded-mime")
        with patch.object(gmail_mail.requests,"post",return_value=response(200,{"id":"18abc123"})) as post:
            result=gmail_mail.send(prepared)
        self.assertEqual(result,{"id":"gmail:18abc123"})
        post.assert_called_once()
        self.assertEqual(post.call_args.args[0], gmail_mail.SEND_URL)
        self.assertFalse(post.call_args.kwargs["allow_redirects"])

    def test_timeout_rejection_and_malformed_receipt_never_retry_or_expose_response(self):
        for result in (requests.Timeout("PRIVATE request"), response(403,{"error":"PRIVATE"}),
                       response(429,{}),response(500,{}),response(200,{}),response(200,{"id":123})):
            kwargs={"side_effect":result} if isinstance(result,Exception) else {"return_value":result}
            with patch.object(gmail_mail.requests,"post",**kwargs) as post:
                with self.assertRaises(RuntimeError) as error:gmail_mail.send(gmail_mail.PreparedGmail("secret","mime"))
            post.assert_called_once()
            self.assertNotIn("PRIVATE",str(error.exception))

    def test_transport_is_frozen_and_cannot_fall_back_to_resend(self):
        prepared=gmail_mail.PreparedGmail("secret","mime")
        with patch.object(email_service,"EMAIL_PROVIDER","resend"),patch.object(email_service.resend.Emails,"send") as resend,patch.object(gmail_mail,"send",return_value={"id":"gmail:a"}) as gmail:
            self.assertEqual(email_service.send_reminder_payload(payload(),"key",gmail_prepared=prepared),{"id":"gmail:a"})
            with self.assertRaises(RuntimeError):email_service.send_reminder_payload(payload(),"key")
        resend.assert_not_called();gmail.assert_called_once()

    def test_missing_gmail_configuration_cannot_create_a_frozen_invalid_payload(self):
        with patch.object(email_service,"EMAIL_PROVIDER","gmail"),patch.dict(os.environ,{"GMAIL_REFRESH_TOKEN":""}):
            with self.assertRaises(gmail_mail.GmailNotReady):
                email_service.build_renewal_reminder_payload("owner@example.test","Vendor","Title","30_day","2026-01-01",None,None)


class GmailDispatchTests(unittest.TestCase):
    def setUp(self):
        self.claim=claim();self.claim["payload"]=payload()
        self.patchers=[patch.object(database,"get_pending_due_reminders_for_delivery",return_value=[candidate()]),
            patch.object(delivery,"organization_recipient",return_value="owner@example.test"),
            patch.object(database,"claim_reminder_delivery",return_value=self.claim),
            patch.object(database,"begin_gmail_reminder_delivery",return_value=True),
            patch.object(database,"complete_reminder_delivery",return_value=True),
            patch.object(database,"fail_reminder_delivery",return_value=True),
            patch.object(gmail_mail,"prepare",return_value=gmail_mail.PreparedGmail("secret","mime")),
            patch.object(delivery,"send_reminder_payload",return_value={"id":"gmail:abc"})]
        self.mocks=[p.start() for p in self.patchers]
        for p in self.patchers:self.addCleanup(p.stop)

    def test_google_auth_failure_does_not_reserve_or_send(self):
        self.mocks[-2].side_effect=gmail_mail.GmailNotReady("Not connected")
        self.assertEqual(delivery.deliver_due_reminders("org-a","test")["failed_count"],1)
        self.mocks[3].assert_not_called();self.mocks[-1].assert_not_called()

    def test_missing_false_or_uncertain_dispatch_reservation_never_sends(self):
        for effect in (False, RuntimeError("PRIVATE lost RPC response")):
            self.mocks[3].side_effect=effect if isinstance(effect,Exception) else None
            self.mocks[3].return_value=effect
            result=delivery.deliver_due_reminders("org-a","test")
            self.assertEqual(result["needs_review_count"],1)
            self.assertEqual(self.mocks[5].call_args.args[-1],"gmail_delivery_unconfirmed")
        self.mocks[-1].assert_not_called()

    def test_acceptance_persistence_failure_requires_review_instead_of_resending(self):
        self.mocks[4].return_value=False
        result=delivery.deliver_due_reminders("org-a","test")
        self.assertEqual(result["needs_review_count"],1)
        self.assertEqual(self.mocks[4].call_count,3)
        self.mocks[-1].assert_called_once()
        self.assertEqual(self.mocks[5].call_args.args[-1],"gmail_delivery_unconfirmed")


class GmailSetupAndHealthTests(unittest.TestCase):
    def test_setup_writes_private_credentials_outside_repo_without_sending_or_printing_tokens(self):
        class Server:
            server_port = 12345
            def __init__(self,_address,handler):self.handler=handler
            def __enter__(self):return self
            def __exit__(self,*_args):pass
            def handle_request(self):
                handler=object.__new__(self.handler)
                handler.path='/?state=state&code=synthetic'
                handler.send_response=lambda *_:None
                handler.send_header=lambda *_:None
                handler.end_headers=lambda:None
                handler.wfile=io.BytesIO()
                handler.do_GET()
        with tempfile.TemporaryDirectory() as directory:
            client=Path(directory)/'client.json'
            client.write_text('{"installed":{"client_id":"synthetic.apps.googleusercontent.com","client_secret":"PRIVATE-client"}}')
            output=Path(directory)/'sender.env'
            token=response(200,{'access_token':'PRIVATE-access','refresh_token':'PRIVATE-refresh','scope':gmail_mail.SEND_SCOPE+' openid email'})
            identity=response(200,{'email':'sender@example.test','email_verified':True})
            printed=io.StringIO()
            with patch.object(setup,'HTTPServer',Server),patch.object(setup.secrets,'token_urlsafe',side_effect=['state','verifier']),patch.object(setup.requests,'post',return_value=token) as post,patch.object(setup.requests,'get',return_value=identity),patch('sys.stdout',printed):
                setup.connect(client,'sender@example.test',output)
            self.assertEqual(stat.S_IMODE(output.stat().st_mode),0o600)
            self.assertIn('PRIVATE-refresh',output.read_text())
            self.assertNotIn('PRIVATE',printed.getvalue())
            post.assert_called_once()
            self.assertEqual(post.call_args.args[0],gmail_mail.TOKEN_URL)
            with self.assertRaises(ValueError):setup.connect(client,'sender@example.test',output)
            with self.assertRaises(ValueError):setup.connect(client,'sender@example.test',Path(setup.__file__).with_name('unsafe.env'))

    def test_setup_requests_sending_and_identity_only_with_pkce_and_state(self):
        url=authorization_url("client","http://127.0.0.1:1234/","state","verifier")
        query=parse_qs(urlparse(url).query)
        self.assertEqual(set(query["scope"][0].split()),{"openid","email",gmail_mail.SEND_SCOPE})
        self.assertEqual(query["code_challenge_method"],["S256"])
        self.assertEqual(callback_code('/?state=state&code=synthetic', 'state'),'synthetic')
        for path in ('/?state=wrong&code=secret','/?state=state&error=denied','/?state=state&code=a&code=b'):
            with self.assertRaises(ValueError):callback_code(path,'state')

    def test_expired_gmail_dispatch_is_review_not_retryable(self):
        now=datetime.now(timezone.utc)
        rows=[{"state":"processing","first_attempt_at":now.isoformat(),
               "lease_until":(now-timedelta(minutes=1)).isoformat(),"dispatched_at":now.isoformat()}]
        with patch.object(database,"get_reminder_delivery_health",return_value=rows):
            result=delivery.delivery_health("org-a")
        self.assertEqual(result["needs_review"],1)
        self.assertEqual(result["retryable"],0)


if __name__ == "__main__":unittest.main()
