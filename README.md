# RenewAI

RenewAI turns SaaS and service contracts into trustworthy renewal decisions. It extracts contractual and commercial terms, lets a human review them, calculates the next actionable renewal deadline deterministically, and supports evidence-backed recommendations, reminders, and renewal decisions.

> RenewAI recommends. The organization decides.

## Current status

RenewAI is a production-deployed private beta in launch-readiness hardening.

- Frontend: https://renewai-psi.vercel.app
- Backend: https://renewai-ai.onrender.com
- Health check: https://renewai-ai.onrender.com/health

The documented BETA-001 through BETA-032 regression campaign has passed. The eight-character password policy is deployed and production-verified. Current launch work focuses on beta recruitment and onboarding, with monitoring and continued reliability checks.

Raj maintains a local, private AGENTS.md with product decisions, architecture invariants, testing history, and current priorities. It is intentionally excluded from Git; collaborators should request the current copy before making substantial changes.

## Product workflow

```text
Upload PDF
  -> AI extraction
  -> Human review
  -> Trusted contract record
  -> Deterministic renewal calculations
  -> Evidence and commercial intelligence
  -> AI recommendation
  -> Human renewal decision
  -> Work queue, reminders, and audit history
```

Important behavior:

- Unknown contract terms remain unknown; missing values are not invented.
- AI-extracted fields are provisional until reviewed and saved by a user.
- AI interprets contractual language, while deterministic code owns date arithmetic.
- Recommendations and human renewal decisions remain separate.
- Organization access is derived from the authenticated user, not a client-supplied organization ID.

## Architecture

```text
Browser
  |-- Next.js frontend (Vercel)
  |     `-- Supabase Auth
  |
  `-- Authenticated requests
        `-- FastAPI backend (Render)
              |-- Supabase PostgreSQL + RLS
              |-- Groq contract intelligence
              `-- Resend email delivery

Supabase Cron + pg_net
  `-- protected FastAPI reminder endpoint
        `-- due-reminder processing and email delivery
```

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase browser client
- Vercel hosting

### Backend

- FastAPI
- Python
- Supabase Python client
- PyMuPDF contract text extraction
- Groq through an OpenAI-compatible API
- Resend email delivery
- Render hosting

### Data and authentication

- Supabase Auth
- PostgreSQL
- Row Level Security
- Organization/workspace-based multi-tenancy

Tenant-owned records must always be scoped through:

```text
authenticated user -> organization_members -> organization_id -> records
```

### Reminder scheduling

Production has one reminder scheduler:

```text
Supabase Cron
  -> pg_net POST
  -> Render /internal/process-reminders
  -> process_due_reminders()
  -> Resend
  -> atomically record provider acceptance and reminder status
```

Keep `ENABLE_REMINDER_SCHEDULER=false` on the Render web service unless this architecture is intentionally replaced.

Cron and manual sends share organization-scoped eligibility checks, durable
delivery claims, frozen payloads, and provider idempotency keys. Past deadlines
and obsolete checkpoints are excluded. Unconfirmed outcomes outside the safe
retry window require review. Provider acceptance is distinct from inbox delivery.
Apply `backend/migrations/20261015_reminder_delivery_safety.sql` before releasing
this dispatcher; reconcile ambiguous legacy sends first. See the
[delivery operations guide](docs/reminder-delivery.md) for release order, recovery,
sender-domain requirements, rollback precautions and real PostgreSQL tests.

## Repository layout

```text
renewai/
├── AGENTS.md                 Product and engineering operating manual
├── README.md                 Repository overview and setup
├── backend/
│   ├── main.py               FastAPI application and routes
│   ├── contract_ai.py        Contract extraction and AI intelligence
│   ├── renewal_engine.py     Deterministic renewal calculations
│   ├── database.py           Organization-scoped persistence
│   ├── reminder_scheduler.py Reminder generation and dispatch
│   └── email_service.py      Resend integration
└── frontend/
    ├── app/                  Next.js App Router pages
    ├── components/           Shared interface components
    └── lib/                  Supabase and authenticated API helpers
```

The base database schema and production infrastructure configuration are managed externally in Supabase, Render, and Vercel. Incremental backend migrations are checked in under `backend/migrations/`; the complete base schema is not included.

### Contract save and AI analysis

`POST /contracts/save` recalculates reviewed renewal terms, persists the contract with
`ai_analysis_status=pending`, and creates reminders. It never calls the AI provider.
Reminder creation failures return a successful save with a separate recovery warning.
The frontend requests AI analysis after receiving the saved contract ID.

`POST /contracts/{contract_id}/ai-insight` generates or retries analysis for an active,
organization-owned contract. It stores `completed` atomically with the insight, or
`failed` if analysis fails. The latter returns HTTP 503 for the analysis request with
`contract_saved=true`, `retryable=true`, the saved `database_id`, and a friendly
`detail` message. It never inserts another contract, recalculates dates, or creates
reminders. Contract reads include the persisted status; completed insights are reused.
Pending includes work not yet requested and interrupted attempts; it is not a queued
job. Retrying uses the same endpoint. If database writes are unavailable, recording
failure is best effort; the existing contract remains saved and retryable.

Before deploying this backend, apply
`backend/migrations/20261015_contract_ai_analysis_status.sql` to Supabase. It adds one
status column and marks existing populated insights as completed. Existing records
without an insight start pending because prior failures cannot be inferred. Apply
the migration before the code release; older code ignores the added column. For a
rollback, restore the older backend first; the added column can remain in place.

## Local development

### Prerequisites

- Node.js 20.9 or newer
- npm
- Python 3.14-compatible environment
- A Supabase project with the required schema and RLS policies
- Groq credentials for contract analysis, or an Ollama model for supported local experimentation

### Frontend

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

Set the frontend environment variables before starting:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_URL` — normally `http://127.0.0.1:8000` locally

Only public browser-safe values belong in `NEXT_PUBLIC_*` variables.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn main:app --reload
```

The local API runs at http://127.0.0.1:8000 by default.

Backend environment variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `ALLOWED_ORIGINS`
- `AI_PROVIDER`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `OLLAMA_MODEL` — optional local fallback
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `EMAIL_PROVIDER` — `resend` by default; optional `gmail` service sender
- `GMAIL_SENDER_ADDRESS`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` — Gmail only, server-side secrets
- `ENABLE_REMINDER_SCHEDULER`
- `CRON_SECRET`

Never commit populated environment files or copy secrets into documentation, logs, frontend code, or public environment variables.

An optional [temporary Gmail sender](docs/gmail-sender.md) uses the Gmail HTTPS
API with sending and basic identity permissions. It requires a dedicated account,
Google OAuth setup and `20261016_gmail_delivery.sql` before activation. Gmail
attempts get one durable dispatch reservation; uncertain outcomes require review
instead of automatic resend. Existing Resend delivery remains the default.

## Validation

Run frontend checks from `frontend/`:

```bash
npm run lint
npm run build
```

The backend has a small committed Python unittest suite. Run it from backend/ with python -m unittest discover -p 'test_*.py' when dependencies are installed. The historical beta test set described in the private AGENTS.md remains an important regression reference and should be preserved rather than reconstructed from memory.

For meaningful changes, also test the relevant workflow manually. Production verification is required for changes involving authentication, deployment, reminders, CORS, API routing, tenant isolation, or other production-only configuration.

Security-sensitive changes should retest at least:

- Account A cannot list, open, edit, or archive Account B contracts.
- Account A cannot list Account B reminders.
- Direct foreign contract URLs do not reveal another tenant's data.
- Settings and member endpoints remain organization-scoped.
- The reminder cron endpoint rejects missing or invalid credentials.
- Secrets do not appear in frontend output or logs.

## P0 error handling and recovery

Permanent contract deletion now uses a backend-only atomic database function so a
later failure cannot leave a surviving contract without its reminders or decision
history. Apply `backend/migrations/20261016_atomic_contract_delete.sql` before the
backend release. See [contract data safety](docs/contract-data-safety.md) for
workspace-access coverage, release checks and rollback limitations.

API failures use friendly messages rather than provider/database exception text.
The browser also filters error responses, including HTML gateway responses and
errors from older API revisions. Safe GET/HEAD requests retry temporary
500/502/503/504 failures; writes are not automatically retried after a network or
server failure. An uncertain save directs the user to check Contracts first.

Contract saving and reminder creation remain separate from AI insight generation.
The contract page reads persisted `ai_analysis_status` after refresh, offers an
explicit AI retry, and retains the saved dates and reminder timeline. Pending
means analysis has not completed; it does not imply a background worker is running.

Run `npm test`, `npm run lint`, and `npm run build` in `frontend/`, and
`python -m unittest discover -p 'test_*.py'` in `backend/`. Failure-path tests use
an isolated in-memory database and mocked providers; they do not require live
Supabase, AI, or email credentials. They cover provider failure, same-record AI
retry, unchanged reminders, expired sessions, private error suppression,
validation privacy, and duplicate-save recovery.

## Shareable contract summary PDF

Saved contract pages include **Download summary PDF**. The authenticated,
organization-scoped `GET /contracts/{contract_id}/summary.pdf` endpoint exports
reviewed terms, saved renewal dates and notice requirements, full saved commercial
clauses, existing advisory AI insight, the recorded decision/status, and the saved
non-cancelled reminder schedule. Internal decision notes, owner, history, recipient
details, and arbitrary database fields are excluded. The response is a private,
non-cacheable PDF attachment; no public sharing link is created.

The PDF uses existing PyMuPDF support, with no new dependency, schema migration,
AI call, contract update, or reminder send. It works without AI insight. Missing
details are marked **Not recorded**; the customer name is not currently stored as
a separate field. Full clause text can span multiple pages. Dates describe the
saved calculation snapshot; the days remaining are calculated at export time in
UTC, and a past deadline prompts review rather than appearing actionable.

## Deployment

- Pushes to the production-linked branch deploy the frontend through Vercel.
- The FastAPI backend is hosted on Render.
- Supabase owns PostgreSQL, Auth, RLS, Cron, pg_net, and Vault configuration.
- Production reminder processing must continue to use the single protected Supabase Cron path.

Before calling a release complete:

1. Confirm a clean Git status.
2. Run frontend lint and production build.
3. Verify backend health.
4. Smoke-test the affected production workflow.
5. Run tenant-isolation checks after security-sensitive changes.
6. Record material architecture, security, testing, or product decisions in `AGENTS.md`.

## Product boundaries

RenewAI is contract and renewal intelligence—not legal advice, a generic chatbot, a full contract lifecycle management suite, or an autonomous procurement system. Sensitive actions remain human-approved.

Features intentionally outside the current MVP include automatic contract cancellation, autonomous vendor negotiation, enterprise SSO, a large integration catalog, custom LLM training, a complex procurement workflow engine, a mobile app, and full CLM replacement.
