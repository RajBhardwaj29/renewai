import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Load the actual browser helpers with a fake session/transport. No live services.
function helpers(fetch, overrides = {}) {
  const cache = new Map();
  const session = { access_token: "test-token" };
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    refreshSession: async () => ({ data: { session }, error: null }),
    ...overrides,
  };
  const context = vm.createContext({
    fetch, Response, Headers, AbortSignal, console,
    setTimeout: (callback) => setTimeout(callback, 0),
    process: { env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:9" } },
  });
  function load(name) {
    if (name === "@/lib/supabase") return { supabase: { auth } };
    if (cache.has(name)) return cache.get(name).exports;
    const path = fileURLToPath(new URL(`../lib/${name.split("/").at(-1)}.ts`, import.meta.url));
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loaded = { exports: {} };
    cache.set(name, loaded);
    const execute = vm.runInContext(`(function(require, module, exports) {${source}\n})`, context);
    execute((id) => id.startsWith("@/") ? load(id) : createRequire(import.meta.url)(id), loaded, loaded.exports);
    return loaded.exports;
  }
  return { ...load("@/lib/authFetch"), ...load("@/lib/renewalAI"), ...load("@/lib/apiErrors") };
}

test("raw server details and gateway HTML never reach the UI", async () => {
  for (const response of [
    new Response(JSON.stringify({ detail: "Server disconnected: private-database-secret" }), { status: 500 }),
    new Response("<html>private provider trace</html>", { status: 502 }),
  ]) {
    const api = helpers(async () => response);
    const safe = await api.authFetch("/contracts/test");
    const body = await safe.json();
    assert.match(body.detail, /Please try again/);
    assert.doesNotMatch(JSON.stringify(body), /private|disconnected|html/);
  }
});

test("safe reads retry temporary 500 errors; writes are attempted once", async () => {
  let reads = 0;
  const api = helpers(async () => {
    reads += 1;
    return new Response("{}", { status: reads === 1 ? 500 : 200 });
  });
  assert.equal((await api.authFetchWithRetry("/contracts/test")).status, 200);
  assert.equal(reads, 2);

  let writes = 0;
  const writesApi = helpers(async () => {
    writes += 1;
    throw new Error("private network trace");
  });
  await assert.rejects(writesApi.authFetchWithRetry("/contracts/save", { method: "POST" }), /Check Contracts/);
  assert.equal(writes, 1);
});

test("cancelled reads stop retrying", async () => {
  let calls = 0;
  const api = helpers(async () => { calls += 1; throw new Error("aborted"); });
  await assert.rejects(api.authFetchWithRetry("/contracts/test", { signal: AbortSignal.abort() }));
  assert.equal(calls, 1);
});

test("duplicate recovery preserves its existing-contract link without raw text", async () => {
  const api = helpers(async () => new Response(JSON.stringify({ detail: {
    message: "private diagnostic", existing_contract_id: "saved-id", vendor_name: "Test vendor",
  } }), { status: 409 }));
  const body = await (await api.authFetch("/contracts/save", { method: "POST" })).json();
  assert.equal(body.detail.existing_contract_id, "saved-id");
  assert.equal(body.detail.vendor_name, "Test vendor");
  assert.doesNotMatch(body.detail.message, /private/);
});

test("validation remains useful without echoing sensitive input", async () => {
  const api = helpers(async () => new Response(JSON.stringify({ detail: [{ input: "private contract" }] }), { status: 422 }));
  const body = await (await api.authFetch("/contracts/save", { method: "POST" })).json();
  assert.match(body.detail, /Review/);
  assert.doesNotMatch(JSON.stringify(body), /private/);
});

test("expired sessions are friendly, and refresh rejection is contained", async () => {
  const api = helpers(async () => new Response("{}", { status: 401 }), {
    refreshSession: async () => { throw new Error("private auth error"); },
  });
  const response = await api.authFetch("/contracts/test");
  assert.equal(response.status, 401);
  assert.match((await response.json()).detail, /sign in/);
});

test("AI failure stays friendly and explicit retry uses the same saved record", async () => {
  const paths = [];
  let attempts = 0;
  const insight = { action: "investigate", confidence: 0.8, summary: "Review terms.", key_findings: [], commercial_flags: [] };
  const api = helpers(async (url) => {
    paths.push(url);
    attempts += 1;
    return new Response(JSON.stringify(attempts === 1
      ? { detail: "private provider failure" } : { ai_insight: insight }), { status: attempts === 1 ? 503 : 200 });
  });
  await assert.rejects(api.generateRenewalAIInsight("saved-id"), /Your contract is saved/);
  assert.equal((await api.generateRenewalAIInsight("saved-id")).summary, insight.summary);
  assert.equal(attempts, 2);
  assert.ok(paths.every((url) => url.endsWith("/contracts/saved-id/ai-insight")));
});

test("malformed AI success responses stay retryable and do not display server text", async () => {
  const api = helpers(async () => new Response(JSON.stringify({ ai_insight: { summary: "private invalid result" } })));
  await assert.rejects(api.generateRenewalAIInsight("saved-id"), /Your contract is saved/);
});
