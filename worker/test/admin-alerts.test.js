import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverride, checkBronnen, recordBronnen, BRON_STORING_MS } from "../src/admin-alerts.js";

/** Tiny stand-in for D1 that only knows the kv table. */
function fakeEnv() {
  const kv = new Map();
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => (sql.startsWith("SELECT value, at FROM kv") && kv.has(args[0]) ? { value: kv.get(args[0]).value, at: kv.get(args[0]).at } : null),
    run: async () => {
      if (sql.startsWith("INSERT OR REPLACE INTO kv")) kv.set(args[0], { value: args[1], at: args[2] });
      if (sql.startsWith("DELETE FROM kv")) kv.delete(args[0]);
    },
  });
  return { kv, DB: { prepare: (sql) => stmt(sql) } };
}

test("beheer: a warning ended by hand shows as ended", () => {
  const r = applyOverride({ status: "actief", end_at: null, ov_ended: 1000 });
  assert.equal(r.status, "beeindigd");
  assert.equal(r.end_at, 1000);
  assert.equal(applyOverride({ status: "actief", ov_ended: null }).status, "actief");
});

test("beheer: outage push after 30 minutes and a recovery push, only once each", async () => {
  const env = fakeEnv();
  const sent = [];
  const push = async (_env, title, _body, opts) => { sent.push([title, opts.kind]); };
  await recordBronnen(env, { nlalert: "ok 0", burgernet: "fout: HTTP 500", knmi: "ongewijzigd" });
  await checkBronnen(env, push);
  assert.equal(sent.length, 0);
  // NL-Alert last worked 31 minutes ago.
  env.kv.set("bron_ok:nlalert", { value: String(Date.now() - BRON_STORING_MS - 60_000), at: 0 });
  await checkBronnen(env, push);
  await checkBronnen(env, push);
  assert.deepEqual(sent, [["⚠️ NL-Alert ligt eruit", "bronnen"]]);
  await recordBronnen(env, { nlalert: "ok 1" });
  await checkBronnen(env, push);
  assert.deepEqual(sent.at(-1), ["✅ NL-Alert werkt weer", "bronnen"]);
});
