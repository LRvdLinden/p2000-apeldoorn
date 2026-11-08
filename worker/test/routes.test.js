import { test } from "node:test";
import assert from "node:assert/strict";
import { berekenRoutes, kiesKazernes, isSpoed, dun } from "../src/routes.js";

const KAZ = [
  { id: "bw-zuid", naam: "Kazerne Zuid", soort: "brandweer", lat: 52.19, lon: 5.96, aliassen: ["apeldoorn-zuid"] },
  { id: "bw-noord", naam: "Kazerne Noord", soort: "brandweer", lat: 52.24, lon: 5.97, aliassen: ["apeldoorn-noord"] },
];

test("routes: named stations, road route, urgency a quarter faster", async () => {
  const m = { guid: "g1", dienst: "brandweer", prioriteit: "P1", lat: 52.21, lon: 5.96, datum_tijd: "2026-11-08T12:00:00Z",
    eenheden: [{ naam: "Brandweer Apeldoorn-Noord" }] };
  assert.equal(isSpoed(m), true);
  assert.equal(isSpoed({ prioriteit: "A2" }), false);
  const { gekozen, genoemd } = kiesKazernes(m, KAZ);
  assert.equal(genoemd, true);
  assert.deepEqual(gekozen.map((k) => k.id), ["bw-noord"]);
  const r = await berekenRoutes(m, async () => ({ km: 4, min: 8, punten: [[52.24, 5.97], [52.22, 5.965], [52.21, 5.96]] }), KAZ);
  const k = r.kazernes[0];
  assert.equal(k.via, "route");
  assert.equal(k.rij_min, 6); // 8 × 0.75
  assert.equal(k.vertrek, "2026-11-08T12:04:00.000Z"); // 4 min turnout
  assert.equal(k.aankomst, "2026-11-08T12:10:00.000Z");
  assert.equal(k.route.length, 3);
});

test("routes: without a route an estimate, nearest station when none is named", async () => {
  const m = { guid: "g2", dienst: "brandweer", prioriteit: "P2", lat: 52.195, lon: 5.96, datum_tijd: "2026-11-08T12:00:00Z", eenheden: [] };
  const r = await berekenRoutes(m, async () => null, KAZ);
  assert.equal(r.kazernes[0].id, "bw-zuid");
  assert.equal(r.kazernes[0].via, "schatting");
  assert.equal(r.kazernes[0].genoemd, false);
  assert.equal(dun(Array.from({ length: 500 }, (_, i) => [i, i]), 100).length, 100);
});
