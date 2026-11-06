import { test } from "node:test";
import assert from "node:assert/strict";
import { vluchtenUit } from "../src/spoor.js";

const t0 = Date.parse("2026-11-06T18:00:00Z");
const p = (min, lat, lon, grond = 0, hoogte = 1500) => ({ at: t0 + min * 60_000, lat, lon, grond, hoogte_ft: hoogte });

test("spoor: positions are cut into flights on landing and on gaps", () => {
  const rows = [
    // flight 1: Volkel → Apeldoorn, lands at the scene
    p(0, 51.65, 5.70), p(5, 51.85, 5.80), p(10, 52.05, 5.90), p(15, 52.20, 5.95, 0, 300), p(16, 52.205, 5.955, 1, 0),
    // flight 2: back to the hospital, still in the air
    p(40, 52.205, 5.955, 0, 400), p(45, 52.10, 5.90), p(48, 52.00, 5.88),
  ];
  const v = vluchtenUit(rows, t0 + 49 * 60_000);
  assert.equal(v.length, 2);
  assert.equal(v[0].onderweg, true);
  assert.equal(v[0].einde, null);
  assert.equal(v[1].onderweg, false);
  assert.equal(v[1].duur_min, 16);
  assert.ok(v[1].afstand_km > 55 && v[1].afstand_km < 70, String(v[1].afstand_km));
  assert.equal(v[1].naar.lat, 52.205);
  // A gap of more than 10 minutes ends the flight too.
  const gap = vluchtenUit([p(0, 52, 5.9), p(5, 52.1, 5.9), p(30, 52.2, 5.9), p(35, 52.3, 5.9)], t0 + 3 * 3600_000);
  assert.equal(gap.length, 2);
  assert.ok(gap.every((f) => !f.onderweg));
});
