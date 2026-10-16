import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const context = vm.createContext({});
const source = ts.transpileModule(readFileSync(new URL('../lib/contractTiming.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const loaded = {exports: {}};
vm.runInContext(`(function(exports){${source}\n})`, context)(loaded.exports);
const { utcDay, deadlineDay, currentContractTiming, observeUtcDay } = loaded.exports;
const today = utcDay(Date.parse('2026-10-16T00:00:00Z'));
const base = {cancellation_deadline: '2026-12-01', days_until_cancellation_deadline: 999,
  risk_level: 'safe', recommendation: 'old safe guidance', effective_renewal_date: '2027-03-01',
  ai_summary: 'Saved AI advice', renewal_decision: 'renew'};

test('fresh days, risk and guidance follow all existing policy boundaries', () => {
  for (const [days, risk] of [[-1,'critical'],[0,'critical'],[1,'critical'],[14,'critical'],
    [15,'urgent'],[30,'urgent'],[31,'attention'],[90,'attention'],[91,'safe']]) {
    const deadline = new Date((today + days)*86400000).toISOString().slice(0,10);
    const saved = {...base, cancellation_deadline: deadline};
    const copy = structuredClone(saved);
    const view = currentContractTiming(saved, today);
    assert.equal(view.days_until_cancellation_deadline, days);
    assert.equal(view.risk_level, risk);
    assert.doesNotMatch(view.recommendation, /old safe/);
    assert.equal(view.effective_renewal_date, saved.effective_renewal_date);
    assert.equal(view.ai_summary, saved.ai_summary);
    assert.equal(view.renewal_decision, saved.renewal_decision);
    assert.deepEqual(saved, copy);
  }
  assert.match(currentContractTiming({...base,cancellation_deadline:'2026-10-15'},today).recommendation,/already passed/);
});

test('invalid dates are unknown, never safe; qualified unknowns retain their explanation', () => {
  for (const deadline of [null,'','2026-02-30','2026-2-1','20261016','invalid','2026-10-16T00:00:00Z']) {
    assert.equal(deadlineDay(deadline),null);
    const view = currentContractTiming({...base,cancellation_deadline:deadline},today);
    assert.equal(view.days_until_cancellation_deadline,null);
    assert.equal(view.risk_level,'unknown');
    assert.doesNotMatch(view.recommendation,/safe guidance/);
  }
  for (const explanation of ['Business-day calendar unavailable','Incomplete notice window','Evergreen rolling termination rights']) {
    const view = currentContractTiming({...base,risk_level:'unknown',recommendation:explanation},today);
    assert.equal(view.risk_level,'unknown');
    assert.equal(view.days_until_cancellation_deadline,null);
    assert.equal(view.recommendation,explanation);
  }
});

test('UTC day arithmetic survives leap/year boundaries and offset/DST timestamps', () => {
  assert.equal(deadlineDay('2028-03-01')-deadlineDay('2028-02-28'),2);
  assert.equal(deadlineDay('2027-01-01')-deadlineDay('2026-12-31'),1);
  assert.equal(utcDay(Date.parse('2026-10-16T05:30:00+05:30')),today);
  assert.equal(utcDay(Date.parse('2026-10-15T17:00:00-07:00')),today);
  assert.equal(utcDay(Date.parse('2026-03-08T03:30:00-04:00')),deadlineDay('2026-03-08'));
});

test('midnight, suspended tabs, focus, visibility and cleanup share one local clock', () => {
  let now = Date.parse('2026-10-15T23:59:59Z');
  let nextId = 0;
  const timers = new Map();
  const windowEvents = new Map(), documentEvents = new Map();
  const eventTarget = (events) => ({addEventListener: (name,fn)=>events.set(name,fn),
    removeEventListener: (name,fn)=>{assert.equal(events.get(name),fn);events.delete(name);}});
  const doc = {...eventTarget(documentEvents),visibilityState:'visible'};
  const days = [];
  const stop = observeUtcDay(day=>days.push(day), {now:()=>now,
    setTimer: (fn,delay)=>{timers.set(++nextId,{fn,delay});return nextId;},
    clearTimer:id=>timers.delete(id), window:eventTarget(windowEvents), document:doc});
  assert.equal(days.at(-1),today-1);
  assert.equal([...timers.values()][0].delay,1000);
  now += 1000;
  [...timers.values()][0].fn();
  assert.equal(days.at(-1),today);
  assert.equal(currentContractTiming(base,days.at(-1)).days_until_cancellation_deadline,46);
  now += 3*86400000;
  windowEvents.get('focus')();
  assert.equal(days.at(-1),today+3);
  now += 86400000;
  doc.visibilityState='hidden';documentEvents.get('visibilitychange')();
  assert.equal(days.at(-1),today+3);
  doc.visibilityState='visible';documentEvents.get('visibilitychange')();
  assert.equal(days.at(-1),today+4);
  assert.equal(timers.size,1);
  stop();
  assert.equal(timers.size,0);assert.equal(windowEvents.size,0);assert.equal(documentEvents.size,0);
});
