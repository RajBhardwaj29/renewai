-- Apply before deploying the atomic-delete backend. This migration deletes no data.
BEGIN;
CREATE OR REPLACE FUNCTION public.delete_contract_atomically(
    p_organization_id uuid, p_contract_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid;
BEGIN
    -- Use the same contract-first lock order as the delivery dispatcher.
    -- Authorization is rechecked here even when the API already read the row.
    SELECT id INTO v_id FROM public.contracts
      WHERE id=p_contract_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- All dependent deletes and the contract delete commit or roll back together.
    -- The delivery journal follows its existing reminder ON DELETE CASCADE FK.
    DELETE FROM public.contract_reminders
      WHERE contract_id=v_id AND organization_id=p_organization_id;
    DELETE FROM public.contract_decision_history
      WHERE contract_id=v_id AND organization_id=p_organization_id;
    DELETE FROM public.contracts
      WHERE id=v_id AND organization_id=p_organization_id RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Contract deletion was not completed'; END IF;
    RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_contract_atomically(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contract_atomically(uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
