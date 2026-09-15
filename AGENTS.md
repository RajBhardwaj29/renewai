# AGENTS.md — RenewAI Build Context & Operating Manual

*Last updated: 15 September 2026*

This file is the primary working context for any AI agent, coding agent, or ChatGPT Work session helping build RenewAI.

It is intentionally more operational than a normal README. Treat it as a **single source of truth for product intent, architecture, constraints, testing history, launch status, and working rules**.

---

## 1\. Project identity

**Product:** RenewAI  
**Founder / builder:** Raj Bhardwaj  
**Stage:** Production-ready private beta / launch-readiness hardening  
**Primary domain:** Contract renewal intelligence, SaaS spend intelligence, and future AI procurement automation

### Core problem

Businesses sign SaaS, software, and service contracts containing renewal dates, notice periods, auto-renewal clauses, pricing commitments, minimum commitments, refund restrictions, termination restrictions, and renewal pricing rights.

Missing a notice deadline can automatically commit a company to another contract term and create avoidable spend.

### Core product promise

RenewAI turns contracts into trustworthy renewal decisions.

The product should help users answer:

- What renews?  
- When does it renew?  
- What is the last day we can act?  
- What commercial risk exists?  
- What should we do next?  
- What evidence supports that recommendation?

### Product principle

> **RenewAI recommends. The organization decides.**

AI interprets contractual and commercial meaning.  
Deterministic code handles date arithmetic and renewal calculations.  
Humans review AI-extracted contract data before it becomes trusted.  
AI recommendation and human renewal decision remain separate.

---

## 2\. Long-term vision

RenewAI should evolve from renewal intelligence into an **AI Procurement Employee**.

Long-term workflow:

1. Discover vendors and contracts  
2. Understand contract terms  
3. Monitor spend, usage, renewals, and obligations  
4. Detect waste  
5. Evaluate renewal options  
6. Recommend renew / reduce / renegotiate / cancel / replace  
7. Draft communications or actions  
8. Request human approval  
9. Execute approved actions  
10. Verify the outcome  
11. Quantify realized savings  
12. Report business impact

The moat is **not the LLM**. The moat should become the combination of:

- workflow  
- trusted contract data  
- usage and spend data  
- vendor pricing benchmarks  
- negotiation history  
- procurement playbooks  
- integrations  
- verified savings outcomes  
- user trust

---

## 3\. What RenewAI is — and is not

### RenewAI is

- Contract intelligence  
- Renewal intelligence  
- SaaS spend intelligence  
- Commercial risk analysis  
- Evidence-backed recommendations  
- Human-in-the-loop decision support  
- Future procurement automation

### RenewAI is not

- A generic chatbot  
- Merely a PDF reader  
- A legal advice platform  
- A generic document storage product  
- A full CLM suite  
- An accounting platform  
- A fully autonomous procurement system at the current stage

---

## 4\. Current product workflow

Current production workflow:

**Upload PDF → AI extraction → Human review → Save trusted record → Deterministic renewal calculations → Evidence → AI commercial intelligence → AI recommendation → Human renewal decision → Work queue → Portfolio intelligence → Audit history → Reminders**

Important behavior:

- Unknown fields must remain unknown.  
- Do not invent missing terms.  
- Users can edit AI-extracted fields before save.  
- Only reviewed/saved data becomes the trusted contract record.  
- Important claims should preserve source evidence where possible.  
- AI interpretation must not replace deterministic date math.  
- Contract decisions remain human-owned.

---

## 5\. Current stack

### Frontend

- Next.js  
- React  
- TypeScript  
- Tailwind CSS  
- Vercel

Production frontend:

`https://renewai-psi.vercel.app`

### Backend

- FastAPI  
- Python  
- Render

Production backend:

`https://renewai-ai.onrender.com`

Health endpoint:

`GET /health`

Expected response:

{"status":"healthy"}

### Database and authentication

- Supabase  
- PostgreSQL  
- Supabase Auth  
- Row Level Security (RLS)  
- Organization/workspace-based multi-tenancy

### AI

Current production provider:

- Groq via OpenAI-compatible API  
- Current configured model: `openai/gpt-oss-20b`

Earlier local experimentation used Ollama.

### Email

- Resend HTTP API

### Scheduling

- Supabase Cron  
- pg\_net  
- Protected FastAPI internal reminder endpoint

### Deployment

- Frontend: Vercel  
- Backend: Render  
- DB/Auth/Cron/Vault: Supabase

### Version control

GitHub repository:

`https://github.com/RajBhardwaj29/renewai.git`

Local project path:

`/Users/rajbhardwaj/Documents/renewai`

---

## 6\. Architecture rules — do not break casually

These are architectural invariants unless there is a clear reason to change them.

### Rule 1 — deterministic renewal logic stays separate from AI

AI may extract:

- dates  
- term lengths  
- notice clauses  
- renewal structure  
- notice anchors  
- commercial restrictions  
- pricing rights  
- commitments  
- clause evidence

But deterministic code must calculate:

- effective term boundaries  
- renewal cycles  
- cancellation / non-renewal deadlines  
- day counts  
- reminder checkpoints  
- current applicable cycle

Never ask an LLM to become the authoritative source for date arithmetic.

### Rule 2 — human review before trust

AI extraction is provisional.

The user must be able to review and correct important fields before the final record is saved.

### Rule 3 — unknown means unknown

If contract language does not provide enough evidence:

- store null / unknown  
- show that it is unknown  
- do not fabricate a precise value

This is especially important for dates, renewal terms, and notice requirements.

### Rule 4 — tenant isolation is a launch blocker

Organization A must never access Organization B data.

Current model:

`User -> organization_members -> organization_id -> contracts/reminders`

RLS and backend scoping must remain organization-aware.

### Rule 5 — backend derives organization context

Do not trust an arbitrary `organization_id` supplied by the frontend for authorization.

Derive organization access from the authenticated user.

### Rule 6 — no secret in frontend

Never expose:

- service-role keys  
- CRON\_SECRET  
- API secrets  
- private Resend credentials  
- Groq keys  
- database secrets

Nothing sensitive belongs in `NEXT_PUBLIC_*`.

### Rule 7 — one production reminder scheduler

Production scheduler path is:

`Supabase Cron -> pg_net POST -> Render /internal/process-reminders -> process_due_reminders() -> Supabase -> Resend -> mark sent`

Keep:

`ENABLE_REMINDER_SCHEDULER=false`

on the Render web service.

Do not introduce a second production scheduler unless intentionally replacing the first.

---

## 7\. Core contract intelligence behavior

RenewAI currently supports or has been hardened around:

- explicit contract start/end dates  
- derived term boundaries  
- initial term months  
- renewal term months  
- automatic renewal  
- fixed-term non-auto-renewing agreements  
- end-date notice anchors  
- renewal-date notice anchors  
- expiration anchors  
- notice-window ranges  
- calendar-month notice periods  
- business-day notice concepts  
- evergreen / indefinite renewal structures  
- amendments and superseding clauses  
- conflicting contract metadata  
- conditional renewal / opt-in structures  
- current-cycle advancement  
- exact renewal boundary behavior  
- multiple committed renewal-cycle advancement  
- notice periods longer than renewal terms  
- leap years / leap-day contracts  
- end-of-month drift  
- missing renewal metadata  
- deadline-today boundary behavior

### Critical calculation principle

The system must determine the **next actionable renewal opportunity**, not merely repeat an old historical deadline.

If a deadline is already missed and a renewal is committed, advance through renewal cycles until the next legally/actionably relevant cycle is found.

### Calendar months vs days

Never silently reinterpret:

`3 calendar months`

as:

`90 days`

These are not always contractually equivalent.

### Business days

Do not fabricate an exact business-day deadline if required holiday/calendar metadata is unavailable.

Prefer an unresolved or qualified result over invented precision.

---

## 8\. Commercial intelligence

RenewAI extracts and/or reasons about commercial terms such as:

- subscription value  
- pricing clauses  
- price-increase rights  
- minimum commitments  
- licensed-seat commitments  
- prepaid fees  
- refundability  
- termination-for-convenience rights  
- material-breach termination  
- non-cancellable commitments  
- renewal lock-in  
- renewal obligations

The AI commercial layer can output:

- recommended action  
- confidence  
- summary  
- findings  
- flags  
- evidence

Typical recommended actions:

- renew  
- renegotiate  
- cancel  
- investigate  
- reduce / right-size  
- replace (future roadmap)

---

## 9\. Human renewal decision workspace

Human decisions are independent from the AI suggestion.

Supported renewal decisions:

- `undecided`  
- `renew`  
- `renegotiate`  
- `cancel`

Workflow statuses:

- `under_review`  
- `decision_made`  
- `completed`

Other decision fields may include:

- decision owner  
- notes  
- timestamp

Decision changes are recorded in an audit/history timeline.

UI principle shown in the contract workspace:

> RenewAI recommends. Your organization decides. A human decision may intentionally differ from the AI suggestion.

---

## 10\. Reminder engine

Typical reminder checkpoints:

- 90 days  
- 60 days  
- 30 days  
- 14 days  
- 7 days

Important reminder rules:

- Reminders are generated from the current actionable cancellation / non-renewal deadline.  
- Historical unsent reminder checkpoints must **not** be backfilled as live emails.  
- A reminder scheduled for today can be dispatched today.  
- Sent reminders should only be marked sent after successful email delivery.  
- Failed sends should remain retryable.  
- Cron execution must be idempotent enough to avoid duplicate emails.  
- Archived or materially edited contracts must not leave stale reminder behavior.  
- Logs should include useful identifiers but never secrets.

Historical production bug fixed:

Old behavior queried reminder dates using a less-than-or-equal rule and could backfill historical reminders.

Correct behavior for live daily dispatch uses the **exact due date** for that run.

---

## 11\. Authentication and account state

Current auth system:

- Supabase Auth  
- email/password provider enabled  
- anonymous sign-ins disabled  
- manual linking disabled  
- secure email change enabled  
- confirm email currently intentionally **disabled for private beta**  
- password reset flow enabled

### Production URL configuration

Site URL:

`https://renewai-psi.vercel.app`

Allowed redirect coverage includes:

- `https://renewai-psi.vercel.app/reset-password`  
- `https://renewai-psi.vercel.app/**`  
- `http://localhost:3000/reset-password`  
- `http://localhost:3000/**`

### Auth tests already passed

- forgot password from production  
- production reset email redirects to Vercel, not localhost  
- new password accepted  
- login succeeds after password reset  
- missing/deleted Supabase local session redirects cleanly to sign-in  
- logout prevents access to protected pages  
- protected route redirects correctly when logged out  
- duplicate signup returns a friendly message and directs user to sign in  
- fresh signup reaches workspace creation  
- fresh workspace reaches empty portfolio dashboard  
- brand-new user can analyze, review, edit, save a contract  
- post-save renewal intelligence and reminder generation work

### Password policy

Supabase minimum password length was increased from 6 to 8\.

Frontend signup code has been updated to:

minLength={8}

placeholder="Minimum 8 characters"

and helper text:

`Use at least 8 characters.`

Local frontend validation completed on 15 September 2026 after lint cleanup:

- `npm run lint` passed with zero errors and zero warnings  
- `npm run build` passed with Next.js 16.3.1

**Current remaining verification:** deploy the frontend and confirm in production:

- 7-character password is rejected  
- 8+ character password succeeds  
- UI displays 8-character minimum

Until that production check is run, password-policy hardening is **pending verification**, not fully closed.

---

## 12\. Multi-tenancy and security

Security already tested includes:

- RLS on tenant-owned data  
- organization-scoped contract list  
- organization-scoped reminder list  
- cross-workspace contract-list isolation  
- direct foreign contract URL blocked  
- cross-workspace reminder isolation  
- clean “Contract unavailable” behavior for inaccessible contracts

Important helper:

`is_organization_member(target_organization_id)`

must use authenticated identity (`auth.uid()`).

### Security behavior

Treat 403 / 404 similarly for inaccessible foreign resources where practical, so the application does not reveal whether another tenant’s object exists.

### Security retest checklist after meaningful backend changes

- Account A cannot list Account B contracts  
- Account A cannot open Account B contract via direct ID/URL  
- Account A cannot edit/archive Account B contract  
- Account A cannot list Account B reminders  
- settings/member endpoints remain organization-scoped  
- cron endpoint returns 401 without valid secret  
- secrets do not appear in logs or frontend

---

## 13\. Credential incident history and policy

At one point real API/cron credentials were accidentally pasted during debugging.

Remediation was completed:

- stale OpenAI key revoked  
- Resend key rotated  
- CRON\_SECRET rotated  
- Render \+ Supabase Vault synchronized  
- stale OpenAI/SMTP variables removed  
- environment parsing issue around `EMAIL_FROM` was corrected

Never reproduce historical secret values.

### Current environment-variable shape

Backend `.env.example`:

\# Supabase

SUPABASE\_URL=

SUPABASE\_SECRET\_KEY=

&nbsp;

\# Frontend / CORS

ALLOWED\_ORIGINS=

&nbsp;

\# AI

AI\_PROVIDER=groq

GROQ\_API\_KEY=

GROQ\_MODEL=openai/gpt-oss-20b

&nbsp;

\# Optional local Ollama fallback

OLLAMA\_MODEL=

&nbsp;

\# Email

RESEND\_API\_KEY=

EMAIL\_FROM="RenewAI \<onboarding@resend.dev\>"

&nbsp;

\# Reminder processing

ENABLE\_REMINDER\_SCHEDULER=false

CRON\_SECRET=

### Production config principles

Render:

- `AI_PROVIDER=groq`  
- CORS restricted to production frontend  
- production scheduler disabled  
- secrets masked

Vercel public variables:

- `NEXT_PUBLIC_SUPABASE_URL`  
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  
- `NEXT_PUBLIC_API_URL`

Production API URL:

`https://renewai-ai.onrender.com`

Local frontend API may remain:

`http://127.0.0.1:8000`

---

## 14\. Email configuration note

Current beta sender can use the Resend onboarding sender for testing.

Before broader external beta, use a verified sender/domain so customer-facing email has proper identity and deliverability.

---

## 15\. Production reliability improvements already made

### Dashboard transient-network resilience

Dashboard GET reads use retry behavior for temporary failures.

Retry only safe GET reads such as:

- `/contracts`  
- `/reminders`  
- `/me`

Do **not** automatically retry write operations if retrying could create duplicate side effects.

Temporary server/gateway retry statuses considered:

- 502  
- 503  
- 504

Network failures are retried with short backoff.

Friendly user-facing error:

> We couldn’t load your dashboard right now. Please try again or reload the page.

The dashboard provides a **Try again** button.

Production failure-state test passed:

1. Vercel frontend loaded.  
2. Render API requests were intentionally blocked.  
3. Friendly dashboard fallback appeared.  
4. API was unblocked.  
5. “Try again” recovered successfully.

This replaced raw user-facing `Failed to fetch` behavior.

---

## 16\. UI / density work

RenewAI is a data-dense enterprise application.

Desktop root scale was intentionally reduced:

@media (min-width: 1024px) {

&nbsp;&nbsp;html {

&nbsp;&nbsp;&nbsp;&nbsp;font-size: 14px;

&nbsp;&nbsp;}

}

Reason:

At browser 100% zoom the original interface appeared too large. The 14px root gives approximately 87.5% of the previous rem scale and produces a denser enterprise-dashboard feel without manually editing thousands of Tailwind classes.

This production layout has been visually tested and accepted.

Do not casually revert this without checking dashboard, contract detail, and forms at 100% browser zoom.

---

## 17\. Beta hardening status

The structured beta hardening run is **closed**.

**BETA-001 through BETA-032 passed after required fixes.**

Important test themes covered:

- basic renewal notice calculation  
- end-date vs renewal-date notice anchor  
- ambiguous anchors  
- amendments / supersession  
- derived dates  
- fixed-term no-auto-renewal  
- leap year / leap day behavior  
- commercial lock-in intelligence  
- calendar-month notice  
- business-day notice  
- defined business-day logic  
- expiration anchor  
- notice-window ranges  
- conflicting dates / amendments  
- evergreen indefinite renewal  
- dual notice obligations  
- competing notice anchors  
- conditional opt-in renewal  
- expired auto-renewal / past deadline  
- irregular renewal term  
- exact renewal-boundary transition  
- end-of-month renewal drift  
- recurring leap-day renewal  
- renewal-date anchor across multiple cycles  
- notice period longer than renewal term  
- notice-window advancement  
- missing renewal-term metadata  
- deadline-today boundary  
- reminder checkpoint advancement  
- production reminder dispatch  
- conflicting term metadata  
- full end-to-end production scenario  
- final launch smoke test

### Important late-beta fixes

#### Current-cycle advancement

When a prior renewal has already become committed, calculate the next actionable cycle rather than surfacing a stale historical date.

Relevant checkpoints:

- `dccdf66` — Advance auto-renewals to current contract cycle  
- `c2db61e` — Handle committed renewal cycle before term boundary  
- `69e3903` — Advance through multiple committed renewal cycles

#### Historical reminder backfill

Historical unsent reminders must not be sent merely because they are before today.

Relevant checkpoint:

- `7af8249` — Prevent historical reminder backfill

#### Structured AI output hardening

Relevant checkpoint:

- `a72bb04` — Harden Groq structured output generation

---

## 18\. Beta test document inventory

The following synthetic or control documents were used across hardening and evaluation. Preserve them as a regression suite when possible.

Known named tests include:

- BETA-002 — Renewal Date Notice Test  
- BETA-003 — Ambiguous Notice Anchor Test  
- BETA-004 — Conflicting Notice Clauses Test  
- BETA-005 — Derived Dates Test  
- BETA-006 — Fixed Term No Auto Renewal Test  
- BETA-007 — Leap Year Month End Date Test  
- BETA-008 — Commercial Lock-In Intelligence Test  
- BETA-009 — Calendar Month Notice Test  
- BETA-010 — Business Day Notice Test  
- BETA-011 — Defined Business Days Test  
- BETA-012 — Expiration Anchor Notice Test  
- BETA-013 — Notice Window Range Test  
- BETA-014 — Conflicting Dates Amendment Test  
- BETA-015 — Evergreen Indefinite Renewal Test  
- BETA-016 — Dual Notice Obligations Test  
- BETA-017 — Competing Notice Anchors Test  
- BETA-018 — Conditional Renewal Opt-In Test  
- BETA-019 — Expired Auto Renewal Past Deadline Test  
- BETA-020 — Irregular Renewal Term Current Cycle Test  
- BETA-021 — Exact Renewal Boundary Test  
- BETA-022 — End-of-Month Renewal Drift Test  
- BETA-023 — Leap Day Recurring Renewal Test  
- BETA-024 — Renewal-Date Anchor Cycle Advancement Test  
- BETA-025 — Notice Longer Than Renewal Term Test  
- BETA-026 — Notice Window Cycle Advancement Test  
- BETA-027 — Missing Renewal Term Metadata Test  
- BETA-028 — Deadline Today Boundary Test  
- BETA-029 — Advanced Cycle Reminder Checkpoint Test  
- BETA-029B — Fresh Reminder Dispatch Test  
- BETA-029C — Production Reminder Dispatch Verification  
- BETA-030 — Conflicting Term Metadata Test  
- BETA-031 — End-to-End Production Scenario  
- BETA-032 — Final Launch Smoke Test

Additional test assets include:

- RenewAI Beta Test Contract  
- RenewAI Grounding Test Contract  
- Commercial Intelligence test documents  
- Sample SaaS agreements  
- renewal-engine fix snapshots  
- contract-AI fix snapshots

The beta suite should be treated as a regression asset, not disposable test data.

---

## 19\. Important beta examples

### BETA-025 — notice longer than renewal term

Scenario:

- 3-month renewal term  
- 120-day notice period  
- notice measured from renewal date

Implication:

The notice period exceeds a single renewal term. A missed deadline may mean more than one future cycle is already committed.

Required behavior:

Advance through renewal dates until finding the next cycle whose notice deadline is still actionable.

### BETA-029C — production reminder dispatch

Scenario verifies:

- current operational cancellation deadline  
- 90/60/30/14/7 checkpoints  
- on the day of processing, only the reminder scheduled for that exact day is sent  
- earlier unsent checkpoints remain historical and are not backfilled

### BETA-031 — end-to-end production scenario

Scenario combines:

- 18-month initial term  
- 12-month auto-renewal  
- renewal-date notice anchor  
- 90-day notice  
- INR 8.4M annualized value  
- minimum user commitment  
- renewal price increase rights  
- non-refundable terms  
- no general termination-for-convenience

This is a useful comprehensive regression contract.

### BETA-032 — final launch smoke

Scenario combines:

- explicit initial term  
- annual auto-renewal  
- renewal-date notice anchor  
- 90-day notice  
- subscription fee  
- minimum commitment  
- price increase  
- non-refundable terms  
- no general convenience termination  
- committed renewal effect

Use this as a quick post-deploy smoke contract.

---

## 20\. Current launch-readiness status

Major launch-readiness sequence:

1. Repository cleanup  
2. Production config audit  
3. README / documentation  
4. UX cleanup  
5. Security / account checks  
6. Beta onboarding  
7. Release checkpoint

### Completed

#### Repository cleanup

`.gitignore` hardened.

Current intended ignore structure:

\# Environment files

.env

.env.local

.env.\*.local

&nbsp;

\# Python

.venv/

\_\_pycache\_\_/

\*.pyc

&nbsp;

\# macOS

.DS\_Store

&nbsp;

\# Node / Next.js

node\_modules/

.next/

&nbsp;

\# Logs

\*.log

Tracked-sensitive-file check returned only `backend/.env.example`, which is expected.

#### Production config audit — mostly completed

- Render env audited  
- Vercel env audited  
- CORS verified  
- backend URL verified  
- production scheduler policy verified  
- Supabase auth URL / redirects corrected  
- production password reset verified

#### UX cleanup — substantial progress

- desktop density improved  
- dashboard resilience improved  
- friendly error/retry state tested

#### Launch documentation

The root `README.md` was completed on 15 September 2026 with:

- product and workflow overview  
- architecture and deployment model  
- repository layout  
- local frontend and backend setup  
- environment-variable documentation  
- validation and security retest guidance  
- current private-beta boundaries

#### Authentication / account checks

Passed:

- password reset  
- invalid session  
- logout/protected routes  
- duplicate signup  
- fresh signup  
- workspace onboarding  
- first contract flow  
- post-save intelligence/reminders

Remaining:

- production verification of 8-character password policy after frontend deploy

### Still important before broader external beta

- Verify password-policy frontend deployment  
- Decide when to enable email confirmation  
- Verify external sender/domain for email  
- Run final Account A / Account B isolation retest if any security-sensitive code changed  
- Observe real scheduled cron execution  
- Add basic monitoring/observability if absent  
- Prepare beta onboarding instructions  
- Tag/release a clean launch checkpoint

---

## 21\. Private beta auth posture

Current intentional decisions:

- **Email confirmation:** OFF for private beta to reduce friction  
- **Anonymous sign-in:** OFF  
- **Manual account linking:** OFF  
- **Secure email change:** ON  
- **Minimum password length:** target 8  
- **Leaked-password checking:** unavailable / not currently enabled  
- **Secure password change / require current password:** not tightened yet because UX implications should be reviewed first

Before broad public signup:

- strongly consider enabling email confirmation  
- verify confirmation redirect flow first  
- verify sender/domain deliverability  
- retest signup and password-reset UX after change

---

## 22\. Product UX principles

RenewAI should feel like an enterprise operations tool, not an AI demo.

Prioritize:

- dense but readable layouts  
- clear hierarchy  
- low ambiguity  
- explicit evidence  
- actionable next steps  
- useful empty states  
- friendly failure states  
- strong loading states  
- obvious human-review moments  
- minimal raw technical errors

Avoid:

- chat-first UX when a structured workflow is better  
- over-animated interfaces  
- hiding contractual evidence behind opaque AI confidence  
- excessive badges or “AI magic” language  
- surfacing internal exceptions directly to users

---

## 23\. Dashboard / portfolio intelligence

Dashboard should reflect real database state, not client-side assumptions.

Current or intended concepts:

- portfolio value  
- auto-renewing count  
- contracts needing attention  
- upcoming deadlines  
- reminder status  
- renewal exposure  
- actionable work queue  
- portfolio intelligence

Empty state should guide the user toward analyzing the first contract.

---

## 24\. Contract lifecycle requirements

For saved contracts, preserve support for:

- edit  
- archive  
- status transitions  
- expired-contract behavior  
- manually renewed contracts  
- recalculation when critical renewal fields change  
- reminder regeneration when appropriate  
- stale reminder cleanup

Be careful with hard delete. For beta, archive is often safer because historical decisions and audit records matter.

---

## 25\. Auditability

RenewAI should preserve an audit trail for meaningful human decisions and important system events.

At minimum, important decision changes should record:

- old state  
- new state  
- user / actor  
- timestamp  
- contract  
- relevant notes if available

Longer term, auditability should include:

- AI extraction version / provider / model  
- evidence used  
- calculation version  
- reminders created/sent  
- actions requested/executed

---

## 26\. AI grounding and trust

Every important AI claim should move toward a structure like:

- value  
- confidence  
- source document  
- source page/section  
- supporting text

For example:

Notice period: 60 days

Confidence: 97%

Source: Contract.pdf

Page: 17

Section: 8.2

Supporting text: ...

For the current stage, transparency and evidence are more important than pretending to have perfect certainty.

---

## 27\. Evaluation strategy

Long-term evaluation target:

Create a manually verified contract benchmark set.

Important fields:

- vendor  
- contract value  
- start date  
- end date  
- renewal date  
- initial term  
- renewal term  
- notice requirement  
- notice unit  
- notice anchor  
- auto-renewal  
- minimum commitment  
- price increase  
- refundability  
- termination rights

Initial extraction-quality target can be \~90%+ on critical fields.

Long-term high-risk-field target should approach 99%+ with:

- evidence  
- human review  
- regression testing  
- deterministic validation

Do not switch models because of hype. Benchmark first.

---

## 28\. Observability backlog

Track or plan to track:

- API latency  
- API failure rate  
- frontend failure states  
- AI latency  
- AI extraction failures  
- extraction accuracy  
- token usage  
- AI cost  
- reminder processing  
- email failures  
- agent/workflow failures  
- customer activity

Potential future tools:

- Sentry  
- PostHog  
- LangSmith  
- OpenTelemetry

Add tools only when they solve an actual visibility problem.

---

## 29\. Initial ICP and buyer hypothesis

Initial ICP:

- SaaS-heavy startup / SMB  
- roughly 20–200 employees  
- 20+ software vendors  
- limited dedicated procurement function

Potential buyers:

- CFO  
- COO / Operations  
- Head of Finance  
- Procurement  
- IT  
- Founder

Pain points:

- missed renewal deadlines  
- auto-renewals  
- wasted licenses  
- fragmented contracts and spend  
- unknown contract ownership  
- vendor price increases  
- manual renewal workflows  
- lack of centralized commitments

---

## 30\. Positioning

Do not position RenewAI as:

> “We use AI to read contracts.”

Position around business outcomes:

- avoid missed renewals  
- reduce renewal risk  
- prevent unwanted spend  
- identify negotiation leverage  
- reduce time spent managing contracts  
- quantify savings

Useful positioning sentence:

> RenewAI sits on top of a company’s contracts and business systems and turns renewal data into savings actions.

---

## 31\. Pricing hypothesis — not final

Historical working hypothesis:

- Free: small contract limit  
- Starter: low-volume SMB tier  
- Growth: larger contract portfolio  
- Business: custom

Potential future outcome-based model:

- percentage of verified savings

Do **not** finalize pricing before customer discovery validates willingness to pay.

---

## 32\. Product roadmap

### Phase 0 — Validation

- customer interviews  
- competitor research  
- manual contract / SaaS audits  
- willingness-to-pay validation

### Phase 1 — Contract Intelligence

- PDF upload  
- extraction  
- review  
- evidence  
- trusted records

### Phase 2 — Renewal Intelligence

- renewal deadlines  
- cancellation windows  
- risk scoring  
- alerts  
- work queue  
- calendar

### Phase 3 — Spend Optimization

- SaaS usage data  
- license utilization  
- duplicates  
- right-sizing  
- savings opportunities

### Phase 4 — AI Actions

- draft emails  
- create tasks  
- approval flows  
- action execution with human approval

### Phase 5 — Procurement Agent

- vendor workflows  
- negotiation support  
- pricing benchmarks  
- renewal playbooks  
- savings tracking

---

## 33\. Features explicitly out of MVP scope

Do not build these before evidence justifies them:

- automatic contract cancellation  
- fully autonomous vendor negotiation  
- enterprise SSO  
- dozens of integrations  
- custom LLM training  
- complex procurement workflow engine  
- mobile app  
- full CLM replacement

---

## 34\. Founder / product operating principles

1. Do not build before talking to customers.  
2. Do not build features because they sound impressive.  
3. Every feature must solve a customer problem.  
4. AI should provide evidence for important claims.  
5. Human approval precedes sensitive actions.  
6. Avoid over-engineering the MVP.  
7. Customer value matters more than feature count.  
8. Savings and risk reduction matter more than AI sophistication.  
9. Use deterministic workflows wherever possible.  
10. Build what customers repeatedly need.  
11. Ship → measure → learn → improve.

Feature gate:

> Does this help the customer save money, save time, or reduce risk?

If not, deprioritize it.

---

## 35\. Coding-agent operating rules

When modifying RenewAI:

### Before changing code

1. Understand the current behavior.  
2. Identify whether the bug belongs to:  
   - AI extraction  
   - deterministic engine  
   - persistence  
   - auth / security  
   - UI  
   - reminders  
3. Prefer the smallest change that fixes the real cause.  
4. Check regression risk against the beta suite.

### Code response preference

For Raj:

- small/local change → send the minimal snippet  
- large or cross-cutting change → send the full file

Do not dump huge code files for tiny edits.

### After changes

Run the relevant build/test.

Frontend:

cd /Users/rajbhardwaj/Documents/renewai/frontend

npm run build

Backend dev:

cd /Users/rajbhardwaj/Documents/renewai/backend

source .venv/bin/activate

python \-m uvicorn main:app \--reload

Git status:

cd /Users/rajbhardwaj/Documents/renewai

git status \--short

### Before declaring success

Verify in production when the change affects:

- auth  
- deployment  
- reminders  
- CORS  
- API URLs  
- tenant isolation  
- production routing

A local pass is not always a production pass.

---

## 36\. Change-safety rules

### Safe to retry

Usually:

- GET reads  
- health checks  
- idempotent retrieval operations

### Do not blindly retry

Potentially:

- contract upload/save  
- archive/delete  
- human decision writes  
- reminder delivery  
- email sends  
- external side-effect actions

Write operations require explicit idempotency before automatic retry.

---

## 37\. Error-handling policy

User-facing errors should:

- explain what failed in plain language  
- suggest a recovery step  
- avoid raw stack traces  
- avoid exposing internal infrastructure  
- preserve user data where possible

Examples:

Good:

> We couldn’t load your dashboard right now. Please try again or reload the page.

Bad:

> TypeError: Failed to fetch

---

## 38\. Current known URLs and commands

### Production

Frontend:

`https://renewai-psi.vercel.app`

Backend:

`https://renewai-ai.onrender.com`

GitHub:

`https://github.com/RajBhardwaj29/renewai.git`

### Local repo

`/Users/rajbhardwaj/Documents/renewai`

### Backend

cd /Users/rajbhardwaj/Documents/renewai/backend

source .venv/bin/activate

python \-m uvicorn main:app \--reload

### Frontend

cd /Users/rajbhardwaj/Documents/renewai/frontend

npm run dev

### Production frontend build check

cd /Users/rajbhardwaj/Documents/renewai/frontend

npm run build

---

## 39\. Known Git checkpoints

Important historical commits:

- `a72bb04` — Harden Groq structured output generation  
- `dccdf66` — Advance auto-renewals to current contract cycle  
- `c2db61e` — Handle committed renewal cycle before term boundary  
- `69e3903` — Advance through multiple committed renewal cycles  
- `7af8249` — Prevent historical reminder backfill

Other later commits include:

- repository / `.gitignore` hardening  
- environment example cleanup  
- desktop density improvements  
- dashboard network resilience

When exact later commit hashes are not known, inspect git history rather than inventing them.

---

## 40\. Important historical artifacts

Useful project artifacts created during the build include:

- `RenewAI_Master_Founder_Document.docx`  
- `RenewAI_4_Week_Production_Checklist.pdf`  
- `RenewAI_BETA_022_End_of_Month_Renewal_Drift_Test.pdf`  
- `RenewAI_BETA_023_Leap_Day_Recurring_Renewal_Test.pdf`  
- `RenewAI_BETA_024_Renewal_Date_Anchor_Cycle_Advancement_Test.pdf`  
- `RenewAI_BETA_025_Notice_Longer_Than_Renewal_Term_Test.pdf`  
- `RenewAI_BETA_026_Notice_Window_Cycle_Advancement_Test.pdf`  
- `RenewAI_BETA_027_Missing_Renewal_Term_Metadata_Test.pdf`  
- `RenewAI_BETA_028_Deadline_Today_Boundary_Test.pdf`  
- `RenewAI_BETA_029_Advanced_Cycle_Reminder_Checkpoint_Test.pdf`  
- `RenewAI_BETA_029B_Fresh_Reminder_Dispatch_Test.pdf`  
- `RenewAI_BETA_029C_Production_Reminder_Dispatch_Verification.pdf`  
- `RenewAI_BETA_030_Conflicting_Term_Metadata_Test.pdf`  
- `RenewAI_BETA_031_End_to_End_Production_Scenario.pdf`  
- `RenewAI_BETA_032_Final_Launch_Smoke_Test.pdf`  
- renewal-engine snapshots and contract-AI snapshots

Where available, agents should retrieve these files rather than reconstructing them from memory.

---

## 41\. Immediate next actions

At the time this AGENTS.md was compiled, the best next sequence is:

1. **Finish password-policy verification**

   - local lint and frontend build passed on 15 September 2026  
   - deploy  
   - production UI says 8 characters  
   - 7-char signup rejected  
   - 8+ accepted  
2. **Final security retest if security-sensitive code changed**

   - Account A vs B contracts  
   - Account A vs B reminders  
   - direct foreign contract URL  
   - write isolation  
3. **Production scheduler observation**

   - verify a real scheduled Supabase Cron run  
   - inspect logs  
   - confirm no duplicate emails  
4. **Email sender readiness**

   - move from onboarding sender to verified domain before wider external beta  
5. **Beta onboarding**

   - concise tester instructions  
   - known limitations  
   - feedback capture  
   - issue triage flow  
6. **Release checkpoint**

   - clean git status  
   - build passes  
   - backend health  
   - frontend smoke test  
   - tag or document release state

---

## 42\. How ChatGPT Work / coding agents should continue this project

When asked to continue RenewAI:

1. Read this file first.  
2. Inspect current git status and recent commits.  
3. Do not assume the working tree matches historical snippets.  
4. Read the actual files before editing.  
5. Preserve the architecture rules above.  
6. Use existing beta tests as regression tests.  
7. Prefer incremental changes.  
8. Test locally.  
9. Deploy only when appropriate.  
10. Verify critical production behavior.  
11. Record important architectural decisions or new regressions back into this file.

If a requested change conflicts with:

- tenant isolation  
- deterministic date math  
- evidence-backed AI  
- human review  
- reminder idempotency  
- secret safety

stop and resolve the conflict before implementing it.

---

## 43\. Working style for Raj

When helping Raj build RenewAI:

- Be concrete and hands-on.  
- Prefer step-by-step execution for complex tasks.  
- If the next 2–3 steps are simple, group them together.  
- Avoid overwhelming checklists unless explicitly requested.  
- For code, use snippets for small changes and full files for large changes.  
- State exactly what should happen after each test.  
- Distinguish clearly between local success and production success.  
- Do not ask unnecessary questions when the next action is obvious.  
- Do not expose or repeat credentials.  
- When something is uncertain, verify it from the repository, Supabase, Render, Vercel, or existing project files rather than guessing.

---

## 44\. Definition of a trustworthy RenewAI change

A change is not “done” merely because code compiles.

For meaningful changes, done means:

- requirement understood  
- smallest correct implementation  
- existing behavior preserved  
- build/tests pass  
- relevant edge case tested  
- security implications checked  
- production behavior verified where applicable  
- user-facing UX is understandable  
- no secrets exposed  
- documentation updated when architecture or operations changed

---

## 45\. Final product north star

The product should not be judged by how sophisticated its AI sounds.

Judge it by whether a company can:

1. upload a contract,  
2. trust the extracted terms,  
3. know exactly when action is required,  
4. understand the commercial risk,  
5. decide what to do,  
6. act before money is unnecessarily committed,  
7. measure the result.

**Build the smallest useful thing. Prove the savings. Then automate the procurement employee.**

&nbsp;
