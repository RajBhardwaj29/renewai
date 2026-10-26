# Founder-led pilot readiness

This batch establishes basic API monitoring, observed activation measurement,
and a repeatable usability session. It does not establish enterprise readiness,
extraction accuracy, reliable reminder delivery, or customer traction.

## Monitoring during a pilot

Owner: Raj. Before and after each pilot session, inspect **renewai-ai → Logs**
in Render. Search `renewai.pilot.v1`. Review warnings and
`"outcome":"failure"`, then group by `operation`, `event`, and `request_ref`.
Review daily while a pilot is active; no recurring automation is installed.

The application emits compact JSON messages, with UTC `at`, a random
`request_ref`, duration in milliseconds where applicable, and the host's commit
`revision` when Render supplies it. API outcomes are recorded for analyze, save,
AI insight, decision updates, and portfolio reads. A response below 400 is
`success`, 4xx is `rejected`, and 5xx is `failure`. Rejections include expired
sessions, invalid PDFs and duplicates; they are not automatically outages.
`pdf_text` and `extraction` events distinguish PDF reading from AI extraction.
`reminder_generation_failed` remains visible even when the contract save succeeds.

Investigate any confirmed-save failure or decision-update failure immediately
during a session. Repeated extraction failures across known readable synthetic
PDFs warrant investigation before another session. Record UTC time, operation,
request reference and release revision privately. Never paste contract text,
tokens, notes or raw provider errors into an issue. For uncertain writes, read
Contracts before retrying. A decision failure may follow a committed decision
and failed history insert; the telemetry does not make that workflow atomic.

For a frontend incident inspect Vercel build/runtime logs and the browser's
visible error. Browser-only failures, requests that never reach the API, process
termination and provider log loss are not covered by these API signals. No
third-party error tracker, stack-trace collection, automatic notification,
external log drain, uptime monitor or durable analytics store is configured by
this batch. Hosting retention limits apply; export pilot logs before expiry.

Logs contain SHA-256-derived, domain-separated 24-character workspace/contract
references for cohort counting. These are pseudonymous, not a claim of anonymous
data. No new cookie, local-storage identifier, email, filename, contract text,
decision content, IP, user agent, raw URL or request payload is added by these
events. Existing hosting/access/reminder logs have their own content and retention.
Keep exports private and outside Git. Delete them when no longer needed under
the agreed pilot data-handling policy. This is not a verified retention guarantee.

## Measure activation without overstating it

Count `contract_saved` only after a database insert is confirmed. A later reminder
failure does not undo that event. Duplicate and rejected saves do not count.
Count `decision_saved` only after the existing decision/history helper returns
success; `decision_recorded=true` means the submitted decision was not Undecided.
These are observed milestones, not proof the user understood the terms or achieved
savings. Repeated decision updates do not create new activated contracts.

Export the text log messages from Render into a private local file, then run:

```sh
cd backend
.venv/bin/python tools/summarize_pilot_events.py /private/tmp/renewai-pilot-events.log
```

The command reads a local export and prints aggregate JSON. It makes no network,
database, email or AI request. Overlapping exports are deduplicated by request and
event. Use `--exclude-workspace-ref <reference>` for each known internal/QA workspace.
Obtain the pseudonym from its known session's log; never mix QA activity with
customer activation. Provide complete, untruncated JSON message lines, optionally
prefixed by hosting timestamps. JSON-wrapped provider exports need their message
field extracted locally first.

Report the observation window and pilot cohort alongside:

- Unique saved contracts and workspaces with a confirmed save.
- Unique contracts and workspaces with a recorded decision.
- Contracts observed both saved and subsequently/previously recorded as decided
  within the export; this is an intersection, not an ordered conversion funnel.
- Workspaces with successful portfolio loads on multiple UTC dates, a return-use
  proxy that also includes reloads/background API reads and archived lists.
- Workflow successes, rejections, failures, and PDF/extraction failures.

Events start at this release and may be lost, retried or truncated by hosting.
First observed save is not necessarily the workspace's first-ever save. A lost
response may follow a logged confirmed insert. These metrics are not an audit
ledger, user count, retention benchmark, conversion rate, or revenue evidence.
For each pilot record invited participants, successful first reviewed save,
deadline comprehension, first decision, later return, and willingness to pay in
private session notes. The invited cohort and comprehension need human observation.

## 20-minute usability session

Use an isolated test workspace and a synthetic text-readable agreement with known
dates. Obtain consent before recording a session; recording is not required.
Do not load confidential customer documents for a broad demo.

1. **Context, 2 minutes.** “How do you track vendor renewals today? Tell me about
   the last renewal that required work.” Avoid explaining the interface first.
2. **First contract, 6 minutes.** “Add this agreement. Review the extracted terms
   and save it when you trust them.” Observe hesitation, corrections and recovery.
   Mark whether saving succeeded unaided and whether AI and reviewed facts were
   understood. Do not interpret an AI confidence score as accuracy.
3. **Deadline, 4 minutes.** “When must your team act, and what in this agreement
   supports that date?” Ask the participant to explain the cancel-by date, notice
   period and unknowns. Compare with the fixture's independently calculated answer.
4. **Decision, 4 minutes.** “Record what your team should do next.” Observe whether
   the participant distinguishes AI advice from their own decision. Reopen the
   saved record and confirm persistence. Never send an email as part of this test.
5. **Value, 4 minutes.** “What would make you return next week? What would stop you
   trusting this? Who would approve paying for it?” Record the answer verbatim
   privately; avoid leading questions or treating stated interest as a sale.

For each task record success/assisted/blocked, elapsed time, confusion, severity,
and a concrete observation. End with the three largest issues. Run five sessions
before selecting the next UX batch; a repeated issue deserves priority over a
single preference. This document does not authorize outreach or scheduling.

## Physical-device checklist — pending

On 26 October the connected computer offered Chrome and iPhone Mirroring. iPhone
Mirroring required the owner's Touch ID/Mac login; no physical Safari check could
be completed. No Android surface was connected. Prior responsive viewport checks
are historical browser checks, not physical-device passes.

Run on an actual iPhone/Safari and Android/Chrome before claiming device readiness.
Record model, OS/browser versions, release commit, date, result, and issue evidence.
Use synthetic records and future reminder checkpoints. Leave sending and permanent
deletion outside this session.

- Sign in, refresh, navigate Dashboard → Contracts → Analyze; verify navigation
  and tap targets in portrait and landscape with no overlapping content.
- Choose a PDF using the real file picker; verify upload, review, keyboard scrolling,
  numeric/date edits, and visibility of save/error messages.
- Save once, reopen, compare dates/values and identify AI pending/failure/success
  separately from confirmed saving. Test recovery with synthetic local services.
- Record a decision, refresh, confirm it persisted; inspect long notes and labels.
- Open then cancel archive/delete dialogs; check keyboard focus, screen reader
  labels, scrolling, and that cancel issues no write.
- Download/open the summary PDF using the device's normal viewer and return.
- Background/resume the page; check draft preservation, focus behavior and countdown
  refresh. Use a controlled local clock for midnight rather than changing production.
- Test larger text/zoom and VoiceOver/TalkBack for task completion, errors and dialogs.

Reminder delivery remains explicitly deferred. Do not promise reliable email
delivery until the separate operational limitations have been resolved.

## Release and rollback

No migration, new credential, paid service, or sender change is required. Deploy
the tested commit to the existing main-linked Vercel/Render services. Verify the
Render commit through `X-RenewAI-Revision` on `/health`, inspect structured logs
after an authenticated portfolio read, and verify Vercel's current production SHA.
Retest denied/expired authentication and tenant isolation locally. Production
checks should use reads and harmless rejected requests; successful write and
failure-path telemetry can be verified with isolated synthetic services.

Rollback by restoring the preceding application commit on both hosts. No database
rollback is needed. Old exported events remain on their host until retention expiry.
This release does not change calendar calculations, authorization, save/AI separation,
reminder dispatch, or atomic permanent deletion.
