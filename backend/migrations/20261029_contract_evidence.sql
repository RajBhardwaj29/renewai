-- Apply before deploying evidence-aware backend. No historical backfill.
-- Evidence shares the contracts row's organization ownership, RLS and deletion.
BEGIN;
ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS source_evidence jsonb;
COMMENT ON COLUMN public.contracts.source_evidence IS
    'Server-generated renewai.evidence.v1 source quotes and review signals. NULL means legacy/unknown evidence; not verified legal applicability.';
COMMIT;
