-- Apply before deploying the backend that writes ai_analysis_status.
BEGIN;

ALTER TABLE public.contracts
    ADD COLUMN IF NOT EXISTS ai_analysis_status text NOT NULL DEFAULT 'pending'
    CHECK (ai_analysis_status IN ('pending', 'completed', 'failed'));

-- Old records have no attempt history; only populated insights imply completion.
UPDATE public.contracts
SET ai_analysis_status = 'completed'
WHERE ai_analysis_status = 'pending'
    AND ai_action IS NOT NULL AND ai_action <> ''
    AND ai_summary IS NOT NULL AND ai_summary <> ''
    AND ai_confidence IS NOT NULL;

COMMENT ON COLUMN public.contracts.ai_analysis_status IS
    'Advisory analysis only: pending, completed, or failed. Does not affect contract persistence.';

NOTIFY pgrst, 'reload schema';
COMMIT;
