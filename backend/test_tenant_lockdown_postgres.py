"""Real role/RLS regressions on the guarded disposable PostgreSQL fixture.

The minimal synthetic schema reproduces the observed live membership policy;
it is not a production schema export. Every test's schema/data changes roll back.
"""
from pathlib import Path
import unittest
import test_reminder_delivery_postgres as fixture

MIGRATIONS = Path(__file__).with_name("migrations")
LOCKDOWN = (MIGRATIONS / "20261029_browser_write_lockdown.sql").read_text()
EVIDENCE = (MIGRATIONS / "20261029_contract_evidence.sql").read_text()
USER_A = "00000000-0000-4000-8000-000000000041"
USER_B = "00000000-0000-4000-8000-000000000042"


def transaction_body(sql):
    # Keep deployment transactions inside the per-test rollback boundary.
    return sql.replace("BEGIN;", "").replace("COMMIT;", "")


@unittest.skipUnless(fixture.DSN and fixture.psycopg, "Requires disposable local PostgreSQL")
class TenantLockdownPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.ReminderPostgresTests.setUpClass()  # Includes remote/name guard.

    def setUp(self):
        self.db = fixture.psycopg.connect(fixture.DSN)
        self.addCleanup(self.db.close)
        self.db.execute("""
            truncate public.organizations, public.contracts, public.contract_reminders,
                public.reminder_deliveries cascade;
            alter table public.organizations add column if not exists name text;
            create schema if not exists auth;
            grant usage on schema public, auth to anon, authenticated, service_role;
            create or replace function auth.uid() returns uuid language sql stable as
                $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
            create table public.organization_members (
                organization_id uuid references public.organizations(id), user_id uuid,
                role text, primary key(organization_id,user_id));
            create table if not exists public.contract_decision_history (
                id uuid primary key, organization_id uuid references public.organizations(id),
                contract_id uuid references public.contracts(id), decision_notes text);
            create or replace function public.is_organization_member(target_organization_id uuid)
                returns boolean language sql stable security definer set search_path=public as $$
                select exists(select 1 from public.organization_members
                  where organization_id=target_organization_id and user_id=auth.uid())$$;
            create or replace function public.create_organization(organization_name text)
                returns uuid language plpgsql security definer set search_path=public as $$
                declare new_organization_id uuid := gen_random_uuid(); current_user_id uuid;
                begin
                  current_user_id := auth.uid();
                  if current_user_id is null then raise exception 'Not authenticated'; end if;
                  if organization_name is null or length(trim(organization_name))=0 then
                    raise exception 'Organization name is required'; end if;
                  insert into public.organizations(id,name) values(new_organization_id,trim(organization_name));
                  insert into public.organization_members(organization_id,user_id,role)
                    values(new_organization_id,current_user_id,'owner');
                  return new_organization_id;
                end$$;
            revoke execute on function public.create_organization(text) from public, anon;
            grant execute on function public.create_organization(text) to authenticated;
            grant all on public.organizations, public.organization_members, public.contracts,
                public.contract_reminders,public.contract_decision_history to anon, authenticated,service_role;
            alter table public.organization_members enable row level security;
            alter table public.contracts enable row level security;
            create policy "users can create their own organization membership" on public.organization_members
                for insert to authenticated with check(user_id=auth.uid());
            create policy own_membership_read on public.organization_members
                for select to authenticated using(user_id=auth.uid());
            create policy owned_contracts on public.contracts for all to authenticated
                using(public.is_organization_member(organization_id))
                with check(public.is_organization_member(organization_id));
        """)
        self.db.execute("insert into public.organizations(id,name) values(%s,'A'),(%s,'B')", (fixture.ORG, fixture.OTHER_ORG))
        self.db.execute("insert into public.organization_members values(%s,%s,'owner'),(%s,%s,'owner')",
                        (fixture.ORG, USER_A, fixture.OTHER_ORG, USER_B))
        self.db.execute("insert into public.contracts(id,organization_id) values(%s,%s)",
                        (fixture.CONTRACT, fixture.OTHER_ORG))

    def as_user(self, user=USER_A, role="authenticated"):
        self.db.execute("reset role")
        self.db.execute("select set_config('request.jwt.claim.sub',%s,true)", (user,))
        self.db.execute(f"set local role {role}")  # Fixed test-controlled roles.

    def apply(self):
        self.db.execute("reset role")
        self.db.execute(transaction_body(LOCKDOWN))

    def denied(self, statement, params=()):
        with self.assertRaises(fixture.psycopg.errors.InsufficientPrivilege):
            with self.db.transaction():
                self.db.execute(statement, params)

    def test_old_policy_reproduces_self_enrollment_and_foreign_contract_access_locally(self):
        self.as_user()
        self.assertEqual(self.db.execute("select id from public.contracts").fetchall(), [])
        self.db.execute("insert into public.organization_members values(%s,%s,'owner')", (fixture.OTHER_ORG,USER_A))
        self.assertEqual(str(self.db.execute("select id from public.contracts").fetchone()[0]), fixture.CONTRACT)

    def test_lockdown_blocks_arbitrary_membership_and_all_direct_contract_writes(self):
        self.apply(); self.as_user()
        self.denied("insert into public.organization_members values(%s,%s,'owner')", (fixture.OTHER_ORG,USER_A))
        self.denied("update public.contracts set archived=true where id=%s", (fixture.CONTRACT,))
        self.denied("delete from public.contracts where id=%s", (fixture.CONTRACT,))
        self.denied("truncate public.contracts cascade")
        self.assertEqual(self.db.execute("select id from public.contracts").fetchall(), [])

    def test_onboarding_rpc_still_creates_exactly_one_new_owned_workspace(self):
        self.apply(); self.as_user()
        identifier = self.db.execute("select public.create_organization(' New workspace ')").fetchone()[0]
        rows = self.db.execute("select organization_id,user_id,role from public.organization_members where organization_id=%s", (identifier,)).fetchall()
        self.assertEqual([(str(org),str(user),role) for org,user,role in rows], [(str(identifier), USER_A, 'owner')])
        self.db.execute("reset role")
        self.assertEqual(self.db.execute("select name from public.organizations where id=%s",(identifier,)).fetchone()[0], "New workspace")
        self.assertEqual(self.db.execute("select count(*) from public.organization_members where organization_id=%s",(fixture.OTHER_ORG,)).fetchone()[0],1)

    def test_anonymous_onboarding_is_denied_and_service_role_writes_remain_available(self):
        self.apply(); self.as_user(user="",role="anon")
        self.denied("select public.create_organization('forbidden')")
        self.as_user(role="service_role")
        self.db.execute("update public.contracts set vendor_name='Backend write' where id=%s",(fixture.CONTRACT,))
        self.assertEqual(self.db.execute("select vendor_name from public.contracts where id=%s",(fixture.CONTRACT,)).fetchone()[0],"Backend write")

    def test_column_grants_cannot_bypass_table_lockdown_or_forge_evidence(self):
        self.db.execute(transaction_body(EVIDENCE))
        self.db.execute("grant update(source_evidence),insert(source_evidence) on public.contracts to authenticated")
        self.apply(); self.as_user(USER_B)
        self.denied("update public.contracts set source_evidence='{}' where id=%s",(fixture.CONTRACT,))
        row=self.db.execute("select source_evidence from public.contracts where id=%s",(fixture.CONTRACT,)).fetchone()
        self.assertEqual(row,(None,))

    def test_repeatable_migrations_preserve_legacy_rows_and_rpc_permissions(self):
        for _ in range(2):
            self.apply(); self.db.execute(transaction_body(EVIDENCE))
        row=self.db.execute("""select prosecdef,proconfig,
            has_function_privilege('anon',oid,'EXECUTE'),
            has_function_privilege('authenticated',oid,'EXECUTE')
            from pg_proc where oid='public.create_organization(text)'::regprocedure""").fetchone()
        self.assertEqual(row,(True,['search_path=pg_catalog, public'],False,True))
        self.assertEqual(self.db.execute("select count(*),count(source_evidence) from public.contracts").fetchone(),(1,0))

    def test_evidence_json_roundtrip_is_available_to_backend_and_owned_reads_only(self):
        self.apply(); self.db.execute(transaction_body(EVIDENCE)); self.as_user(role="service_role")
        value={'schema_version':'renewai.evidence.v1','requires_human_review':True}
        self.db.execute("update public.contracts set source_evidence=%s where id=%s",(fixture.Jsonb(value),fixture.CONTRACT))
        self.as_user(USER_B)
        self.assertEqual(self.db.execute("select source_evidence from public.contracts").fetchone()[0],value)
        self.as_user(USER_A)
        self.assertEqual(self.db.execute("select source_evidence from public.contracts").fetchall(),[])
