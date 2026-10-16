# Reminder delivery operations

## Delivery contract

This guide describes the default Resend transport. The optional Gmail transport
has a stricter single-dispatch policy and separate setup/migration; see
[temporary Gmail sender](gmail-sender.md). It does not use Resend's retry window
as authorization to repeat a Gmail send.

Supabase Cron is the production scheduler. Its protected POST to
`/internal/process-reminders` and the authenticated `/reminders/send-due` action
use the same dispatcher. Keep `ENABLE_REMINDER_SCHEDULER=false` on Render.
The current daily schedule is 03:30 UTC (09:00 India time), with a health warmup
five minutes earlier. A successful Cron SQL job only proves that pg_net queued
the request: inspect `net._http_response` and the backend run log as well.
Partial or failed processing returns HTTP 500. Do not invoke the protected route
as a smoke test: it sends real emails.

Only pending checkpoints for an active contract in the same organization may
send. Dates use UTC. An overdue checkpoint remains eligible through its current
cancellation deadline, provided its date still equals that deadline minus its
90/60/30/14/7-day offset. Past deadlines, obsolete checkpoints, unavailable
contracts and archived contracts are skipped. Both entry points address the
workspace owner, with a deterministic member fallback for older workspaces that
have members but no owner role. A workspace without members fails with a friendly
recipient error. Membership is never created or reassigned automatically.

Before the provider request, a service-only PostgreSQL function locks the
contract, reminder and delivery journal in that order, revalidates eligibility,
then reserves a five-minute claim. This handles concurrent Cron/manual workers.
The journal freezes the first email payload and uses one provider idempotency key:
`renewai-reminder/<reminder UUID>`. Retries reuse both. A changed recipient or
changed checkpoint snapshot requires review instead of sending stale content.
The email includes a `renewai_reminder_id` provider tag for reconciliation.

A provider acceptance receipt and `contract_reminders.status=sent` are recorded
in one transaction. The dispatcher retries that receipt write up to three times.
`sent` means accepted by the provider; it does not establish inbox delivery.
An archive prevents a new claim, but cannot retract an already dispatched email.

Resend idempotency keys have a 24-hour lifetime. This implementation permits
retries for 23 hours after the first claim, leaving a one-hour margin. An expired
claim can be recovered within that window using the same payload/key. After the
window, an unconfirmed attempt becomes `needs_review`; it must never silently
get a new key. With a once-daily schedule, the next daily run can already be outside
that recovery window. Investigate failures promptly and use a manual retry within
the window when appropriate. This is duplicate-resistant delivery, not an
unconditional exactly-once or guaranteed inbox-delivery promise.

## Release order

1. Inspect the latest scheduled run, provider logs and pending reminders. The
   earlier sender had no durable idempotency journal. Pending legacy records
   whose provider outcome is unknown must be reconciled before their first new
   claim; the migration cannot determine whether an old request was accepted.
   Do not reset their status or blindly resend them.
2. Deploy outside the scheduled processing window after any running worker has
   finished. Apply `backend/migrations/20261015_reminder_delivery_safety.sql`
   before releasing the backend. It creates a private journal and three
   service-only functions; it sends no emails and changes no historical contract
   or reminder rows. The migration is transactional and repeatable.
3. Verify the journal has RLS enabled, ordinary browser roles have no grants or
   function execution privileges, and the service role can access the functions.
   Confirm the existing unique constraint on `(contract_id, reminder_type)`.
4. Release the backend, then the frontend. If the migration is missing, dispatch
   fails before contacting the provider. The Alerts page pauses sending when the
   delivery-health read is unavailable.
5. Check backend health, authenticated Alerts loading, delivery-health counts,
   unauthorized access, and the next scheduled run's actual HTTP response and
   structured summary. Check provider delivery events separately. Avoid a manual
   production send merely to prove deployment.

Use a verified domain in the connected Resend account and set `EMAIL_FROM` to an
address on that domain before promising delivery to other users. The default
`onboarding@resend.dev` sender is restricted to the service account owner. The
Alerts page displays a warning for this test sender. Domain registration, DNS
changes, and changing production recipients require an explicit operational
decision; the code does not perform them.

## Recovery and evidence

`GET /reminders/delivery-health` returns organization-scoped counts for processing,
retryable, needs-review and accepted attempts plus a test-sender flag. It excludes
email payloads and recipient details. Expired leases appear retryable; expired
safe retry windows appear as needing review even before another send attempt.

Backend logs include `REMINDER_RUN_START`, `REMINDER_RUN_COMPLETE`,
`REMINDER_ORG_COMPLETE`, `REMINDER_ACCEPTED`, `REMINDER_SKIPPED` and
`REMINDER_DELIVERY_FAILED`, with run, organization and reminder IDs. Failure codes
and exception class names are logged; raw provider errors, credentials and email
addresses are not. A missing recipient logs `REMINDER_RECIPIENT_FAILED`.

For an unconfirmed attempt:

1. Inspect its private journal, attempt time, provider logs, reminder tag,
   idempotency key, frozen recipient and provider events using an authorized
   service/admin session. Keep that payload private.
2. If the provider accepted it, verify the receipt belongs to this exact reminder
   and use `complete_reminder_delivery(organization_id, reminder_id, current
   claim_token, verified_provider_email_id)` to record acceptance without another
   provider request. Check the boolean result and saved receipt. Do not invent a
   receipt or use one from another reminder.
3. If the outcome is uncertain and the safe retry window is still open, a retry
   uses the same key and frozen payload. If the recipient changed, first resolve
   the original delivery; do not send it to a former owner.
4. After the safe window, leave automatic resending paused and reconcile with the
   provider. There is deliberately no automatic journal reset or override. Any
   separately authorized replacement after proving non-delivery needs an audited
   operational decision. Do not change `first_attempt_at`, delete the journal, or
   create a different key as a blind recovery shortcut.

Historical/obsolete pending checkpoints are excluded, rather than deleted or
silently moved into another renewal cycle. Review contractual dates before
creating replacement alerts. This change does not implement cycle editing or
automatic legacy cleanup.

For rollback, pause the scheduled dispatch and finish in-flight requests before
changing sender code. Restoring the old unkeyed sender would reintroduce duplicate
risk. Prefer keeping the safe dispatcher or temporarily disabling dispatch. The
new private journal/functions can remain; do not drop delivery evidence.

## Local verification

Run the normal backend unittest suite with synthetic configuration and mocked
providers. The opt-in SQL suite executes the actual migration and concurrent
claims against PostgreSQL. It requires the test-only `psycopg` driver and refuses
anything except a loopback database named `renewai_reminder_test`:

```sh
RENEWAI_TEST_POSTGRES_URL=postgresql://localhost/renewai_reminder_test \
  python -m unittest test_reminder_delivery_postgres
```

That database is disposable: these tests create minimal tables/roles, apply the
migration and truncate its fixture data. Never point this suite at a shared or
production database. No provider email is sent by the tests.
