import { test } from "node:test";
import assert from "node:assert/strict";
import { vnogDatum, platTekst, vnogPlaats, vnogWarning, vnogStraat, vnogLijst, vnogGrip, inStraat, straatKey } from "../src/vnog.js";
import { payloadForWarning, wantsPush, prefsFrom } from "../src/alerts.js";

// Shapes as the API of VNOG returned them on 14 November 2026 (https://www.vnog.nl/api/v1/incidents).
const intro = '<p><span>Op deze pagina lees je updates rondom het incident.</span></p>';
const dierenriem = { id: "2418", title: "Brand autobedrijf Laan van Dierenriem Apeldoorn", created: "zaterdag 14 november 2026 - 08:15", updated: "zaterdag 14 november 2026 - 12:16",
  url: "https://www.vnog.nl/incidenten/brand-autobedrijf-laan-van-dierenriem-apeldoorn", main_image: false, grip: false, introduction: intro, status: true,
  updates: [{ title: "Werkplaats onder de rook", description: "<p>Iets voor 8.00 uur vanmorgen is de brandweer gealarmeerd voor een brand in een garagebedrijf aan de Laan van Dierenriem in Apeldoorn.&nbsp;</p><p>De brand is uit.</p>", image: false, link: false }],
  municipalities: { 47: "Apeldoorn" } };
const teuge = { id: "2386", title: "Brand autobedrijf Stationsweg Teuge", created: "vrijdag 11 september 2026 - 18:05", updated: "vrijdag 11 september 2026 - 18:29", url: "https://www.vnog.nl/incidenten/x",
  grip: false, status: false, municipalities: { 66: "Voorst" },
  updates: [{ title: "Brand onder controle", description: "<p>De brandweer heeft het sein 'brand meester' gegeven.</p>", image: false, link: false },
    { title: "Brand autobedrijf", description: "<p>Bij een autobedrijf in Teuge is brand uitgebroken.</p>", image: false, link: { uri: "https://www.vnog.nl/brand", title: "" } }] };
const beekbergen = { id: "2363", title: "Brand gebouw, Lage Bergweg in Beekbergen", created: "maandag 3 augustus 2026 - 21:40", updated: "maandag 3 augustus 2026 - 22:10", url: "u", grip: "1", status: true,
  updates: [{ title: "GRIP 1", description: "<p>Er is opgeschaald.</p>" }], municipalities: { 47: "Apeldoorn" } };

test("Dutch date of the API, winter and summer time", () => {
  assert.equal(new Date(vnogDatum("zaterdag 14 november 2026 - 08:15")).toISOString(), "2026-11-14T07:15:00.000Z");
  assert.equal(new Date(vnogDatum("vrijdag 11 september 2026 - 18:05")).toISOString(), "2026-09-11T16:05:00.000Z");
  assert.equal(vnogDatum("gisteren"), null);
});

test("HTML becomes plain text", () => {
  assert.equal(platTekst("<p>Een&nbsp;brand &amp; rook.</p><p>Caf&eacute; <a href='/x'>hier</a></p>"), "Een brand & rook.\nCafé hier");
});

test("place: Apeldoorn, a village in the title, Teuge from Voorst, and nothing else from Voorst", () => {
  assert.equal(vnogPlaats(dierenriem).naam, "Apeldoorn");
  assert.equal(vnogPlaats(beekbergen).naam, "Beekbergen");
  assert.equal(vnogPlaats(teuge).naam, "Teuge");
  assert.equal(vnogPlaats({ ...teuge, title: "Brand Twello", updates: [] }), null);
  assert.equal(vnogPlaats({ title: "Woningbrand Zutphen", municipalities: { 68: "Zutphen" }, updates: [] }), null);
  // A hamlet name only counts in the text after "in": a car from Engeland is not the hamlet Engeland.
  assert.equal(vnogPlaats({ title: "Ongeval A1", municipalities: { 47: "Apeldoorn" }, updates: [{ title: "x", description: "Een vrachtwagen uit Engeland." }] }).naam, "Apeldoorn");
  assert.equal(vnogPlaats({ title: "Ongeval A1", municipalities: { 47: "Apeldoorn" }, updates: [{ title: "x", description: "Het gebeurde in Loenen." }] }).naam, "Loenen");
});

test("street from the title", () => {
  assert.equal(vnogStraat(dierenriem), "Laan van Dierenriem");
  assert.equal(vnogStraat(teuge), "Stationsweg");
  assert.equal(vnogStraat(beekbergen), "Lage Bergweg");
});

test("first sight: timeline with start, no pushes flagged, no made-up spot", () => {
  const now = Date.parse("2026-11-14T16:00:00Z");
  const w = vnogWarning(dierenriem, null, now);
  assert.equal(w.id, "vnog:2418");
  assert.equal(w.bron, "vnog");
  assert.equal(w.status, "actief");
  assert.equal(w.soort, "Incident");
  assert.equal(w.lat, null);
  assert.equal(w.berichten.length, 1);
  assert.equal(w.berichten[0].soort, "start");
  assert.equal(w.berichten[0].at, "2026-11-14T07:15:00.000Z");
  assert.match(w.tekst, /^Werkplaats onder de rook: Iets voor 8\.00 uur/);
  assert.equal(w._nieuw, false);
  assert.equal(w._vers, false); // seen almost 9 hours after the start: no push
  assert.equal(vnogWarning(dierenriem, null, Date.parse("2026-11-14T07:30:00Z"))._vers, true);
});

test("a new update, an edited update, a higher GRIP and the closing", () => {
  const t0 = Date.parse("2026-11-14T07:20:00Z");
  const w1 = vnogWarning(dierenriem, null, t0);
  const prev = (w, notified = "1") => ({ row: { titel: w.titel, plaats: w.plaats, status: w.status, start_at: w.start_at, end_at: w.end_at, lat: w.lat, lon: w.lon, notified }, extra: w.extra });
  // The same answer again: nothing new.
  const zelfde = vnogWarning(dierenriem, prev(w1), t0 + 120_000);
  assert.equal(zelfde._nieuw, false);
  assert.deepEqual(zelfde.berichten, w1.berichten);
  // A typo fixed in an update: the text follows, but it is no new message.
  const typo = { ...dierenriem, updates: [{ ...dierenriem.updates[0], description: "<p>Verbeterde tekst.</p>" }] };
  const w1b = vnogWarning(typo, prev(w1), t0 + 180_000);
  assert.equal(w1b._nieuw, false);
  assert.equal(w1b.berichten[0].tekst, "Werkplaats onder de rook: Verbeterde tekst.");
  // A new update (the API puts it first) with GRIP 1.
  const t1 = t0 + 600_000;
  const meer = { ...dierenriem, grip: "1", updates: [{ title: "Brand meester", description: "<p>De brand is uit.</p>" }, ...dierenriem.updates] };
  const w2 = vnogWarning(meer, prev(w1), t1);
  assert.equal(w2._nieuw, true);
  assert.equal(w2._gripHoger, true);
  assert.equal(w2.soort, "GRIP 1");
  assert.equal(w2.extra.grip, 1);
  assert.deepEqual(w2.berichten.map((b) => b.soort), ["start", "update"]);
  assert.equal(w2.berichten[1].at, new Date(t1).toISOString());
  assert.equal(w2.tekst, "Brand meester: De brand is uit.");
  // GRIP back to none: the highest is remembered, no push for a lower one.
  const w3 = vnogWarning({ ...meer, grip: false }, prev(w2), t1 + 60_000);
  assert.equal(w3._gripHoger, false);
  assert.equal(w3.extra.grip, null);
  assert.equal(w3.extra.grip_hoogste, 1);
  // Closed.
  const t2 = t1 + 3_600_000;
  const w4 = vnogWarning({ ...meer, grip: false, status: false }, prev(w3), t2);
  assert.equal(w4.status, "beeindigd");
  assert.equal(w4._afgesloten, true);
  assert.equal(w4.end_at, t2);
  assert.equal(w4.berichten.at(-1).soort, "afloop");
  assert.equal(w4.tekst, "Brand meester: De brand is uit."); // the last real update stays the text
  // Read again after the closing: not closed twice, same end.
  const w5 = vnogWarning({ ...meer, grip: false, status: false }, prev(w4), t2 + 120_000);
  assert.equal(w5._afgesloten, false);
  assert.equal(w5.end_at, t2);
  assert.equal(w5.berichten.filter((b) => b.soort === "afloop").length, 1);
});

test("an old closed incident at first sight: start and last change as times, a link is kept", () => {
  const w = vnogWarning(teuge, null, Date.parse("2026-11-14T16:00:00Z"));
  assert.equal(w.plaats, "Teuge");
  assert.equal(w.status, "beeindigd");
  assert.deepEqual(w.berichten.map((b) => b.soort), ["start", "update", "afloop"]);
  assert.equal(w.berichten[0].at, "2026-09-11T16:05:00.000Z");
  assert.equal(w.berichten[1].at, "2026-09-11T16:29:00.000Z");
  assert.equal(w.berichten[0].link, "https://www.vnog.nl/brand");
  assert.equal(w._afgesloten, false);
});

test("a page that is gone closes with the stored place", () => {
  const w1 = vnogWarning(teuge.status ? teuge : { ...teuge, status: true }, null, Date.parse("2026-09-11T16:10:00Z"));
  const w = vnogWarning({ id: "2386", title: w1.titel, url: w1.link, updates: [], status: false },
    { row: { titel: w1.titel, plaats: "Teuge", status: "actief", start_at: w1.start_at }, extra: w1.extra }, w1.start_at + 7_200_000);
  assert.equal(w.plaats, "Teuge");
  assert.equal(w.status, "beeindigd");
  assert.equal(w._afgesloten, true);
  assert.equal(w.berichten.length, 3);
});

test("list or object, GRIP values", () => {
  assert.equal(vnogLijst([dierenriem]).length, 1);
  assert.equal(vnogLijst({ 2418: dierenriem, 2386: teuge }).length, 2);
  assert.equal(vnogLijst(null).length, 0);
  assert.equal(vnogGrip(false), null);
  assert.equal(vnogGrip("2"), 2);
});

test("push: own switch, places of the device, texts per kind", () => {
  const device = { enabled: true, plaatsen: [], radius_km: 0 };
  const w = { id: "vnog:2363", bron: "vnog", titel: "Brand gebouw, Lage Bergweg in Beekbergen", tekst: "GRIP 1: Er is opgeschaald.", plaats: "Beekbergen", grip: 1, lat: null, lon: null, gebied: null };
  assert.equal(prefsFrom({ nlalert: true }).vnog, false); // an app that does not know VNOG never gets it
  assert.equal(wantsPush(device, prefsFrom({ vnog: true }), w), true);
  assert.equal(wantsPush(device, prefsFrom({ vnog: false }), w), false);
  assert.equal(wantsPush({ ...device, plaatsen: ["Loenen"] }, prefsFrom({ vnog: true }), w), false);
  assert.equal(wantsPush({ ...device, plaatsen: ["Beekbergen"] }, prefsFrom({ vnog: true }), w), true);
  const n = payloadForWarning(w, "nl", { kind: "n" });
  assert.equal(n.aps.alert.title, "VNOG · GRIP 1 · Beekbergen");
  assert.equal(n.aps["interruption-level"], "time-sensitive");
  assert.equal(n.bron, "vnog");
  assert.equal(n.grip, 1);
  assert.equal(payloadForWarning(w, "nl", { kind: "u" }).aps.alert.title, "VNOG · Update · Beekbergen");
  assert.equal(payloadForWarning({ ...w, grip: 2 }, "nl", { kind: "s" }).aps.alert.title, "VNOG · Opgeschaald naar GRIP 2 · Beekbergen");
  const a = payloadForWarning({ ...w, afloop: "Het incident is afgesloten." }, "en", { kind: "a" });
  assert.equal(a.aps.alert.title, "VNOG · Closed · Beekbergen");
  assert.match(a.aps.alert.body, /Het incident is afgesloten\.$/);
  assert.equal(a.aps["interruption-level"], "active");
  assert.equal(payloadForWarning({ ...w, grip: null }, "nl", { kind: "n" }).aps.alert.title, "VNOG · Beekbergen");
});

test("the street of VNOG against the address of P2000 (seen live on 14 November 2026)", () => {
  assert.equal(straatKey("Laan van de Dierenriem"), "laan dierenriem");
  assert.equal(inStraat("Laan van de Dierenriem", "Laan van Dierenriem"), true);
  assert.equal(inStraat("Laan van de Dierenriem 12", "Laan van Dierenriem"), true);
  assert.equal(inStraat("Lage Bergweg 31", "Lage Bergweg"), true);
  assert.equal(inStraat("Bergweg 3", "Lage Bergweg"), false);
  assert.equal(inStraat("Deventerstraat", "Stationsstraat"), false);
  assert.equal(inStraat("", "Stationsweg"), false);
});
