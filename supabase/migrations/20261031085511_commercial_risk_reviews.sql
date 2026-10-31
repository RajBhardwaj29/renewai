BEGIN;
CREATE TABLE public.contract_risk_reviews (
 contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 status text NOT NULL CHECK (status IN ('confirmed','dismissed','needs_context')),
 rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 1000),
 revision integer NOT NULL CHECK (revision > 0),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (contract_id, fingerprint)
);
CREATE TABLE public.contract_risk_review_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 fingerprint text NOT NULL,
 actor_id uuid NOT NULL,
 status text NOT NULL,
 rationale text NOT NULL,
 revision integer NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_risk_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_risk_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_risk_reviews, public.contract_risk_review_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_risk_reviews, public.contract_risk_review_events TO service_role;
GRANT USAGE ON SEQUENCE public.contract_risk_review_events_id_seq TO service_role;
CREATE FUNCTION public.review_commercial_finding(p_org uuid,p_contract uuid,p_actor uuid,p_fingerprint text,p_status text,p_rationale text,p_revision integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE current_revision integer;
BEGIN
 PERFORM 1 FROM public.contracts WHERE id=p_contract AND organization_id=p_org AND archived=false FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=p_org AND user_id=p_actor) THEN
   RETURN false;
 END IF;
 SELECT revision INTO current_revision FROM public.contract_risk_reviews WHERE contract_id=p_contract AND fingerprint=p_fingerprint AND organization_id=p_org;
 IF coalesce(current_revision,0) <> p_revision THEN RETURN false; END IF;
 INSERT INTO public.contract_risk_reviews(contract_id,organization_id,fingerprint,status,rationale,revision)
 VALUES(p_contract,p_org,p_fingerprint,p_status,p_rationale,p_revision+1)
 ON CONFLICT(contract_id,fingerprint) DO UPDATE SET status=EXCLUDED.status,rationale=EXCLUDED.rationale,revision=EXCLUDED.revision,reviewed_at=now();
 INSERT INTO public.contract_risk_review_events(contract_id,organization_id,fingerprint,actor_id,status,rationale,revision)
 VALUES(p_contract,p_org,p_fingerprint,p_actor,p_status,p_rationale,p_revision+1);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.review_commercial_finding(uuid,uuid,uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_commercial_finding(uuid,uuid,uuid,text,text,text,integer) TO service_role;
COMMIT;
