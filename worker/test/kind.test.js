import { test } from "node:test";
import assert from "node:assert/strict";
import { groepeer, kindWarning, parseCircle, raaktWerkgebied, kindBericht } from "../src/kind.js";
import { payloadForWarning, wantsPush, prefsFrom } from "../src/alerts.js";

// Shapes as Burgernet's test API returns them (services.burgernet.nl/landactiehost/api/test/alerts).
const media = { Image: "https://services.burgernet.nl/fototest/9999.jpg", SmallImage: "https://services.burgernet.nl/fototest/30009999.jpg" };
const amberStart = { AlertId: "99999998", MessageId: "99999999", Sent: "1794231702", Type: "Alert", AlertLevel: "10", Location: {},
  Message: { Title: "Voornaam (leeftijd)", Description: "Laatst gezien Plaats.", DescriptionExt: "Vermist", Readmore_URL: "https://www.politie.nl/amberalert", Media: media },
  Area: { Description: null, Circle: null, CircleKM: null } };
const amberEinde = { ...amberStart, MessageId: "100000000", Sent: "1794231829", Type: "Cancel", Message: { Title: null, Description: "Sluitbericht AMBER Alert", Media: {} } };
const vkApeldoorn = { ...amberStart, AlertId: "5551", MessageId: "5552", AlertLevel: "5",
  Area: { Description: "Apeldoorn", Circle: "52.2108,5.9737 3000", CircleKM: "52.2108,5.9737 3" } };
const vkAmsterdam = { ...vkApeldoorn, AlertId: "5553", Area: { Description: "Amsterdam", Circle: "52.373146846702192,4.8923057800325829 5000" } };

test("parseCircle reads metres and km", () => {
  assert.deepEqual(parseCircle("52.37,4.89 5000"), { lat: 52.37, lon: 4.89, km: 5 });
  assert.deepEqual(parseCircle(null, "52.37,4.89 5"), { lat: 52.37, lon: 4.89, km: 5 });
});

test("AMBER Alert: start, then the closing message removes photo and description", () => {
  const [[id, start]] = [...groepeer([amberStart])];
  assert.equal(id, "amber:99999998");
  const w1 = kindWarning(start, null);
  assert.equal(w1.status, "actief");
  assert.equal(w1.plaats, "Nederland");
  assert.equal(w1.extra.foto, media.Image);
  assert.equal(w1.berichten.length, 1);
  const w2 = kindWarning(groepeer([amberEinde]).get(id), { row: { titel: w1.titel, status: "actief" }, extra: w1.extra });
  assert.equal(w2.status, "beeindigd");
  assert.equal(w2.extra.foto, null);
  assert.deepEqual(w2.berichten.map((b) => b.soort), ["start", "afloop"]);
  assert.match(w2.berichten[0].tekst, /verwijderd/);
  assert.equal(w2.berichten[1].tekst, "Sluitbericht AMBER Alert");
});

test("Vermist Kind Alert: only when the search area reaches Apeldoorn, with the circle as area", () => {
  assert.equal(kindWarning(groepeer([vkAmsterdam]).get("vermistkind:5553"), null), null);
  const w = kindWarning(groepeer([vkApeldoorn]).get("vermistkind:5551"), null);
  assert.equal(w.bron, "vermistkind");
  assert.equal(w.plaats, "Apeldoorn");
  assert.equal(w.gebied[0].length, 49);
  assert.ok(raaktWerkgebied({ lat: 52.2108, lon: 5.9737, km: 3 }));
});

test("A second alert message with the same AlertId is an update", () => {
  const w1 = kindWarning(groepeer([amberStart]).get("amber:99999998"), null);
  const upd = { ...amberStart, MessageId: "123", Sent: "1794231760", Message: { ...amberStart.Message, Description: "Kind is gezien in Deventer." } };
  const w2 = kindWarning(groepeer([upd]).get("amber:99999998"), { row: { titel: w1.titel, status: "actief" }, extra: w1.extra });
  assert.deepEqual(w2.berichten.map((b) => b.soort), ["start", "update"]);
  assert.deepEqual(w2._soortNieuw, ["start"]);
  assert.equal(w2.tekst, "Kind is gezien in Deventer.");
});

test("push: only to apps that turned it on; payload titles", () => {
  const w = { id: "amber:1", bron: "amber", titel: "Voornaam (8)", tekst: "Laatst gezien …", plaats: "Nederland" };
  const dev = { enabled: true, plaatsen: ["Teuge"], radius_km: 2, lat: 52.2, lon: 5.9 };
  assert.equal(wantsPush(dev, prefsFrom({ nlalert: true }), w), false);
  assert.equal(wantsPush(dev, prefsFrom({ amber: true }), w), true);
  assert.equal(payloadForWarning(w, "nl").aps.alert.title, "AMBER Alert");
  assert.equal(payloadForWarning(w, "nl", { kind: "a" }).aps.alert.title, "AMBER Alert · Beëindigd");
  assert.equal(payloadForWarning({ ...w, bron: "vermistkind", plaats: "Apeldoorn" }, "en", { kind: "u" }).aps.alert.title, "Missing Child Alert · Update · Apeldoorn");
  assert.equal(kindBericht({ AlertLevel: "3", AlertId: "1" }), null);
});
