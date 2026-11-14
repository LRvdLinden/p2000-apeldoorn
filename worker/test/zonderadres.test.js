import { test } from "node:test";
import assert from "node:assert/strict";
import { kenToe } from "../src/incident.js";

const t0 = Date.parse("2026-11-14T10:15:12Z");
const pol = (guid, min, o = {}) => ({ guid, dienst: "politie", prioriteit: "P1", title: "Aanrijding letsel Deventerstraat Apeldoorn 871182", locatie: "Deventerstraat", stad: "Apeldoorn", lat: 52.22017, lon: 6.00016, datum: t0 + min * 60_000, eenheden: [], ...o });
const ambu = (guid, min, o = {}) => ({ guid, dienst: "ambulance", prioriteit: "A1", title: "Ambu 06121 HV weg letsel Apeldoorn Rit 351102", locatie: null, stad: "Apeldoorn", lat: 52.21118, lon: 5.97282, datum: t0 + min * 60_000, eenheden: [], ...o });

test("ambulance without an address joins the one road accident in the same place", () => {
  const r = kenToe([pol("p1", 0), pol("p2", 1.8), ambu("a1", 2.5)], []);
  assert.deepEqual(r.map((m) => m.incident), ["p1", "p1", "p1"]);
});
test("also when the ambulance came first", () => {
  const r = kenToe([ambu("a1", 0), pol("p1", 1), pol("p2", 2)], []);
  assert.deepEqual(r.map((m) => m.incident), ["a1", "a1", "a1"]);
});
test("no guess: two accidents, another place, too late, another kind of call", () => {
  assert.equal(kenToe([pol("p1", 0), pol("p2", 1, { locatie: "Zwolseweg", lat: 52.24, lon: 5.96 }), ambu("a1", 2)], [])[2].incident, "a1");
  assert.equal(kenToe([pol("p1", 0, { stad: "Ugchelen" }), ambu("a1", 2)], [])[1].incident, "a1");
  assert.equal(kenToe([pol("p1", 0), ambu("a1", 6)], [])[1].incident, "a1");
  assert.equal(kenToe([pol("p1", 0), ambu("a1", 2, { title: "Ambu 06121 Apeldoorn Rit 351103" })], [])[1].incident, "a1");
  assert.equal(kenToe([pol("p1", 0, { title: "Inbraak woning Deventerstraat Apeldoorn" }), ambu("a1", 2)], [])[1].incident, "a1");
  assert.equal(kenToe([pol("p1", 0), ambu("a1", 2, { prioriteit: "B1" })], [])[1].incident, "a1");
});

test("the joined ambulance stands at the address of the accident", () => {
  const r = kenToe([pol("p1", 0), ambu("a1", 2.5)], []);
  assert.deepEqual([r[1].lat, r[1].lon, r[1].locatie], [52.22017, 6.00016, "Deventerstraat"]);
  const los = kenToe([pol("p1", 0), ambu("a1", 9)], []);
  assert.equal(los[1].locatie, null);
});

// Seen live on 14 November 2026, 21:18 to 21:20, Lieren: three ambulances without an address, the fire brigade and a
// fourth ambulance with "Kanaal Zuid" ended up as four incidents.
const lieren = (guid, sec, title, dienst = "ambulance", straat = null) => ({ guid, dienst, prioriteit: dienst === "brandweer" ? "P1" : "A0", title, locatie: straat, stad: "Lieren",
  lat: straat ? 52.1574 : 52.16016, lon: straat ? 6.01796 : 6.00097, datum: t0 + sec * 1000, eenheden: [] });
const reeks = () => [lieren("a1", 0, "Reanimatie Lieren"), lieren("b1", 17, "BON-02 Reanimatie Kanaal Zuid Lieren 063441", "brandweer", "Kanaal Zuid"),
  lieren("a2", 37, "Ambu 06126 06122 Reanimatie Lieren Rit 351699 3"), lieren("a3", 122, "Ambu 06812 Reanimatie Lieren Rit 351702"),
  lieren("a4", 137, "Ambu 08993 Reanimatie Kanaal zuid  Lieren Rit 351703 regio 6", "ambulance", "Kanaal Zuid")];

test("resuscitation: every alert of the Lieren call is one incident, at the address", () => {
  const r = kenToe(reeks(), []);
  assert.deepEqual(r.map((m) => m.incident), ["a1", "a1", "a1", "a1", "a1"]);
  assert.deepEqual([r[2].locatie, r[2].lat, r[2].lon], ["Kanaal Zuid", 52.1574, 6.01796]);
  assert.equal(r[3].locatie, "Kanaal Zuid");
});
test("resuscitation: ambulances without an address join each other when no address is known", () => {
  const r = kenToe([lieren("a1", 0, "Reanimatie Lieren"), lieren("a2", 37, "Ambu 06126 Reanimatie Lieren Rit 351699")], []);
  assert.deepEqual(r.map((m) => m.incident), ["a1", "a1"]);
});
test("resuscitation: no guess with two addresses, another place, too late or another kind of call", () => {
  const twee = kenToe([lieren("b1", 0, "Reanimatie Kanaal Zuid Lieren", "brandweer", "Kanaal Zuid"), { ...lieren("b2", 20, "Reanimatie Dorpstraat Lieren", "brandweer", "Dorpstraat"), lat: 52.17, lon: 6.03 },
    lieren("a1", 60, "Ambu 06126 Reanimatie Lieren Rit 1")], []);
  assert.equal(twee[2].incident, "a1");
  assert.equal(kenToe([lieren("a1", 0, "Reanimatie Lieren"), { ...lieren("a2", 30, "Reanimatie Beekbergen"), stad: "Beekbergen" }], [])[1].incident, "a2");
  assert.equal(kenToe([lieren("a1", 0, "Reanimatie Lieren"), lieren("a2", 360, "Ambu 06126 Reanimatie Lieren Rit 2")], [])[1].incident, "a2");
  assert.equal(kenToe([lieren("a1", 0, "Reanimatie Lieren"), lieren("a2", 30, "Ambu 06126 HV weg letsel Lieren Rit 2")], [])[1].incident, "a2");
  // A road accident still needs police or fire brigade with the address: two ambulances without one do not join.
  assert.equal(kenToe([lieren("a1", 0, "Ambu 06121 HV weg letsel Lieren Rit 1"), lieren("a2", 30, "Ambu 06126 HV weg letsel Lieren Rit 2")], [])[1].incident, "a2");
});
