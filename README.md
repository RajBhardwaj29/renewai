# RenewAI

RenewAI turns SaaS and service contracts into trustworthy renewal decisions. It extracts contractual and commercial terms, lets a human review them, calculates the next actionable renewal deadline deterministically, and supports evidence-backed recommendations, reminders, and renewal decisions.

> RenewAI recommends. The organization decides.

## Current status

RenewAI is a production-deployed private beta in launch-readiness hardening.

- Frontend: https://renewai-psi.vercel.app
- Backend: https://renewai-ai.onrender.com
- Health check: https://renewai-ai.onrender.com/health

The documented BETA-001 through BETA-032 regression campaign has passed. The eight-character password UI is deployed and verified; a real seven-character rejection and eight-character account-creation check still needs a dedicated production test email. Before a broader external beta, the remaining work also includes observation of a scheduled reminder run, a verified email sender/domain, beta onboarding, and a clean release checkpoint.

For product decisions, architecture invariants, security history, testing history, and current priorities, read [`AGENTS.md`](./AGENTS.md) before making changes.

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
  -> mark successfully delivered reminders as sent
```

Keep `ENABLE_REMINDER_SCHEDULER=false` on the Render web service unless this architecture is intentionally replaced.

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

The database schema and production infrastructure configuration are managed externally in Supabase, Render, and Vercel; migration and infrastructure-as-code files are not currently included in this repository.

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
- `ENABLE_REMINDER_SCHEDULER`
- `CRON_SECRET`

Never commit populated environment files or copy secrets into documentation, logs, frontend code, or public environment variables.

## Validation

Run frontend checks from `frontend/`:

```bash
npm run lint
npm run build
```

There is not yet a committed automated unit or integration test suite. The historical beta test set described in `AGENTS.md` is the current regression reference and should be preserved rather than reconstructed from memory.

For meaningful changes, also test the relevant workflow manually. Production verification is required for changes involving authentication, deployment, reminders, CORS, API routing, tenant isolation, or other production-only configuration.

Security-sensitive changes should retest at least:

- Account A cannot list, open, edit, or archive Account B contracts.
- Account A cannot list Account B reminders.
- Direct foreign contract URLs do not reveal another tenant's data.
- Settings and member endpoints remain organization-scoped.
- The reminder cron endpoint rejects missing or invalid credentials.
- Secrets do not appear in frontend output or logs.

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
