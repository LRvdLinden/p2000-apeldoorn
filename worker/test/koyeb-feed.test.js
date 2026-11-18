import { test } from "node:test";
import assert from "node:assert/strict";
import { fromFeed } from "../src/rules.js";
import { fromKoyeb, dedupKey, sameDispatch, PUBLIC_SOURCE } from "../src/koyeb-feed.js";

const timestamp = Math.floor(Date.now() / 60_000) * 60;
const idKoyeb = "ebf2da7b-5641-a189-ec5d-6eb8ca89bd02";
const idPrimary = "9eecb01e-df66-4caa-a567-d63d05040937";
const raw = "A1 Ambu 06343 - Apeldoorn Rit 337571";
const koyeb = {
  id: idKoyeb, p2000: raw, stad: "Apeldoorn", straat: "onbekend",
  dienst: "ambulance", regio: "Noord- en Oost-Gelderland", prio: 1,
  date: { timestamp }, capcodes: [
    { capcode: "0820999", label: "Monitorcode / Ambulance / Meldkamer" },
    { capcode: "0820343", label: "Rapid Responder 06-343 / Ambulance / Noord- en Oost-Gelderland" },
  ],
};
const primary = {
  uid: idPrimary, link: "https://p2000.page/api", timestamp: String(timestamp + 19),
  melding: raw, plaats: "Apeldoorn", vr: "Noord- en Oost-Gelderland",
  dienst: "Ambulance", locatie: "",
  capcodes_json: JSON.stringify({ capcodes: koyeb.capcodes }),
};

test("Koyeb and p2000.page messages with different UUIDs still match", () => {
  const a = fromKoyeb(koyeb), b = fromFeed(primary);
  assert.ok(a);
  assert.ok(b);
  assert.notEqual(a.guid, b.guid);
  assert.equal(sameDispatch(a, b), true);
  assert.equal(dedupKey(a), dedupKey(b));
  assert.equal(a.link, PUBLIC_SOURCE);
  assert.equal(a.capcode, "0820343");
  assert.equal(a.prioriteit, "A1");
});

test("identical UUID always wins; different dispatches are not merged", () => {
  const a = fromKoyeb(koyeb);
  assert.equal(sameDispatch(a, { ...a }), true);
  assert.equal(sameDispatch(a, { ...a, guid: idPrimary, stad: "Loenen" }), false);
  assert.equal(sameDispatch(a, { ...a, guid: idPrimary, full_melding: "Another call" }), false);
  assert.equal(sameDispatch(a, { ...a, guid: idPrimary, datum: a.datum + 180_000 }), false);
});

test("source remains p2000.page and malformed/out-of-scope messages are rejected", () => {
  assert.equal(fromKoyeb({ ...koyeb, stad: "Rotterdam" }), null);
  assert.equal(fromKoyeb({ ...koyeb, id: "not-a-uuid" }), null);
  assert.equal(fromKoyeb({ ...koyeb, p2000: "" }), null);
  assert.equal(fromKoyeb({ ...koyeb, date: { timestamp: 0 } }), null);
  assert.equal(fromKoyeb(koyeb).link, "https://p2000.page/api");
});

test("capcode or content mismatch blocks fallback equality", () => {
  const a = fromKoyeb(koyeb);
  const b = fromFeed(primary);
  assert.equal(sameDispatch(a, { ...b, capcode: "0123456" }), false);
  assert.equal(sameDispatch(a, { ...b, full_melding: "A1 Ambu 06343 - Apeldoorn Rit 337572" }), false);
});
