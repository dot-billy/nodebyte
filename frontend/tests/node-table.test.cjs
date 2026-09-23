const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(readFileSync(`${__dirname}/../src/lib/node-table.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({ exports: {} });
vm.runInContext(source, context);
const { sortNodes, loadAllNodePages, toLocalDateInput, documentDatePayload } = context.exports;
const ids = (nodes) => Array.from(nodes, (node) => node.id);

test("document sorting respects timezone offsets and keeps missing dates last in both directions", () => {
  const nodes = [
    { id: "unknown", name: "A", document_updated_at: null },
    { id: "earlier", name: "B", document_updated_at: "2026-01-01T09:00:00+02:00" },
    { id: "later", name: "C", document_updated_at: "2026-01-01T08:00:00Z" },
  ];
  assert.deepEqual(ids(sortNodes(nodes, { key: "document_updated_at", direction: "desc" })), ["later", "earlier", "unknown"]);
  assert.deepEqual(ids(sortNodes(nodes, { key: "document_updated_at", direction: "asc" })), ["earlier", "later", "unknown"]);
  assert.deepEqual(ids(nodes), ["unknown", "earlier", "later"]);
});

test("tags sort consistently regardless of stored tag order, with untagged nodes last", () => {
  const nodes = [{ id: "b", name: "B", tags: ["zulu", "alpha"] }, { id: "a", name: "A", tags: ["alpha", "zulu"] }, { id: "c", name: "C", tags: [] }];
  assert.deepEqual(ids(sortNodes(nodes, { key: "tags", direction: "asc" })), ["a", "b", "c"]);
  assert.deepEqual(nodes[0].tags, ["zulu", "alpha"]);
});

test("all record and document timestamp columns sort chronologically", () => {
  for (const key of ["created_at", "updated_at", "document_created_at", "document_updated_at"]) {
    const nodes = [{ id: "old", name: "Z", [key]: "2020-01-01T00:00:00Z" }, { id: "new", name: "A", [key]: "2026-01-01T00:00:00Z" }];
    assert.deepEqual(ids(sortNodes(nodes, { key, direction: "desc" })), ["new", "old"]);
  }
});

test("loads children beyond the first 200 records before sorting", async () => {
  const calls = [];
  const rows = await loadAllNodePages(async ({ limit, offset }) => {
    calls.push([limit, offset]);
    return Array.from({ length: offset ? 1 : 200 }, (_, index) => ({ id: String(offset + index) }));
  });
  assert.equal(rows.length, 201);
  assert.deepEqual(calls, [[200, 0], [200, 200]]);
});

test("page failures are surfaced and cancellation stops further requests", async () => {
  await assert.rejects(loadAllNodePages(async () => { throw new Error("offline"); }), /offline/);
  let cancelled = false;
  let calls = 0;
  const rows = await loadAllNodePages(async () => {
    calls++;
    cancelled = true;
    return Array.from({ length: 200 }, (_, id) => ({ id }));
  }, () => cancelled);
  assert.equal(calls, 1);
  assert.equal(rows.length, 0);
});

test("editing unrelated fields preserves source date precision and dates can be cleared", () => {
  const original = "2026-09-23T12:34:56.123456+02:00";
  assert.equal(documentDatePayload(toLocalDateInput(original), original), original);
  assert.equal(documentDatePayload("", original), null);
  assert.equal(documentDatePayload("", null), null);
  const edited = "2026-08-15T13:25:00";
  assert.equal(documentDatePayload(edited, original), new Date(edited).toISOString());
});
