import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyHomey } from "../src/homey.js";

function fakeDB(state) {
  return {
    prepare: (sql) => {
      const stmt = { args: [] };
      stmt.bind = (...a) => { stmt.args = a; return stmt; };
      stmt.first = async () => (/FROM kv/.test(sql) ? (state.kv.has(stmt.args[0]) ? { value: state.kv.get(stmt.args[0]) } : null) : null);
      stmt.run = async () => { if (/INSERT (OR REPLACE )?INTO kv/.test(sql)) state.kv.set(stmt.args[0], stmt.args[1]); };
      stmt.all = async () => (/FROM meldingen/.test(sql) ? { results: state.meldingen } : { results: state.waarschuwingen });
      return stmt;
    },
  };
}

test("homey: first run only sets the cursor, then changes are posted once to the webhook", async () => {
  const state = { kv: new Map(), meldingen: [], waarschuwingen: [] };
  const env = { HOMEY_WEBHOOK_ID: "abc123", DB: fakeDB(state) };
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response("ok"); };
  try {
    assert.equal((await notifyHomey(env)).reason, "cursor set");
    assert.equal((await notifyHomey(env)).reason, "nothing new");
    state.meldingen = [{ guid: "g1", title: "A1 Ambu 08993 Europaweg Apeldoorn", dienst: "ambulance", datum: Date.now(), eenheden: "[]", voertuigen: "[]" }];
    const r = await notifyHomey(env);
    assert.equal(r.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://webhooks.athom.com/webhook/abc123");
    assert.equal(calls[0].body.channel, "aalerts");
    assert.equal(calls[0].body.meldingen[0].guid, "g1");
    assert.ok(JSON.parse(state.kv.get("homey_last")).ok);
  } finally { globalThis.fetch = orig; }
  assert.equal((await notifyHomey({ DB: fakeDB(state) })).reason, "not configured");
});
