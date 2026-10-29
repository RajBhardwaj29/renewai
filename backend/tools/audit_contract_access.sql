-- Read-only catalog/storage metadata. No customer records or secret values.
-- Run before/after a reviewed security release; retain results privately.
BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
       has_table_privilege('service_role', c.oid, 'INSERT') AS service_insert,
       has_table_privilege('service_role', c.oid, 'UPDATE') AS service_update
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
    ('organizations','organization_members','contracts','contract_reminders',
     'contract_decision_history','reminder_deliveries') AND c.relkind='r'
ORDER BY c.relname;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;

SELECT p.oid::regprocedure AS function_name, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proconfig AS configuration,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
ORDER BY p.proname;

-- Validate each onboarding/member helper body separately before migration.
SELECT pg_get_functiondef('public.create_organization(text)'::regprocedure);
SELECT pg_get_functiondef('public.is_organization_member(uuid)'::regprocedure);

SELECT table_name,column_name,grantee,privilege_type
FROM information_schema.column_privileges
WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
  AND privilege_type IN ('INSERT','UPDATE','REFERENCES')
ORDER BY table_name,column_name,grantee;

SELECT id, public FROM storage.buckets ORDER BY id;
ROLLBACK;
