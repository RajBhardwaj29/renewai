import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function render(result) {
  const source = ts.transpileModule(readFileSync(new URL('../components/CommercialRiskReview.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const loaded={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`)(id=>id==='react'?{...React,useState:initial=>React.useState(initial===null?result:initial)}:id==='@/lib/authFetch'?{authFetch:()=>{throw Error('No network during rendering');}}:require(id),loaded,loaded.exports);
  return renderToStaticMarkup(React.createElement(loaded.exports.default,{contractId:'fictional'}));
}
const fixture=()=>({policy:{name:'Demo policy v1',summary:'Thresholds shown here',qualification:'Provisional; not approved.'},coverage:'Three candidates only',items:['high','medium','low','not_assessed'].map((severity,i)=>({fingerprint:String(i),title:'Term '+i,status:'review_required',severity,severity_reason:'Reason for '+severity,explanation:'Review manually',citations:[{page:i+1,quote:'<script>private attack</script>'}],review:null}))});
test('ratings show the policy, every level, reasons and source pages independently of human review',()=>{
 const html=render(fixture());
 for(const level of ['High','Medium','Low','Not assessed'])assert.ok(html.includes('Severity: '+level));
 assert.match(html,/How ratings are calculated/);assert.match(html,/Demo policy v1/);assert.match(html,/Reason for high/);assert.match(html,/PDF page 4/);assert.match(html,/Unreviewed/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('legacy policy-less response never presents a policy as approved',()=>{
 const data=fixture();delete data.policy;
 assert.match(render(data),/Policy unavailable/);
});
