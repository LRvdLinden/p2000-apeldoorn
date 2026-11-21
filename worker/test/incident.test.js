import { test } from "node:test";
import assert from "node:assert/strict";
import { score, kenToe, los } from "../src/incident.js";
import { fromFeed } from "../src/rules.js";

const t0 = Date.parse("2026-11-14T06:44:00Z");
const m = (guid, min, extra = {}) => ({ guid, title: "BR gebouw", dienst: "brandweer", prioriteit: "P1", datum: t0 + min * 60_000, locatie: "Laan van de Dierenriem", lat: 52.2379, lon: 5.9835, stad: "Apeldoorn", eenheden: [{ code: "0804405" }], ...extra });

test("score: same address is one incident, restaffing never", () => {
  assert.equal(score(m("a", 0), m("b", 3)), 5);
  assert.equal(score(m("a", 0), m("b", 3, { dienst: "ambulance", eenheden: [] })), 4);
  assert.equal(score(m("a", 0), m("b", 60)), 0); // outside 45 minutes
  assert.equal(score(m("a", 0, { opschaling: "middel" }), m("b", 60)), 5); // a large incident lasts longer
  assert.equal(score(m("a", 0), m("b", 3, { locatie: "Vosselmanstraat", lat: 52.21, lon: 5.96 })), 2); // same unit only
  assert.equal(score(m("a", 0), m("b", 3, { title: "Herbezet./kazerneren (herbezetting) Kazerne Apeldoorn Centrum" })), 0);
  assert.equal(los({ prioriteit: "B2", title: "x" }), true);
});

test("kenToe: every alert gets the guid of the first alert of its incident", () => {
  const nieuw = [m("c", 9), m("b", 3), m("x", 4, { locatie: "Hoofdstraat 50", lat: 52.2, lon: 5.9, eenheden: [{ code: "1" }] })];
  kenToe(nieuw, [{ ...m("a", 0), incident: "a" }]);
  assert.deepEqual(Object.fromEntries(nieuw.map((n) => [n.guid, n.incident])), { c: "a", b: "a", x: "x" });
  // without earlier alerts the oldest of the batch is the incident
  const los2 = [m("q", 5), m("p", 1)];
  kenToe(los2, []);
  assert.deepEqual(los2.map((n) => n.incident), ["p", "p"]);
});

test("fromFeed: flags of the source", () => {
  const r = { uid: "u1", melding: "P 1 BR woning Hoofdstraat Apeldoorn", plaats: "Apeldoorn", dienst: "Brandweer", timestamp: "1794641496", groot: "1", kruising: "1", antiespam: "0", groep: "0", latlong: "52.2,5.9" };
  assert.equal(fromFeed(r).vlaggen, "groot,kruising");
  assert.equal(fromFeed({ ...r, groot: "0", kruising: "0" }).vlaggen, null);
});

test("incident numbers: the same ride or GMS number links, close ride numbers only for the same call in the same place", async () => {
  const { kenToe, nummers } = await import("../src/incident.js");
  const t0 = Date.parse("2026-11-18T20:51:00Z");
  const m = (guid, min, dienst, title, extra = {}) => ({ guid, datum: t0 + min * 60_000, dienst, title, prioriteit: extra.prio ?? "A1", stad: "Apeldoorn", locatie: extra.locatie ?? null, lat: null, lon: null, eenheden: [] });
  assert.deepEqual(nummers({ title: "A1 Ambu 06127 - Apeldoorn Rit 356390", dienst: "ambulance" }), { rit: 356390 });
  assert.deepEqual(nummers({ title: "Graag opnieuw contact OC Apeldoorn GMS:888026", dienst: "politie" }), { gms: 888026 });
  assert.deepEqual(nummers({ title: "Aanrijding letsel Koningstraat Zwolseweg Apeldoorn 888423", dienst: "politie" }), { gms: 888423 });
  assert.deepEqual(nummers({ title: "Graag contact OC Apeldoorn 888333", dienst: "ambulance" }), { gms: 888333 });
  assert.deepEqual(nummers({ title: "P 1 BON-11 Brandgerucht Snijdersplaats Apeldoorn 063231", dienst: "brandweer" }), {});
  // Two ambulances, the same ride, no street.
  const a = kenToe([m("a1", 0, "ambulance", "A1 Ambu 06128 - Apeldoorn Rit 356390"), m("a2", 1, "ambulance", "A1 Ambu 06127 - Apeldoorn Rit 356390")], []);
  assert.equal(a[1].incident, "a1");
  // "Einde VWS" an hour later, same ride.
  const v = kenToe([m("v1", 0, "ambulance", "A2 Ambu 06189 VWS Apeldoorn Rit 356095", { prio: "A2" }), m("v2", 57, "ambulance", "Einde VWS Apeldoorn Rit 356095", { prio: null })], []);
  assert.equal(v[1].incident, "v1");
  // Police accident and the contact request about its GMS number 25 minutes later.
  const g = kenToe([m("g1", 0, "politie", "Aanrijding letsel Koningstraat Zwolseweg Apeldoorn 888423", { locatie: "Koningstraat", prio: null }), m("g2", 25, "politie", "Graag contact OC Apeldoorn GMS 888423", { prio: null })], []);
  assert.equal(g[1].incident, "g1");
  // Resuscitation with two ambulances and consecutive ride numbers.
  const r = kenToe([m("r1", 0, "ambulance", "A0 Ambu 06125 06123 Reanimatie Apeldoorn Rit 358289", { prio: "A0" }), m("r2", 1, "ambulance", "A0 Ambu 06123 Reanimatie Apeldoorn Rit 358290", { prio: "A0" })], []);
  assert.equal(r[1].incident, "r1");
  // Consecutive ride numbers for different calls: not linked.
  const x = kenToe([m("x1", 0, "ambulance", "A1 Ambu 06126 - Apeldoorn Rit 359070"), m("x2", 1, "ambulance", "A2 Ambu 06343 DIA Apeldoorn Rit 359071", { prio: "A2" })], []);
  assert.equal(x[1].incident, "x2");
  // Planned transport never joins, also with the same ride number.
  const b = kenToe([m("b1", 0, "ambulance", "B2 Ambu 06203 - Apeldoorn Rit 359066", { prio: "B2" }), m("b2", 3, "ambulance", "B2 Ambu 06204 - Apeldoorn Rit 359066", { prio: "B2" })], []);
  assert.equal(b[1].incident, "b2");
});
