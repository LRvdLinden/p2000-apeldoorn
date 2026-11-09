import test from "node:test";
import assert from "node:assert/strict";
import { heliPrefsFrom, grootPrefsFrom, isGrootIncident, grootWanted, heliEvents, heliZonePushes, meldingVoorspelling, ziekenhuisBij } from "../src/extra.js";

const dev = (token, extra = {}) => ({ token, enabled: true, quiet: false, critical: false, ...extra });

test("heliPrefsFrom: zones gevalideerd, standaardwaarden", () => {
  const p = heliPrefsFrom({ zones: [{ naam: "Thuis", lat: 52.21, lon: 5.97, km: 5 }, { lat: 10, lon: 5, km: 5 }] });
  assert.equal(p.zones.length, 1);
  assert.equal(p.zones[0].naam, "Thuis");
  assert.deepEqual(p.soorten, ["trauma"]);
  assert.equal(p.opstijgen && p.landen && p.binnen, true);
  assert.equal(heliPrefsFrom(null), null);
});

test("groot incident: GRIP, grote brand, veel eenheden", () => {
  assert.equal(isGrootIncident({ title: "Zeer grote brand bedrijfspand" }), true);
  assert.equal(isGrootIncident({ title: "Ambu", grip: "1" }), true);
  assert.equal(isGrootIncident({ title: "Ambu", eenheden: Array(10).fill({}) }), true);
  assert.equal(isGrootIncident({ title: "Ongeval wegvervoer letsel" }), false);
  assert.equal(isGrootIncident({ title: "BR woning (schoorsteen)", opschaling: "klein" }), false);
  assert.equal(isGrootIncident({ title: "BR industrie", opschaling: "middel" }), true);
  const g = grootPrefsFrom({ aan: true, plaatsen: [] });
  assert.equal(grootWanted(dev("a"), { groot: g }, { title: "Grote brand", stad: "Apeldoorn" }), true);
  assert.equal(grootWanted(dev("a"), { groot: { aan: false } }, { title: "Grote brand" }), false);
});

test("heli-zones: opstijgen en zone in", () => {
  const now = Date.now();
  const zone = { naam: "Thuis", lat: 52.2, lon: 5.9, km: 5 };
  const prefs = new Map([["a", { heli: heliPrefsFrom({ zones: [zone] }) }], ["b", { heli: heliPrefsFrom({ zones: [zone], opstijgen: false, binnen: false }) }]]);
  const prev = new Map([
    ["lifeliner3", { at: now - 60_000, lat: 52.2, lon: 5.9, grond: 1 }],
    ["lifeliner1", { at: now - 60_000, lat: 52.4, lon: 5.9, grond: 0 }],
  ]);
  const list = [
    { id: "lifeliner3", naam: "Lifeliner 3", soort: "trauma", lat: 52.201, lon: 5.901, op_grond: false },
    { id: "lifeliner1", naam: "Lifeliner 1", soort: "trauma", lat: 52.21, lon: 5.9, op_grond: false },
  ];
  const ev = heliEvents(list, prev, now);
  assert.equal(ev.length, 2);
  const pushes = heliZonePushes([dev("a"), dev("b")], prefs, ev, now);
  const kinds = pushes.map((p) => p.key.split(":")[2]).sort();
  assert.deepEqual(kinds, ["binnen", "opgestegen"]);
  assert.ok(pushes.every((p) => p.tokens.join() === "a"));
  assert.match(pushes.find((p) => p.key.includes("opgestegen")).texts.nl.title, /opgestegen/);
  // paused
  prefs.get("a").heli.pauze_tot = now + 3600_000;
  assert.equal(heliZonePushes([dev("a")], prefs, ev, now).length, 0);
});

test("voorspelling: Lifeliner naar de melding, daarna ziekenhuis", () => {
  const now = Date.now();
  const h = { id: "lifeliner3", naam: "Lifeliner 3", soort: "trauma", lat: 52.0, lon: 5.6, snelheid_kt: 130, op_grond: false };
  const m = { guid: "abc12345", title: "A1 Ambulance Lifeliner 3", dienst: "traumaheli", lat: 52.21, lon: 5.97, stad: "Apeldoorn", datum_tijd: new Date(now - 5 * 60_000).toISOString(), eenheden: [] };
  const v = meldingVoorspelling(h, [m], new Set(), now);
  assert.equal(v.soort, "melding");
  assert.equal(v.guid, "abc12345");
  assert.ok(v.eta_min >= 1);
  assert.ok(v.daarna?.naam);
  assert.equal(meldingVoorspelling(h, [m], new Set(["lifeliner3:abc12345"]), now), null);
  assert.ok(ziekenhuisBij({ lat: 52.21, lon: 5.97 }));
});
