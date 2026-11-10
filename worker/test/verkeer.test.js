import { test } from "node:test";
import assert from "node:assert/strict";
import { verkeer, verkeerRun } from "../src/verkeer.js";

function env(extra = {}) {
  const kv = new Map();
  return { kv, VERKEER_URL: "https://x.koyeb.app/", VERKEER_TOKEN: "t", ...extra, DB: { prepare: () => ({ bind: (...a) => ({
    first: async () => (kv.has(a[0]) ? { value: kv.get(a[0]) } : null),
    run: async () => { kv.set(a[0], a[1]); },
  }) }) } };
}

test("verkeerRun stores the list, sends the ETag next time, verkeer serves it", async () => {
  const e = env();
  const now = new Date().toISOString();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init.headers]);
    if (init.headers["if-none-match"] === '"a"') return { status: 304, ok: false };
    return { status: 200, ok: true, headers: { get: () => '"a"' }, json: async () => ({ bijgewerkt: now, opgehaald: now, items: [{ id: "1", soort: "ongeval" }], flitsers: [{ id: "osm:1" }] }) };
  };
  assert.deepEqual(await verkeerRun(e, null), { ok: true, nieuw: true, items: 1 });
  assert.equal(calls[0][0], "https://x.koyeb.app/verkeer");
  assert.equal(calls[0][1].authorization, "Bearer t");
  assert.deepEqual(await verkeerRun(e, null), { ok: true, nieuw: false });
  const v = await verkeer(e);
  assert.equal(v.items.length, 1);
  assert.equal(v.flitsers.length, 1);
  assert.equal(v.verouderd, false);
});

test("without secrets: empty and not available; old data: no items", async () => {
  assert.deepEqual((await verkeer(env({ VERKEER_URL: "" }))).beschikbaar, false);
  const e = env();
  e.kv.set("verkeer", JSON.stringify({ at: 0, data: { opgehaald: "2026-01-01T00:00:00Z", items: [{ id: 1 }], flitsers: [] } }));
  const v = await verkeer(e);
  assert.equal(v.verouderd, true);
  assert.equal(v.items.length, 0);
});
