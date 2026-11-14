import { test } from "node:test";
import assert from "node:assert/strict";
import { genoemdePosten, eigenVanPost, verdeling } from "../src/posten.js";
import { volgPushes, heliPrefsFrom } from "../src/extra.js";

const m = {
  guid: "g", dienst: "brandweer", full_melding: "P 1 BON-06 BR gebouw Herwers Hyundai Laan van de Dierenriem Apeldoorn 062631",
  eenheden: [{ code: "0804405", naam: "Vrijwilligers (Apeldoorn Centrum)" }, { code: "0804999", naam: "OvD Midden" }],
  voertuigen: [{ nra: "062631", nrb: "06-2631", label: "Apeldoorn Centrum - Tankautospuit (TS)" }, { nra: "069291", nrb: "06-9291", label: "OvD Apeldoorn - Dienstauto (DA)" }],
};

test("genoemdePosten: the stations named in an alert, of its own service", () => {
  assert.deepEqual(genoemdePosten(m).map((p) => p.naam), ["Brandweerkazerne Apeldoorn-Centrum"]);
  assert.deepEqual(genoemdePosten({ ...m, dienst: "ambulance" }), []);
  const p = genoemdePosten(m)[0];
  assert.deepEqual(eigenVanPost(m, p), { voertuigen: [["06-2631", "Tankautospuit (TS)"]], capcodes: [["0804405", "Vrijwilligers"]] });
});

test("verdeling: per hour and per day in Dutch time, Monday first", () => {
  // Saturday 14 November 2026, 06:44 UTC = 07:44 in the Netherlands
  const v = verdeling([Date.parse("2026-11-14T06:44:00Z"), Date.parse("2026-11-14T23:30:00Z")]);
  assert.equal(v.per_uur[7], 1); assert.equal(v.per_uur[0], 1);
  assert.equal(v.per_dag[5], 1); assert.equal(v.per_dag[6], 1); // the second one is Sunday 00:30
});

test("volgPushes: landing only when asked, flight back can be switched off", () => {
  const now = Date.parse("2026-11-14T10:00:00Z");
  const dev = [{ token: "a", enabled: 1 }, { token: "b", enabled: 1 }];
  const prefs = new Map([["a", { heli: heliPrefsFrom({ volg: ["lifeliner3"], volg_landen: true, volg_terug: false }) }], ["b", { heli: heliPrefsFrom({ volg: ["lifeliner3"] }) }]]);
  const grond = { id: "lifeliner3", naam: "Lifeliner 3", lat: 52.2108, lon: 5.9737, op_grond: true };
  const lucht = { ...grond, op_grond: false, boven: "Apeldoorn" };
  // landed: only the device that asked for it
  let g = volgPushes(dev, prefs, [grond], new Map([["lifeliner3", { at: now - 30_000, grond: 0 }]]), now);
  assert.equal(g.length, 1); assert.deepEqual(g[0].tokens, ["a"]); assert.equal(g[0].texts.nl.title, "Lifeliner 3 is geland"); assert.equal(g[0].texts.nl.body, "In Apeldoorn");
  // takes off again 20 minutes after the landing: the flight back, not for the device that switched it off
  g = volgPushes(dev, prefs, [lucht], new Map([["lifeliner3", { at: now - 30_000, grond: 1 }]]), now, new Map([["lifeliner3", now - 20 * 60_000]]));
  assert.deepEqual(g[0].tokens, ["b"]);
  // an ordinary take-off: both
  g = volgPushes(dev, prefs, [lucht], new Map([["lifeliner3", { at: now - 30_000, grond: 1 }]]), now);
  assert.deepEqual(g[0].tokens, ["a", "b"]);
});
