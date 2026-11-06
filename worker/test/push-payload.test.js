import { test } from "node:test";
import assert from "node:assert/strict";
import { payloadFor } from "../src/rules.js";
import { payloadForWarning } from "../src/alerts.js";

test("push: rich notifications (map + buttons) for alerts and warnings", () => {
  const p = payloadFor({ guid: "g1", dienst: "brandweer", title: "BR woning", stad: "beekbergen", locatie: "Dorpsstraat", lat: 52.16, lon: 5.96, prioriteit: "P1" });
  assert.equal(p.aps["mutable-content"], 1);
  assert.equal(p.aps.category, "MELDING");
  assert.equal(p.lat, 52.16);
  // Town only: no map.
  const q = payloadFor({ guid: "g2", dienst: "ambulance", title: "Ambu", stad: "apeldoorn", locatie: null, lat: 52.2, lon: 5.96 });
  assert.equal(q.lat, undefined);
  const w = payloadForWarning({ id: "knmi:x", bron: "knmi", niveau: "orange", soort: "Wind", tekst: "Zware windstoten", lat: 52.2, lon: 5.9 }, "nl");
  assert.equal(w.aps.category, "WAARSCHUWING");
  assert.equal(w.bron, "knmi");
  assert.equal(w.niveau, "orange");
  assert.ok(JSON.stringify(p).length < 4000 && JSON.stringify(w).length < 4000);
});
