import { test } from "node:test";
import assert from "node:assert/strict";
import { plaatsBij, plaatsenUit } from "../src/plaats.js";
import { adresUit, kiesPand } from "../src/pand.js";
import { volgPushes, heliPrefsFrom } from "../src/extra.js";

test("plaatsBij: nearest place, null above sea", () => {
  assert.equal(plaatsBij(52.2108, 5.9737).plaats, "Apeldoorn");
  assert.equal(plaatsBij(52.2369, 6.0498).tekst, "Teuge, Voorst");
  assert.equal(plaatsBij(53.9, 4.0), null); // North Sea
  assert.equal(plaatsBij(null, 5), null);
});

test("plaatsenUit: one line per place, newest first, no jumping back and forth", () => {
  const t0 = Date.parse("2026-11-13T09:00:00Z");
  const p = (min, lat, lon, grond = 0) => ({ at: t0 + min * 60_000, lat, lon, grond });
  const rows = [p(0, 52.2108, 5.9737), p(1, 52.2108, 5.9740), p(1.2, 52.2369, 6.0498), p(1.5, 52.2110, 5.9739), p(3, 52.2369, 6.0498), p(5, 52.2369, 6.0500)];
  const l = plaatsenUit(rows);
  assert.deepEqual(l.map((x) => x.plaats), ["Teuge", "Apeldoorn"]);
  assert.equal(l[1].van, "2026-11-13T09:00:00.000Z");
  assert.equal(l[1].tot, l[0].van);
  assert.deepEqual(plaatsenUit([]), []);
});

test("adresUit and kiesPand", () => {
  assert.deepEqual(adresUit("Hoofdstraat 50"), { straat: "Hoofdstraat", nummer: "50" });
  assert.deepEqual(adresUit("Laan van Zevenhuizen 12a"), { straat: "Laan van Zevenhuizen", nummer: "12a" });
  assert.equal(adresUit("Europaweg"), null);
  assert.equal(adresUit("A50 211"), null);
  const vierkant = { type: "Polygon", coordinates: [[[5.96, 52.21], [5.97, 52.21], [5.97, 52.22], [5.96, 52.22], [5.96, 52.21]]] };
  const f = [{ geometry: vierkant, properties: { bouwjaar: 1966, gebruiksdoel: "winkelfunctie,woonfunctie", aantal_verblijfsobjecten: 3 } }];
  assert.deepEqual(kiesPand(f, 52.215, 5.965), { bouwjaar: 1966, gebruik: ["Winkel", "Wonen"], adressen: 3 });
  assert.equal(kiesPand(f, 52.3, 5.965), null);
});

test("volgPushes: the bell on one aircraft", () => {
  const now = Date.parse("2026-11-13T10:00:00Z");
  const heli = heliPrefsFrom({ volg: ["lifeliner3", "lucht-480c21", "x y"] });
  assert.deepEqual(heli.volg, ["lifeliner3", "lucht-480c21"]);
  const devices = [{ token: "t1", enabled: 1 }, { token: "t2", enabled: 1 }];
  const prefs = new Map([["t1", { heli }], ["t2", { heli: heliPrefsFrom({}) }]]);
  const h = { id: "lifeliner3", naam: "Lifeliner 3", lat: 51.6, lon: 5.7, op_grond: false, boven: "Volkel, Maashorst" };
  // was on the ground → take-off
  let g = volgPushes(devices, prefs, [h], new Map([["lifeliner3", { at: now - 60_000, grond: 1 }]]), now);
  assert.equal(g.length, 1); assert.deepEqual(g[0].tokens, ["t1"]); assert.equal(g[0].texts.nl.body, "Nu boven Volkel, Maashorst");
  // already flying a minute ago → nothing
  assert.equal(volgPushes(devices, prefs, [h], new Map([["lifeliner3", { at: now - 60_000, grond: 0 }]]), now).length, 0);
  // not seen before → take-off
  assert.equal(volgPushes(devices, prefs, [h], new Map(), now).length, 1);
});
