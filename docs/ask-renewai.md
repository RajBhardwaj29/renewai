# Ask RenewAI — Feature 2

## Scope and behavior

Saved contract pages include an independent, read-only AI Contract Assistant.
Attach the **identical original PDF** and ask a question about its terms. The
backend verifies the saved SHA-256 before parsing it. RenewAI does not retain
original PDFs, so reattachment is deliberate: this feature adds no document
store, extracted-text database, chat history, migration or backfill. Records
without a valid saved file hash cannot use the assistant. Re-exporting or
modifying a PDF changes its hash and is rejected even if it looks identical.

The assistant uses AI to select relevant passages. Its answer is **extractive**:
exact PDF text with one-based PDF page citations, not a generated legal opinion
or paraphrase. It does not calculate deadlines, change saved terms, make a
renewal decision, or send communications. Existing summary exports, reports,
history, clause evidence, reminders and upload/save/AI-insight flows are unchanged.
Archived owned contracts remain readable, consistently with their detail/export
pages. Every question is independent; refresh/navigation clears the component's
in-memory answer and attached file.

## API

`POST /contracts/{contract_id}/ask` accepts authenticated multipart fields:

- `file`: original `application/pdf`, maximum 10 MiB, 200 pages and 500,000
  extracted characters; existing empty/encrypted/damaged/OCR-only errors apply.
- `question`: 3–1,000 characters after trimming; no client-provided tenant context.

Success includes `contract_id`, `document_sha256`, `requires_human_review=true`,
`qualification`, `status` (`answered` or `abstained`), a fixed explanatory `answer`,
and up to three `citations`. Each citation has `page`, `start`, `end` and `quote`.
Offsets are Unicode code points within that page's PyMuPDF text. Blank pages are
preserved in page numbering. Every quote is exactly `pages[page-1][start:end]`.

Unsupported questions, explicit model refusals, empty/invalid selections and
fabricated passage IDs return abstention with no citations. Abstention does
**not** establish that a term is absent. Provider outages return a private 503;
the UI preserves the question and offers another explicit submission. POSTs do
not use automatic failure retries (the existing auth helper may refresh a 401).
Responses, including errors, use private/no-store and nosniff headers.

## Security and grounding boundaries

- The existing upload guard authenticates and resolves the contract with both
  organization and contract filters **before consuming the body**. Missing and
  foreign IDs return the same 404. The guard enforces the existing 12 MiB
  request budget, 30-second receive timeout and encoding restrictions.
- The original file's SHA-256 must match the owned record. File names, supplied
  organization fields, saved clause edits and AI summaries cannot become sources.
- Retrieval scans only this request's document. Page fragments are at most 1,800
  characters with 300-character overlap. Matching pages are expanded with
  neighbouring pages, amendment/precedence context and referenced numbered
  sections. At most eight candidates reach the provider. If this context exceeds
  the budget or a referenced section cannot be located, the assistant abstains
  before inference instead of silently dropping the omitted terms. There is no
  shared index, cross-contract search or prior-turn context.
- The system instruction treats the question and PDF as untrusted data, asks for
  abstention on conflicts, missing qualifications, advice or unsupported claims,
  and disallows external knowledge and calculations. Explicit signed amendments
  or order forms may resolve conflicts only where their scope and precedence are
  stated; a date alone is insufficient. Common instruction attacks found in the
  PDF cause abstention for the whole request; suspicious text is not silently
  removed while the remainder is presented as a complete answer. Ordinary API-key
  protection clauses are treated as contract data, not automatically as attacks.
- Explicit question guards reject advice, action and calculation requests. Exact
  calendar-deadline requests require a literal source deadline or notice-by date
  both in the PDF and in the selected citation. A relative notice
  formula is insufficient. These English pattern checks are conservative
  safeguards, not a complete natural-language intent classifier.
- Both configured providers (Groq or Ollama) return a strict selection schema:
  `supported` and up to three passage IDs. No tools, browsing or actions are
  available. Unknown/duplicate IDs, extra answer fields and malformed output fail
  closed. Only server-owned passages and locations are returned to the browser;
  model-generated prose, page numbers, URLs and quotes cannot enter the answer.
- React renders source text as escaped plain text, with no HTML/Markdown or link
  execution. The browser also validates contract ID, response shape, page bounds,
  quote lengths and Unicode offsets before displaying citations.
- Membership and owned-record access are checked again after provider latency.
  A revoked membership, deleted/moved record or changed source hash suppresses
  the late answer. No database mutations or reminder operations occur.
- Provider work runs off the event loop. Each process allows one in-flight
  assistant operation per workspace and four overall, releasing slots on failure.
  Provider requests have a 30-second network timeout and no Groq automatic retry.
  These are per-process bounds, **not** distributed quotas or billing controls.
- PDFs, questions, responses and provider exceptions are excluded from application
  logs and are not persisted by this feature. The configured provider receives
  the question and selected source text; its own terms/retention still apply.
  The UI and privacy notice disclose this processing.

Prompt-injection resistance is layered, not a claim that an AI can never select
an irrelevant or misleading passage. Literal matching proves quote fidelity,
not legal applicability or semantic completeness. Numeric section/heading and
governing-context detection are heuristic; unfamiliar wording, unnumbered
references, tables or external amendments can still be missed. The expanded
context policy deliberately increases abstention on long or repetitive PDFs.
Signature authenticity and legal effect are not verified. Human review is always
required. OCR, semantic/vector
retrieval, conversational memory and persistent source storage are outside scope.

## Validation and release gate

Run the existing backend suite and the new `test_contract_assistant.py`, then
frontend tests/lint/TypeScript and an optimized production build. Test fixtures
must be synthetic and service calls mocked; do not use customer PDFs for evals.
The optional SQL tests require an owned disposable loopback database named
`renewai_reminder_test`, as documented in [development](development.md).

Implementation verification on 30 October 2026:

- All 203 backend tests passed, zero skips, including 39 actual PostgreSQL tests
  on a newly created disposable PostgreSQL 16.2 cluster. The first SQL run used
  a differently named local owner; six existing lockdown tests correctly rejected
  that fixture. Rerunning as the fixture-required `postgres` owner passed.
- All 24 frontend tests passed; lint, TypeScript and optimized webpack production
  build passed using synthetic local environment values.
- New coverage includes exact page/Unicode spans, late-page retrieval, unknown
  support, injection, malformed/fabricated provider output, isolated provider
  payloads, two-workspace authorization, pre-body rejection, source-hash mismatch,
  access revocation during inference, provider errors/privacy, bounded concurrent
  work and unchanged saved records/reminders/history.
- The production-built actual contract detail page passed a local browser check
  against synthetic API/auth/database/provider fixtures: original PDF → page-two
  source quote, unsupported question, private 503, wrong-PDF rejection and
  recovery, instruction-attack abstention, refresh clearing, existing summary
  control, desktop and 390px mobile without horizontal overflow or page errors.
  The fixture initially lacked existing required contract/reminder fields;
  completing the fixture resolved those test-only render failures.

The initial implementation tests mocked provider responses. A following narrow
browser smoke test used the real configured Groq `openai/gpt-oss-20b` model and a
three-page fictional agreement with synthetic local Auth/database records. It
passed upload/extraction/save, three exact-page answers (notice, price cap and
refund exception), unsupported-insurance abstention, wrong-file and foreign-tenant
rejection, summary download and unchanged records. One provider rate-limit error
was shown safely; a later explicit retry on the same record passed. That single
fictional agreement is not a calibrated accuracy benchmark or production test.
The benchmark below extends that narrow check. Authorized real Auth/database
staging verification remains a release prerequisite. Provider docs used for the response contract:
[Groq structured outputs](https://console.groq.com/docs/structured-outputs).

### Dependency remediation — 30 October 2026

The initial frontend lockfile reported six npm audit findings (five high, one
critical). Next.js and its matching ESLint config are now pinned to **16.4.3**.
Patched transitive versions include `sharp` 0.35.5 (and matching platform/libvips
packages), `brace-expansion` 1.1.21/5.0.12, `js-yaml` 4.3.2, `source-map-js` 1.2.2
and `zod` 4.6.7. React, React DOM and Supabase versions are unchanged. No forced
audit fix, dependency override, application-code, auth or database changes were
needed. See [Next.js 16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3)
and the [image-optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw).

Verification after the upgrade:

- Clean `npm ci --ignore-scripts` succeeded from the committed-format lockfile;
  full `npm audit` reports **zero known vulnerabilities**, including development
  dependencies, as of this check. This is not a claim about undisclosed issues.
- All 24 frontend tests, ESLint, standalone TypeScript and the optimized webpack
  build passed. The native image library successfully resized a synthetic PNG.
- All 61 focused backend tests for Ask, upload limits, summary export and
  save/AI separation passed, zero skips. Backend sources/dependencies are unchanged;
  the full 203-test run above is the earlier implementation verification.
- The newly built frontend passed the fictional-contract browser flow: upload,
  reviewed save, Ask source citations/abstention, injection and wrong-file
  rejection, foreign-workspace denial, summary download, unchanged saved records
  and desktop/390px mobile checks without page errors or horizontal overflow.
  This dependency regression used synthetic local Auth/database/AI fixtures;
  it did not repeat live-provider calls or use production services.

No production deploy, merge, database migration, customer-data write, live model
request or email send was performed for the dependency remediation. Before release,
verify the intended backend/frontend revisions and provider configuration, run
the synthetic upload/save → Ask → abstention → retry → original summary/history
flow, recheck two-account access, and obtain deployment authorization.
Rollback removes the new UI and route; no schema rollback or retained document
cleanup is needed.

## Reproducible fictional benchmark

`backend/fixtures/ask_renewai_benchmark.json` defines explicit expected outcomes
for supported terms, amendments, order-form precedence, unresolved conflicts,
cross-page exceptions, distant/missing numbered references, unsupported details,
advice/actions/calculations, instruction attacks, a harmless credential policy,
context-budget overflow and a page-200 clause. The fixture set is agent-curated,
not independently annotated by legal reviewers. It is a development regression
suite, not a held-out customer accuracy estimate.

The runner creates each synthetic PDF in memory, uses the same bounded PDF
extractor as uploads, and verifies exact source spans, required page/qualification
coverage and abstention shape against the explicit expectations. No second model
grades answers. No database/Auth client, production API, email sender or customer
document is used. The fixed fixture path prevents accidental customer-file input.

From `backend/`, inspect retrieval without any provider requests:

```sh
python tools/benchmark_contract_assistant.py --repeats 1 --output /private/tmp/ask-plan.json
```

Explicitly opt into the configured provider using fictional inputs only:

```sh
python tools/benchmark_contract_assistant.py --live --repeats 2 \
  --interval-seconds 10 --env-file /path/to/private-ai.env \
  --output /private/tmp/ask-live.json
```

Only AI configuration is imported from the optional environment file. Keys,
provider exception messages and raw customer content are never written to the
result. A provider outage/rate limit is reported separately as `provider_error`
and fails the gate; it cannot count as a correct abstention. There is no automatic
retry or provider fallback. `--resume` reuses completed results only for the same
source fingerprint, model, fixture selection and repeat count, rerunning provider
errors. `--only` marks a report as a subset; a subset is not a complete-suite pass.
Results include a content fingerprint because the Git HEAD may still be the base
commit while evaluating an uncommitted working tree.

Recorded verification on 30 October 2026:

- A six-case live retrieval baseline failed five cases: distant referenced terms,
  document-instruction handling, a harmless credential-protection clause, and two
  late-context cases. After expanding context, the wider run additionally found
  that background clauses could be labelled as answers to a calendar-calculation
  or legal-advice request. These were status/selection failures; no generated
  legal advice or calculated date was rendered. The new context and question
  guards address those observed failures.
- The final configured Groq `openai/gpt-oss-20b` run matched all **26 expected
  outcomes twice: 52 passes, zero failures and zero provider errors**. This used
  **36 real provider requests**; **16 assessments were resolved by pre-inference
  guards**. All selected quotes matched exact PDF page spans and met the case's
  required page/qualification checks. Ollama was not live-benchmarked.
- All **214 backend tests passed with zero skips**, including the 39 actual
  disposable PostgreSQL tests and new API checks that advice/oversized-context
  abstention preserves contracts and reminders without calling AI. All **24
  frontend tests passed**. Frontend source/dependencies are unchanged since the
  prior verified build; that build was not repeated for this backend-only change.
- The [machine-readable record](benchmarks/ask-renewai-20261030.json) includes
  fixture/source fingerprints and per-case outcomes. The full private diagnostic
  runs remain separate from customer data. These are curated development cases,
  not independent legal review, statistical accuracy certification or production
  integration testing. Real Auth/database staging verification remains open.
