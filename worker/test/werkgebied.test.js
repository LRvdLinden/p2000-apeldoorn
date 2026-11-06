import { test } from "node:test";
import assert from "node:assert/strict";
import { plaatsenFor, matchesPlaatsen, inWerkgebied, PLAATS_NAMEN } from "../src/werkgebied.js";
import { matches, PLAATS_KEYS } from "../src/rules.js";

test("26 places incl. Teuge", () => {
  assert.equal(PLAATS_NAMEN.length, 26);
  assert.ok(PLAATS_NAMEN.includes("Teuge"));
  assert.ok(PLAATS_KEYS.has("wenum wiesel") && PLAATS_KEYS.has("beemte broekland"));
});

test("woonplaats matches on town name, hamlet on street location", () => {
  const assel = { stad: "HOOG SOEREN", locatie: "Asselsestraat", lat: 52.2004, lon: 5.8368 };
  assert.deepEqual([...plaatsenFor(assel)].sort(), ["Assel", "Hoog Soeren"]);
  assert.ok(matchesPlaatsen(["Assel"], assel));
  assert.ok(matchesPlaatsen(["Hoog Soeren"], assel));
  assert.ok(!matchesPlaatsen(["Uddel"], assel));
  // No street: coordinate is only the town centre, so no hamlet.
  const noStreet = { stad: "APELDOORN", locatie: "", lat: 52.21084, lon: 5.97373 };
  assert.deepEqual([...plaatsenFor(noStreet)], ["Apeldoorn"]);
  assert.ok(matchesPlaatsen([], noStreet));
});

test("working area", () => {
  assert.ok(inWerkgebied(52.2112, 5.9699));      // Apeldoorn centre
  assert.ok(inWerkgebied(52.2369, 6.0498));      // Teuge
  assert.ok(!inWerkgebied(52.0907, 5.1214));     // Utrecht
  assert.ok(!inWerkgebied(52.2550, 6.1600));     // Deventer
});

test("push matching keeps old behaviour", () => {
  const dev = { enabled: true, diensten: [], plaatsen: ["Beekbergen"], prioriteiten: [], quiet: false, critical: true };
  assert.ok(matches(dev, { stad: "beekbergen", dienst: "brandweer" }));
  assert.ok(!matches(dev, { stad: "apeldoorn", dienst: "brandweer" }));
});
