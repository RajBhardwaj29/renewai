import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Response })(
    (id) => dependencies[id] ?? require(id), loaded, loaded.exports);
  return loaded.exports;
}
const parser = load('../lib/contractAssistant.ts');
const chatResponse = () => ({...response(), answer: 'The notice period is 60 days before renewal.'});
const components = load('../components/ContractAssistant.tsx', {
  '@/lib/contractAssistant': parser, '@/lib/authFetch': {authFetch: () => {throw new Error('Unexpected request');}},
});
const quote = '💼 Renewal requires 60 days notice.\nExcept as amended.';
const response = () => ({status: 'answered', contract_id: 'a', document_sha256: 'a'.repeat(64),
  requires_human_review: true, citations: [{page: 2, start: 9, end: 9 + Array.from(quote).length, quote}]});

test('assistant accepts only consistent scoped answers and Unicode citation offsets', () => {
  const data = parser.parseAssistantAnswer(response(), 'a');
  assert.equal(data.citations[0].quote, quote);
  assert.equal(data.citations[0].page, 2);
  for (const mutate of [
    (d) => { d.contract_id = 'foreign'; }, (d) => { d.document_sha256 = 'bad'; },
    (d) => { d.requires_human_review = false; }, (d) => { d.status = 'certain'; },
    (d) => { d.citations = []; }, (d) => { d.citations[0].page = 0; },
    (d) => { d.citations[0].page = 201; }, (d) => { d.citations[0].start = -1; },
    (d) => { d.citations[0].end += 1; }, (d) => { d.citations[0].quote = ''; },
    (d) => { d.citations[0].page = '2'; }, (d) => { d.status = 'abstained'; },
  ]) {
    const bad = response(); mutate(bad);
    assert.throws(() => parser.parseAssistantAnswer(bad, 'a'));
  }
  assert.throws(() => parser.parseAssistantAnswer(null, 'a'));
});

test('chat answers require bounded plain text and validated citations', () => {
  const data = chatResponse();
  assert.equal(parser.parseChatAnswer(data, 'a').answer, data.answer);
  for (const answer of [null, '', ' '.repeat(3), 'x'.repeat(901), {text:'fake'}]) {
    assert.throws(() => parser.parseChatAnswer({...data,answer}, 'a'));
  }
  assert.throws(() => parser.parseChatAnswer({...data,contract_id:'foreign'}, 'a'));
});

test('plain answer leads and exact sources stay collapsed and escaped', () => {
  const data = chatResponse();
  data.answer = '<script>bad()</script> You need 60 days notice.';
  const html = renderToStaticMarkup(createElement(components.AssistantResult, {answer: parser.parseChatAnswer(data, 'a')}));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /View source · Page 2/);
  assert.match(html, /Except as amended/);
  assert.doesNotMatch(html, /<script|<details[^>]* open|Source-supported passages|document_sha256/);
});

test('abstention renders a friendly response without source claims', () => {
  const data = {...chatResponse(), status:'abstained', citations:[], answer:'I couldn’t find enough support in this contract.'};
  const html = renderToStaticMarkup(createElement(components.AssistantResult, {answer: parser.parseChatAnswer(data,'a')}));
  assert.match(html, /couldn’t find enough support/);
  assert.doesNotMatch(html, /<blockquote|<details/);
});

test('chat starts without a PDF picker, with scoped conversation and fixed message composer', () => {
  const html = renderToStaticMarkup(createElement(components.default, {contractId:'a',contractName:'Fictional <A>'}));
  assert.match(html, /aria-haspopup="dialog"/);
  assert.doesNotMatch(html, /<dialog[^>]*\sopen(?:=|>)/);
  assert.match(html, /Fictional &lt;A&gt;/);
  assert.match(html, /Follow-up questions welcome/);
  assert.match(html, /role="log" aria-label="Conversation"/);
  assert.match(html, /for="assistant-question"/);
  assert.match(html, /maxLength="1000"/);
  assert.match(html, /Send message/);
  assert.doesNotMatch(html, /type="file"|Each question is independent|Source-supported passages/);
});

test('assistant error handling preserves actionable file guidance without echoing private text', async () => {
  const errors = load('../lib/apiErrors.ts');
  for (const detail of ['Attach the original PDF saved for this contract.', 'The original PDF cannot be verified for this contract.']) {
    const result = await errors.safeErrorResponse('/contracts/a/ask', new Response(JSON.stringify({detail}), {status: 400}));
    assert.equal((await result.json()).detail, detail);
  }
  const result = await errors.safeErrorResponse('/contracts/a/ask', new Response(JSON.stringify({detail: 'PRIVATE prompt and key'}), {status: 503}));
  assert.doesNotMatch(JSON.stringify(await result.json()), /PRIVATE/);
});
