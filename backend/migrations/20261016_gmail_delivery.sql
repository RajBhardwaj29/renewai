-- Apply after 20261015_reminder_delivery_safety.sql, before enabling Gmail.
-- No provider call or historical reminder modification.
BEGIN;
ALTER TABLE public.reminder_deliveries ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;

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
        IF coalesce(v_delivery.payload->>'_provider','resend') IS DISTINCT FROM coalesce(p_payload->>'_provider','resend')
           OR (v_delivery.payload->>'_provider'='gmail' AND v_delivery.payload->>'from' IS DISTINCT FROM p_payload->>'from') THEN
            UPDATE public.reminder_deliveries SET state='needs_review',lease_until=NULL,
              last_error_code='sender_changed',updated_at=v_now WHERE reminder_id=p_reminder_id;
            RETURN jsonb_build_object('outcome','needs_review');
        END IF;
        -- Gmail has no request idempotency key. A durable dispatch marker stops
        -- every replay after the single authorized send, including worker crashes.
        IF v_delivery.payload->>'_provider'='gmail' AND v_delivery.dispatched_at IS NOT NULL THEN
            IF v_delivery.state='processing' AND v_delivery.lease_until>v_now THEN
                RETURN jsonb_build_object('outcome','busy');
            END IF;
            UPDATE public.reminder_deliveries SET state='needs_review',lease_until=NULL,
              last_error_code='gmail_delivery_unconfirmed',updated_at=v_now WHERE reminder_id=p_reminder_id;
            RETURN jsonb_build_object('outcome','needs_review');
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

CREATE OR REPLACE FUNCTION public.begin_gmail_reminder_delivery(
    p_organization_id uuid, p_reminder_id uuid, p_claim_token uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_contract public.contracts%ROWTYPE; v_reminder public.contract_reminders%ROWTYPE;
        v_delivery public.reminder_deliveries%ROWTYPE; v_contract_id uuid;
        v_now timestamptz;
BEGIN
    SELECT contract_id INTO v_contract_id FROM public.contract_reminders
      WHERE id=p_reminder_id AND organization_id=p_organization_id;
    SELECT * INTO v_contract FROM public.contracts
      WHERE id=v_contract_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT * INTO v_reminder FROM public.contract_reminders
      WHERE id=p_reminder_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT * INTO v_delivery FROM public.reminder_deliveries
      WHERE reminder_id=p_reminder_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    v_now:=clock_timestamp();
    IF v_delivery.payload->>'_provider' IS DISTINCT FROM 'gmail'
       OR v_delivery.state<>'processing' OR v_delivery.claim_token<>p_claim_token
       OR v_delivery.dispatched_at IS NOT NULL OR v_delivery.lease_until IS NULL
       OR v_delivery.lease_until<=v_now OR v_reminder.status<>'pending'
       OR v_contract.archived IS DISTINCT FROM false
       OR v_contract.cancellation_deadline IS DISTINCT FROM v_delivery.deadline
       OR v_contract.cancellation_deadline<(v_now AT TIME ZONE 'UTC')::date
       OR v_reminder.remind_on<>v_delivery.checkpoint_date THEN RETURN false; END IF;
    UPDATE public.reminder_deliveries SET dispatched_at=v_now,updated_at=v_now
      WHERE reminder_id=p_reminder_id;
    RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fail_reminder_delivery(
    p_organization_id uuid, p_reminder_id uuid, p_claim_token uuid, p_error_code text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF p_error_code NOT IN ('provider_request_failed','invalid_provider_response','receipt_unconfirmed',
                           'claim_expired','idempotency_window_expired','gmail_delivery_unconfirmed') THEN
        RAISE EXCEPTION 'Invalid failure code';
    END IF;
    UPDATE public.reminder_deliveries SET state=CASE WHEN p_error_code IN ('idempotency_window_expired','gmail_delivery_unconfirmed') OR (payload->>'_provider'='gmail' AND dispatched_at IS NOT NULL) THEN 'needs_review' ELSE 'retryable' END,
      lease_until=NULL,last_error_code=p_error_code,
      updated_at=clock_timestamp() WHERE reminder_id=p_reminder_id AND organization_id=p_organization_id
      AND claim_token=p_claim_token AND state='processing';
    RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION public.claim_reminder_delivery(uuid,uuid,date,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_reminder_delivery(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_gmail_reminder_delivery(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reminder_delivery(uuid,uuid,date,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_reminder_delivery(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_gmail_reminder_delivery(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
