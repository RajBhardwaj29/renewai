-- Apply before deploying the new save/chat routes. No existing rows are backfilled.
BEGIN;
CREATE FUNCTION public.contract_source_text_hash(p_pages jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE source_text text;
BEGIN
  IF jsonb_typeof(p_pages) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid pages'; END IF;
  IF jsonb_array_length(p_pages) NOT BETWEEN 1 AND 200
     OR EXISTS (SELECT FROM jsonb_array_elements(p_pages) e WHERE jsonb_typeof(e) <> 'string')
     OR (SELECT sum(length(e #>> '{}')) FROM jsonb_array_elements(p_pages) e) > 500000
  THEN RAISE EXCEPTION 'Invalid pages'; END IF;
  SELECT string_agg(e #>> '{}', E'\n' ORDER BY n) INTO source_text
    FROM jsonb_array_elements(p_pages) WITH ORDINALITY AS page(e,n);
  RETURN encode(sha256(convert_to(source_text, 'UTF8')), 'hex');
END $$;

CREATE TABLE public.contract_source_documents (
  contract_id uuid PRIMARY KEY REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
  pages jsonb NOT NULL,
  text_sha256 text NOT NULL CHECK (text_sha256 = public.contract_source_text_hash(pages)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_source_documents_organization ON public.contract_source_documents(organization_id);
ALTER TABLE public.contract_source_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_source_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_source_documents TO service_role;

CREATE FUNCTION public.enforce_contract_source_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.contracts c WHERE c.id = NEW.contract_id
      AND c.organization_id = NEW.organization_id AND c.file_hash = NEW.document_sha256
      AND (c.source_evidence->>'text_sha256' IS NULL OR c.source_evidence->>'text_sha256' = NEW.text_sha256))
  THEN RAISE EXCEPTION 'Contract source mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_contract_source_scope BEFORE INSERT OR UPDATE ON public.contract_source_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contract_source_scope();

CREATE FUNCTION public.attach_contract_source(p_organization_id uuid, p_contract_id uuid,
  p_document_sha256 text, p_pages jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  -- Lock the owned row for the entire attachment transaction.
  PERFORM 1 FROM public.contracts WHERE id=p_contract_id AND organization_id=p_organization_id
    AND file_hash=p_document_sha256 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract source mismatch'; END IF;
  INSERT INTO public.contract_source_documents(contract_id, organization_id, document_sha256, pages, text_sha256)
    VALUES(p_contract_id, p_organization_id, p_document_sha256, p_pages, public.contract_source_text_hash(p_pages))
    ON CONFLICT(contract_id) DO UPDATE SET pages=EXCLUDED.pages, text_sha256=EXCLUDED.text_sha256;
END $$;

CREATE FUNCTION public.save_contract_with_source(p_record jsonb, p_pages jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE columns_sql text; saved public.contracts;
BEGIN
  IF jsonb_typeof(p_record) IS DISTINCT FROM 'object' OR p_record = '{}'::jsonb
     OR p_record ?| ARRAY['id','created_at'] THEN RAISE EXCEPTION 'Invalid contract'; END IF;
  -- Only supplied columns participate, preserving all database defaults. Keys are
  -- quoted identifiers and values stay bound JSON parameters, never SQL text.
  SELECT string_agg(format('%I', key), ',' ORDER BY key) INTO columns_sql FROM jsonb_object_keys(p_record) key;
  EXECUTE format('INSERT INTO public.contracts (%s) SELECT %s FROM jsonb_populate_record(NULL::public.contracts,$1) RETURNING *', columns_sql, columns_sql)
    INTO saved USING p_record;
  PERFORM public.attach_contract_source(saved.organization_id, saved.id, saved.file_hash, p_pages);
  RETURN to_jsonb(saved);
END $$;

-- SECURITY INVOKER throughout; no browser can invoke storage helpers or read text.
REVOKE ALL ON FUNCTION public.contract_source_text_hash(jsonb), public.enforce_contract_source_scope(),
  public.attach_contract_source(uuid,uuid,text,jsonb), public.save_contract_with_source(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contract_source_text_hash(jsonb), public.enforce_contract_source_scope(),
  public.attach_contract_source(uuid,uuid,text,jsonb), public.save_contract_with_source(jsonb,jsonb) TO service_role;
COMMIT;
