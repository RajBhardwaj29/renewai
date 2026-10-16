"""PDF-input, source-grounding and export quality regressions (no live services)."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import pymupdf
from test_contract_ai import make_contract
from contract_ai import reconcile_grounded_pdf_fields
from test_contract_summary import sample_contract, pdf_text, NOW
from contract_summary import build_contract_summary
from test_contract_save_flow import main
from fastapi import HTTPException


SOURCE = '''SYNTHETIC TEST AGREEMENT
1. Parties and service
This Enterprise Software Subscription Agreement is between Provider Ltd and Buyer Ltd.
2. Renewal pricing
Provider may increase subscription fees by up to 5% at renewal. Any increase above 5% requires written agreement of both parties.
3. Refunds
Fees are non-refundable once the term begins. Customer has no general termination-for-convenience right.
'''

class PdfGroundingTests(unittest.TestCase):
    def test_explicit_title_replaces_missing_or_test_footer(self):
        for existing in [None, 'Synthetic QA only | QA-TEST-01']:
            c = reconcile_grounded_pdf_fields(make_contract(contract_title=existing), SOURCE)
            self.assertEqual(c.contract_title, 'Enterprise Software Subscription Agreement')
        self.assertEqual(reconcile_grounded_pdf_fields(make_contract(contract_title='Reviewed custom title'), SOURCE).contract_title, 'Reviewed custom title')

    def test_heading_fallback_and_ambiguous_unknown(self):
        self.assertEqual(reconcile_grounded_pdf_fields(make_contract(), 'MASTER SERVICES AGREEMENT\nProvider supplies services.').contract_title, 'MASTER SERVICES AGREEMENT')
        self.assertEqual(reconcile_grounded_pdf_fields(make_contract(), 'Master Services Agreement\nProvider supplies services.').contract_title, 'Master Services Agreement')
        self.assertIsNone(reconcile_grounded_pdf_fields(make_contract(), 'No agreement title is stated.').contract_title)
        self.assertIsNone(reconcile_grounded_pdf_fields(make_contract(), SOURCE+'\nThis Different Agreement is between two other parties.').contract_title)

    def test_recovers_adjacent_qualifier_by_unique_literal_source_match(self):
        original = make_contract(pricing_clause='Provider may increase subscription fees by up to 5% at renewal.')
        c = reconcile_grounded_pdf_fields(original, SOURCE)
        self.assertIn('Any increase above 5% requires written agreement of both parties.', c.pricing_clause)
        self.assertNotIn('non-refundable', c.pricing_clause)
        self.assertNotIn('written agreement', original.pricing_clause)

    def test_expanding_partial_paragraphs_never_repeats_existing_sentences(self):
        first='Provider may increase subscription fees by up to 5% at renewal.'
        second='Any increase above 5% requires written agreement of both parties.'
        c=make_contract(pricing_clause=first+' '+second)
        result=reconcile_grounded_pdf_fields(c,SOURCE)
        self.assertEqual(result.pricing_clause.count(first),1)
        self.assertEqual(result.pricing_clause.count(second),1)
        self.assertEqual(reconcile_grounded_pdf_fields(result,SOURCE),result)
        source=SOURCE.replace(first,first+' Additional annual billing applies.')
        result=reconcile_grounded_pdf_fields(c,source)
        self.assertEqual(result.pricing_clause.count(first),1)
        self.assertEqual(result.pricing_clause.count(second),1)

    def test_ambiguous_or_paraphrased_matches_do_not_attach_another_clause(self):
        c = make_contract(pricing_clause='Provider may increase subscription fees by up to 5% at renewal.')
        repeated = SOURCE+'\n4. Amendment\n'+c.pricing_clause+' No consent is required.\n'
        self.assertEqual(reconcile_grounded_pdf_fields(c,repeated).pricing_clause,c.pricing_clause)
        c = make_contract(pricing_clause='Annual pricing increases are limited to five percent.')
        self.assertEqual(reconcile_grounded_pdf_fields(c,SOURCE).pricing_clause,c.pricing_clause)

    def test_real_pdf_extraction_router_uses_grounded_source(self):
        doc=pymupdf.open();p=doc.new_page();p.insert_textbox((40,40,550,700),SOURCE)
        content=doc.tobytes();doc.close()
        source=main.extract_pdf_text(content)
        import contract_ai
        with patch.object(contract_ai,'AI_PROVIDER','groq'), patch.object(contract_ai,'extract_with_groq',return_value=make_contract()):
            c=contract_ai.extract_contract_data(source)
        self.assertEqual(c.contract_title,'Enterprise Software Subscription Agreement')

    def test_payment_recovery_preserves_full_wrapped_source_paragraph(self):
        import contract_ai
        source=SOURCE+'\n4. Payment\nThe annual subscription fee is INR 2,400,000, excluding taxes. It is invoiced annually in advance\nand payable within thirty (30) calendar days of invoice.\n'
        with patch.object(contract_ai,'AI_PROVIDER','groq'), patch.object(contract_ai,'extract_with_groq',return_value=make_contract()):
            c=contract_ai.extract_contract_data(source)
        self.assertIn('invoiced annually in advance',c.payment_terms)
        self.assertIn('thirty (30) calendar days',c.payment_terms)


class PdfInputTests(unittest.TestCase):
    def test_bad_uploads_fail_before_analysis(self):
        for content_type,content in [('text/plain',b'%PDF'),('application/pdf',b''),('application/pdf',b'not a pdf')]:
            with self.assertRaises(HTTPException) as caught:
                main.validate_pdf_content(SimpleNamespace(content_type=content_type),content)
            self.assertEqual(caught.exception.status_code,400)

    def test_damaged_pdf_is_actionable_client_error(self):
        with self.assertRaises(HTTPException) as caught:main.extract_pdf_text(b'%PDF broken test')
        self.assertEqual(caught.exception.status_code,400)
        self.assertIn('Export a new PDF',caught.exception.detail)

    def test_encrypted_and_image_only_pdfs_have_specific_guidance(self):
        doc=pymupdf.open();doc.new_page().insert_text((72,72),'Synthetic confidential test')
        encrypted=doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256,owner_pw='local-owner',user_pw='local-user');doc.close()
        with self.assertRaises(HTTPException) as caught:main.extract_pdf_text(encrypted)
        self.assertIn('password-protected',caught.exception.detail)
        doc=pymupdf.open();doc.new_page();empty=doc.tobytes();doc.close()
        with self.assertRaises(HTTPException) as caught:main.extract_pdf_text(empty)
        self.assertIn('OCR',caught.exception.detail)


class PdfLayoutTests(unittest.TestCase):
    def test_short_clause_continuation_does_not_force_an_empty_page(self):
        c=sample_contract()
        # Sweep boundary lengths: the historical forced AI page break stranded
        # a short refund clause on a nearly empty continuation page.
        for count in [1,5,10,15,20,25]:
            c['renewal_clause']='Renewal notice must be received before the deadline. '*count
            pdf=build_contract_summary(c,[],generated_at=NOW)
            with pymupdf.open(stream=pdf,filetype='pdf') as doc:
                for page in list(doc)[:-1]:
                    body='\n'.join(page.get_text().splitlines()[1:-1])
                    self.assertGreater(len(body.strip()),180)
            self.assertIn(c['refund_clause'],pdf_text(pdf))
