import { test } from "node:test";
import assert from "node:assert/strict";
import { voorspel, opgestegen, heliVoorMelding, genoemd } from "../src/heliplus.js";

test("heliplus: predicts the hospital ahead on the course", () => {
  // Above Apeldoorn flying north-north-east → Isala Zwolle.
  const h = { id: "lifeliner3", soort: "trauma", lat: 52.22, lon: 5.97, koers: 15, snelheid_kt: 120, op_grond: false };
  const v = voorspel(h);
  assert.ok(v, "a prediction");
  assert.match(v.naam, /Isala/);
  assert.ok(v.eta_min > 5 && v.eta_min < 20);
});

test("heliplus: back to its own base, nothing on the ground", () => {
  const h = { id: "lifeliner3", soort: "trauma", lat: 52.22, lon: 5.97, koers: 192, snelheid_kt: 120, op_grond: false };
  const v = voorspel(h);
  assert.ok(v);
  assert.ok(/Volkel|Radboud|Nijmegen|Canisius|Arnhem|Rijnstate|Maartens/.test(v.naam), v.naam);
  assert.equal(voorspel({ ...h, op_grond: true }), null);
});

test("heliplus: take-off after the ground or after a gap", () => {
  const now = Date.now();
  const list = [{ id: "lifeliner3", soort: "trauma", op_grond: false }, { id: "zulu01", soort: "politie", op_grond: false }];
  assert.equal(opgestegen(list, new Map([["lifeliner3", { grond: 1, at: now - 30_000 }]]), now).length, 1);
  assert.equal(opgestegen(list, new Map([["lifeliner3", { grond: 0, at: now - 30_000 }]]), now).length, 0);
  assert.equal(opgestegen(list, new Map([["lifeliner3", { grond: 0, at: now - 20 * 60_000 }]]), now).length, 1);
});

test("heliplus: the Lifeliner of an alert", () => {
  const helis = [{ id: "lifeliner3", soort: "trauma", lat: 51.65, lon: 5.7 }, { id: "lifeliner4", soort: "trauma", lat: 53.1, lon: 6.5 }];
  assert.equal(genoemd({ title: "A1 Lifeliner 4 Apeldoorn" }), "lifeliner4");
  assert.equal(heliVoorMelding({ title: "A1 Lifeliner 4 Apeldoorn" }, helis).id, "lifeliner4");
  assert.equal(heliVoorMelding({ title: "A1 MMT inzet", dienst: "traumaheli", lat: 52.21, lon: 5.97 }, helis).id, "lifeliner3");
});
