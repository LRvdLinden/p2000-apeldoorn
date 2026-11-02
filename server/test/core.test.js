import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "p2000-"));

const { fromFeed, prioriteit, categorie } = await import("../src/ingest.js");
const { matches, distanceKm, payloadFor, isQuiet } = await import("../src/push.js");
const { insertMelding, listMeldingen, upsertDevice, activeDevices } = await import("../src/db.js");
const { monthStats } = await import("../src/stats.js");

const feed = {
  uid: "52581a38-2ca2-a4c9-fc27-3d654d952a71", link: "https://p2000.page/u-52581a38/7", timestamp: String(Math.floor(Date.now() / 1000)),
  melding: "A1 Ambu 06343 - Apeldoorn Rit 337571", plaats: "Apeldoorn", vr: "Noord- en Oost-Gelderland",
  capcodes_json: '{"capcodes": [{"capcode": "0820999", "label": "Monitorcode / Ambulance / Meldkamer"}, {"capcode": "0820343", "label": "Rapid Responder 06-343 / Ambulance / Noord- en Oost-Gelderland"}]}',
  voertuigen_json: '{"voertuig": [{"nra": "06343", "nrb": "06-343", "label": "Rapid Responder"}]}',
  locatie: "", dienst: "Ambulance", prio: "1", latlong: "", plaats_latlon: "52.21633,5.96462", grip: "0", soortopschaling: "",
};

test("prioriteit", () => {
  assert.equal(prioriteit("A1 Ambu"), "A1");
  assert.equal(prioriteit("P 1 BAD-02 Ongeval"), "P1");
  assert.equal(prioriteit("Prio 3 A12"), "P3");
  assert.equal(prioriteit("Aanrijding letsel"), null);
});

test("categorie", () => {
  assert.equal(categorie("brandweer", "P1", "P 1 BON-06 BR container Veenweg Apeldoorn"), "Afvalcontainer brand");
  assert.equal(categorie("ambulance", "A2", "A2 Ambu 06121 DIA Apeldoorn Rit 1"), "Directe inzet ambulance");
  assert.equal(categorie("ambulance", "A1", "A1 Ambu 06343 - Apeldoorn Rit 1"), "Ambulance spoedurgentie");
  assert.equal(categorie("politie", null, "Aanrijding letsel Koedijk Loenen"), "Aanrijding met letsel");
});

test("fromFeed keeps Apeldoorn only and parses units", () => {
  const m = fromFeed(feed);
  assert.equal(m.title, "Ambu 06343 - Apeldoorn Rit 337571");
  assert.equal(m.prioriteit, "A1");
  assert.equal(m.dienst, "ambulance");
  assert.equal(m.eenheden.length, 1);
  assert.equal(m.capcode, "0820343");
  assert.equal(m.lat, 52.21633);
  assert.equal(fromFeed({ ...feed, plaats: "Lochem" }), null);
  assert.ok(fromFeed({ ...feed, plaats: "Beemte broekland" }));
});

test("store + list + stats", () => {
  const m = fromFeed(feed);
  assert.equal(insertMelding(m), true);
  assert.equal(insertMelding(m), false);
  const list = listMeldingen({ limit: 10 });
  assert.equal(list[0].guid, m.guid);
  assert.ok(list[0].datum_tijd.endsWith("Z"));
  const d = new Date();
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit" }).format(d);
  const s = monthStats(key);
  assert.equal(s.totaal, 1);
  assert.equal(s.by_dienst.ambulance, 1);
  assert.equal(s.by_uur.reduce((a, b) => a + b), 1);
});

test("matching incl. radius and quiet hours", () => {
  const m = fromFeed(feed);
  const base = { enabled: 1, diensten: [], plaatsen: [], prioriteiten: [], quiet: 0, quiet_from: 1380, quiet_to: 420, critical: 1, radius_km: null, lat: null, lon: null };
  assert.equal(matches(base, m), true);
  assert.equal(matches({ ...base, diensten: ["brandweer"] }, m), false);
  assert.equal(matches({ ...base, plaatsen: ["Ugchelen"] }, m), false);
  assert.equal(matches({ ...base, plaatsen: ["Apeldoorn"] }, m), true);
  // Ugchelen centre (≈ 3.6 km away)
  assert.equal(matches({ ...base, radius_km: 2, lat: 52.187, lon: 5.942 }, m), false);
  assert.equal(matches({ ...base, radius_km: 5, lat: 52.187, lon: 5.942 }, m), true);
  const always = { ...base, quiet: 1, quiet_from: 0, quiet_to: 0 };
  assert.equal(isQuiet(always), true);
  assert.equal(matches(always, m), true);               // A1 is critical
  assert.equal(matches({ ...always, critical: 0 }, m), false);
  assert.ok(Math.abs(distanceKm(52.21633, 5.96462, 52.18706, 5.94176) - 3.6) < 0.2);
});

test("payload", () => {
  const p = payloadFor(fromFeed(feed), "nl");
  assert.equal(p.aps.alert.title, "Ambulance · Apeldoorn");
  assert.match(p.aps.alert.body, /Prioriteit A1 - Ambulance spoedurgentie/);
  assert.equal(p.aps["interruption-level"], "time-sensitive");
  assert.equal(p.guid, feed.uid);
});

test("devices", () => {
  upsertDevice({ token: "a".repeat(64), platform: "ios", environment: "sandbox", enabled: true, plaatsen: ["Apeldoorn"], diensten: [], prioriteiten: [], quiet: false, quiet_from: 1380, quiet_to: 420, critical: true, radius_km: 5, lat: 52.2, lon: 5.9 });
  const d = activeDevices();
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].plaatsen, ["Apeldoorn"]);
});
