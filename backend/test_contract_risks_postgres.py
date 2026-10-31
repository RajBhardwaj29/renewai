from pathlib import Path
import unittest
import test_reminder_delivery_postgres as fixture

@unittest.skipUnless(fixture.DSN and fixture.psycopg,'Requires disposable loopback PostgreSQL')
class RiskReviewPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): fixture.ReminderPostgresTests.setUpClass()
    def setUp(self):
        self.db=fixture.psycopg.connect(fixture.DSN)
        self.addCleanup(self.db.close)
        self.db.execute('truncate organizations cascade')
        self.db.execute('create table if not exists public.organization_members(organization_id uuid,user_id uuid)')
        self.db.execute((Path(__file__).parents[1]/'supabase/migrations/20261031085511_commercial_risk_reviews.sql').read_text().replace('BEGIN;','').replace('COMMIT;',''))
        self.db.execute('insert into organizations(id) values(%s),(%s)',(fixture.ORG,fixture.OTHER_ORG))
        self.db.execute('insert into contracts(id,organization_id) values(%s,%s)',(fixture.CONTRACT,fixture.ORG))
        self.db.execute('insert into organization_members values(%s,%s)',(fixture.ORG,fixture.ORG))
    def review(self,org=None,revision=0,status='confirmed'):
        return self.db.execute('select review_commercial_finding(%s,%s,%s,%s,%s,%s,%s)',(org or fixture.ORG,fixture.CONTRACT,fixture.ORG,'a'*64,status,'Reviewed source',revision)).fetchone()[0]
    def test_persistence_stale_revision_audit_and_cascade(self):
        self.assertTrue(self.review())
        self.assertFalse(self.review())
        self.assertTrue(self.review(revision=1,status='dismissed'))
        self.assertEqual(self.db.execute('select count(*) from contract_risk_review_events').fetchone()[0],2)
        self.db.execute('delete from contracts where id=%s',(fixture.CONTRACT,))
        self.assertEqual(self.db.execute('select count(*) from contract_risk_reviews').fetchone()[0],0)
        self.assertEqual(self.db.execute('select count(*) from contract_risk_review_events').fetchone()[0],0)
    def test_foreign_and_browser_access_denied(self):
        self.assertFalse(self.review(org=fixture.OTHER_ORG))
        for role in ['anon','authenticated']:
            with self.assertRaises(fixture.psycopg.errors.InsufficientPrivilege),self.db.transaction():
                self.db.execute('set local role '+role)
                self.db.execute('select * from contract_risk_reviews')
            with self.assertRaises(fixture.psycopg.errors.InsufficientPrivilege),self.db.transaction():
                self.db.execute('set local role '+role)
                self.review()
    def test_invalid_review_rolls_back_without_event(self):
        with self.assertRaises(fixture.psycopg.Error),self.db.transaction(): self.review(status='approved')
        self.assertEqual(self.db.execute('select count(*) from contract_risk_review_events').fetchone()[0],0)
