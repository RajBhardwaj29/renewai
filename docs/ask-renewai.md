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
  characters with 300-character overlap; at most eight candidates reach the
  provider. There is no shared index, cross-contract search or prior-turn context.
- The system instruction treats the question and PDF as untrusted data, asks for
  abstention on conflicts, missing qualifications, advice or unsupported claims,
  and disallows external knowledge and calculations. An additional pattern filter
  rejects common instruction attacks and excludes suspicious passages.
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
not legal applicability or semantic completeness. Lexical retrieval can miss
synonyms, amendments, cross-page context, tables and conflicting language outside
the selected candidates. Human review is always required. OCR, semantic/vector
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

No real model-quality evaluation or production smoke test is claimed. Local
tests mock provider responses and therefore cannot measure retrieval/selection
accuracy on real agreements. Live provider evaluation with a reviewed synthetic
benchmark, configured-model compatibility and an authorized staging/production
smoke test are release prerequisites. No populated AI credentials were available
in this isolated checkout. Provider docs used for the response contract:
[Groq structured outputs](https://console.groq.com/docs/structured-outputs).

The inherited frontend lockfile also reports six npm audit findings (five high,
one critical, including Next.js 16.3.1; audit recommends 16.4.3). No dependencies
were added or changed in this feature. Dependency remediation and its regression
checks remain a separate release prerequisite; this PR does not claim they are
resolved.

No production deploy, merge, database migration, customer-data write, live model
request or email send was performed. Before release,
verify the intended backend/frontend revisions and provider configuration, run
the synthetic upload/save → Ask → abstention → retry → original summary/history
flow, recheck two-account access, and obtain deployment authorization.
Rollback removes the new UI and route; no schema rollback or retained document
cleanup is needed.
