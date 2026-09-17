const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(
  readFileSync(`${__dirname}/../src/lib/api.ts`, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function client(fetch) {
  const context = vm.createContext({ exports: {}, fetch, URLSearchParams });
  vm.runInContext(source, context);
  return context.exports.api;
}

function pendingResponse() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("overlapping refreshes consume the rotating cookie only once", async () => {
  const pending = pendingResponse();
  let calls = 0;
  const api = client(async (url, init) => {
    calls++;
    assert.equal(url, "/api/auth/refresh");
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "include");
    await pending.promise;
    // A second request with the same cookie triggers server replay protection.
    return calls === 1
      ? { ok: true, status: 200, json: async () => ({ access_token: "restored" }) }
      : { ok: false, status: 401, json: async () => ({ detail: "Refresh token reuse detected" }) };
  });
  const first = api.auth.refresh();
  const second = api.auth.refresh();
  pending.resolve();
  const results = await Promise.allSettled([first, second]);
  assert.equal(calls, 1);
  for (const result of results) {
    assert.equal(result.status, "fulfilled");
    assert.equal(result.value.access_token, "restored");
  }
  // Later refreshes must use the newly rotated cookie, not a cached response.
  calls = 0;
  await api.auth.refresh();
  assert.equal(calls, 1);
});

for (const failure of ["unauthorized", "network"]) {
  test(`a shared ${failure} failure permits a later refresh attempt`, async () => {
    const pending = pendingResponse();
    let calls = 0;
    let fail = true;
    const api = client(async () => {
      calls++;
      await pending.promise;
      if (fail && failure === "network") throw new Error("Network unavailable");
      return {
        ok: !fail,
        status: fail ? 401 : 200,
        json: async () => fail ? { detail: "Invalid refresh token" } : { access_token: "new-session" },
      };
    });
    const first = api.auth.refresh();
    const second = api.auth.refresh();
    pending.resolve();
    const results = await Promise.allSettled([first, second]);
    assert.equal(calls, 1);
    assert.equal(results[0].status, "rejected");
    assert.equal(results[1].status, "rejected");
    fail = false;
    assert.equal((await api.auth.refresh()).access_token, "new-session");
    assert.equal(calls, 2);
  });
}
