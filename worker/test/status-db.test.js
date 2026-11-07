// Runs the status module against a real SQLite database with the Worker's schema (D1 is SQLite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { statusTick, statusOverzicht, notePushes, maakIncident, updateIncident, noteHeli } from "../src/status.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); } };
}

test("status: tick, history, beheer push and incidents", async () => {
  const env = { DB: d1() };
  const now = Date.now();
  const set = (k, v) => env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(k, String(v), now).run();
  await set("cron_run", now);
  await set("feed_ok", now - 20 * 60_000); // P2000 read failing for 20 min
  await set("feed_error", "HTTP 502");
  for (const b of ["nlalert", "burgernet", "knmi"]) await set(`bron_ok:${b}`, now - 30_000);
  await noteHeli(env, true);
  await notePushes(env, Array.from({ length: 20 }, (_, i) => ({ platform: "android", ok: i > 5, dead: false, latency: 4000 })));
  const pushes = [];
  const pushAdmins = async (_env, t, b) => { pushes.push(`${t} ${b}`); return { sent: 1 }; };
  await statusTick(env, pushAdmins, now - 4 * 60_000);
  await statusTick(env, pushAdmins, now);
  assert.ok(pushes.some((t) => t.includes("P2000")), pushes.join(" | "));
  const o = await statusOverzicht(env, { beheer: true }, now);
  const p2000 = o.groepen[0].onderdelen.find((x) => x.id === "p2000");
  assert.equal(p2000.staat, "down");
  assert.equal(p2000.fout, "HTTP 502");
  assert.equal(o.groepen[1].onderdelen.find((x) => x.id === "push_android").staat, "down");
  assert.equal(o.staat, "down");
  assert.equal(p2000.dagen.length, 90);

  const inc = await maakIncident(env, { titel: "P2000 komt niet binnen", soort: "storing", onderdelen: ["p2000"], tekst: "We onderzoeken het." });
  let l = await statusOverzicht(env, {}, Date.now());
  assert.equal(l.incidenten.actief.length, 1);
  assert.equal(l.fout, undefined);
  await updateIncident(env, inc.id, { tekst: "Opgelost.", opgelost: true });
  l = await statusOverzicht(env, {}, Date.now() + 1000);
  assert.equal(l.incidenten.actief.length, 0);
  assert.equal(l.incidenten.recent.length, 1);
  assert.equal(l.incidenten.recent[0].updates[0].fase, "opgelost");

  // Recovery push
  await set("feed_ok", now);
  await statusTick(env, pushAdmins, now + 60_000);
  assert.ok(pushes.some((t) => t.includes("werkt weer")), pushes.join(" | "));
});
