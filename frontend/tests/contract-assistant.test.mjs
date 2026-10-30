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

test('abstention has no citations or implied missing clause and ignores generated answer text', () => {
  const result = parser.parseAssistantAnswer({...response(), status: 'abstained', citations: [], answer: 'Private invented answer'}, 'a');
  const html = renderToStaticMarkup(createElement(components.AssistantResult, {answer: result}));
  assert.match(html, /Insufficient source support/);
  assert.match(html, /does not mean a term is absent/);
  assert.doesNotMatch(html, /Private invented answer|<blockquote/);
});

test('passages render exact quotes, page citations and escaped untrusted HTML', () => {
  const data = response();
  data.citations[0].quote = '<script>alert(1)</script> Renewal requires notice.';
  data.citations[0].end = 9 + data.citations[0].quote.length;
  const html = renderToStaticMarkup(createElement(components.AssistantResult, {answer: parser.parseAssistantAnswer(data, 'a')}));
  assert.match(html, /Page 2 · original PDF/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Human review required/);
  assert.doesNotMatch(html, /<script|<a |document_sha256/);
});

test('initial assistant is accessible, bounded, explicit about processing, and requires original PDF', () => {
  const html = renderToStaticMarkup(createElement(components.default, {contractId: 'a'}));
  assert.match(html, /Ask RenewAI/);
  assert.match(html, /for="assistant-question"/);
  assert.match(html, /for="assistant-pdf"/);
  assert.match(html, /maxLength="1000"/);
  assert.match(html, /Each question is independent/);
  assert.match(html, /configured AI provider/);
  assert.match(html, /does not save questions or answers/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /type="submit" disabled/);
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
