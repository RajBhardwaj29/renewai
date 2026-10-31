import unittest
from unittest.mock import patch
from contract_risks import findings, load_review
from risk_policy import POLICY, rate_term
from test_contract_risks import sample

class PolicyTests(unittest.TestCase):
    def test_pricing_boundaries_and_consent_qualification(self):
        for value,level in [('0','low'),('5','low'),('5.01','medium'),('10','medium'),('10.01','high')]:
            with self.subTest(value=value):
                quote=f'Provider may increase fees up to {value}% at renewal. Above {value}% requires written agreement.'
                item=findings(sample(pricing_clause=quote),[quote])[0]
                self.assertEqual(item['severity'],level)
                self.assertIn(value+'%',item['severity_reason'])
                self.assertEqual(item['citations'][0]['quote'],quote)

    def test_commitment_boundaries_years_and_quantity_unknown(self):
        for quote,level in [('A 12-month minimum commitment applies.','low'),('Minimum commitment is 13 months.','medium'),('A 2 year minimum commitment applies.','medium'),('Minimum commitment of 25 months.','high'),('Minimum commitment is 80 users.','not_assessed'),('Minimum commitment is 0 months.','not_assessed')]:
            with self.subTest(quote=quote): self.assertEqual(rate_term('commitment',quote,True)['severity'],level)

    def test_refund_rights_exceptions_and_references(self):
        for quote,level in [('Fees are non-refundable without exceptions.','high'),('Fees are non-refundable.','not_assessed'),('Fees are non-refundable once the term begins, except for material breach by Provider.','medium'),('Customer may terminate for convenience and receive a pro-rata refund of unused prepaid fees.','low'),('Fees are non-refundable except where an express provision requires a refund.','not_assessed'),('No refunds except breach.','not_assessed'),('Refunds may be available.','not_assessed')]:
            with self.subTest(quote=quote): self.assertEqual(rate_term('refund',quote,True)['severity'],level)

    def test_ambiguous_conditions_negation_and_formulas_abstain(self):
        for category,quote in [('pricing','Provider may increase fees up to 5% at renewal, unless otherwise agreed.'),('pricing','Provider may increase fees up to 5% at renewal plus CPI.'),('pricing','Provider may increase fees up to 5% monthly.'),('pricing','Provider may increase fees up to 5% at renewal. A 20% minimum applies.'),('pricing','Provider may increase fees up to 5% at renewal. Other increases are uncapped.'),('commitment','No minimum commitment is 24 months.'),('commitment','A 1.5 year minimum commitment applies.'),('commitment','Minimum commitment is 12 months, extended by 24 months.'),('refund','Fees are non-refundable. An amendment supersedes this term.')]:
            with self.subTest(quote=quote):self.assertEqual(rate_term(category,quote,True)['severity'],'not_assessed')

    def test_unverified_and_duplicate_sources_never_get_severity(self):
        quote='Fees are non-refundable.'
        for pages in [[quote,quote],['Unrelated']]:
            self.assertEqual(findings(sample(refund_clause=quote),pages)[2]['severity'],'not_assessed')
        self.assertEqual(rate_term('refund',quote,False)['severity'],'not_assessed')

    def test_policy_change_invalidates_old_review_identity(self):
        quote='Provider may increase fees up to 5% at renewal.'
        contract=sample(pricing_clause=quote)
        first=findings(contract,[quote])[0]
        with patch.dict(POLICY,{'pricing_low_max_percent':3}):
            second=findings(contract,[quote])[0]
        self.assertNotEqual(first['fingerprint'],second['fingerprint'])
        self.assertEqual((first['severity'],second['severity']),('low','medium'))

    def test_all_levels_have_reasons_and_exact_sources(self):
        for quote in ['Minimum commitment is 6 months.','Minimum commitment is 18 months.','Minimum commitment is 36 months.','Minimum commitment is 30 users.']:
            item=findings(sample(minimum_commitment=quote),[quote])[1]
            self.assertTrue(item['severity_reason'])
            self.assertEqual(item['citations'][0]['quote'],quote)

    def test_report_includes_policy_rating_reasons_and_keeps_private_notes_out(self):
        from contract_summary import build_contract_summary
        import pymupdf
        import unicodedata
        quote='Provider may increase fees up to 12% at renewal.'
        items=findings(sample(pricing_clause=quote),[quote])
        items[0]['review']={'status':'confirmed','rationale':'PRIVATE POLICY REASON'}
        with pymupdf.open(stream=build_contract_summary(sample(),[],commercial_review={'policy':POLICY,'coverage':'Three candidates only','items':items}),filetype='pdf') as doc:
            text=unicodedata.normalize('NFKC',''.join(p.get_text() for p in doc))
        self.assertIn(POLICY['name'],text)
        self.assertIn('High',text)
        self.assertIn('above 10%',text)
        self.assertIn('PDF page 1',text)
        self.assertNotIn('PRIVATE POLICY REASON',text)

    def test_old_policy_reviews_do_not_carry_forward(self):
        from types import SimpleNamespace
        import test_contract_save_flow as fixture
        quote='Provider may increase fees up to 5% at renewal.'
        c=sample(pricing_clause=quote)
        import hashlib,json
        old=hashlib.sha256(json.dumps(['commercial-review-v1','a'*64,hashlib.sha256(quote.encode()).hexdigest(),'pricing_clause',quote],ensure_ascii=False).encode()).hexdigest()
        query=SimpleNamespace()
        query.select=query.eq=lambda *args:query
        query.execute=lambda:SimpleNamespace(data=[{'fingerprint':old,'status':'confirmed','revision':1,'rationale':'Old approval','reviewed_at':'2026-10-31'}])
        with patch.object(fixture.database.supabase,'table',return_value=query):
            result=load_review(c,'org-a',[quote])
        self.assertEqual(result['policy']['id'],POLICY['id'])
        self.assertIsNone(result['items'][0]['review'])

    def test_distant_amendment_prevents_rating_superseded_candidates(self):
        quote='Provider may increase fees up to 5% at renewal.'
        item=findings(sample(pricing_clause=quote),[quote,'Amendment: the preceding pricing clause is superseded.'])[0]
        self.assertEqual(item['severity'],'not_assessed')
        self.assertIn('governs',item['severity_reason'])
        self.assertTrue(item['citations'])

    def test_oversized_numeric_wording_abstains_instead_of_crashing(self):
        quote='Minimum commitment is '+('9'*5000)+' months.'
        self.assertEqual(rate_term('commitment',quote,True)['severity'],'not_assessed')
