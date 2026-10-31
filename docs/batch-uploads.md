# Batch contract uploads

The Analyze page accepts 1–10 PDF files per batch, including a single PDF. Select
files, then choose **Analyze queued PDFs**. Extraction runs sequentially through
the existing authenticated `/contracts/analyze` endpoint. Each file retains the
existing 10 MiB / 200-page server limits; the browser also checks extension, size
and empty files before submitting them. PDF contents remain validated by the
server.

The queue displays queued, analyzing, ready for review, failed, duplicate, saving,
save needs attention and saved states. A failed analysis does not stop the queue.
**Retry analysis** requeues only that failed file and shares the same single
analysis worker. Individual analysis requests time out after two minutes; retries
are explicit. No persistent background job or automatic retry is created.

## Review and saving

Use **Review** beside a completed file to open its existing editable terms and
calculation preview. Reviews stay mounted separately with unique field IDs;
switching files preserves each file's edits. Reset review edits requires
confirmation. Nothing is saved by analysis. **Confirm & Save Contract** sends
only that review's original PDF and reviewed fields to `/contracts/save`.

A confirmed save is displayed independently of subsequent AI renewal analysis.
Retrying AI analysis uses the saved record and never repeats the contract save.
Failed saves retain the reviewed fields. A network/server failure may have
committed the save: check Contracts before explicitly retrying. Saves are never
automatically retried by the queue. Existing server duplicate checks apply again
at save time.

## Duplicates and recovery

SHA-256 hashes identify byte-identical files within the batch, even under different
filenames. The first copy owns analysis/review/retry; later copies point to that
queue entry. Filenames alone do not establish identity. Different PDF versions
or separately encoded copies are not semantic duplicates.

Existing organization-scoped server duplicate checks run before analysis and at
save, with a link to the existing contract when provided. A single failed or
duplicate entry does not discard successful results for other files.

## Page lifetime and limits

Keep the page open through review and saving. Files, queue state and unsaved
reviews live in browser memory, without local/session storage or retained PDF
binaries. Refresh or navigation loses unsaved work; a refresh/tab-close warning
is installed while unsaved entries remain, subject to browser support. Internal
navigation is not blocked. **Start new batch** asks before discarding unsaved
work and is disabled during analysis or saving. Saved contracts remain intact.

The ten-file cap is per browser batch, not an organization quota or server-wide
concurrency limit. Other tabs/users may still issue concurrent requests. No
backend, schema, provider, hosting or scheduler configuration changes are needed.

## Development checks

`cd frontend && npm test`, `npm run lint`, and `npm run build -- --webpack` cover
queue regressions, frontend lint and the optimized build/TypeScript checks.
`cd backend && .venv/bin/python -m unittest test_contract_save_flow test_upload_security`
checks the existing save and upload boundaries using synthetic services.

Local browser verification used the actual queue/review components and styles
with simulated authentication/API/AI responses and fictional files. It covered
10/11 selection bounds, serial analysis, renamed and saved duplicates, retry,
retained per-file edits, unique labels/IDs, explicit save failure/recovery,
AI retry without re-save, and a 390px mobile viewport. It does not establish live
Auth/database/provider integration or physical-device coverage. Private harness
and screenshots are under `tmp/batch-upload/`.
