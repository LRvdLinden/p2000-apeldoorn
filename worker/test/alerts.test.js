import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromNlAlert, fromBurgernet, fromKnmi, wantsPush, prefsFrom, payloadForWarning, parseNlAlertRing } from "../src/alerts.js";

const sample = (f) => JSON.parse(readFileSync(new URL(`../../tools/samples/${f}`, import.meta.url)));
const ring = (lat, lon, r = 0.02) => [0, 60, 120, 180, 240, 300].map((a) => `${(lat + r * Math.cos(a * Math.PI / 180)).toFixed(5)},${(lon + r * 1.6 * Math.sin(a * Math.PI / 180)).toFixed(5)}`).join(" ");

test("NL-Alert: real feed has nothing for Apeldoorn, a fire in Ugchelen is kept", () => {
  const real = sample("nlalert.json").data.map((a) => fromNlAlert(a)).filter(Boolean);
  assert.equal(real.length, 0);
  const w = fromNlAlert({ id: "abc123", message: "Brand met rook in Ugchelen. Houd ramen dicht. *** Fire in Ugchelen.", type: "alert",
    start_at: new Date(Date.now() - 600_000).toISOString(), stop_at: new Date(Date.now() + 3_600_000).toISOString(), area: [ring(52.17, 5.90)] });
  assert.equal(w.id, "nlalert:abc123");
  assert.equal(w.titel, "Brand met rook in Ugchelen");
  assert.equal(w.tekst_en, "Fire in Ugchelen.");
  assert.equal(w.status, "actief");
  assert.equal(w.gebied[0][0].length, 2);
  assert.ok(Math.abs(w.gebied[0][0][1] - 52.19) < 0.01); // [lon, lat]
});

test("parse NL-Alert ring", () => {
  assert.deepEqual(parseNlAlertRing("52.1,5.9 52.2,6.0"), [[5.9, 52.1], [6.0, 52.2]]);
});

test("Burgernet: only Apeldoorn (and Teuge via Voorst), place from the text", () => {
  const real = sample("burgernet.json").map((a) => fromBurgernet(a)).filter(Boolean);
  assert.ok(real.every((w) => w.plaats));
  const a = fromBurgernet({ location: "APELDOORN", date: "06/11/2026", time: "", link: "https://burgernet.nl/burgernet/123", report: "7335AB In verband met een vermissing in Ugchelen zoeken wij: Man, 80 jaar. Tips? Bel nu 112", isClosed: null });
  assert.equal(a.plaats, "Ugchelen");
  assert.equal(a.soort, "Vermissing");
  assert.equal(a.id, "burgernet:123");
  assert.ok(!a.titel.includes("7335AB"));
  const b = fromBurgernet({ location: "VOORST", date: "06/11/2026", report: "Diefstal in Twello", link: "x/burgernet/9" });
  assert.equal(b, null);
  const c = fromBurgernet({ location: "VOORST", date: "06/11/2026", report: "Inbraak bij vliegveld Teuge, verdachte gevlucht", link: "x/burgernet/10" });
  assert.equal(c.plaats, "Teuge");
});

test("KNMI: keeps periods that cover the area, with the highest level", () => {
  const gelderland = { type: "Polygon", coordinates: [[[5.5, 51.8], [6.5, 51.8], [6.5, 52.5], [5.5, 52.5], [5.5, 51.8]]] };
  const zeeland = { type: "Polygon", coordinates: [[[3.4, 51.2], [4.2, 51.2], [4.2, 51.7], [3.4, 51.7], [3.4, 51.2]]] };
  const now = Date.now();
  const data = { warning_events: [{ id: 7, phenomenon: { nl: "Mist" }, periods: [{ starts_at: new Date(now - 3600e3).toISOString(), ends_at: new Date(now + 3600e3).toISOString(),
    parts: [{ level: "yellow", area_description: "Gelderland", geometry: gelderland }, { level: "orange", area_description: "Zeeland", geometry: zeeland }] }] }] };
  const list = fromKnmi(data, now);
  assert.equal(list.length, 1);
  assert.equal(list[0].niveau, "yellow");
  assert.equal(list[0].plaats, "Gelderland");
  assert.equal(list[0].status, "actief");
  assert.deepEqual(fromKnmi({ warning_events: [] }), []);
});

test("push preferences", () => {
  const prefs = prefsFrom({ nlalert: true, burgernet: false, knmi: ["orange", "red"] });
  const dev = { enabled: true, plaatsen: [] };
  assert.ok(wantsPush(dev, prefs, { bron: "nlalert", gebied: null }));
  assert.ok(!wantsPush(dev, prefs, { bron: "burgernet", plaats: "Apeldoorn" }));
  assert.ok(!wantsPush(dev, prefs, { bron: "knmi", niveau: "yellow" }));
  assert.ok(wantsPush(dev, prefs, { bron: "knmi", niveau: "red" }));
  assert.ok(!wantsPush(dev, null, { bron: "nlalert" }), "old app versions get no warning pushes");
  const ugchelen = { enabled: true, plaatsen: ["Ugchelen"] };
  const nl = fromNlAlert({ id: "x", message: "Brand in Ugchelen.", start_at: new Date().toISOString(), area: [ring(52.17, 5.90)] });
  assert.ok(wantsPush(ugchelen, prefs, nl));
  assert.ok(!wantsPush({ enabled: true, plaatsen: ["Uddel"] }, prefs, nl));
  const p = payloadForWarning({ ...nl, bron: "nlalert" }, "nl");
  assert.equal(p.aps.alert.title, "NL-Alert");
  assert.equal(p.waarschuwing, "nlalert:x");
});

test("warnings: Mijn buurt (radius) also limits warning pushes", async () => {
  const { wantsPush } = await import("../src/alerts.js");
  const prefs = { nlalert: true, burgernet: true, knmi: ["orange", "red"] };
  const dev = { enabled: true, plaatsen: [], radius_km: 3, lat: 52.21, lon: 5.97 };
  const square = (lat, lon, d) => [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]];
  assert.equal(wantsPush(dev, prefs, { bron: "nlalert", gebied: square(52.21, 5.97, 0.01) }), true);   // covers the centre
  assert.equal(wantsPush(dev, prefs, { bron: "nlalert", gebied: square(52.10, 5.80, 0.01) }), false);  // far away
  assert.equal(wantsPush(dev, prefs, { bron: "burgernet", plaats: "Apeldoorn", lat: 52.22, lon: 5.98 }), true);
  assert.equal(wantsPush(dev, prefs, { bron: "burgernet", plaats: "Hoenderloo", lat: 52.12, lon: 5.88 }), false);
  assert.equal(wantsPush({ ...dev, radius_km: null }, prefs, { bron: "burgernet", plaats: "Hoenderloo", lat: 52.12, lon: 5.88 }), true);
});
