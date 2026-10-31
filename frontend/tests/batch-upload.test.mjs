import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../lib/batchUpload.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(`(function(exports, module) { ${source}\n})`, { AbortController, crypto, Uint8Array })(mod.exports, mod);
const { BatchUploadQueue, UploadFailure, hashPDF } = mod.exports;
const file = (name, content = name) => new File([content], name, { type: 'application/pdf' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('selection enforces 10 files atomically and validates individual file limits', () => {
  const queue = new BatchUploadQueue(async () => ({}));
  assert.throws(() => queue.select(Array.from({length: 11}, (_, i) => file(`${i}.pdf`))), /1 and 10/);
  assert.equal(queue.getSnapshot().length, 0);
  queue.select([file('okay.pdf'), file('wrong.doc'), file('empty.pdf', ''), new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf')]);
  assert.deepEqual(Array.from(queue.getSnapshot(), i => i.status), ['queued', 'failed', 'failed', 'failed']);
  assert.ok(queue.getSnapshot().slice(1).every(i => !i.retryable));
});

test('renamed identical PDFs are analyzed once, distinct content with same name remains eligible', async () => {
  const calls = [];
  const queue = new BatchUploadQueue(async f => { calls.push(f.name); return { name: f.name }; });
  queue.select([file('first.pdf', 'same'), file('renamed.pdf', 'same'), file('first.pdf', 'different')]);
  await queue.start();
  assert.deepEqual(calls, ['first.pdf', 'first.pdf']);
  assert.deepEqual(Array.from(queue.getSnapshot(), i => i.status), ['ready', 'duplicate', 'ready']);
  assert.equal(queue.getSnapshot()[1].duplicateOf, 'file-0');
  assert.equal(await hashPDF(file('a.pdf', 'same')), await hashPDF(file('b.pdf', 'same')));
});

test('one failed analysis does not block others; retry runs only the failed file', async () => {
  const calls = [];
  const queue = new BatchUploadQueue(async f => {
    calls.push(f.name);
    if (calls.length === 1) throw new UploadFailure('Please try again.');
    return { name: f.name };
  });
  queue.select([file('a.pdf'), file('b.pdf')]);
  await queue.start();
  assert.deepEqual(Array.from(queue.getSnapshot(), i => i.status), ['failed', 'ready']);
  queue.retry('file-0');
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(calls, ['a.pdf', 'b.pdf', 'a.pdf']);
  assert.ok(queue.getSnapshot().every(i => i.status === 'ready'));
  queue.retry('file-1');
  assert.equal(calls.length, 3);
});

test('double starts and retries during processing never overlap analysis', async () => {
  const gate = deferred();
  let active = 0, peak = 0, count = 0;
  const queue = new BatchUploadQueue(async () => {
    active++; peak = Math.max(peak, active); count++;
    if (count === 1) await gate.promise;
    active--; return {};
  });
  queue.select([file('a.pdf'), file('b.pdf')]);
  const running = queue.start();
  await queue.start();
  assert.equal(queue.reset(), false);
  gate.resolve(); await running;
  assert.equal(peak, 1); assert.equal(count, 2);
});

test('saved-contract duplicate carries recovery link and queue continues', async () => {
  const queue = new BatchUploadQueue(async f => {
    if (f.name === 'a.pdf') throw new UploadFailure('Already saved.', 'saved-id', true);
    return {};
  });
  queue.select([file('a.pdf'), file('b.pdf')]); await queue.start();
  assert.equal(queue.getSnapshot()[0].status, 'duplicate');
  assert.equal(queue.getSnapshot()[0].existingId, 'saved-id');
  assert.equal(queue.getSnapshot()[1].status, 'ready');
});

test('unmount cancels pending work and ignores late results', async () => {
  const gate = deferred(); let calls = 0, signal;
  const queue = new BatchUploadQueue(async (_, s) => { calls++; signal = s; await gate.promise; return {}; });
  queue.select([file('a.pdf'), file('b.pdf')]);
  const running = queue.start();
  await new Promise(r => setTimeout(r, 10));
  queue.stop(); gate.resolve(); await running;
  assert.equal(signal.aborted, true); assert.equal(calls, 1);
  assert.equal(queue.getSnapshot()[0].analysis, undefined);
});

test('analysis never saves automatically; reset is blocked during a reviewed save', async () => {
  const queue = new BatchUploadQueue(async () => ({ contract: { vendor_name: 'Fictional' } }));
  queue.select([file('a.pdf')]); await queue.start();
  assert.equal(queue.getSnapshot()[0].status, 'ready');
  queue.update('file-0', { status: 'saving' }); assert.equal(queue.reset(), false);
  queue.update('file-0', { status: 'save_failed' });
  assert.equal(queue.getSnapshot()[0].analysis.contract.vendor_name, 'Fictional');
  assert.equal(queue.reset(), true); assert.equal(queue.getSnapshot().length, 0);
});

test('retry requested while another file is analyzing joins the same serial worker', async () => {
  const gate = deferred(); let attempts = 0, active = 0, peak = 0;
  const queue = new BatchUploadQueue(async f => {
    active++; peak = Math.max(active, peak);
    try {
      if (f.name === 'a.pdf' && attempts++ === 0) throw new UploadFailure('Retry');
      if (f.name === 'b.pdf') await gate.promise;
      return {};
    } finally { active--; }
  });
  queue.select([file('a.pdf'), file('b.pdf')]);
  const running = queue.start();
  await new Promise(r => setTimeout(r, 10));
  queue.retry('file-0'); queue.retry('file-0');
  gate.resolve(); await running;
  assert.equal(peak, 1); assert.equal(attempts, 2);
  assert.ok(queue.getSnapshot().every(i => i.status === 'ready'));
});

test('hash failures remain retryable without echoing private errors', async () => {
  let calls = 0;
  const queue = new BatchUploadQueue(async () => ({}), async () => {
    if (++calls === 1) throw new Error('private file content');
    return 'hash';
  });
  queue.select([file('a.pdf')]); await queue.start();
  assert.equal(queue.getSnapshot()[0].status, 'failed');
  assert.doesNotMatch(queue.getSnapshot()[0].error, /private/);
  queue.retry('file-0');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(queue.getSnapshot()[0].status, 'ready');
});
