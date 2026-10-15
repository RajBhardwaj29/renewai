"""Eligibility, shared entry points, safe failures, and privacy without live services."""
from datetime import datetime, timedelta, timezone
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import test_contract_save_flow
import database
import email_service
import reminder_delivery as delivery
import reminder_scheduler
from reminder_rules import delivery_reason

main = test_contract_save_flow.main
NOW = datetime.now(timezone.utc)
TODAY = NOW.date()


def candidate():
    deadline = TODAY + timedelta(days=10)
    return {"id":"reminder-a","organization_id":"org-a","contract_id":"contract-a","status":"pending",
            "reminder_type":"30_day","remind_on":(deadline-timedelta(days=30)).isoformat(),
            "contracts":{"id":"contract-a","organization_id":"org-a","archived":False,
                         "vendor_name":"Synthetic vendor","contract_title":"Synthetic agreement",
                         "cancellation_deadline":deadline.isoformat(),"effective_renewal_date":(deadline+timedelta(days=90)).isoformat()}}


def claim():
    return {"outcome":"claimed","claim_token":"claim-a","idempotency_key":"stable-key",
            "lease_until":(NOW+timedelta(minutes=5)).isoformat(),"send_before":(NOW+timedelta(hours=23)).isoformat(),
            "payload":{"from":"sender@example.test","to":["owner@example.test"],"subject":"Frozen subject","text":"Frozen body"}}


class EligibilityTests(unittest.TestCase):
    def test_due_and_overdue_are_eligible_until_the_deadline_day(self):
        r = candidate()
        self.assertEqual(delivery_reason(r,TODAY),"eligible")
        self.assertEqual(delivery_reason(r, TODAY+timedelta(days=10)),"eligible")
        self.assertEqual(delivery_reason(r, TODAY+timedelta(days=11)),"past_deadline")

    def test_unknown_archived_foreign_and_stale_records_fail_closed(self):
        mutations = [("contracts",None,"unavailable"), ("contracts.organization_id","org-b","unavailable"),
                     ("contracts.id","other-contract","unavailable"), ("contracts.archived",True,"archived"),
                     ("contracts.cancellation_deadline",None,"invalid_dates"),
                     ("remind_on",TODAY.isoformat(),"obsolete_checkpoint"), ("reminder_type","unknown","obsolete_checkpoint"),
                     ("status","cancelled","inactive")]
        for field,value,expected in mutations:
            r=candidate()
            target,key = (r["contracts"],field.split(".")[1]) if "." in field else (r,field)
            target[key]=value
            self.assertEqual(delivery_reason(r,TODAY),expected,field)


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.claim = claim()
        self.patchers = [patch.object(database,"get_pending_due_reminders_for_delivery",return_value=[candidate()]),
                         patch.object(delivery,"organization_recipient",return_value="owner@example.test"),
                         patch.object(database,"claim_reminder_delivery",side_effect=lambda *_a:self.claim),
                         patch.object(database,"complete_reminder_delivery",return_value=True),
                         patch.object(database,"fail_reminder_delivery",return_value=True),
                         patch.object(delivery,"send_reminder_payload",return_value={"id":"provider-a"})]
        self.mocks=[p.start() for p in self.patchers]
        for p in self.patchers:self.addCleanup(p.stop)
        self.sender=self.mocks[-1]

    def send(self):
        return delivery.deliver_due_reminders("org-a","run-a")

    def test_missing_safety_migration_fails_before_provider(self):
        with patch.object(database,"claim_reminder_delivery",side_effect=RuntimeError("PRIVATE RPC not found")):
            result=self.send()
        self.assertEqual(result["failed_count"],1)
        self.assertNotIn("PRIVATE",str(result))
        self.sender.assert_not_called()

    def test_malformed_claim_fails_closed_without_hiding_a_second_exception(self):
        self.claim=["unexpected"]
        self.assertEqual(self.send()["failed_count"],1)
        self.sender.assert_not_called()

    def test_expired_lease_or_safe_retry_window_stops_a_paused_worker(self):
        for field in ("lease_until","send_before"):
            self.claim=claim()
            self.claim[field]=(NOW-timedelta(minutes=1)).isoformat()
            self.assertEqual(self.send()["failed_count"],1)
        self.sender.assert_not_called()

    def test_overdue_but_expired_deadline_skips_recipient_and_provider(self):
        r=candidate();r["contracts"]["cancellation_deadline"]=(TODAY-timedelta(days=1)).isoformat()
        with patch.object(database,"get_pending_due_reminders_for_delivery",return_value=[r]):
            self.assertEqual(self.send()["skipped_count"],1)
        self.mocks[1].assert_not_called()
        self.sender.assert_not_called()

    def test_failed_delivery_response_and_logs_do_not_contain_provider_text(self):
        self.sender.side_effect=RuntimeError("PRIVATE provider key=do-not-print owner@example.test")
        with self.assertLogs(delivery.logger,level="INFO") as logs:
            result=self.send()
        combined=str(result)+str(logs.output)
        self.assertNotIn("PRIVATE",combined)
        self.assertNotIn("owner@example.test",combined)
        self.assertNotIn("do-not-print",combined)

    def test_missing_recipient_cannot_send_or_create_claim(self):
        self.mocks[1].side_effect=RuntimeError("No members")
        self.assertEqual(self.send()["processing_errors"],1)
        self.mocks[2].assert_not_called()
        self.sender.assert_not_called()


class EmailTransportTests(unittest.TestCase):
    def test_provider_transport_requires_and_passes_idempotency_key(self):
        with patch.object(email_service,"RESEND_API_KEY","synthetic-key"),patch.object(email_service.resend.Emails,"send",return_value={"id":"fake"}) as send:
            email_service.send_reminder_payload({"text":"test"},"stable-event")
            send.assert_called_once_with({"text":"test"},options={"idempotency_key":"stable-event"})
            with self.assertRaises(ValueError):email_service.send_reminder_payload({},"")


class DeliveryHealthTests(unittest.TestCase):
    def test_health_exposes_only_counts_and_flags(self):
        rows=[{"state":"processing","first_attempt_at":(NOW-timedelta(days=2)).isoformat(),"lease_until":None,
               "payload":{"to":["PRIVATE@example.test"]}},
              {"state":"processing","first_attempt_at":NOW.isoformat(),"lease_until":(NOW-timedelta(minutes=1)).isoformat()},
              {"state":"accepted","first_attempt_at":NOW.isoformat()}]
        with patch.object(database,"get_reminder_delivery_health",return_value=rows):
            result=delivery.delivery_health("org-a")
        self.assertEqual(result["needs_review"],1)
        self.assertEqual(result["retryable"],1)
        self.assertEqual(result["accepted"],1)
        self.assertNotIn("PRIVATE",str(result))


class ReminderRouteTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(main.app,raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def test_manual_route_uses_authenticated_organization_and_shared_dispatcher(self):
        with patch.object(main,"get_authenticated_context",return_value={"organization_id":"org-a"}),patch.object(main,"deliver_due_reminders",return_value={"sent_count":0}) as send:
            response=self.client.post("/reminders/send-due",json={"organization_id":"org-b"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(send.call_args.args[0],"org-a")

    def test_cron_rejects_missing_or_wrong_secret_without_dispatch(self):
        with patch.dict(os.environ,{"CRON_SECRET":"test-secret"}),patch.object(main,"process_due_reminders") as process:
            for headers in ({},{"X-Cron-Secret":"wrong"}):
                self.assertEqual(self.client.post("/internal/process-reminders",headers=headers).status_code,401)
        process.assert_not_called()

    def test_partial_cron_run_is_not_reported_as_http_success(self):
        with patch.dict(os.environ,{"CRON_SECRET":"test-secret"}),patch.object(main,"process_due_reminders",return_value={"status":"partial"}):
            response=self.client.post("/internal/process-reminders",headers={"X-Cron-Secret":"test-secret"})
        self.assertEqual(response.status_code,500)

    def test_health_requires_authentication(self):
        self.assertEqual(self.client.get("/reminders/delivery-health").status_code,401)

    def test_scheduler_uses_same_dispatcher_and_marks_failures_partial(self):
        query=SimpleNamespace(select=lambda *_:SimpleNamespace(execute=lambda:SimpleNamespace(data=[{"id":"org-a"}])))
        result={"due_found":2,"sent_count":1,"failed_count":1,"skipped_count":0,"in_progress_count":0,"needs_review_count":1,"processing_errors":0}
        with patch.object(database,"supabase",SimpleNamespace(table=lambda *_:query)),patch.object(reminder_scheduler,"deliver_due_reminders",return_value=result) as send:
            summary=reminder_scheduler.process_due_reminders()
        self.assertEqual(send.call_args.args[0],"org-a")
        self.assertEqual(summary["status"],"partial")
        self.assertEqual(summary["needs_review"],1)


if __name__ == "__main__":unittest.main()
