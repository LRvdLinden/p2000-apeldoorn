import { test } from "node:test";
import assert from "node:assert/strict";
import { meldingWanted } from "../src/profielen.js";
import { isContactMeldkamer, isTestOproep } from "../src/rules.js";
import { prefsFrom } from "../src/alerts.js";

test("contact meldkamer and test calls are recognised", () => {
  for (const t of ["Graag contact OC Apeldoorn GMS 888908", "svp contact OC Apeldoorn gms 889006", "Graag opnieuw contact OC Apeldoorn GMS:888026", "Graag contact MKA NOG Apeldoorn"])
    assert.ok(isContactMeldkamer({ full_melding: t }), t);
  assert.ok(isContactMeldkamer({ categorie: "Graag contact meldkamer", full_melding: "x" }));
  assert.ok(!isContactMeldkamer({ full_melding: "A1 Contactweg Apeldoorn 12345" }));
  for (const t of ["TESTOPROEP brandweer", "Proefalarm sirene", "test"]) assert.ok(isTestOproep({ full_melding: t }), t);
  assert.ok(!isTestOproep({ full_melding: "P 1 BR woning Testerweg Apeldoorn" }));
});

test("hidden kinds never give a push, also not for a followed capcode", () => {
  const device = { enabled: 1, plaatsen: [], diensten: [], prioriteiten: [] };
  const m = { full_melding: "Graag contact OC Apeldoorn GMS 888908", capcode: "1234567", dienst: "politie", stad: "Apeldoorn", datum: Date.now() };
  const prefs = { ...prefsFrom({ verbergContact: true }), capcodes: ["1234567"] };
  assert.equal(meldingWanted(device, prefs, m), false);
  assert.equal(prefsFrom({}).verbergTest, false);
});
