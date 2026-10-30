from pathlib import Path
import json
import unittest
import test_reminder_delivery_postgres as fixture

MIGRATION=(Path(__file__).parents[1]/'supabase/migrations/20261030111923_contract_chat_sources.sql').read_text()


@unittest.skipUnless(fixture.DSN and fixture.psycopg,'Requires disposable local PostgreSQL')
class ContractSourcesPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): fixture.ReminderPostgresTests.setUpClass()

    def setUp(self):
        self.db=fixture.psycopg.connect(fixture.DSN);self.addCleanup(self.db.close)
        self.db.execute('truncate public.organizations cascade')
        self.db.execute("alter table public.contracts add column if not exists file_hash text; alter table public.contracts add column if not exists source_evidence jsonb; alter table public.contracts alter column id set default gen_random_uuid(); grant usage on schema public to service_role,anon,authenticated; grant select,insert,update,delete on public.contracts to service_role;")
        self.db.execute(MIGRATION.replace('BEGIN;','').replace('COMMIT;',''))
        self.db.execute('insert into public.organizations(id) values(%s),(%s)',(fixture.ORG,fixture.OTHER_ORG))

    def save(self,pages=None,org=fixture.ORG):
        return self.db.execute('select public.save_contract_with_source(%s::jsonb,%s::jsonb)',(json.dumps({'organization_id':org,'file_hash':'a'*64,'vendor_name':'Synthetic'}),json.dumps(pages or ['Renewal requires 60 days notice.']))).fetchone()[0]

    def test_atomic_save_defaults_source_hash_and_cascade_delete(self):
        self.db.execute('set local role service_role');c=self.save(['💼 Notice\nreceived.','Second page.'])
        source=self.db.execute('select pages,text_sha256 from public.contract_source_documents where contract_id=%s',(c['id'],)).fetchone()
        import hashlib
        self.assertEqual(source[1],hashlib.sha256('💼 Notice\nreceived.\nSecond page.'.encode()).hexdigest())
        self.db.execute('delete from public.contracts where id=%s',(c['id'],))
        self.assertEqual(self.db.execute('select count(*) from public.contract_source_documents').fetchone()[0],0)

    def test_invalid_source_rolls_back_insert(self):
        for pages in [[3],['x']*201,['x'*500001]]:
            with self.subTest(pages_type=type(pages[0]).__name__), self.assertRaises(fixture.psycopg.Error):
                with self.db.transaction(): self.save(pages)
        self.assertEqual(self.db.execute('select count(*) from public.contracts').fetchone()[0],0)

    def test_browser_roles_have_no_table_or_rpc_access_even_after_accidental_table_grant(self):
        self.save()
        for role in ['anon','authenticated']:
            for sql in ['select * from public.contract_source_documents',"select public.save_contract_with_source('{}','[]')"]:
                with self.subTest(role=role,sql=sql),self.assertRaises(fixture.psycopg.errors.InsufficientPrivilege):
                    with self.db.transaction():self.db.execute('set local role '+role);self.db.execute(sql)
        self.db.execute('grant select on public.contract_source_documents to authenticated')
        with self.db.transaction():
            self.db.execute('set local role authenticated')
            self.assertEqual(self.db.execute('select count(*) from public.contract_source_documents').fetchone()[0],0)

    def test_cross_workspace_hash_and_text_mismatch_are_rejected(self):
        c=self.save()
        for org,h,pages in [(fixture.OTHER_ORG,'a'*64,['text']),(fixture.ORG,'b'*64,['text'])]:
            with self.assertRaises(fixture.psycopg.Error):
                with self.db.transaction():self.db.execute('select public.attach_contract_source(%s,%s,%s,%s::jsonb)',(org,c['id'],h,json.dumps(pages)))
        with self.assertRaises(fixture.psycopg.Error):
            with self.db.transaction():self.db.execute("update public.contract_source_documents set pages='[\"tampered\"]'")
        self.assertFalse(self.db.execute("select bool_or(prosecdef) from pg_proc where proname in ('save_contract_with_source','attach_contract_source')").fetchone()[0])
