import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { fromFeed, prioriteit, categorie, matches, distanceKm, payloadFor, isQuiet, deviceFrom } from "../src/rules.js";
import { mapkitToken, es256 } from "../src/apple.js";

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
  assert.equal(categorie("brandweer", "P1", "P 1 BON-06 (Middel BR) BR gebouw Herwers Hyundai Laan van de Dierenriem Apeldoorn 079391"), "Gebouwbrand");
  assert.equal(categorie("brandweer", "P2", "P 2 BON-10 Dier te water Baron Sloetkade Apeldoorn 062631"), "Dier in problemen");
  assert.equal(categorie("brandweer", "P2", "P 2 Paard in sloot Zwolseweg Apeldoorn"), "Dier in problemen");
  assert.equal(categorie("brandweer", "P2", "P 2 Dienstverlening Paardenmarkt Apeldoorn"), "Dienstverlening verzoek");
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
  assert.equal(p.aps.alert.title, "Ambulance • A1");
  assert.match(p.aps.alert.body, /^A1 .+ \(\d\d:\d\d:\d\d\)$/);
  assert.equal(p.aps["interruption-level"], "time-sensitive");
  assert.equal(p.guid, feed.uid);
});

test("deviceFrom validates and rounds the radius centre", () => {
  const d = deviceFrom({ token: "A".repeat(64), platform: "ios", settings: { radius_km: 5, lat: 52.21633, lon: 5.96462, prioriteiten: ["a1"] } });
  assert.equal(d.token, "a".repeat(64));
  assert.equal(d.lat, 52.216);
  assert.deepEqual(d.prioriteiten, ["A1"]);
  assert.throws(() => deviceFrom({ token: "nope" }), /Invalid token/);
});

const testKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const p8 = testKey.privateKey.export({ type: "pkcs8", format: "pem" });

test("ES256 JWT verifies (WebCrypto)", async () => {
  const token = await es256({ alg: "ES256", kid: "K" }, { iss: "T" }, p8.replace(/\n/g, "\\n"));
  const [h, c, sig] = token.split(".");
  assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key: testKey.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
});

test("MapKit JS token is bound to allowed origins", async () => {
  const env = { WEB_MAPKIT_JS_KEY_ID: "ABC123DEFG", WEB_MAPKIT_JS_TEAM_ID: "EU3UY476T6", WEB_MAPKIT_JS_P8: p8 };
  const token = await mapkitToken(env, "https://p2000-apeldoorn.nl");
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  assert.equal(claims.iss, "EU3UY476T6");
  assert.equal(claims.origin, "https://p2000-apeldoorn.nl");
  assert.equal(await mapkitToken(env, "https://evil.example"), null);
  assert.ok(await mapkitToken(env, "http://localhost:8000"));
});
