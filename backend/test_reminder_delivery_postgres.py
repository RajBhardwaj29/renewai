"""Opt-in real PostgreSQL tests. Refuses remote or non-disposable databases.

Requires psycopg in the test environment and RENEWAI_TEST_POSTGRES_URL pointing
at the loopback-only database named renewai_reminder_test. No email is sent.
"""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
from threading import Event, Lock
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import urlparse

import test_contract_save_flow  # Import the app with synthetic configuration.
import database
import reminder_delivery as delivery

try:
    import psycopg
    from psycopg import sql
    from psycopg.types.json import Jsonb
except ImportError:
    psycopg = None

DSN = os.getenv("RENEWAI_TEST_POSTGRES_URL", "")
ORG = "00000000-0000-4000-8000-000000000001"
OTHER_ORG = "00000000-0000-4000-8000-000000000002"
CONTRACT = "00000000-0000-4000-8000-000000000010"
REMINDER = "00000000-0000-4000-8000-000000000020"


class SQLRPC:
    """Execute the actual migration functions; do not emulate their locking."""
    def rpc(self, name, params):
        def execute():
            query = sql.SQL("select public.{}({})").format(sql.Identifier(name),
                sql.SQL(",").join(sql.Placeholder() for _ in params))
            values = [Jsonb(v) if isinstance(v, dict) else v for v in params.values()]
            with psycopg.connect(DSN, autocommit=True) as connection:
                return SimpleNamespace(data=connection.execute(query, values).fetchone()[0])
        return SimpleNamespace(execute=execute)


class Provider:
    def __init__(self, lose_first_response=False, block=False):
        self.calls, self.accepted = [], {}
        self.lock, self.entered, self.release = Lock(), Event(), Event()
        self.lose_first_response, self.block = lose_first_response, block

    def __call__(self, payload, key):
        with self.lock:
            self.calls.append((deepcopy(payload), key))
            encoded = json.dumps(payload, sort_keys=True)
            if key in self.accepted:
                assert self.accepted[key][0] == encoded, "Idempotent payload changed"
            else:
                self.accepted[key] = (encoded, f"provider-{len(self.accepted)+1}")
            receipt = self.accepted[key][1]
            lose = self.lose_first_response
            self.lose_first_response = False
        self.entered.set()
        if self.block and not self.release.wait(5):
            raise RuntimeError("Local test barrier timed out")
        if lose:
            raise RuntimeError("PRIVATE provider timeout after accepting the email")
        return {"id": receipt}


@unittest.skipUnless(DSN and psycopg, "Set loopback RENEWAI_TEST_POSTGRES_URL and install psycopg for SQL tests")
class ReminderPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        parsed = urlparse(DSN)
        if parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed.path != "/renewai_reminder_test":
            raise RuntimeError("Refusing a remote or non-disposable reminder test database")
        with psycopg.connect(DSN, autocommit=True) as c:
            c.execute("""
                do $$ begin
                  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
                  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
                  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
                end $$;
                create table if not exists public.organizations(id uuid primary key);
                create table if not exists public.contracts(
                  id uuid primary key, organization_id uuid references public.organizations(id),
                  vendor_name text, contract_title text, archived boolean not null default false,
                  cancellation_deadline date, effective_renewal_date date);
                create table if not exists public.contract_reminders(
                  id uuid primary key, organization_id uuid not null references public.organizations(id),
                  contract_id uuid not null references public.contracts(id), reminder_type text not null,
                  remind_on date not null,status text not null default 'pending',
                  created_at timestamptz not null default now(),sent_at timestamptz,
                  unique(contract_id,reminder_type));
            """)
            migration = Path(__file__).with_name("migrations") / "20261015_reminder_delivery_safety.sql"
            c.execute(migration.read_text())
            c.execute(migration.read_text())  # The deployment migration is repeatable.

    def query(self, statement, params=()):
        with psycopg.connect(DSN, autocommit=True) as c:
            cursor = c.execute(statement, params)
            return cursor.fetchall() if cursor.description else []

    def setUp(self):
        self.query("truncate public.organizations,public.contracts,public.contract_reminders,public.reminder_deliveries cascade")
        self.deadline = datetime.now(timezone.utc).date() + timedelta(days=10)
        self.query("insert into public.organizations values(%s),(%s)", (ORG, OTHER_ORG))
        self.query("insert into public.contracts values(%s,%s,'Synthetic vendor','Test agreement',false,%s,%s)",
                   (CONTRACT, ORG, self.deadline, self.deadline + timedelta(days=90)))
        self.query("insert into public.contract_reminders(id,organization_id,contract_id,reminder_type,remind_on) values(%s,%s,%s,'30_day',%s)",
                   (REMINDER, ORG, CONTRACT, self.deadline - timedelta(days=30)))
        self.provider = Provider()
        for patcher in [patch.object(database, "supabase", SQLRPC()),
                        patch.object(database, "get_pending_due_reminders_for_delivery", side_effect=self.candidates),
                        patch.object(delivery, "organization_recipient", return_value="owner@example.test"),
                        patch.object(delivery, "send_reminder_payload", side_effect=lambda *args: self.provider(*args))]:
            patcher.start()
            self.addCleanup(patcher.stop)

    def candidates(self, organization_id, **_kwargs):
        return [r[0] for r in self.query("""select to_jsonb(r)||jsonb_build_object('contracts',to_jsonb(c))
            from public.contract_reminders r left join public.contracts c on c.id=r.contract_id
            where r.organization_id=%s and r.status='pending' and r.remind_on<=(now() at time zone 'UTC')::date""", (organization_id,))]

    def send(self):
        return delivery.deliver_due_reminders(ORG, "local-test")

    def state(self):
        return self.query("select r.status,d.state,d.provider_email_id from public.contract_reminders r left join public.reminder_deliveries d on d.reminder_id=r.id")[0]

    def claim(self, org=ORG):
        return database.claim_reminder_delivery(org, REMINDER, self.deadline.isoformat(),
            {"from":"sender@example.test","to":["owner@example.test"],"subject":"Test","text":"Frozen"})

    def test_overdue_current_checkpoint_is_sent_once_and_recorded_atomically(self):
        self.assertEqual(self.send()["sent_count"], 1)
        self.assertEqual(self.state(), ("sent", "accepted", "provider-1"))
        self.assertEqual(self.send()["sent_count"], 0)
        self.assertEqual(len(self.provider.accepted), 1)

    def test_overlapping_dispatches_only_one_worker_reaches_provider(self):
        self.provider = Provider(block=True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(self.send)
            self.assertTrue(self.provider.entered.wait(3))
            try:
                second = pool.submit(self.send).result(timeout=3)
                self.assertEqual(second["in_progress_count"], 1)
                self.assertEqual(second["sent_count"], 0)
            finally:
                self.provider.release.set()
            self.assertEqual(first.result(timeout=3)["sent_count"], 1)
        self.assertEqual(len(self.provider.calls), 1)

    def test_eight_concurrent_claims_have_one_winner(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            outcomes = list(pool.map(lambda _: self.claim()["outcome"], range(8)))
        self.assertEqual(outcomes.count("claimed"), 1)
        self.assertEqual(outcomes.count("busy"), 7)

    def test_provider_timeout_after_acceptance_retries_same_key_and_payload(self):
        self.provider = Provider(lose_first_response=True)
        self.assertEqual(self.send()["failed_count"], 1)
        self.assertEqual(self.state()[:2], ("pending", "retryable"))
        self.query("update public.contracts set vendor_name='Renamed vendor'")
        self.assertEqual(self.send()["sent_count"], 1)
        self.assertEqual(len(self.provider.calls), 2)
        self.assertEqual(self.provider.calls[0], self.provider.calls[1])
        self.assertEqual(len(self.provider.accepted), 1)

    def test_recipient_change_requires_review_without_sending_to_former_owner(self):
        self.provider = Provider(lose_first_response=True)
        self.send()
        with patch.object(delivery, "organization_recipient", return_value="new-owner@example.test"):
            self.assertEqual(self.send()["needs_review_count"], 1)
        self.assertEqual(len(self.provider.calls), 1)

    def test_failed_receipt_write_never_causes_an_unkeyed_send(self):
        with patch.object(database, "complete_reminder_delivery", side_effect=RuntimeError("PRIVATE DB ERROR")):
            first = self.send()
        self.assertEqual(first["failed_count"], 1)
        self.assertEqual(self.send()["sent_count"], 1)
        self.assertEqual(len(self.provider.accepted), 1)
        self.assertEqual(self.state()[0], "sent")

    def test_transient_receipt_write_failure_retries_only_the_database(self):
        complete = database.complete_reminder_delivery
        with patch.object(database, "complete_reminder_delivery", side_effect=[RuntimeError("transient"), True]) as mock:
            self.assertEqual(self.send()["sent_count"], 1)
            self.assertEqual(mock.call_count, 2)
        self.assertEqual(len(self.provider.calls), 1)
        # The previous mocked success only verifies orchestration; persist via the real function.
        token = self.query("select claim_token from public.reminder_deliveries")[0][0]
        self.assertTrue(complete(ORG,REMINDER,str(token),"provider-1"))

    def test_expired_idempotency_window_requires_review_without_resending(self):
        self.provider = Provider(lose_first_response=True)
        self.send()
        self.query("update public.reminder_deliveries set first_attempt_at=now()-interval '24 hours'")
        result = self.send()
        self.assertEqual(result["needs_review_count"], 1)
        self.assertEqual(self.state()[:2], ("pending", "needs_review"))
        self.assertEqual(len(self.provider.calls), 1)

    def test_archived_expired_and_stale_checkpoints_are_not_sent(self):
        for statement in ["update public.contracts set archived=true",
                          "update public.contracts set cancellation_deadline=current_date-1",
                          "update public.contracts set cancellation_deadline=cancellation_deadline+1"]:
            with self.subTest(statement=statement):
                self.query("update public.contracts set archived=false,cancellation_deadline=%s", (self.deadline,))
                self.query(statement)
                self.assertEqual(self.send()["skipped_count"], 1)
                self.assertEqual(self.claim()["outcome"], "skipped")
        self.assertEqual(self.provider.calls, [])

    def test_direct_claim_refuses_foreign_organization_or_missing_contract(self):
        self.assertEqual(self.claim(OTHER_ORG)["outcome"], "skipped")
        self.query("update public.contract_reminders set organization_id=%s",(OTHER_ORG,))
        self.assertEqual(self.claim(OTHER_ORG)["outcome"], "skipped")
        self.assertEqual(self.provider.calls, [])

    def test_lease_recovery_and_fencing_reject_late_workers(self):
        first = self.claim()
        self.query("update public.reminder_deliveries set lease_until=now()-interval '1 minute'")
        second = self.claim()
        self.assertNotEqual(first["claim_token"], second["claim_token"])
        self.assertFalse(database.complete_reminder_delivery(ORG,REMINDER,first["claim_token"],"late-provider-id"))
        self.assertFalse(database.fail_reminder_delivery(ORG,REMINDER,first["claim_token"],"provider_request_failed"))
        self.assertTrue(database.complete_reminder_delivery(ORG,REMINDER,second["claim_token"],"current-provider-id"))

    def test_cancelled_or_already_sent_reminders_cannot_be_claimed(self):
        for state in ("sent", "cancelled"):
            self.query("update public.contract_reminders set status=%s",(state,))
            self.assertEqual(self.claim()["outcome"], "skipped")

    def test_changed_deadline_between_candidate_read_and_claim_is_rejected(self):
        original = database.claim_reminder_delivery
        def change_then_claim(*args):
            self.query("update public.contracts set archived=true")
            return original(*args)
        with patch.object(database,"claim_reminder_delivery",side_effect=change_then_claim):
            self.assertEqual(self.send()["skipped_count"],1)
        self.assertEqual(self.provider.calls, [])

    def test_changed_frozen_event_is_quarantined(self):
        self.claim()
        self.query("update public.contracts set cancellation_deadline=cancellation_deadline+1")
        self.query("update public.contract_reminders set remind_on=remind_on+1")
        self.deadline += timedelta(days=1)
        self.assertEqual(self.claim()["outcome"], "needs_review")

    def test_malformed_provider_response_does_not_mark_sent(self):
        with patch.object(delivery,"send_reminder_payload",return_value={}):
            self.assertEqual(self.send()["failed_count"],1)
        self.assertEqual(self.state()[:2],("pending","retryable"))

    def test_authenticated_clients_cannot_read_payloads_or_call_claim_functions(self):
        self.claim()
        for role in ("anon","authenticated"):
            for statement in ["select * from public.reminder_deliveries",
                              "select public.claim_reminder_delivery(null,null,null,'{}'::jsonb)"]:
                with psycopg.connect(DSN,autocommit=True) as c:
                    c.execute(sql.SQL("set role {}").format(sql.Identifier(role)))
                    with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                        c.execute(statement)

    def test_receipt_write_is_idempotent_and_late_failure_cannot_downgrade(self):
        claim = self.claim()
        self.assertTrue(database.complete_reminder_delivery(ORG,REMINDER,claim["claim_token"],"provider-1"))
        self.assertTrue(database.complete_reminder_delivery(ORG,REMINDER,claim["claim_token"],"provider-1"))
        self.assertFalse(database.fail_reminder_delivery(ORG,REMINDER,claim["claim_token"],"provider_request_failed"))
        self.assertEqual(self.state(),("sent","accepted","provider-1"))


if __name__ == "__main__":
    unittest.main()
