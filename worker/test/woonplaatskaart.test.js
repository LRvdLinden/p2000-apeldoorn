import { test } from "node:test";
import assert from "node:assert/strict";
import { woonplaatsCentrum } from "../src/werkgebied.js";
import { toAPI } from "../src/db.js";
import { fromKoyeb } from "../src/koyeb-feed.js";
import { matches } from "../src/rules.js";

const alert = (overrides = {}) => ({
  guid: "f9c47be5-dd07-75aa-0ffc-9ae2482d0f05",
  datum: Date.parse("2026-11-18T09:35:00.000Z"),
  title: "Ambu 06123 - Apeldoorn Rit 355656",
  full_melding: "A1 Ambu 06123 - Apeldoorn Rit 355656",
  stad: "Apeldoorn", dienst: "ambulance", locatie: null,
  lat: null, lon: null, eenheden: "[]", voertuigen: "[]",
  link: "https://p2000.page/api", ...overrides
});

test("Historic Koyeb alert without coordinates displays Apple Maps marker at Apeldoorn centre", () => {
  const saved = alert();
  const publicAlert = toAPI(saved);
  assert.deepEqual([publicAlert.lat, publicAlert.lon], [52.21084, 5.97373]);
  assert.equal(publicAlert.plaatscentrum, true);
  assert.equal(publicAlert.locatie, null);
  // The D1 source remains untouched: an approximate marker must not be treated
  // as a precise address or used for radius notification targeting.
  assert.equal(saved.lat, null);
  assert.equal(saved.lon, null);
  assert.equal(saved.plaatscentrum, undefined);
});

test("New Koyeb alert uses the same read-time fallback without persisting estimated GPS", () => {
  const raw = {
    id: "d1f9dcd9-dd07-75aa-0ffc-9ae2482d0f05",
    p2000: "A1 Ambu 06123 - Apeldoorn Rit 355656",
    stad: "Apeldoorn", straat: "onbekend", dienst: "ambulance",
    date: { timestamp: Math.floor(Date.now() / 60_000) * 60 },
  };
  const m = fromKoyeb(raw);
  assert.ok(m);
  assert.equal(m.lat, null);
  assert.equal(m.lon, null);
  const d = toAPI({ ...m, eenheden: "[]", voertuigen: "[]" });
  assert.equal(d.plaatscentrum, true);
  assert.equal(d.lat, 52.21084);
  assert.equal(d.lon, 5.97373);
  assert.equal(d.link, "https://p2000.page/api");
});

test("Known village aliases resolve to their own centres, never always Apeldoorn", () => {
  const examples = [
    ["Beekbergen", 52.14413, 5.96788],
    ["Loenen", 52.10966, 6.00754],
    ["Wenum Wiesel", 52.2542, 5.92707],
    ["Beemte Broekland", 52.2571, 6.01057],
    ["Teuge", 52.23686, 6.04975],
  ];
  for(const [stad, lat, lon] of examples) {
    assert.deepEqual(woonplaatsCentrum(stad) && [woonplaatsCentrum(stad).lat, woonplaatsCentrum(stad).lon], [lat, lon]);
    const d=toAPI(alert({ stad }));
    assert.deepEqual([d.lat, d.lon], [lat, lon]);
    assert.equal(d.plaatscentrum, true);
  }
});

test("Real coordinates are preserved, even when the street name is unavailable", () => {
  const d = toAPI(alert({ lat: 52.1967, lon: 5.9633, locatie: null }));
  assert.equal(d.lat, 52.1967);
  assert.equal(d.lon, 5.9633);
  assert.equal(d.plaatscentrum, undefined);
});

test("If street is known but coordinates are not, label town marker as approximate", () => {
  const d=toAPI(alert({locatie:"Onbekende Nieuweweg"}));
  assert.equal(d.plaatscentrum,true);
  assert.deepEqual([d.lat,d.lon],[52.21084,5.97373]);
});

test("Unknown town cannot be silently plotted at Apeldoorn", () => {
  const d=toAPI(alert({stad:"Onbekende plaats"}));
  assert.equal(d.lat,null);
  assert.equal(d.lon,null);
  assert.equal(d.plaatscentrum,undefined);
});

test("A radius subscription still cannot match a town-only Koyeb alert", () => {
  const device={enabled:true,diensten:[],plaatsen:[],prioriteiten:[],radius_km:5,
    lat:52.21084,lon:5.97373,quiet:false};
  const m=fromKoyeb({id:"aabbccdd-1111-2222-3333-444444444444",p2000:"A1 Ambu 06123 - Apeldoorn Rit 355656",
    stad:"Apeldoorn",straat:"onbekend",dienst:"ambulance",date:{timestamp:Math.floor(Date.now()/60000)*60}});
  assert.ok(m);
  assert.equal(matches(device,m),false);
});
