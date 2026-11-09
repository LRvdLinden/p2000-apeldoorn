import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { knmiPagina, fromNlAlert, fromBurgernet, fromKnmi, wantsPush, prefsFrom, payloadForWarning, parseNlAlertRing } from "../src/alerts.js";

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

test("Burgernet: no time in the feed means no made-up 13:00, and 'Opgelet!' is not the whole title", () => {
  const now = Date.parse("2026-11-09T19:13:00Z");
  const w = fromBurgernet({ location: "APELDOORN", date: "09/11/2026", time: "", link: "https://burgernet.nl/burgernet/3977418",
    report: "Opgelet! Op dit moment zijn nepagenten actief in/rondom Apeldoorn Zij vragen om uw geld. Tips? Bel nu 112" }, now);
  assert.equal(w.start_at, now);
  assert.equal(w.startOnbekend, true);
  assert.match(w.titel, /^Opgelet! Op dit moment zijn nepagenten actief/);
  const t = fromBurgernet({ location: "APELDOORN", date: "09/11/2026", time: "20:11", link: "x/burgernet/1", report: "Gezocht: man. Tips? Bel nu 112" }, now);
  assert.equal(new Date(t.start_at).toISOString(), "2026-11-09T19:11:00.000Z");
});

test("Burgernet /active: relative link becomes the burgernet.nl page, start from date and time", () => {
  const w = fromBurgernet({ location: "APELDOORN", date: "09\/11\/2026".replace(/\\/g, ""), time: "20:11", link: "/burgernet/3977418",
    report: "Opgelet! Op dit moment zijn nepagenten actief in/rondom Apeldoorn.\r\nTips? Bel nu 112" });
  assert.equal(w.id, "burgernet:3977418");
  assert.equal(w.link, "https://www.burgernet.nl/burgernet/3977418");
  assert.equal(w.startOnbekend, false);
  assert.equal(new Date(w.start_at).toISOString(), "2026-11-09T19:11:00.000Z");
  assert.equal(fromBurgernet({ location: "GOUDA", date: "09/11/2026", time: "20:03", link: "/burgernet/3977417", report: "Vermist" }), null);
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

test("knmi: consecutive periods of one warning are joined, phenomenon in Dutch", () => {
  const ring = [[5.8, 52.1], [6.1, 52.1], [6.1, 52.3], [5.8, 52.3], [5.8, 52.1]];
  const part = (level) => ({ level, area_description: "Gelderland", impact: "Houd rekening met vertragingen op de weg.", instruction: "Rijd langzamer.", geometry: { type: "Polygon", coordinates: [ring] } });
  const now = Date.parse("2026-11-08T07:00:00Z");
  const data = { warning_events: [{ id: "e1", phenomenon: "fog", periods: [
    { starts_at: "2026-11-08T05:00:00Z", ends_at: "2026-11-08T08:00:00Z", parts: [part("yellow")] },
    { starts_at: "2026-11-08T08:00:00Z", ends_at: "2026-11-08T09:00:00Z", parts: [part("yellow")] },
    { starts_at: "2026-11-08T09:00:00Z", ends_at: "2026-11-08T10:00:00Z", parts: [part("orange")] },
  ] }] };
  const list = fromKnmi(data, now);
  assert.equal(list.length, 2);
  assert.equal(list[0].titel, "Mist");
  assert.equal(list[0].end_at, Date.parse("2026-11-08T09:00:00Z"));
  assert.equal(list[1].niveau, "orange");
  assert.deepEqual(list[0].tijdvakken.map((t) => t.niveau), ["yellow", "orange"]);
  assert.equal(list[0]._ev, undefined);
  assert.equal(list[0].verwachting, "Houd rekening met vertragingen op de weg.");
  assert.equal(list[0].advies, "Rijd langzamer.");
  assert.equal(list[0].tekst, "Houd rekening met vertragingen op de weg.");
});

test("knmi: headline, description and details from the warnings page", () => {
  const html = `<section id="waarschuwing-2" class="weather-warnings-card"><article class="weather-warnings-details">
  <h2 id="warning-title-2" class="weather-warnings-details__title">Vanochtend in het midden en noorden plaatselijk dichte mist</h2>
  <div class="weather-warnings-details__body"><p>Vanochtend komt er plaatselijk dichte mist voor.</p><p>De mist verplaatst zich.</p></div>
  <p class="weather-warnings-details__issued">Uitgifte: 08/11/2026 07:50 uur LT</p>
  <details class="weather-warnings-more"><summary>Details</summary><div><p>Zicht minder dan 200 meter.</p></div></details></article></section>`;
  const p = knmiPagina(html).get("2");
  assert.equal(p.kop, "Vanochtend in het midden en noorden plaatselijk dichte mist");
  assert.equal(p.omschrijving, "Vanochtend komt er plaatselijk dichte mist voor.\nDe mist verplaatst zich.");
  assert.equal(p.details, "Zicht minder dan 200 meter.");
  assert.equal(p.uitgifte, "08/11/2026 07:50 uur LT");
  const ring = [[5.8, 52.1], [6.1, 52.1], [6.1, 52.3], [5.8, 52.3], [5.8, 52.1]];
  const data = { warning_events: [{ id: 2, phenomenon: "fog", label: "Mist", periods: [{ starts_at: "2026-11-08T05:00:00Z", ends_at: "2026-11-08T08:00:00Z",
    parts: [{ level: "yellow", area_description: "Gelderland", geometry: { type: "Polygon", coordinates: [ring] } }] }] }] };
  const [w] = fromKnmi(data, Date.parse("2026-11-08T06:00:00Z"), knmiPagina(html));
  assert.equal(w.kop, p.kop);
  assert.equal(w.titel, "Mist");
});

test("knmi: an old link shows the warning as lifted (code green)", async () => {
  const { knmiOpgeheven } = await import("../src/alerts.js");
  const w = knmiOpgeheven("knmi:2:2026-11-08T06:00:00+01:00");
  assert.equal(w.niveau, "green");
  assert.equal(w.status, "beeindigd");
  assert.equal(knmiOpgeheven("nlalert:12"), null);
});
