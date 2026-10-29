# Upload security and clause evidence — 29 October 2026

This batch was implemented and tested from `1e64cf980fcba788a518c097b75c10e00e10282e`.
The browser-write lockdown was applied and verified in production on 29 October
2026 before source publication. Forbidden membership/contract writes were denied;
onboarding succeeded in a rollback-only transaction, with organization, membership,
contract and reminder counts unchanged. The release order below remains mandatory
for other environments. Backend deployment must follow the evidence-column migration.

## Confirmed pre-release finding and remediation

Read-only inspection of the existing Supabase project confirmed:

- `organization_members` permits authenticated INSERT with only
  `WITH CHECK (user_id = auth.uid())`; authenticated has INSERT privilege.
- An authenticated user could therefore enroll their own ID in a different
  organization. Contract/reminder RLS then accepts membership in that organization.
  The backend also trusts this membership, so API scoping cannot repair the flaw.
- Authenticated also has direct contract UPDATE privilege. Direct browser writes
  can bypass backend validation, attribution and the atomic-delete workflow.
- `create_organization(text)` is a postgres-owned SECURITY DEFINER RPC, available
  to authenticated users and denied to anon. Its inspected body authenticates via
  `auth.uid()` and creates a **new** organization and its owner in one transaction.
- The application frontend writes through the API; its only direct database RPC
  is onboarding's `create_organization`. No direct table mutations were found.

No production exploit, enrollment, contract mutation or deletion was attempted.
The old policy exploit was reproduced only in the disposable PostgreSQL fixture.
This establishes a security flaw, not evidence of historical abuse.

`20261029_browser_write_lockdown.sql` removes direct browser mutations from the
five business tables, including column-level write grants, drops the permissive
membership INSERT policy, and pins the two helper search paths. Existing
authenticated SELECT/RPC and service-role grants remain. Existing memberships
remain unchanged and require a separate authorized review for unexpected access.
Future invitations/team administration must use an explicit authorized service
workflow; do not restore unrestricted self-enrollment.

## Upload changes

- Authenticate and resolve membership **before** consuming multipart bodies.
  Reuse that verified context in analyze/save; never accept a caller's workspace.
- Maximum request 12 MiB, file 10 MiB, 200 pages, 500,000 extracted characters,
  reviewed JSON 128 KiB. The body read has a 30-second deadline. Real received
  bytes are counted even with no or an understated Content-Length. Compressed
  HTTP request bodies are rejected.
- Preserve MIME/signature, damaged/encrypted/OCR errors, duplicate detection,
  review-before-save, AI-independent persistence and reminder failure separation.
- API responses include `Cache-Control: private, no-store` and `nosniff`, including
  early failures. CORS remains readable for allowed origins. Rejected uploads
  retain content-free workflow telemetry.
- Extraction system messages treat document instructions as untrusted input in
  Ollama, Groq strict JSON and the JSON-object fallback. This is defense in depth,
  not a prompt-injection immunity or an accuracy guarantee.
- Ignore `.env.*` variants by default while retaining `.env.example` templates.

The guard bounds application buffering and multipart temporary-file work. It is
not an ingress rate limiter, a distributed concurrency budget, malware scanner,
OCR service, decompression-memory guarantee or process sandbox. PyMuPDF can
allocate memory before the extracted-text limit is checked. Hosting request/rate
limits and process-level parser CPU/memory isolation remain recommended follow-up.

## Evidence contract

Analyze returns additive `source_evidence`; save recomputes it from the **same
uploaded bytes and final submitted fields**, ignoring client-supplied evidence.
Save persists it in the same contract INSERT. Existing detail reads return it
under normal organization scoping. `20261029_contract_evidence.sql` adds one
nullable JSONB column; historical rows remain NULL, with no fabricated backfill.

The strict `renewai.evidence.v1` shape contains:

- PDF SHA-256 and extracted-text SHA-256, method/version and draft/submission stage.
- Six clause candidates: renewal, termination, payment, pricing, minimum commitment
  and refund. Every candidate is explicitly missing, grounded, ambiguous or unverified.
- Unique literal matches after whitespace normalization, with 1-based PDF page
  numbers, 0-based/end-exclusive offsets into each page's `get_text()` output, and
  exact original quotes. Unique matches crossing pages retain separate page spans.
- Duplicate wording stays ambiguous; paraphrases, missing text and partial-word
  matches stay unverified. Unknowns are never converted into safe/low risk.
- Versioned review prompts linked to clause fields. These are evidence review
  signals, not a calibrated financial/legal risk score or applicability judgment.
  A unique quote can still be superseded by an amendment or omit a qualification.
- The submitted original cancellation deadline, separate from the engine's final
  operational deadline. The existing deterministic engine remains unchanged.

Every result requires human review. `reviewed_submission` means a user submitted
the review form, not that legal correctness was certified. Original PDFs/full raw
text are not durably stored; uploaded multipart files may spool temporarily through
the framework. Quotes cannot replace a retained source document for audit purposes.
No UI for the new evidence bundle, OCR, numeric term provenance, clause applicability
resolver, automatic action or independent extraction benchmark is added in this batch.

### Contract-detail evidence view — frontend follow-up, 29 October 2026

The frontend follow-up replaces the existing clause cards with a source-aware
view using the unchanged authenticated contract-detail response. Each of the six
saved clauses retains its text and shows grounded (text found), ambiguous,
unverified or missing status. Grounded terms have keyboard-operable disclosures
with exact quotes and 1-based PDF page references. Human review is always required;
matching does not prove completeness, applicability or legal accuracy. Originals
are not archived, so there is no link to open or highlight an original PDF.

Legacy, unsupported or draft evidence shows "Source evidence unavailable" while
preserving saved terms. Inconsistent text, duplicate field entries, malformed
spans or unsupported statuses cannot display a grounded badge. The browser checks
display consistency, not the original document's authenticity. Quotes are rendered
as plain React text; hashes, internal offsets and review-signal metadata stay out
of the presentation. No new fetch, write, provider call or migration is introduced.

Local validation: all 19 frontend tests passed (13 existing, six evidence/rendering
tests), lint and the optimized webpack build including TypeScript/static generation
passed. A temporary synthetic page checked the actual component at desktop and
390px mobile widths, click/keyboard disclosure operation, all status labels and
legacy fallback; inspected browser logs had no warnings/errors. The temporary
route was removed before the final build. A stale generated preview validator was
moved to private temporary storage before rebuilding. This does not establish a
new authenticated browser-to-production workflow or physical-device pass. This
release and deployed verification are tracked separately from these local checks.

## Release order and readiness

1. Confirm target project and current revisions. Run the read-only catalog checks
   in `backend/tools/audit_contract_access.sql`; verify onboarding/helper bodies,
   owner, grants and existing trusted memberships. Capture a private backup and
   recovery plan. No production backup/restore guarantees are established here.
2. Review and apply **browser_write_lockdown** first. It needs no app deployment
   and changes no rows. Verify direct authenticated/anonymous writes denied,
   service-role access intact, and synthetic onboarding through the existing RPC.
   Keep backend/API tenant filters and existing RLS enabled.
3. Apply **contract_evidence** before deploying this backend. Without the new column,
   saves will fail safely rather than silently dropping evidence. Reload the Data
   API schema cache if required by the provider and verify the column is visible.
4. Deploy only the tested intended revision after approval/readiness confirmation.
   Do not push to production-linked main as a way to stage work. Existing Vercel
   previews point to the production API and are not isolated test environments.
5. Recheck health/revision, CORS and no-store headers, two-account denial paths,
   one approved synthetic analyze → edited review → save → reload → PDF export,
   same-record advisory AI retry, and invalid/oversize PDF handling. No live email
   or production fault injection is needed. Inspect only privacy-safe logs.

Rollback: retain the nullable column and browser-write restrictions. The prior
backend ignores the new column and uses the same authorized API/onboarding paths.
Do not restore vulnerable membership or direct browser write grants. The DB-only
lockdown should not be coupled to a frontend rollback.

## Verification and limits

The full local backend suite passed **174 tests with zero skips**, including the
32 prior real PostgreSQL cases and seven new migration/RLS/grant/onboarding tests,
on disposable loopback PostgreSQL 16.2. The new role tests cover old-policy exploit
reproduction, denied self-enrollment/direct writes, column-grant bypass denial,
owned/foreign evidence reads, service-role writes, unchanged legacy rows, repeatable
migrations, and preserved atomic onboarding. No production data was used.

All **13 frontend tests passed**. No frontend source or dependencies changed; a
new frontend build/browser E2E was not run. API tests cover evidence generation,
review changes, hash binding, source offsets, ambiguity, save/reload, tampering,
authentication before malformed multipart, upload budgets and privacy headers.

Read-only live checks: backend health 200 at `0fe7906521c82661e5949948780a1bfb77143cf9`;
anonymous/invalid-token contract reads 401; frontend login 200. Vercel dashboard
showed production `BUMVmRRDqxq1C41vYeXNF65gpfNH` Ready at `1e64cf9`. Supabase showed
RLS enabled on the six inspected tables, the seven public helper functions, and
no storage buckets in the inspected metadata query. Delivery/delete helper RPCs
deny anon/authenticated execution and pin `pg_catalog, public`; onboarding/member
helpers currently use `public`, tightened by this batch.

A bounded redacted scan of 100 tracked files and 333 historical text blobs found
no high-confidence credential patterns. A scan of nine directly referenced public
login JavaScript assets (824,134 bytes) found only an expected publishable key
category, with no detected server-key patterns. Only the backend environment
template was tracked. This is not a complete secret audit, provider-key validity test or proof
of runtime configuration. No credentials were printed or rotated. Service-role keys bypass RLS, so backend
organization filters remain required ([Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)).

Remaining risks include unexpected historical memberships, complete base-schema/
view/grant audit, role-based privileges, concurrent duplicate-save uniqueness,
decision/history atomicity, backups/retention/account erasure, AI provider data
handling and extraction quality. Reminder delivery follow-up remains deferred.
