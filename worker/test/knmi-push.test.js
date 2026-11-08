// KNMI extra pushes (one hour before, and code green when lifted) against SQLite with the Worker's schema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { knmiExtraPushes, payloadForWarning, prefsFrom } from "../src/alerts.js";

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
const H = 3_600_000;

test("knmi: push one hour before, and one code-green push for a whole warning", async () => {
  const env = { DB: d1() };
  const kvMap = new Map();
  const kv = { get: async (k) => kvMap.get(k) ?? null, set: async (k, v) => { kvMap.set(k, v); } };
  const now = Date.parse("2026-11-08T12:00:00Z");
  const add = (id, titel, niveau, status, start, end, firstSeen) => env.DB.prepare(`INSERT INTO waarschuwingen
    (id, bron, titel, niveau, status, start_at, end_at, first_seen, updated_at, notified) VALUES (?, 'knmi', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, titel, niveau, status, start, end, firstSeen, now, niveau).run();
  // Wind: issued yesterday, starts in 40 minutes.
  await add("knmi:1:a", "Wind", "orange", "verwacht", now + 40 * 60_000, now + 6 * H, now - 20 * H);
  // Mist: yellow then orange, both over.
  await add("knmi:2:a", "Mist", "yellow", "actief", now - 5 * H, now - 2 * H, now - 6 * H);
  await add("knmi:2:b", "Mist", "orange", "actief", now - 2 * H, now - 60_000, now - 6 * H);
  // Regen: over, but a new rain code starts within the hour: no code green yet.
  await add("knmi:3:a", "Regen", "yellow", "beeindigd", now - 3 * H, now - 30 * 60_000, now - 4 * H);
  await add("knmi:3:b", "Regen", "yellow", "verwacht", now + 20 * 60_000, now + 3 * H, now - 10 * 60_000);

  const uit = await knmiExtraPushes(env, kv, now);
  assert.deepEqual(uit.find((u) => u.kind === "v"), { id: "knmi:1:a", kind: "v" });
  const g = uit.filter((u) => u.kind === "g");
  assert.equal(g.length, 1);
  assert.equal(g[0].id, "knmi:2:b");
  assert.deepEqual(g[0].levels.sort(), ["orange", "yellow"]);
  // Second run: nothing again.
  assert.equal((await knmiExtraPushes(env, kv, now + 60_000)).length, 0);

  const p = payloadForWarning({ bron: "knmi", niveau: "orange", soort: "Mist", start: new Date(now).toISOString(), tekst: "x" }, "nl", { kind: "g" });
  assert.equal(p.aps.alert.title, "Code groen · Mist");
  assert.match(p.aps.alert.body, /opgeheven/);
  const v = payloadForWarning({ bron: "knmi", niveau: "orange", soort: "Wind", start: "2026-11-08T13:00:00Z", tekst: "x" }, "nl", { kind: "v" });
  assert.equal(v.aps.alert.title, "Om 14:00 gaat code oranje in · Wind");
  assert.equal(prefsFrom({ knmi: ["yellow"] }).knmiVooraf, true);
  assert.equal(prefsFrom({ knmi: ["yellow"], knmiOpgeheven: false }).knmiOpgeheven, false);
});

test("capcode volgen: a followed capcode gets a push outside places and radius", async () => {
  const { meldingWanted, capcodesFrom } = await import("../src/profielen.js");
  const device = { enabled: true, diensten: ["ambulance"], plaatsen: ["Ugchelen"], prioriteiten: [], radius_km: 2, lat: 52.2, lon: 5.9, quiet: 0 };
  const m = { dienst: "brandweer", stad: "Deventer", lat: 52.25, lon: 6.16, prioriteit: "P2", eenheden: [{ code: "0600123", naam: "Kazerne X" }] };
  assert.equal(meldingWanted(device, { capcodes: capcodesFrom(["0600123"]) }, m), true);
  assert.equal(meldingWanted(device, { capcodes: capcodesFrom(["0600999"]) }, m), false);
  assert.deepEqual(capcodesFrom(["06 00 123", "x", "0600123"]), ["0600123"]);
});
