-- Additive only: existing customers remain unknown, never inferred from workspaces.
BEGIN;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS customer_name text;
NOTIFY pgrst, 'reload schema';
COMMIT;
