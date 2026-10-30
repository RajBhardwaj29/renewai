"""Concurrent requests share one ASGI loop; no network or live credentials."""
import asyncio
import json
import logging
from threading import Barrier, Event, get_ident
import unittest
from unittest.mock import patch

import httpx
import pymupdf
import test_contract_save_flow as fixture
from test_contract_ai import make_contract
from test_contract_data_safety import TwoWorkspaces
from test_contract_summary import sample_contract
import latency_observability as timings
import pilot_observability as signals

main, database = fixture.main, fixture.database


class ConcurrentRequestTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        document = pymupdf.open()
        document.new_page().insert_text((72, 72), 'Synthetic agreement for concurrency testing.')
        self.pdf = document.tobytes()
        document.close()
        self.patches = [
            patch.object(main, 'get_authenticated_context', return_value={'organization_id': 'org-a'}),
            patch.object(main, 'ensure_contract_not_duplicate'),
            patch.object(main, 'extract_contract_data', return_value=make_contract()),
            patch.object(main, 'calculate_renewal_intelligence', return_value={}),
            patch.object(main, 'save_contract', return_value={'id': 'synthetic', 'ai_analysis_status': 'pending'}),
            patch.object(main, 'get_contract_by_id', return_value=sample_contract()),
            patch.object(main, 'get_contract_reminders', return_value=[]),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://isolated')
        self.addAsyncCleanup(self.client.aclose)

    async def upload(self, path):
        return await self.client.post(path, headers={'Authorization': 'Bearer synthetic'},
            files={'file': ('synthetic.pdf', self.pdf, 'application/pdf')},
            data={'contract_json': make_contract().model_dump_json()})

    async def check_responsive(self, path, function, result):
        started, release, finished = Event(), Event(), Event()
        def blocked(*_args, **_kwargs):
            started.set()
            try:
                release.wait(2)
                return result
            finally:
                finished.set()
        with patch.object(main, function, side_effect=blocked):
            request = asyncio.create_task(self.upload(path) if path.startswith('/contracts/a') or path == '/contracts/save'
                                          else self.client.get(path))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 2))
                self.assertFalse(finished.is_set(), 'Synchronous work blocked the ASGI loop')
                health = await asyncio.wait_for(self.client.get('/health'), timeout=1)
                self.assertEqual(health.status_code, 200)
                self.assertFalse(finished.is_set(), 'Health waited for the unrelated slow operation')
            finally:
                release.set()
                response = await request
            self.assertEqual(response.status_code, 200)

    async def test_analyze_database_and_ai_waits_do_not_block_health(self):
        for function, result in [('ensure_contract_not_duplicate', None), ('extract_contract_data', make_contract())]:
            with self.subTest(function=function):
                await self.check_responsive('/contracts/analyze', function, result)

    async def test_save_database_waits_do_not_block_health(self):
        for function, result in [('ensure_contract_not_duplicate', None),
                ('save_contract', {'id': 'synthetic', 'ai_analysis_status': 'pending'})]:
            with self.subTest(function=function):
                await self.check_responsive('/contracts/save', function, result)

    async def test_export_database_waits_do_not_block_health(self):
        for function, result in [('get_authenticated_context', {'organization_id': 'org-a'}),
                ('get_contract_by_id', sample_contract()), ('get_contract_reminders', [])]:
            with self.subTest(function=function):
                await self.check_responsive('/contracts/synthetic/summary.pdf', function, result)

    async def test_pymupdf_extraction_and_export_stay_on_event_loop_thread(self):
        expected = get_ident()
        extract, render = main.extract_pdf_pages, main.build_contract_summary
        seen = []
        def extraction(*args):
            seen.append(get_ident())
            return extract(*args)
        def export(*args):
            seen.append(get_ident())
            return render(*args)
        with patch.object(main, 'extract_pdf_pages', side_effect=extraction), \
                patch.object(main, 'build_contract_summary', side_effect=export):
            for path in ['/contracts/analyze', '/contracts/save']:
                self.assertEqual((await self.upload(path)).status_code, 200)
            self.assertEqual((await self.client.get('/contracts/synthetic/summary.pdf')).status_code, 200)
        self.assertEqual(seen, [expected, expected, expected])

    async def test_overlapping_upload_workers_keep_separate_request_and_workspace_contexts(self):
        barrier = Barrier(2)
        def provider(_text):
            barrier.wait(timeout=2)
            return make_contract()
        async def upload_for(account):
            return await self.client.post('/contracts/analyze', headers={'Authorization': 'Bearer ' + account},
                files={'file': ('synthetic.pdf', self.pdf, 'application/pdf')})
        with patch.object(main, 'get_authenticated_context', side_effect=lambda header: {'organization_id': header}), \
                patch.object(main, 'extract_contract_data', side_effect=provider), \
                self.assertLogs(signals.logger, logging.INFO) as captured:
            responses = await asyncio.gather(upload_for('a'), upload_for('b'))
        self.assertEqual([r.status_code for r in responses], [200, 200])
        extracted = [json.loads(r.getMessage()) for r in captured.records if json.loads(r.getMessage())['event'] == 'extraction']
        self.assertEqual(len(extracted), 2)
        self.assertEqual(len({e['request_ref'] for e in extracted}), 2)
        self.assertEqual(len({e['workspace_ref'] for e in extracted}), 2)
        by_request = {}
        for record in captured.records:
            event = json.loads(record.getMessage())
            if 'workspace_ref' in event:
                by_request.setdefault(event['request_ref'], set()).add(event['workspace_ref'])
        self.assertTrue(all(len(refs) == 1 for refs in by_request.values()))


class WorkspaceLookupTests(unittest.TestCase):
    def setUp(self):
        self.db = TwoWorkspaces()
        p = patch.object(database, 'supabase', self.db)
        p.start(); self.addCleanup(p.stop)

    def test_one_query_returns_only_verified_users_workspace_and_role(self):
        for key in ('a', 'b'):
            before = len(self.db.calls)
            result = database.get_user_organization('user-' + key)
            self.assertEqual(result, {'id': 'org-' + key, 'name': key.upper(), 'role': 'owner', 'created_at': '2026-10-16'})
            self.assertEqual(len(self.db.calls) - before, 1)
            self.assertIn(('user_id', 'user-' + key), self.db.calls[-1][2])

    def test_no_membership_or_missing_organization_fails_closed(self):
        self.assertIsNone(database.get_user_organization('user-no-workspace'))
        self.db.rows['organizations'] = [o for o in self.db.rows['organizations'] if o['id'] != 'org-a']
        self.assertIsNone(database.get_user_organization('user-a'))

    def test_revoked_membership_is_not_cached_and_database_failure_does_not_fall_back(self):
        self.assertEqual(database.get_user_organization('user-a')['id'], 'org-a')
        self.db.rows['organization_members'] = []
        self.assertIsNone(database.get_user_organization('user-a'))
        self.db.fail = ('organization_members', 'select')
        with self.assertRaises(RuntimeError):
            database.get_user_organization('user-a')


class TimingTests(unittest.TestCase):
    setUp = fixture.ContractSaveFlowTests.setUp
    save = fixture.ContractSaveFlowTests.save

    def test_timings_survive_worker_hop_and_join_the_workflow_without_private_content(self):
        with self.assertLogs(timings.logger, logging.INFO) as captured, \
                self.assertLogs(signals.logger, logging.INFO) as pilot:
            response = self.save()
        self.assertEqual(response.status_code, 200)
        stages = [json.loads(r.getMessage()) for r in captured.records]
        workflow = [json.loads(r.getMessage()) for r in pilot.records][-1]
        self.assertTrue({'upload_receive', 'duplicate_lookup', 'contract_write', 'reminder_generation'} <= {r['stage'] for r in stages})
        self.assertTrue(all(r['request_ref'] == workflow['request_ref'] for r in stages))
        self.assertTrue(all(type(r['duration_ms']) is int and r['duration_ms'] >= 0 for r in stages))
        self.assertTrue(all(set(r) <= {'schema', 'stage', 'at', 'duration_ms', 'outcome', 'request_ref', 'revision'} for r in stages))

    def test_logging_failure_never_changes_a_confirmed_save_or_original_exception(self):
        with patch.object(timings.logger, 'info', side_effect=RuntimeError('sink failed')):
            self.assertTrue(self.save().json()['contract_saved'])
            with self.assertRaisesRegex(ValueError, 'original failure'):
                with timings.latency_stage('auth_verify'):
                    raise ValueError('original failure')

    def test_stage_names_and_error_details_are_not_arbitrary_log_input(self):
        with patch.object(timings.logger, 'info') as log:
            with timings.latency_stage('private customer text'):
                pass
            log.assert_not_called()
        with self.assertLogs(timings.logger, logging.INFO) as captured:
            with self.assertRaises(ValueError):
                with timings.latency_stage('auth_verify'):
                    raise ValueError('private provider token')
        self.assertNotIn('private', ''.join(captured.output))
        self.assertEqual(json.loads(captured.records[0].getMessage())['outcome'], 'failure')
