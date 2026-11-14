import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { profielenFrom, geldt, meldingWanted, warningWanted, localTime } from "../src/profielen.js";
import { fromAdsb, identify } from "../src/heli.js";

const sample = (f) => JSON.parse(readFileSync(new URL(`../../tools/samples/${f}`, import.meta.url)));
const device = { enabled: true, diensten: [], plaatsen: [], prioriteiten: [], quiet: false, critical: true, radius_km: null, lat: null, lon: null };
const melding = (o) => ({ dienst: "brandweer", prioriteit: "P1", stad: "Beekbergen", locatie: "Dorpsstraat", lat: 52.16, lon: 5.96, ...o });
// 2026-11-04 is a Wednesday; 12:00 UTC = 13:00 in Amsterdam.
const wed1300 = new Date("2026-11-04T12:00:00Z");
const wed2330 = new Date("2026-11-04T22:30:00Z");
const thu0300 = new Date("2026-11-05T02:00:00Z");

test("profiles: cleaned, at most five", () => {
  const list = profielenFrom(Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, diensten: ["brandweer"], knmi: ["red", "purple"], dagen: [9, 1] })));
  assert.equal(list.length, 5);
  assert.deepEqual(list[0].knmi, ["red"]);
  assert.deepEqual(list[0].dagen, [1]);
  assert.equal(profielenFrom(undefined), null);
});

test("profiles: time windows in Amsterdam, overnight belongs to the start day", () => {
  assert.deepEqual(localTime(wed1300), { minutes: 13 * 60, day: 3 });
  const dag = { actief: true, altijd: false, van: 7 * 60, tot: 18 * 60, dagen: [1, 2, 3, 4, 5] };
  assert.equal(geldt(dag, wed1300), true);
  assert.equal(geldt(dag, wed2330), false);
  const nacht = { actief: true, altijd: false, van: 23 * 60, tot: 7 * 60, dagen: [3] };
  assert.equal(geldt(nacht, wed2330), true);
  assert.equal(geldt(nacht, thu0300), true); // Thursday 03:00 still belongs to Wednesday night
  assert.equal(geldt({ ...nacht, dagen: [4] }, thu0300), false);
  assert.equal(geldt({ ...nacht, actief: false, altijd: true }, wed1300), false);
});

test("profiles: an alert is pushed when one active profile matches", () => {
  const prefs = { profielen: profielenFrom([
    { id: "a", diensten: ["ambulance"], plaatsen: ["Apeldoorn"] },
    { id: "b", diensten: ["brandweer"], plaatsen: ["Beekbergen"], altijd: false, van: 600, tot: 1080, dagen: [3] },
  ]) };
  assert.equal(meldingWanted(device, prefs, melding(), wed1300), true);
  assert.equal(meldingWanted(device, prefs, melding(), wed2330), false);
  assert.equal(meldingWanted(device, prefs, melding({ dienst: "politie" }), wed1300), false);
  // Without profiles the old single settings still work.
  assert.equal(meldingWanted({ ...device, diensten: ["politie"] }, null, melding(), wed1300), false);
  assert.equal(meldingWanted(device, null, melding(), wed1300), true);
});

test("profiles: warnings follow the profile choices", () => {
  const prefs = { nlalert: true, burgernet: false, knmi: [], profielen: profielenFrom([{ id: "a", nlalert: false, burgernet: true, knmi: ["red"] }]) };
  assert.equal(warningWanted(device, prefs, { bron: "burgernet", plaats: "Apeldoorn" }, wed1300), true);
  assert.equal(warningWanted(device, prefs, { bron: "nlalert", gebied: null }, wed1300), false);
  assert.equal(warningWanted(device, prefs, { bron: "knmi", niveau: "red", gebied: null }, wed1300), true);
  assert.equal(warningWanted(device, prefs, { bron: "knmi", niveau: "orange", gebied: null }, wed1300), false);
});

test("helicopters: Lifeliner and Zulu found by callsign or registration", () => {
  const ll = sample("adsblol-lifeln3.json").ac;
  const zulu = sample("adsb-type-A139.json").nl;
  const list = fromAdsb([...ll, ...zulu, { flight: "KLM123", lat: 52, lon: 5 }], 1_793_956_626_001);
  assert.deepEqual(list.map((h) => h.naam), ["Lifeliner 3", "Zulu 25"]);
  const l3 = list[0];
  assert.equal(l3.soort, "trauma");
  assert.equal(l3.koers, 204);
  assert.equal(l3.hoogte_ft, 725);
  assert.equal(l3.snelheid_kt, 122);
  assert.equal(identify({ r: "PH-PXA" }).naam, "Zulu 01");
  assert.equal(identify({ flight: "MEDIC01" }).id, "medic01"); // since build 97: the ambulance helicopter, not a Lifeliner
  assert.equal(identify({ flight: "KLM123" }), null);
});

test("helicopters: still recognised after a callsign change", () => {
  // New spelling of the callsign.
  assert.equal(identify({ flight: "LIFELINER3" }).naam, "Lifeliner 3");
  assert.equal(identify({ flight: "ZULU25" }).naam, "Zulu 25");
  assert.equal(identify({ flight: "ZXP07" }).naam, "Zulu 07");
  // Unknown callsign, but this airframe flew as Lifeliner 3 before.
  const learned = new Map([["486a31", { id: "lifeliner3", naam: "Lifeliner 3", soort: "trauma", callsigns: [] }]]);
  const h = identify({ flight: "PHXYZ", hex: "486A31" }, learned);
  assert.equal(h.naam, "Lifeliner 3");
  assert.equal(h.herkenning, "toestel");
  // Unknown airframe, but the aircraft database names the operator.
  const op = identify({ flight: "", r: "PH-ABC", t: "EC35", ownOp: "ANWB Medical Air Assistance", hex: "4844aa" });
  assert.equal(op.soort, "trauma");
  assert.equal(op.herkenning, "operator");
  // An ordinary helicopter is not shown.
  assert.equal(identify({ flight: "PHHOP", r: "PH-HOP", t: "R44", hex: "48aaaa" }), null);
});
