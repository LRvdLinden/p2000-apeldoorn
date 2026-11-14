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
