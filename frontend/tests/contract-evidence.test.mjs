import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const require = createRequire(import.meta.url);
function load(path) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = {exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`)((id) =>
    id === '@/lib/contractEvidence' ? evidence : require(id), loaded, loaded.exports);
  return loaded.exports;
}
const evidence = load('../lib/contractEvidence.ts');
const Component = load('../components/ContractEvidence.tsx').default;
const { clauseFields, clauseEvidenceViews } = evidence;
const quote = 'Fees increase only with written consent.';
const saved = Object.fromEntries(clauseFields.map((field) => [field, quote]));
const span = (text = quote, page = 2, start = 10) => ({page, start, end: start + Array.from(text).length, quote: text});
const bundle = () => ({
  schema_version:'renewai.evidence.v1', method:'literal-whitespace-v1', stage:'reviewed_submission',
  requires_human_review:true, document_sha256:'a'.repeat(64), text_sha256:'b'.repeat(64),
  clauses:clauseFields.map((field) => ({field, text:quote, status:'grounded', source_spans:[span()]})),
});
const render = (source_evidence, clauses = saved) => renderToStaticMarkup(createElement(Component, {contract:{...clauses, source_evidence}}));

test('saved evidence displays exact quotes, PDF pages and qualified grounding', () => {
  const data = bundle();
  data.clauses[0].source_spans = [span('Fees increase\nonly with written consent.')];
  const html = render(data);
  assert.match(html, /Grounded · text found/);
  assert.match(html, /Page 2 · uploaded PDF/);
  assert.match(html, /Fees increase\nonly with written consent\./);
  assert.match(html, /Human review required/);
  assert.match(html, /does not establish completeness, applicability or legal accuracy/);
  assert.match(html, /original PDF is not stored/);
  assert.equal((html.match(/<details/g) ?? []).length, 6);
  assert.doesNotMatch(html, /<details open/);
});

test('multi-page and Unicode code-point spans remain exact', () => {
  const text = '💼 Fees increase only with written consent.';
  const data = bundle();
  data.clauses[0] = {field:'renewal_clause', text, status:'grounded', source_spans:[span('💼 Fees increase',1), span('only with written consent.',2,0)]};
  assert.equal(clauseEvidenceViews(data, {...saved,renewal_clause:text})[0].status,'grounded');
  assert.match(render(data,{...saved,renewal_clause:text}), /Page 1, Page 2/);
  data.clauses[0].source_spans[1].page=3; // Blank middle page has no source span.
  assert.equal(clauseEvidenceViews(data, {...saved,renewal_clause:text})[0].status,'grounded');
  data.clauses[0].source_spans.reverse();
  assert.equal(clauseEvidenceViews(data, {...saved,renewal_clause:text})[0].status,'unverified');
});

test('legacy, malformed, unsupported and draft bundles preserve saved text without source claims', () => {
  for (const data of [null, undefined, {}, 'bad', {...bundle(),schema_version:'future'},
    {...bundle(),method:'semantic'}, {...bundle(),stage:'extracted_draft'},
    {...bundle(),requires_human_review:false}, {...bundle(),document_sha256:'bad'},
    {...bundle(),clauses:null}]) {
    const html = render(data);
    assert.match(html, /Source evidence unavailable/);
    assert.match(html, /Fees increase only with written consent/);
    assert.doesNotMatch(html, /Grounded|<blockquote|<details/);
  }
});

test('ambiguous, unverified and missing terms stay explicit without invented quotes', () => {
  const data = bundle();
  for (const [index,status] of ['ambiguous','unverified','missing'].entries()) {
    data.clauses[index].status=status;
    data.clauses[index].source_spans=[];
  }
  data.clauses[2].text=null;
  const html = render(data,{...saved,payment_terms:null});
  assert.match(html,/Ambiguous/);
  assert.match(html,/occurs more than once/);
  assert.match(html,/Unverified/);
  assert.match(html,/No clause text was saved/);
  assert.match(html,/does not mean the agreement has no such term/);
});

test('inconsistent or malformed grounding fails closed per clause', () => {
  for (const mutate of [
    (data) => {data.clauses[0].text='stale text';},
    (data) => {data.clauses[0].status='certain';},
    (data) => {data.clauses[0].source_spans=[];},
    (data) => {data.clauses[0].source_spans=[span('different quote')];},
    (data) => {data.clauses[0].source_spans[0].page=0;},
    (data) => {data.clauses[0].source_spans[0].end=999;},
    (data) => {data.clauses[0].source_spans[0].start=-1;},
    (data) => {data.clauses[0].source_spans[0].quote=null;},
    (data) => {data.clauses.push(data.clauses[0]);},
    (data) => {data.clauses.shift();},
    (data) => {data.clauses[0]=null;},
  ]) {
    const data=bundle(); mutate(data);
    const view=clauseEvidenceViews(data,saved)[0];
    assert.equal(view.status,'unverified');
    assert.equal(view.spans.length,0);
  }
});

test('source HTML is escaped and no private evidence metadata is rendered', () => {
  const text='<script>alert("private")</script> https://example.test';
  const data=bundle();
  data.clauses[0]={field:'renewal_clause',text,status:'grounded',source_spans:[span(text)]};
  data.risk_evidence=[{explanation:'PRIVATE-METADATA'}];
  const html=render(data,{...saved,renewal_clause:text});
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<a |PRIVATE-METADATA|a{64}|b{64}/);
});
