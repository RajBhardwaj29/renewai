-- Critical: authenticated users could insert themselves into an arbitrary org.
-- Browser writes are unnecessary: the UI writes through the authenticated API,
-- except create_organization(text), which atomically creates a NEW org + owner.
-- Apply and verify independently of the evidence feature. No row data changes.
BEGIN;

-- Refuse to proceed if the existing onboarding boundary is not the audited
-- privileged RPC. Do not turn a security fix into a silent onboarding outage.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.oid = 'public.create_organization(text)'::regprocedure
          AND p.prosecdef
          AND pg_get_userbyid(p.proowner) = 'postgres'
    ) THEN
        RAISE EXCEPTION 'Verify privileged create_organization RPC before browser-write lockdown';
    END IF;
END $$;

REVOKE ALL PRIVILEGES ON TABLE
    public.organizations, public.organization_members, public.contracts,
    public.contract_reminders, public.contract_decision_history
    FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
    public.organizations, public.organization_members, public.contracts,
    public.contract_reminders, public.contract_decision_history
    FROM authenticated;

-- Column-level grants survive a table-level REVOKE; remove those write paths.
DO $$
DECLARE item record;
BEGIN
    FOR item IN
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN
            ('organizations', 'organization_members', 'contracts',
             'contract_reminders', 'contract_decision_history')
    LOOP
        EXECUTE format(
            'REVOKE INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
            item.column_name, item.column_name, item.column_name,
            item.table_schema, item.table_name
        );
    END LOOP;
END $$;

DROP POLICY IF EXISTS "users can create their own organization membership"
    ON public.organization_members;

-- Keep the existing function bodies and verified auth.uid() attribution.
ALTER FUNCTION public.create_organization(text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_organization_member(uuid) SET search_path = pg_catalog, public;
REVOKE EXECUTE ON FUNCTION public.create_organization(text) FROM PUBLIC, anon;

-- Existing authenticated SELECT, RPC execution and service_role grants remain.
COMMIT;
