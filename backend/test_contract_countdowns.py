from copy import deepcopy
from datetime import date, datetime, timezone
import unittest
from unittest.mock import patch
from contract_presentation import current_contract_countdowns
from test_contract_data_safety import TwoWorkspaces, database, main
from fastapi.testclient import TestClient


class CountdownTests(unittest.TestCase):
    def test_calendar_boundaries_and_unknowns_without_mutating_records(self):
        for deadline, today, expected in [
            ('2026-12-01', date(2026, 10, 16), 46),
            ('2026-12-01', date(2026, 12, 1), 0),
            ('2026-12-01', date(2026, 12, 2), -1),
            ('2028-03-01', date(2028, 2, 28), 2),
            ('2027-01-01', date(2026, 12, 31), 1),
            (None, date(2026, 10, 16), None),
            ('2026-02-30', date(2026, 10, 16), None),
            ('', date(2026, 10, 16), None),
            (123, date(2026, 10, 16), None),
        ]:
            with self.subTest(deadline=deadline, today=today):
                rows = [{'cancellation_deadline': deadline, 'days_until_cancellation_deadline': 47,
                         'effective_renewal_date': '2027-03-01', 'risk_level': 'medium'}]
                before = deepcopy(rows)
                self.assertEqual(current_contract_countdowns(rows, today=today),
                                 [{**rows[0], 'days_until_cancellation_deadline': expected}])
                self.assertEqual(rows, before)

    def test_utc_midnight_and_one_clock_read_per_response(self):
        rows = [{'cancellation_deadline': '2026-12-01'}] * 2
        for day, hour, expected in [(15, 23, 47), (16, 0, 46)]:
            with patch('contract_presentation.datetime') as clock:
                clock.now.return_value = datetime(2026, 10, day, hour, tzinfo=timezone.utc)
                self.assertEqual([r['days_until_cancellation_deadline'] for r in
                                  current_contract_countdowns(rows)], [expected, expected])
                clock.now.assert_called_once_with(timezone.utc)

    def test_authenticated_detail_and_active_archived_lists_are_fresh_without_writes(self):
        db = TwoWorkspaces()
        owned = db.rows['contracts'][0]
        owned.update(cancellation_deadline='2026-12-01', days_until_cancellation_deadline=47)
        with patch.object(database, 'supabase', db), patch('contract_presentation.datetime') as clock:
            clock.now.return_value = datetime(2026, 10, 16, tzinfo=timezone.utc)
            with TestClient(main.app) as client:
                for archived in (False, True):
                    owned['archived'] = archived
                    before = deepcopy(db.rows)
                    headers = {'Authorization': 'Bearer token-a'}
                    detail = client.get('/contracts/contract-a', headers=headers)
                    listing = client.get('/contracts', params={'archived': archived}, headers=headers)
                    self.assertEqual(detail.status_code, 200)
                    self.assertEqual(listing.status_code, 200)
                    self.assertEqual(detail.json()['contract']['days_until_cancellation_deadline'], 46)
                    self.assertEqual(len(listing.json()['contracts']), 1)
                    self.assertEqual(listing.json()['contracts'][0]['days_until_cancellation_deadline'], 46)
                    self.assertEqual(db.rows, before)
                    self.assertEqual(db.rpc_calls, [])
