import { test } from "node:test";
import assert from "node:assert/strict";
import { plekVan, luchtIncidenten, verrijk, grootLuchtPushes, roepnaamPushes, statusBijwerken, statusLijst, weerBeperking } from "../src/vliegend.js";
import locaties from "../src/locaties.js";

const zh = locaties.ziekenhuizen[0], basis = locaties.bases[0];
const dev = { token: "t", enabled: true };
const prefs = (heli) => new Map([["t", { heli: { volg: [], zones: [], ...heli } }]]);

test("plekVan: hospital, base, nothing", () => {
  assert.deepEqual(plekVan(zh.lat, zh.lon), { naam: zh.naam, soort: "ziekenhuis" });
  assert.equal(plekVan(basis.lat, basis.lon).soort, "basis");
  assert.equal(plekVan(53.45, 5.2), null);
  assert.equal(plekVan(null, 5), null);
});

const veld = { lat: 52.40, lon: 5.95 };
const a = { id: "lifeliner3", naam: "Lifeliner 3", soort: "trauma", op_grond: true, ...veld };
const b = { id: "zulu1", naam: "Politieheli", soort: "politie", op_grond: false, snelheid_kt: 5, hoogte_ft: 600, lat: 52.405, lon: 5.955 };

test("several helicopters at one spot", () => {
  const i = luchtIncidenten([a, b]);
  assert.equal(i.length, 1);
  assert.equal(i[0].sleutel, "lifeliner3+zulu1");
  assert.equal(luchtIncidenten([a]).length, 0);
  assert.equal(luchtIncidenten([a, { ...b, snelheid_kt: 110 }]).length, 0, "flying past does not count");
  assert.equal(luchtIncidenten([{ ...a, lat: zh.lat, lon: zh.lon }, { ...b, lat: zh.lat, lon: zh.lon }]).length, 0, "not at a hospital");
  assert.equal(luchtIncidenten([a, { ...b, soort: "defensie", icoon: "f35" }]).length, 0, "only helicopters");
  const v = verrijk([a], [a, b]);
  assert.deepEqual(v[0].samen.met, ["Politieheli"]);
  assert.equal(verrijk([{ ...a, lat: zh.lat, lon: zh.lon }])[0].plek, zh.naam);
});

test("push for several helicopters: followers and zones only", () => {
  const i = luchtIncidenten([a, b]);
  assert.equal(grootLuchtPushes([dev], prefs({}), i).length, 0);
  assert.equal(grootLuchtPushes([dev], prefs({ volg: ["zulu1"] }), i).length, 1);
  assert.equal(grootLuchtPushes([dev], prefs({ zones: [{ lat: 52.4, lon: 5.95, km: 5 }] }), i)[0].texts.nl.title.startsWith("2 helikopters"), true);
  assert.equal(grootLuchtPushes([dev], prefs({ volg: ["zulu1"], meerdere: false }), i).length, 0);
});

test("callsign change", () => {
  const h = { ...b, callsign: "ZXP21" };
  assert.equal(roepnaamPushes([dev], prefs({ volg: ["zulu1"] }), [h], { zulu1: { cs: "PHPXB" } })[0].texts.nl.title, "Politieheli vliegt nu als ZXP21");
  assert.equal(roepnaamPushes([dev], prefs({ volg: ["zulu1"] }), [h], { zulu1: { cs: "ZXP21" } }).length, 0);
  assert.equal(roepnaamPushes([dev], prefs({ volg: ["zulu1"] }), [h], { zulu1: { cs: null } }).length, 0);
  assert.equal(roepnaamPushes([dev], prefs({ volg: ["zulu1"], volg_roepnaam: false }), [h], { zulu1: { cs: "PHPXB" } }).length, 0);
});

test("status", () => {
  const now = 1_800_000_000_000;
  const s = statusBijwerken({ oud: { naam: "Oud", at: now - 40 * 86_400_000, grond: 1 } }, [{ ...a, lat: basis.lat, lon: basis.lon }, { ...b, boven: "Epe", callsign: "ZXP21" }], now);
  assert.equal(s.oud, undefined);
  const l = statusLijst(s, now);
  assert.equal(l.find((x) => x.id === "lifeliner3").status, "basis");
  assert.equal(l.find((x) => x.id === "zulu1").status, "lucht");
  assert.equal(l.find((x) => x.id === "zulu1").waar, "Epe");
  assert.equal(statusLijst(s, now + 600_000)[0].status, "uit_beeld");
  assert.equal(statusBijwerken(s, [{ ...b, callsign: null }], now).zulu1.cs, "ZXP21");
});

test("weather that limits flying", () => {
  const now = Date.parse("2026-11-14T10:00:00Z");
  const w = (o) => ({ bron: "knmi", niveau: "yellow", soort: "Dichte mist", titel: "", status: "actief", start: "2026-11-14T06:00:00Z", einde: "2026-11-14T12:00:00Z", ...o });
  assert.deepEqual(weerBeperking([w({})], now), { reden: "dichte mist", reden_en: "dense fog", niveau: "yellow" });
  assert.equal(weerBeperking([w({}), w({ soort: "Zware windstoten", niveau: "orange" })], now).reden, "harde wind");
  assert.equal(weerBeperking([w({ einde: "2026-11-14T08:00:00Z" })], now), null);
  assert.equal(weerBeperking([w({ soort: "Hitte" })], now), null);
  assert.equal(weerBeperking([w({ niveau: "green" })], now), null);
});
