import { test } from "node:test";
import assert from "node:assert/strict";
import { luchtSoort, luchtLijst } from "../src/lucht.js";

const mil = (t, r, extra = {}) => ({ hex: "480abc", t, r, dbFlags: 1, lat: 52.2, lon: 5.9, flight: "NAF11 ", ...extra });

test("luchtSoort: type decides the icon, the callsign plays no part", () => {
  assert.deepEqual(luchtSoort(mil("H47", "D-482")), { soort: "defensie", icoon: "chinook", naam: "Chinook D-482" });
  assert.equal(luchtSoort(mil("H64", "Q-21")).icoon, "apache");
  assert.equal(luchtSoort(mil("AS32", "S-441")).icoon, "cougar");
  assert.equal(luchtSoort(mil("NH90", "N-233")).icoon, "nh90");
  assert.equal(luchtSoort(mil("F35", "F-012")).icoon, "f35");
  assert.equal(luchtSoort(mil("C130", "G-781")).icoon, "hercules");
  assert.equal(luchtSoort(mil("PC7", "L-05")).icoon, "les");
  assert.equal(luchtSoort(mil("H60", "")).icoon, "heli");
  assert.equal(luchtSoort(mil("GLF6", "V-11")).icoon, "vliegtuig");
  assert.equal(luchtSoort({ hex: "484000", t: "B738", r: "PH-BXA", lat: 52, lon: 5 }), null);
});

test("luchtSoort: coastguard, Marechaussee and PH-GOV", () => {
  assert.equal(luchtSoort({ hex: "1", r: "PH-GOV", t: "B737" }).icoon, "phgov");
  assert.deepEqual(luchtSoort({ hex: "6", r: "PH-CGD", t: "DH8A", flight: "NCG01" }), { soort: "kustwacht", icoon: "kustwacht_dash8", naam: "Kustwacht PH-CGD" });
  assert.equal(luchtSoort({ hex: "7", r: "PH-SAR", t: "A189", flight: "RESCUE1" }).icoon, "kustwacht_aw189");
  assert.equal(luchtSoort({ hex: "8", r: "PH-RSQ", t: "A189" }).soort, "kustwacht");
  assert.equal(luchtSoort({ hex: "2", r: "PH-CGX", t: "DH8A", ownOp: "Kustwacht Nederland" }).icoon, "kustwacht_dash8");
  assert.equal(luchtSoort({ hex: "3", r: "PH-NCX", t: "A189", ownOp: "Netherlands Coastguard" }).icoon, "kustwacht_aw189");
  assert.equal(luchtSoort({ hex: "4", r: "OO-XXX", t: "NH90", ownOp: "Belgian Coast Guard" }).icoon, "kustwacht_heli");
  assert.equal(luchtSoort({ hex: "5", r: "PH-XXX", t: "DA62", ownOp: "Koninklijke Marechaussee" }).soort, "kmar");
});

test("luchtLijst: fixed id per airframe, another callsign is the same aircraft, helicopters of the other layer skipped", () => {
  const a = luchtLijst([mil("H47", "D-482", { flight: "NAF11" })], 1000);
  const b = luchtLijst([mil("H47", "D-482", { flight: "GRIZZLY2" })], 2000);
  assert.equal(a[0].id, "lucht-480abc");
  assert.equal(a[0].id, b[0].id);
  assert.equal(b[0].callsign, "GRIZZLY2");
  assert.equal(luchtLijst([mil("H47", "D-482")], 1000, new Set(["480abc"])).length, 0);
  assert.equal(luchtLijst([mil("H47", "D-482", { lat: 51.0, lon: 9.5 })], 1000).length, 0); // above Germany
  const geleerd = new Map([["777", { soort: "kustwacht", icoon: "kustwacht_dash8", naam: "Kustwacht PH-CGX" }]]);
  assert.equal(luchtLijst([{ hex: "777", lat: 52.5, lon: 4.5, flight: "ANDERS1" }], 1000, new Set(), geleerd)[0].icoon, "kustwacht_dash8");
});
