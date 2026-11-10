import { test } from "node:test";
import assert from "node:assert/strict";
import { burgernetStraat, burgernetLocatie } from "../src/alerts.js";

test("burgernetStraat: only a real street in the message", () => {
  assert.equal(burgernetStraat("De Politie Apeldoorn is op zoek naar een vrouw, 1,73 m, donker haar."), null);
  assert.equal(burgernetStraat("In de omgeving van de Deventerstraat in Apeldoorn zoekt de politie een man."), "Deventerstraat");
  assert.equal(burgernetStraat("Gezocht bij de Van Kinsbergenstraat"), "Van Kinsbergenstraat");
  assert.equal(burgernetStraat("Omgeving Laan van Westenenk"), "Laan van Westenenk");
  assert.equal(burgernetStraat("Onderweg gezien? Bel 112"), null);
});

test("burgernetLocatie: spot from PDOK near the place, cached", async () => {
  const kv = new Map();
  const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => (kv.has(a[0]) ? { value: kv.get(a[0]) } : null),
    run: async () => { kv.set(a[0], a[1]); },
  }) }) } };
  const budget = { take: () => true };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ response: { docs: [
    { weergavenaam: "Loolaan, Groningen", centroide_ll: "POINT(6.56 53.21)" },
    { weergavenaam: "Loolaan, Apeldoorn", centroide_ll: "POINT(5.95432 52.22311)" }] } }) }; };
  const w = { bron: "burgernet", plaats: "Apeldoorn", startbericht: "Man vlucht via de Loolaan.", lat: 52.21, lon: 5.97 };
  const uit = await burgernetLocatie(env, budget, w);
  assert.equal(uit.straat, "Loolaan");
  assert.deepEqual([uit.lat, uit.lon], [52.22311, 5.95432]);
  await burgernetLocatie(env, budget, w);
  assert.equal(calls, 1);
  const zonder = await burgernetLocatie(env, budget, { ...w, startbericht: "Politie zoekt een vrouw." });
  assert.equal(zonder.straat, undefined);
});
