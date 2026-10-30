# Backend latency investigation — 29–30 October 2026

The API had a reproducible concurrency bottleneck: synchronous database and AI
calls in async upload/save/export routes stopped unrelated requests from running.
Workspace authorization also made two sequential Data API requests where the
existing foreign-key relationship permits one. This change fixes both paths
without caching authorization or changing extraction/model/date semantics.

## Verified environment

- Repository: `RajBhardwaj29/renewai`, baseline main `4aa3b01`.
- Frontend: Next.js on Vercel, `renewai-psi.vercel.app`; deployed source `4aa3b01`.
- API: FastAPI/Uvicorn on Render, `renewai-ai.onrender.com`; baseline runtime
  revision `7f384d1`, free instance, Oregon, one Uvicorn process.
- Database and Auth: Supabase, Mumbai (`ap-south-1`).
- Extraction and advisory AI: Groq `openai/gpt-oss-20b`.
- PDF text extraction/export: PyMuPDF. Original PDFs are not retained.

These are separate services. Vercel page/build performance does not measure the
Render-to-Supabase or AI request path.

## Measurements and limits

Two correlated production requests on 29 October illustrate the split:

- At 20:04 IST: API analyze request **7,699 ms**, PDF text **68 ms**, AI extraction
  **3,350 ms**. The remaining **4,281 ms** was not separately instrumented.
- At 21:31 IST: a new synthetic PDF reached the review screen, without saving.
  API analyze request **6,771 ms**, PDF text **154 ms**, AI extraction **2,982 ms**.
  Remaining time **3,635 ms**. This is server middleware duration, not complete
  browser time or upload bandwidth.

Other measurements:

- Existing successful portfolio logs included **1,261–2,314 ms**. This is a
  bounded observed range, not a population percentile.
- Five reused-client live health probes from the developer machine: median
  **526 ms**, range **331–850 ms**. A separate initial request took **962 ms**.
  These probes did not establish a cold-start duration.
- Local process launch to `/health` 200, with synthetic dependencies and the
  scheduler disabled: **309, 342, 345 ms**. This excludes Render provisioning,
  instance wakeup, production network and actual credentials.
- Five live read-only workspace probes from the developer machine: original
  two-request median **181 ms**, joined-query median **84 ms**. The returned
  organization and role matched. These are not Render-region timings.
- Empty-tenant database probes executed in **0.109 ms** (membership) and
  **0.159 ms** (contract list), including executor overhead; a Data API empty
  contract probe took a median **80 ms** from the developer machine. The contract
  query used the existing organization index. Empty-tenant plans do not prove
  every real portfolio query is fast.
- Three synthetic AI extractions took **1.43 s, 7.98 s, 37.86 s**. A separate
  instrumented synthetic extraction took **1.22 s**, one HTTP 200 attempt;
  provider-reported prompt time **280 ms**, completion **790 ms**, queue **50 ms**.
  The longer samples did not capture attempt/queue details, so their exact
  upstream cause is unresolved. Do not label all variation model inference.
- Local synthetic PDF extraction medians, five repeats: roughly **2 ms** for
  one page, **12.5 ms** for 20, **100 ms** for 200 (132,000 characters). This is
  not a representative customer-document benchmark.

Render reports that this free instance sleeps when idle and can delay a request
by 50 seconds or more. The cross-region API/database placement adds network
distance. Neither the warning nor geography alone establishes the attribution
of every slow request. No paid upgrade, region migration or production restart
was performed to manufacture a measurement.

## Implemented changes

1. Run blocking duplicate lookups, extraction-provider calls, reviewed-save
   processing/persistence, and summary-export database waits in Starlette's
   worker pool. Keep PDF extraction and rendering on the one event-loop thread:
   [PyMuPDF does not support multi-threaded execution](https://pymupdf.readthedocs.io/en/latest/recipes-multiprocessing.html).
2. Fetch membership and organization together through the existing FK using
   `organizations!inner(id,name,created_at)`, still filtering by verified user.
   No-membership/missing-organization results fail closed. Every request checks
   membership anew; no JWT or authorization cache was introduced.
3. Add `renewai.latency.v1` logs for authentication verification, workspace
   lookup, duplicate lookup, portfolio reads, contract writes, reminder
   generation, upload-body receipt and advisory AI. Correlate by the existing
   random request reference and optional host commit revision. No document
   content, filename, token, user ID or exception message is accepted.

Existing `pdf_text`, `extraction` and `workflow_request` logs remain compatible.
An execution-stage outcome means the function completed or raised; workflow
HTTP status remains the authority for accepted/rejected requests. Body-receipt
timing starts after upload authentication and excludes ingress/preflight and
multipart parsing. Stages are nested in workflow time; do not sum all logs
indiscriminately.

## Verification

The complete backend suite passed **185 tests with zero skips**, including
39 disposable PostgreSQL tests. New cases cover concurrent health responsiveness
during database/AI waits, export waits, single-thread PDF execution, overlapping
workspace/request context isolation, missing/revoked membership, database
failure, timing privacy and logging-sink failure. Existing tenant isolation,
upload budgets, evidence grounding, save/AI independence and delivery safety
tests pass. No application dependency, schema, scheduler or frontend code changed.

The deterministic responsiveness benchmark injects a 600 ms synchronous provider
wait into the real ASGI application. Before the fix, the concurrent health request
could not complete until **612–615 ms** after upload start. After the fix it
completed in **6.6–7.5 ms** while the upload continued for about 611–615 ms.
This measures responsiveness under overlap, not faster model inference.

Run the network-free benchmark from the repository root:

```sh
python backend/tools/benchmark_backend_latency.py
```

Run all tests with a disposable loopback PostgreSQL database named
`renewai_reminder_test`, a test-only psycopg driver and the fixture's `postgres`
owner. Keep `ENABLE_REMINDER_SCHEDULER=false`. Without the fixture, 39 SQL tests
are skipped; do not report those as executed passes.

## Remaining work and release checks

- Release through the existing Git pipeline and confirm Render's revision.
  Repeat a synthetic analyze-only upload and inspect the new stage timings.
  Vercel preview uses the production backend and is not an isolated backend.
- An always-on hosting plan would address idle sleep; placing API and database
  closer together warrants a measured infrastructure proposal. Neither is part
  of this code change or an approved purchase/migration.
- AI tail latency, SDK retries, provider fallback and thread-pool saturation
  remain separate capacity/budget questions. No model, prompt, retry, timeout,
  process-count or concurrency-limit tuning was guessed from this small sample.
- PDF work remains synchronous and serialized; very expensive documents can
  still delay the event loop. Current file/page/text budgets remain enforced.
  Process isolation can be evaluated if representative measurements justify it.
- The Supabase performance advisor reports two per-row Auth/RLS evaluation
  warnings and three unused-index notices. They were not shown to cause this
  service-role API slowdown; no index/policy was altered for them. See
  [the Auth/RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

The production analysis check used only a synthetic document and stopped before
save. No production contract/account/reminder mutation, email send or schema
change was needed for this investigation.
