import json,unittest
from types import SimpleNamespace
from unittest.mock import Mock,patch
import httpx
from groq import APIConnectionError,APIStatusError
import chat_provider as p
import contract_chat as c

def error(status,code=None):
 return APIStatusError('PRIVATE body',response=httpx.Response(status,request=httpx.Request('POST','https://api.groq.com')),body={'error':{'code':code}})

class RecoveryTests(unittest.TestCase):
 def test_retry_only_recoverable_errors_once_without_private_logs(self):
  for exc,retry in [(error(429),True),(error(503),True),(error(400,'json_validate_failed'),True),(APIConnectionError(request=httpx.Request('POST','https://api.groq.com')),True),(error(401),False),(error(400),False)]:
   create=Mock(side_effect=[exc,'ok']);client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
   with patch.object(p.time,'sleep'),self.assertLogs(p.logger) as logs:
    if retry:self.assertEqual(p.completion(client,stage='contract_plain_answer',model='m'),'ok')
    else:
     with self.assertRaises(APIStatusError):p.completion(client,stage='contract_plain_answer',model='m')
   self.assertEqual(create.call_count,2 if retry else 1);self.assertNotIn('PRIVATE',str(logs.output))
 def test_retry_exhaustion_is_bounded(self):
  create=Mock(side_effect=[error(503),error(503)]);client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
  with patch.object(p.time,'sleep'),self.assertRaises(p.ChatProviderUnavailable):p.completion(client,stage='contract_plain_answer')
  self.assertEqual(create.call_count,2)
 def test_draft_and_verifier_outages_keep_selected_quotes_not_unverified_draft(self):
  quote='Fees may rise by 5% at renewal; larger increases require written agreement.'
  for responses in ([p.ChatProviderUnavailable()],[c.PlainAnswer(answer='PRIVATE invented draft'),p.ChatProviderUnavailable()]):
   with patch.object(c.evidence,'select_evidence',side_effect=lambda q,cs:json.dumps({'supported':True,'passage_ids':[cs[0]['id']]})),patch.object(c,'structured_response',side_effect=responses):
    result=c.chat_answer([quote],'Can the price increase?',[],'a'*64)
   self.assertEqual(result['status'],'answered');self.assertEqual(result['citations'][0]['quote'],quote);self.assertNotIn('PRIVATE',result['answer']);self.assertIn('source quotes',result['answer'])
 def test_selection_outage_cannot_return_unselected_evidence(self):
  with patch.object(c.evidence,'select_evidence',side_effect=p.ChatProviderUnavailable()),patch.object(c,'structured_response') as model:
   with self.assertRaises(p.ChatProviderUnavailable):c.chat_answer(['PRIVATE price source'],'Can price increase?',[],'a'*64)
   model.assert_not_called()
