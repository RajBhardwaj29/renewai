"""Two-workspace API boundaries with real authentication-context resolution.

All accounts, records and transport implementations here are synthetic/local.
The PostgreSQL companion tests verify transaction and permission behavior.
"""
from copy import deepcopy
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import test_contract_save_flow as fixture
from test_contract_summary import sample_contract

main, database = fixture.main, fixture.database


class Query(fixture.MemoryQuery):
    def __init__(self, db, table):
        super().__init__(db, table)
        self.extra_filters = []
        self.join_contract = False

    def select(self, columns):
        self.join_contract = 'contracts (' in columns
        return self

    def order(self, *_args, **_kwargs):
        return self

    def neq(self, key, value):
        self.extra_filters.append(lambda row: row.get(key) != value)
        return self

    def gte(self, key, value):
        self.extra_filters.append(lambda row: row.get(key, '') >= value)
        return self

    def execute(self):
        # A filtered view preserves shared records for ordinary updates.
        result = super().execute()
        result.data = [row for row in result.data if all(f(row) for f in self.extra_filters)]
        if self.join_contract:
            for row in result.data:
                row['contracts'] = next((deepcopy(c) for c in self.db.rows['contracts']
                                         if c['id'] == row['contract_id']), None)
        return result


class TwoWorkspaces(fixture.MemoryDatabase):
    def __init__(self):
        super().__init__()
        self.users = {f'token-{key}': SimpleNamespace(id=f'user-{key}', email=f'{key}@example.test')
                      for key in ('a', 'b', 'no-workspace')}
        self.auth = SimpleNamespace(get_user=lambda token: SimpleNamespace(user=self.users.get(token)))
        self.rows.update(organizations=[{'id': 'org-a', 'name': 'A', 'created_at': '2026-10-16'},
                                       {'id': 'org-b', 'name': 'B', 'created_at': '2026-10-16'}],
                         organization_members=[{'organization_id': f'org-{key}', 'user_id': f'user-{key}', 'role': 'owner'}
                                               for key in ('a', 'b')], contract_decision_history=[])
        self.rpc_calls = []
        for key in ('a', 'b'):
            contract = sample_contract()
            contract.update(id=f'contract-{key}', organization_id=f'org-{key}', vendor_name=f'PRIVATE VENDOR {key}')
            self.rows['contracts'].append(contract)
            self.rows['contract_reminders'].append({'id': f'reminder-{key}', 'organization_id': f'org-{key}',
                'contract_id': f'contract-{key}', 'status': 'pending', 'remind_on': '2030-01-01'})
            self.rows['contract_decision_history'].append({'id': f'history-{key}', 'organization_id': f'org-{key}',
                'contract_id': f'contract-{key}', 'created_at': '2026-10-16'})

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, params):
        def execute():
            self.rpc_calls.append((name, deepcopy(params)))
            if self.fail == ('rpc', name):
                raise RuntimeError('PRIVATE database failure')
            org, identifier = params['p_organization_id'], params['p_contract_id']
            owned = any(row['id'] == identifier and row['organization_id'] == org for row in self.rows['contracts'])
            if not owned:
                return SimpleNamespace(data=None)
            for table, id_key in [('contracts', 'id'), ('contract_reminders', 'contract_id'),
                                  ('contract_decision_history', 'contract_id')]:
                self.rows[table] = [row for row in self.rows[table]
                                    if not (row[id_key] == identifier and row['organization_id'] == org)]
            return SimpleNamespace(data=identifier)
        return SimpleNamespace(execute=execute)


class ContractDataSafetyTests(unittest.TestCase):
    def setUp(self):
        self.db = TwoWorkspaces()
        db_patch = patch.object(database, 'supabase', self.db)
        db_patch.start()
        self.addCleanup(db_patch.stop)
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        self.auth = {'Authorization': 'Bearer token-a'}

    def test_only_one_delete_route_is_registered(self):
        routes = [r for r in main.app.routes if getattr(r, 'path', None) == '/contracts/{contract_id}'
                  and 'DELETE' in getattr(r, 'methods', set())]
        self.assertEqual(len(routes), 1)

    def test_actual_auth_context_rejects_missing_invalid_and_workspace_less_sessions(self):
        for header, expected in [(None, 401), ('Basic token-a', 401), ('Bearer invalid', 401),
                                 ('Bearer token-no-workspace', 403)]:
            with self.subTest(header=header):
                response = self.client.get('/contracts', headers={'Authorization': header} if header else {})
                self.assertEqual(response.status_code, expected)
                self.assertNotIn('PRIVATE VENDOR', response.text)

    def test_lists_follow_authenticated_membership_and_ignore_supplied_organization(self):
        for key in ('a', 'b'):
            for archived in (False, True):
                self.db.rows['contracts'][0]['archived'] = archived
                self.db.rows['contracts'][1]['archived'] = archived
                response = self.client.get(f'/contracts?archived={str(archived).lower()}&organization_id=org-other',
                                           headers={'Authorization': f'Bearer token-{key}'})
                self.assertEqual(response.status_code, 200)
                self.assertEqual([r['id'] for r in response.json()['contracts']], [f'contract-{key}'])

    def test_foreign_and_missing_record_reads_are_indistinguishable(self):
        before = deepcopy(self.db.rows)
        for suffix in ('', '/summary.pdf', '/decision-history', '/reminders'):
            foreign = self.client.get(f'/contracts/contract-b{suffix}', headers=self.auth)
            missing = self.client.get(f'/contracts/missing{suffix}', headers=self.auth)
            self.assertEqual(foreign.status_code, 404)
            self.assertEqual(foreign.json(), missing.json())
            self.assertNotIn('PRIVATE VENDOR', foreign.text)
        self.assertEqual(self.db.rows, before)

    def test_foreign_mutations_do_not_change_records_call_ai_or_invoke_delete(self):
        before = deepcopy(self.db.rows)
        with patch.object(main, 'generate_renewal_ai_insight') as ai:
            for method, suffix, body in [('PATCH', '/archive', {}), ('PATCH', '/restore', {}),
                 ('PATCH', '/decision', {'renewal_decision': 'cancel', 'renewal_status': 'completed', 'organization_id': 'org-b'}),
                 ('POST', '/ai-insight', {}), ('DELETE', '', {})]:
                response = self.client.request(method, f'/contracts/contract-b{suffix}', headers=self.auth, json=body)
                self.assertEqual(response.status_code, 404, (method, suffix, response.text))
            ai.assert_not_called()
        self.assertEqual(self.db.rows, before)
        self.assertEqual(self.db.rpc_calls, [])

    def test_reminder_and_history_reads_are_scoped_to_the_owned_contract(self):
        for path, field in [('/reminders', 'reminders'), ('/contracts/contract-a/reminders', 'reminders'),
                            ('/contracts/contract-a/decision-history', 'history')]:
            response = self.client.get(path, headers=self.auth)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()[field])
            self.assertTrue(all(row['organization_id'] == 'org-a' for row in response.json()[field]))

    def test_archive_and_restore_leave_other_workspace_unchanged(self):
        foreign = deepcopy(self.db.rows['contracts'][1])
        archived = self.client.patch('/contracts/contract-a/archive', headers=self.auth)
        self.assertEqual(archived.status_code, 200)
        self.assertTrue(archived.json()['contract']['archived'])
        self.assertEqual(self.db.rows['contract_reminders'][0]['status'], 'cancelled')
        restored = self.client.patch('/contracts/contract-a/restore', headers=self.auth)
        self.assertEqual(restored.status_code, 200)
        self.assertFalse(restored.json()['contract']['archived'])
        self.assertEqual(self.db.rows['contracts'][1], foreign)
        self.assertEqual(self.db.rows['contract_reminders'][1]['status'], 'pending')

    def test_decision_uses_verified_identity_and_does_not_change_other_workspace(self):
        response = self.client.patch('/contracts/contract-a/decision', headers=self.auth, json={
            'renewal_decision': 'renegotiate', 'renewal_status': 'decision_made', 'changed_by_user_id': 'user-b',
            'changed_by_email': 'b@example.test', 'organization_id': 'org-b'})
        self.assertEqual(response.status_code, 200)
        history = self.db.rows['contract_decision_history'][-1]
        self.assertEqual(history['organization_id'], 'org-a')
        self.assertEqual(history['changed_by_user_id'], 'user-a')
        self.assertEqual(history['changed_by_email'], 'a@example.test')
        self.assertEqual(self.db.rows['contracts'][1]['renewal_decision'], 'undecided')

    def test_delete_calls_one_scoped_transaction_and_repeat_is_unavailable(self):
        foreign = deepcopy(self.db.rows['contracts'][1])
        response = self.client.delete('/contracts/contract-a?organization_id=org-b', headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['contract_id'], 'contract-a')
        self.assertEqual(self.db.rpc_calls, [('delete_contract_atomically', {
            'p_organization_id': 'org-a', 'p_contract_id': 'contract-a'})])
        self.assertEqual(self.db.rows['contracts'], [foreign])
        self.assertEqual([r['id'] for r in self.db.rows['contract_reminders']], ['reminder-b'])
        self.assertEqual([r['id'] for r in self.db.rows['contract_decision_history']], ['history-b'])
        self.assertEqual(self.client.delete('/contracts/contract-a', headers=self.auth).status_code, 404)
        self.assertEqual(len(self.db.rpc_calls), 1)

    def test_delete_failure_is_private_and_directs_status_check_without_automatic_retry(self):
        before = deepcopy(self.db.rows)
        self.db.fail = ('rpc', 'delete_contract_atomically')
        response = self.client.delete('/contracts/contract-a', headers=self.auth)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()['code'], 'delete_status_unknown')
        self.assertIn('Refresh Contracts', response.json()['detail'])
        self.assertFalse(response.json()['retryable'])
        self.assertNotIn('PRIVATE', response.text)
        self.assertEqual(self.db.rows, before)
        self.assertEqual(len(self.db.rpc_calls), 1)


if __name__ == '__main__':
    unittest.main()
