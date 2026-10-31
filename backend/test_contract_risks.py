import unittest
from unittest.mock import patch
from types import SimpleNamespace
import test_contract_save_flow as fixture
from contract_risks import findings, load_review
from contract_ai import ContractData
from contract_summary import build_contract_summary
import pymupdf


def sample(**updates):
    return {**{k: None for k in ContractData.model_fields}, 'id':'owned', 'file_hash':'a'*64, **updates}


class CommercialReviewTests(unittest.TestCase):
    def test_three_categories_preserve_qualifications_and_unknown_severity(self):
        price='Provider may increase fees up to 5%. Above 5% requires written agreement.'
        minimum='Minimum commitment is 80 users.'
        refund='Fees are non-refundable except for material breach.'
        result=findings(sample(pricing_clause=price,minimum_commitment=minimum,refund_clause=refund),[price,minimum,refund])
        self.assertEqual(len(result),3)
        self.assertTrue(all(i['status']=='review_required' and i['severity']=='not_assessed' for i in result))
        self.assertEqual(result[0]['citations'][0]['quote'],price)
        self.assertEqual(result[2]['citations'][0]['page'],3)

    def test_repeated_paraphrased_missing_and_source_free_terms_do_not_claim_grounding(self):
        for pages,clause in [(['Fees increase. Fees increase.'],'Fees increase.'),(['No changes.'],'Fees increase.'),(['x'],None)]:
            item=findings(sample(pricing_clause=clause),pages)[0]
            self.assertEqual(item['status'],'not_assessed')
            self.assertEqual(item['citations'],[])
        self.assertEqual(findings(sample(),None),[])

    def test_source_change_invalidates_review_fingerprint(self):
        c=sample(pricing_clause='Fees increase 5%.')
        self.assertNotEqual(findings(c,['Fees increase 5%.'])[0]['fingerprint'],findings(c,['Fees increase 5%.','Amendment.'])[0]['fingerprint'])

    def test_report_has_source_pages_status_and_no_internal_review_reason(self):
        items=findings(sample(refund_clause='No refunds except breach.'),['No refunds except breach.'])
        items[2]['review']={'status':'confirmed','rationale':'PRIVATE REASON'}
        pdf=build_contract_summary(sample(),[],commercial_review={'coverage':'Three categories only','items':items})
        with pymupdf.open(stream=pdf,filetype='pdf') as doc:
            text=''.join(p.get_text() for p in doc).replace('ﬁ','fi')
        self.assertIn('PDF page 1',text)
        self.assertIn('confirmed',text)
        self.assertIn('No refunds except breach.',text)
        self.assertNotIn('PRIVATE REASON',text)

    def test_foreign_and_anonymous_requests_denied_before_parsing(self):
        from fastapi.testclient import TestClient
        from test_contract_data_safety import TwoWorkspaces
        from main import app
        db=TwoWorkspaces()
        with patch.object(fixture.database,'supabase',db), TestClient(app) as client:
            self.assertEqual(client.patch('/contracts/foreign/commercial-review',content='bad').status_code,401)

    def test_scoped_get_review_write_and_report_with_feature_enabled(self):
        import os
        from fastapi.testclient import TestClient
        from test_contract_data_safety import TwoWorkspaces
        import main
        db=TwoWorkspaces()
        c=db.rows['contracts'][0]
        text='Fees are non-refundable except breach.'
        c.update(sample(refund_clause=text),id='contract-a',organization_id='org-a',archived=False)
        db.rows['contract_risk_reviews']=[]
        with patch.dict(os.environ,{'ENABLE_COMMERCIAL_REVIEW':'true'}), patch.object(fixture.database,'supabase',db), patch.object(main,'get_source',return_value=[text]), TestClient(main.app) as client:
            headers={'Authorization':'Bearer token-a'}
            response=client.get('/contracts/contract-a/commercial-review',headers=headers)
            self.assertEqual(response.status_code,200,response.text)
            item=response.json()['items'][2]
            with patch.object(db,'rpc',return_value=SimpleNamespace(execute=lambda:SimpleNamespace(data=True))) as rpc:
                reply=client.patch('/contracts/contract-a/commercial-review',headers=headers,json={'fingerprint':item['fingerprint'],'status':'confirmed','rationale':'Verify exception.','expected_revision':0})
                self.assertEqual(reply.status_code,200,reply.text)
                self.assertEqual(rpc.call_args.args[1]['p_org'],'org-a')
            self.assertEqual(client.get('/contracts/contract-b/commercial-review',headers=headers).status_code,404)
            self.assertEqual(client.patch('/contracts/contract-a/commercial-review',headers=headers,json={'fingerprint':'f'*64,'status':'confirmed','rationale':'Stale','expected_revision':0}).status_code,409)
