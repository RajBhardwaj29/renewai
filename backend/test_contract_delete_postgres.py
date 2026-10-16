"""Atomic deletion regressions on the guarded disposable loopback database."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import unittest

import test_reminder_delivery_postgres as fixture


@unittest.skipUnless(fixture.DSN and fixture.psycopg, 'Requires the disposable local PostgreSQL fixture')
class ContractDeletePostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.ReminderPostgresTests.setUpClass()  # Includes the remote-database refusal guard.
        cls.query = fixture.ReminderPostgresTests.query
        with fixture.psycopg.connect(fixture.DSN, autocommit=True) as c:
            c.execute('''create table if not exists public.contract_decision_history(
                id uuid primary key, organization_id uuid not null references public.organizations(id),
                contract_id uuid not null references public.contracts(id), decision_notes text);
            ''')
            migration = Path(__file__).with_name('migrations') / '20261016_atomic_contract_delete.sql'
            c.execute(migration.read_text())
            c.execute(migration.read_text())

    def setUp(self):
        self.query('''drop trigger if exists fail_contract_delete on public.contracts;
            drop trigger if exists fail_history_delete on public.contract_decision_history;
            truncate public.organizations,public.contracts,public.contract_reminders,
              public.contract_decision_history,public.reminder_deliveries cascade''')
        self.other_contract = '00000000-0000-4000-8000-000000000011'
        self.other_reminder = '00000000-0000-4000-8000-000000000021'
        self.query('insert into public.organizations values(%s),(%s)', (fixture.ORG, fixture.OTHER_ORG))
        for org, contract, reminder, history in [
            (fixture.ORG, fixture.CONTRACT, fixture.REMINDER, '00000000-0000-4000-8000-000000000030'),
            (fixture.OTHER_ORG, self.other_contract, self.other_reminder, '00000000-0000-4000-8000-000000000031')]:
            self.query('''insert into public.contracts(id,organization_id) values(%s,%s);
            ''', (contract, org))
            self.query('''insert into public.contract_reminders(id,organization_id,contract_id,reminder_type,remind_on)
                values(%s,%s,%s,'30_day',current_date)''', (reminder, org, contract))
            self.query('''insert into public.contract_decision_history values(%s,%s,%s,'Synthetic decision')''',
                       (history, org, contract))
            self.query('''insert into public.reminder_deliveries(reminder_id,organization_id,state,claim_token,
                first_attempt_at,deadline,checkpoint_date,payload,provider_email_id)
                values(%s,%s,'accepted',gen_random_uuid(),now(),current_date,current_date,'{}','synthetic-receipt')''',
                       (reminder, org))

    def tearDown(self):
        self.query('''drop trigger if exists fail_contract_delete on public.contracts;
            drop trigger if exists fail_history_delete on public.contract_decision_history''')

    def delete(self, org=fixture.ORG, contract=fixture.CONTRACT):
        return self.query('select public.delete_contract_atomically(%s,%s)', (org, contract))[0][0]

    def counts(self):
        return [self.query(f'select count(*) from public.{table}')[0][0] for table in
                ('contracts', 'contract_reminders', 'contract_decision_history', 'reminder_deliveries')]

    def test_success_deletes_owned_records_and_cascaded_journal_only(self):
        self.assertEqual(str(self.delete()), fixture.CONTRACT)
        self.assertEqual(self.counts(), [1, 1, 1, 1])
        self.assertEqual(str(self.query('select id from public.contracts')[0][0]), self.other_contract)
        self.assertIsNone(self.delete())
        self.assertEqual(self.counts(), [1, 1, 1, 1])

    def test_wrong_workspace_and_missing_contract_delete_nothing(self):
        self.assertIsNone(self.delete(fixture.OTHER_ORG))
        self.assertIsNone(self.delete(contract='00000000-0000-4000-8000-000000000099'))
        self.assertEqual(self.counts(), [2, 2, 2, 2])

    def test_history_failure_rolls_back_prior_reminder_and_journal_deletes(self):
        self.query('''create or replace function public.synthetic_block_delete() returns trigger
            language plpgsql as $$begin raise exception 'Synthetic deletion failure'; end$$;
            create trigger fail_history_delete before delete on public.contract_decision_history
            for each row execute function public.synthetic_block_delete()''')
        with self.assertRaises(fixture.psycopg.Error):
            self.delete()
        self.assertEqual(self.counts(), [2, 2, 2, 2])

    def test_final_contract_failure_rolls_back_all_dependents(self):
        self.query('''create or replace function public.synthetic_block_delete() returns trigger
            language plpgsql as $$begin raise exception 'Synthetic deletion failure'; end$$;
            create trigger fail_contract_delete before delete on public.contracts
            for each row execute function public.synthetic_block_delete()''')
        with self.assertRaises(fixture.psycopg.Error):
            self.delete()
        self.assertEqual(self.counts(), [2, 2, 2, 2])

    def test_suppressed_contract_delete_is_not_reported_as_success(self):
        self.query('''create or replace function public.synthetic_skip_delete() returns trigger
            language plpgsql as $$begin return null; end$$;
            create trigger fail_contract_delete before delete on public.contracts
            for each row execute function public.synthetic_skip_delete()''')
        with self.assertRaises(fixture.psycopg.Error):
            self.delete()
        self.assertEqual(self.counts(), [2, 2, 2, 2])

    def test_concurrent_deletes_have_one_winner(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.delete(), range(8)))
        self.assertEqual(sum(result is not None for result in results), 1)
        self.assertEqual(self.counts(), [1, 1, 1, 1])

    def test_only_backend_role_can_call_pinned_security_definer(self):
        row = self.query('''select prosecdef,proconfig,
            has_function_privilege('anon',oid,'EXECUTE'),
            has_function_privilege('authenticated',oid,'EXECUTE'),
            has_function_privilege('service_role',oid,'EXECUTE')
            from pg_proc where oid='public.delete_contract_atomically(uuid,uuid)'::regprocedure''')[0]
        self.assertEqual(row, (True, ['search_path=pg_catalog, public'], False, False, True))
        for role in ('anon', 'authenticated'):
            with fixture.psycopg.connect(fixture.DSN, autocommit=True) as c:
                c.execute(f'set role {role}')
                with self.assertRaises(fixture.psycopg.errors.InsufficientPrivilege):
                    c.execute('select public.delete_contract_atomically(%s,%s)', (fixture.ORG, fixture.CONTRACT))
        self.assertEqual(self.counts(), [2, 2, 2, 2])


if __name__ == '__main__':
    unittest.main()
