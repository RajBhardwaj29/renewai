# PDF workflow quality checks

The PDF workflow is upload -> source-text extraction -> provisional fields -> human
review -> deterministic save/reminders -> separate advisory AI -> detail/refresh ->
authenticated summary download. It supports text-readable PDFs; image-only inputs
need OCR outside the app. Password-protected files need an unlocked copy. Empty,
wrong-type, damaged and unreadable inputs return actionable client errors.

Extraction requests explicit agreement titles and complete commercial clauses.
Source reconciliation can recover a missing/test-footer title from a unique
opening agreement name or main heading. Existing substantive titles stay intact.
For an existing literal evidence sentence, a unique bounded source paragraph can
restore adjacent qualifications. Ambiguous matches, competing amendments,
paraphrases and unstructured whole documents are not automatically expanded.
This is a conservative recovery aid, not a guarantee that every provision is
captured. Human review remains required. Saved contracts are not rewritten.

Summary PDFs keep provider/customer, saved facts, date/notice rules, complete saved
clauses, advisory AI, human decision and reminder schedule. Internal notes/owner,
history and recipient data remain excluded. Rendering escapes markup, handles
Unicode/long text, flows sections without a forced AI page break, and keeps page
headers/footers and page numbering. PDF exports do not recalculate cycles, write
contracts, invoke AI, or send reminders.

Validation includes invalid/encrypted/image-only PDFs, title and qualifier
recovery/ambiguity, the actual extraction router, payment recovery, pagination
boundary lengths, complete long evidence/Unicode/markup, scoped/private download,
unknowns, UTC deadlines, and save/AI/reminder failure regressions. Run the backend
unittest suite and frontend tests/lint/build. Disposable PostgreSQL tests require
the guarded local test database; report skips separately.

The local browser check uses synthetic data and simulated extraction/advisory
providers with the real API, date engine, save and PDF renderer. Before calling a
release verified, identify deployed frontend/backend revisions and check an
existing synthetic summary and, when authorized, fresh analysis. No schema or
configuration migration is required. Deploy as one release; no separate PDF
feature flags or provider changes are needed.
