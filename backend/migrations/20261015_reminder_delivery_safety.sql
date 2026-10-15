-- Apply before deploying reminder delivery safety. No reminders are sent or
-- historical contract/reminder rows changed by this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.reminder_deliveries (
    reminder_id uuid PRIMARY KEY REFERENCES public.contract_reminders(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    state text NOT NULL CHECK (state IN ('processing', 'retryable', 'accepted', 'needs_review')),
    claim_token uuid NOT NULL,
    lease_until timestamptz,
    first_attempt_at timestamptz NOT NULL,
    deadline date NOT NULL,
    checkpoint_date date NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    provider_email_id text,
    last_error_code text,
    CHECK (state <> 'accepted' OR provider_email_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reminder_deliveries_org_idx ON public.reminder_deliveries(organization_id);
ALTER TABLE public.reminder_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reminder_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_reminder_delivery(
    p_organization_id uuid, p_reminder_id uuid, p_expected_deadline date, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_contract public.contracts%ROWTYPE;
    v_reminder public.contract_reminders%ROWTYPE;
    v_delivery public.reminder_deliveries%ROWTYPE;
    v_now timestamptz := clock_timestamp();
    v_today date := (v_now AT TIME ZONE 'UTC')::date;
    v_offset integer;
    v_token uuid := gen_random_uuid();
    v_contract_id uuid;
BEGIN
    SELECT contract_id INTO v_contract_id FROM public.contract_reminders
      WHERE id = p_reminder_id AND organization_id = p_organization_id;
    -- Lock in a consistent order: contract, reminder, delivery. Every decision
    -- is rechecked after the lock; an earlier Python read is not authorization.
    SELECT * INTO v_contract FROM public.contracts
      WHERE id = v_contract_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome','skipped','reason','unavailable'); END IF;
    SELECT * INTO v_reminder FROM public.contract_reminders
      WHERE id = p_reminder_id AND organization_id = p_organization_id
        AND contract_id = v_contract.id FOR UPDATE;
    v_now := clock_timestamp();
    v_today := (v_now AT TIME ZONE 'UTC')::date;
    IF NOT FOUND OR v_reminder.status <> 'pending' OR v_contract.archived IS DISTINCT FROM false
       OR v_reminder.remind_on > v_today THEN
        RETURN jsonb_build_object('outcome','skipped','reason','inactive_or_not_due');
    END IF;
    v_offset := CASE v_reminder.reminder_type WHEN '90_day' THEN 90 WHEN '60_day' THEN 60
      WHEN '30_day' THEN 30 WHEN '14_day' THEN 14 WHEN '7_day' THEN 7 END;
    IF v_contract.cancellation_deadline IS NULL OR v_contract.cancellation_deadline < v_today
       OR v_contract.cancellation_deadline IS DISTINCT FROM p_expected_deadline
       OR v_offset IS NULL OR v_reminder.remind_on <> v_contract.cancellation_deadline - v_offset THEN
        RETURN jsonb_build_object('outcome','skipped','reason','obsolete_deadline');
    END IF;

    SELECT * INTO v_delivery FROM public.reminder_deliveries
      WHERE reminder_id = p_reminder_id FOR UPDATE;
    IF FOUND THEN
        IF v_delivery.organization_id <> p_organization_id THEN
            RAISE EXCEPTION 'Reminder organization mismatch';
        END IF;
        IF v_delivery.deadline<>v_contract.cancellation_deadline OR v_delivery.checkpoint_date<>v_reminder.remind_on THEN
            IF v_delivery.state<>'accepted' THEN
                UPDATE public.reminder_deliveries SET state='needs_review',lease_until=NULL,
                  last_error_code='obsolete_snapshot',updated_at=v_now WHERE reminder_id=p_reminder_id;
            END IF;
            RETURN jsonb_build_object('outcome','needs_review');
        END IF;
        IF v_delivery.state = 'accepted' THEN
            UPDATE public.contract_reminders SET status='sent', sent_at=coalesce(sent_at,v_delivery.updated_at)
              WHERE id=p_reminder_id AND organization_id=p_organization_id;
            RETURN jsonb_build_object('outcome','already_accepted');
        END IF;
        IF v_delivery.payload->'to' IS DISTINCT FROM p_payload->'to' THEN
            UPDATE public.reminder_deliveries SET state='needs_review',lease_until=NULL,
              last_error_code='recipient_changed',updated_at=v_now WHERE reminder_id=p_reminder_id;
            RETURN jsonb_build_object('outcome','needs_review');
        END IF;
        -- Provider idempotency expires after 24h. Leave a one-hour margin and
        -- never silently create a new key after an ambiguous delivery.
        IF v_delivery.state = 'needs_review' OR v_delivery.first_attempt_at <= v_now - interval '23 hours' THEN
            UPDATE public.reminder_deliveries SET state='needs_review', lease_until=NULL,
              last_error_code='idempotency_window_expired', updated_at=v_now WHERE reminder_id=p_reminder_id;
            RETURN jsonb_build_object('outcome','needs_review');
        END IF;
        IF v_delivery.lease_until > v_now THEN RETURN jsonb_build_object('outcome','busy'); END IF;
        UPDATE public.reminder_deliveries SET state='processing', claim_token=v_token,
          lease_until=v_now + interval '5 minutes', attempt_count=attempt_count+1, updated_at=v_now
          WHERE reminder_id=p_reminder_id RETURNING * INTO v_delivery;
    ELSE
        IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
           OR coalesce(p_payload->>'from','')='' OR coalesce(p_payload->>'subject','')=''
           OR coalesce(p_payload->>'text','')='' OR jsonb_typeof(p_payload->'to') IS DISTINCT FROM 'array'
           OR jsonb_array_length(p_payload->'to')<>1 THEN
            RAISE EXCEPTION 'Invalid reminder payload';
        END IF;
        INSERT INTO public.reminder_deliveries(reminder_id,organization_id,state,claim_token,lease_until,
          first_attempt_at,deadline,checkpoint_date,payload,updated_at)
        VALUES(p_reminder_id,p_organization_id,'processing',v_token,v_now+interval '5 minutes',v_now,
          v_contract.cancellation_deadline,v_reminder.remind_on,p_payload,v_now)
        RETURNING * INTO v_delivery;
    END IF;
    RETURN jsonb_build_object('outcome','claimed','claim_token',v_delivery.claim_token,
      'payload',v_delivery.payload,'idempotency_key','renewai-reminder/'||p_reminder_id::text,
      'send_before',v_delivery.first_attempt_at+interval '23 hours','lease_until',v_delivery.lease_until);
END $$;

CREATE OR REPLACE FUNCTION public.complete_reminder_delivery(
    p_organization_id uuid, p_reminder_id uuid, p_claim_token uuid, p_provider_email_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_contract_id uuid; v_delivery public.reminder_deliveries%ROWTYPE;
BEGIN
    IF coalesce(btrim(p_provider_email_id),'')='' THEN RAISE EXCEPTION 'Missing provider receipt'; END IF;
    SELECT contract_id INTO v_contract_id FROM public.contract_reminders
      WHERE id=p_reminder_id AND organization_id=p_organization_id;
    PERFORM 1 FROM public.contracts WHERE id=v_contract_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    PERFORM 1 FROM public.contract_reminders WHERE id=p_reminder_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT * INTO v_delivery FROM public.reminder_deliveries
      WHERE reminder_id=p_reminder_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    IF v_delivery.state='accepted' THEN RETURN v_delivery.provider_email_id=p_provider_email_id; END IF;
    IF v_delivery.claim_token<>p_claim_token THEN RETURN false; END IF;
    -- Recording a provider receipt and marking sent are one transaction.
    -- Accepted means provider acceptance, not proof of inbox delivery.
    UPDATE public.reminder_deliveries SET state='accepted',provider_email_id=p_provider_email_id,
      last_error_code=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE reminder_id=p_reminder_id;
    UPDATE public.contract_reminders SET status='sent',sent_at=coalesce(sent_at,clock_timestamp())
      WHERE id=p_reminder_id AND organization_id=p_organization_id AND remind_on=v_delivery.checkpoint_date;
    RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fail_reminder_delivery(
    p_organization_id uuid, p_reminder_id uuid, p_claim_token uuid, p_error_code text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF p_error_code NOT IN ('provider_request_failed','invalid_provider_response','receipt_unconfirmed',
                           'claim_expired','idempotency_window_expired') THEN
        RAISE EXCEPTION 'Invalid failure code';
    END IF;
    UPDATE public.reminder_deliveries SET state=CASE WHEN p_error_code='idempotency_window_expired' THEN 'needs_review' ELSE 'retryable' END,
      lease_until=NULL,last_error_code=p_error_code,
      updated_at=clock_timestamp() WHERE reminder_id=p_reminder_id AND organization_id=p_organization_id
      AND claim_token=p_claim_token AND state='processing';
    RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.claim_reminder_delivery(uuid,uuid,date,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_reminder_delivery(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_reminder_delivery(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reminder_delivery(uuid,uuid,date,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_reminder_delivery(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_reminder_delivery(uuid,uuid,uuid,text) TO service_role;
COMMENT ON TABLE public.reminder_deliveries IS
  'Private frozen email payloads, claims and provider receipts. Never expose payloads through organization APIs.';
NOTIFY pgrst, 'reload schema';
COMMIT;
