# Temporary Gmail reminder sender

This option uses one operator-authorized Gmail mailbox for outbound reminders.
Customers still receive reminders at their normal workspace-owner address. No
custom domain, SMTP connection, mailbox password or inbox-reading scope is needed.
It uses the existing `requests` dependency. Resend remains the default until
`EMAIL_PROVIDER=gmail` is explicitly configured.

## Connect the dedicated mailbox

1. Create the Gmail mailbox and complete Google's account checks directly.
   Do not share its password with an agent or store it in the application.
2. Use a dedicated Google Cloud project, enable the Gmail API, and configure its
   OAuth consent screen. Do not add billing or activate a paid trial for this setup.
   The operator must complete any Google terms/consent prompts personally.
3. For initial testing, add the sender mailbox as an OAuth test user. Create an
   OAuth client of type **Desktop app** and download its JSON into a private
   directory outside this repository. Restrict the file to its owner. Never
   paste the JSON, client secret or token into chat, a PR or a screenshot.
4. Run the local authorization helper with the dedicated mailbox address:

   ```sh
   cd backend
   python tools/connect_gmail.py \
     --client-json /private/path/client.json \
     --email sender@gmail.com \
     --output /private/path/gmail-sender.env
   ```

   Open the printed Google authorization URL in the browser. The owner chooses
   the dedicated mailbox and grants **Send email on your behalf** plus basic
   email identity. No permission to read, modify or delete inbox messages is
   requested. The local helper uses PKCE, a random state and a loopback callback,
   verifies the actual account, and writes a new mode-0600 file outside the repo.
   It never sends an email or prints a refresh token. It refuses a different
   sender account, broader Gmail permissions and overwriting an existing file.
5. Put the generated `GMAIL_*` values into the backend host's secret environment
   settings directly. Keep `EMAIL_PROVIDER=resend` until the migration/code and
   authorization are ready. No credential belongs in a `NEXT_PUBLIC_*` setting.

Google OAuth apps in **Testing** issue refresh tokens that expire after seven
days for these Gmail permissions. This is a temporary option: reconnect as needed,
or complete Google's appropriate production/personal-use setup before relying on
it unattended. Gmail account sending limits and Google's policies still apply;
this is not unlimited or a bulk-mail service. Token presence in delivery health
means configured, not a live verification of an unrevoked Google grant.

## Release and activate

Apply `backend/migrations/20261016_gmail_delivery.sql` after the existing reminder
safety migration and before deploying this code. It adds `dispatched_at` and a
service-only Gmail reservation function, and extends existing claim/failure
functions. It sends no emails and changes no historical reminder status. Its
application is repeatable. Verify service-only access and record counts.

Deploy the tested backend/frontend with Resend still selected, install the private
Gmail settings, then explicitly switch `EMAIL_PROVIDER=gmail`. The sender address
must match the verified Google account. Missing/revoked credentials stop before a
Gmail send; an unconfigured sender disables the manual action on Alerts. Gmail
OAuth and send requests use fixed HTTPS endpoints, certificate validation,
timeouts, no redirects and no automatic POST retries.

Before activation, inspect pending journal entries. A previously attempted event
cannot silently change providers, sender or recipient. Existing accepted Resend
events remain accepted and are not sent again. There is no automatic fallback
from Gmail to Resend or the reverse. Test an expressly authorized synthetic email
to an agreed recipient before relying on customer delivery; do not run the
production reminder endpoint just to smoke-test setup.

## Gmail delivery and recovery

Gmail's send API has no Resend-style request idempotency key. A stable MIME
`Message-ID` is a tracing aid, not a duplicate-prevention promise. Each Gmail
event therefore receives a durable `dispatched_at` marker **before** its one
provider POST. Concurrent workers must win that reservation once. A worker crash,
lost reservation response, rejected/uncertain send, malformed acceptance or failed
receipt write must not trigger another automatic Gmail request.

Credentials and MIME validation happen before that marker, so a pre-dispatch
authentication failure remains retryable within the existing claim window.
The reservation rechecks the tenant, active contract, saved deadline, pending
status, current lease and claim token immediately before dispatch. If the lease
expires after the marker, the event requires review instead of lease recovery.
After provider acceptance, receipt/status persistence is retried without another
Gmail send. Acceptance is recorded as `gmail:<Gmail message id>`; it does not
alone prove inbox delivery.

For an unconfirmed attempt, inspect the dedicated Gmail Sent folder and the
stable message ID from the frozen event. With a verified matching Gmail message
ID, an authorized operator can use the existing `complete_reminder_delivery`
function to record `gmail:<id>` and mark sent without sending again. Do not invent
a receipt, clear `dispatched_at`, delete the journal or switch providers to bypass
review. A crash between reservation and POST can hold an unsent message for review;
that conservative tradeoff prevents a duplicate after an unknown outcome.

Keep Google token/recipient/payload details out of logs and reports. Backend logs
use event IDs, static failure codes and exception classes. No public OAuth callback
or customer Gmail connection feature is added; this is a service sender only.

For rollback, retain the migration and delivery evidence. Change providers only
after reconciling pending events, and do not roll back to code that ignores the
Gmail dispatch marker. See [reminder operations](reminder-delivery.md).

Sources: [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending),
[desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
[token expiry](https://developers.google.com/identity/protocols/oauth2#expiration).
