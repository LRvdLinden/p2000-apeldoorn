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
  assert.equal(kenToe([pol("p1", 0), ambu("a1", 20)], [])[1].incident, "a1");
  assert.equal(kenToe([pol("p1", 0), ambu("a1", 2, { title: "Ambu 06121 Apeldoorn Rit 351103" })], [])[1].incident, "a1");
  assert.equal(kenToe([pol("p1", 0, { title: "Inbraak woning Deventerstraat Apeldoorn" }), ambu("a1", 2)], [])[1].incident, "a1");
  assert.equal(kenToe([pol("p1", 0), ambu("a1", 2, { prioriteit: "B1" })], [])[1].incident, "a1");
});
