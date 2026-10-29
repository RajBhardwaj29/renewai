# Contract access and deletion safety

Contract routes derive the workspace from the authenticated account's membership.
A supplied workspace ID must not override that context. Foreign and nonexistent
contract IDs return the same unavailable response before exporting data, requesting
AI or mutating records.

Permanent deletion uses one backend-only database transaction. The function locks
the owned contract, removes its reminders and human decision history, then deletes
the contract. Existing reminder-journal foreign keys remove dependent journal rows.
Any database error rolls back the whole operation. An HTTP timeout can still leave
the client uncertain after a committed deletion: refresh Contracts before retrying.
Already accepted external emails cannot be recalled by deleting a contract.

## Deployment

1. Check the intended project, database schema and release revision. Confirm the
   existing `reminder_deliveries.reminder_id` foreign key cascades on reminder deletion.
2. Apply `backend/migrations/20261016_atomic_contract_delete.sql` before this backend.
   The migration creates/replaces a function and grants only the service role access;
   it deletes no records and changes no table data.
3. Verify the function's pinned search path, denied anonymous/authenticated execution
   and allowed service-role execution. Check that record counts are unchanged.
4. Deploy the backend. The public delete endpoint and existing UI confirmation stay
   the same. A successful response includes the deleted contract ID. Duplicate route
   registration has been removed.
5. Verify health and read-only authenticated access. Do not delete real production
   contracts to manufacture a smoke test. Any production delete needs a specifically
   authorized disposable record and the normal confirmation process.

The new backend deliberately has no fallback to separate deletes. A missing RPC
fails safely instead of partially deleting dependent data. A code rollback may
leave the function installed; removing it is unnecessary. Rolling back the backend
reintroduces the old partial-deletion risk. Database restores/backups and retention
policy are separate operational concerns, not implemented by this change.

## Local verification

`test_contract_data_safety.py` uses two synthetic accounts and memberships with the
real API authentication-context resolver and an isolated in-memory service client.
It covers active/archived lists, direct IDs, PDF/history/reminder reads, archive,
restore, decision attribution, AI access boundaries and deletion. Unknown sessions
and accounts without workspaces are denied. Supplied workspace/identity fields
cannot change the authenticated context.

`test_contract_delete_postgres.py` uses the guarded disposable loopback PostgreSQL
database from the existing integration suite. It applies the migration twice,
checks role permissions and eight concurrent deletions, verifies foreign/missing
IDs do nothing, and forces failures after dependent deletes and at final deletion
to prove full rollback, including delivery-journal records. A trigger that suppresses
final deletion must also roll back rather than report success.

These tests do not certify live Supabase authentication settings or every base-table
RLS policy. They make no production data changes, send no email and use no live AI.

## October 29 security and evidence batch (local, unreleased)

See [upload security and clause evidence](security-evidence-foundation.md) for the
confirmed membership self-enrollment policy flaw, the independently releasable
browser-write lockdown, bounded PDF processing, source-quote schema, tests and
database-first release order. Production remains unchanged until release.
