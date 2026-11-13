import { test } from "node:test";
import assert from "node:assert/strict";
import { hmPaal, kiesPaal, kiesStraat, alleenStraat } from "../src/hm.js";

test("hmPaal: a hectometre post in the title", () => {
  assert.deepEqual(hmPaal("Aanrijding letsel (meervoudig) (personenauto) A50 Re 211,2 Beemte Broekland 866642"), { weg: "A50", hm: 2112, zijde: "Re" });
  assert.deepEqual(hmPaal("Aanrijding letsel A50 Re 197,6 Beekbergen 864557"), { weg: "A50", hm: 1976, zijde: "Re" });
  assert.deepEqual(hmPaal("Ongeval A1 Li 89.5 Apeldoorn"), { weg: "A1", hm: 895, zijde: "Li" });
  assert.deepEqual(hmPaal("Voertuig te water N345 10,0 Voorst"), { weg: "N345", hm: 100, zijde: null });
  assert.equal(hmPaal("A1 Ambu 06123 Deventerstraat Apeldoorn"), null);
  assert.equal(hmPaal("Brand woning Laan van Zevenhuizen 12 Apeldoorn"), null);
  assert.equal(hmPaal("Aanrijding A50 Apeldoorn 866642"), null);
});

test("kiesPaal: main carriageway first, only near Apeldoorn", () => {
  const docs = [
    { hectometerletter: "b", centroide_ll: "POINT(6.00803237 52.25128029)" },
    { centroide_ll: "POINT(6.00605285 52.25050065)" },
  ];
  assert.deepEqual(kiesPaal(docs), [52.2505, 6.00605]);
  assert.deepEqual(kiesPaal([docs[0]]), [52.25128, 6.00803]);
  assert.equal(kiesPaal([{ centroide_ll: "POINT(5.46826988 51.5198119)" }]), null);
  assert.equal(kiesPaal([]), null);
});

test("kiesStraat: exactly this street in this place", () => {
  const docs = [
    { weergavenaam: "Kanaal Noord, Beemte Broekland", centroide_ll: "POINT(5.98350219 52.25903765)" },
    { weergavenaam: "Kanaal Noord, Apeldoorn", centroide_ll: "POINT(5.97490537 52.22884155)" },
    { weergavenaam: "Kanaal Noord, Wijk bij Duurstede", centroide_ll: "POINT(5.29485177 51.97507773)" },
  ];
  assert.deepEqual(kiesStraat(docs, "Kanaal Noord", "Apeldoorn"), [52.22884, 5.97491]);
  assert.deepEqual(kiesStraat(docs, "kanaal noord", "Beemte Broekland"), [52.25904, 5.9835]);
  assert.equal(kiesStraat(docs, "Kanaal Zuid", "Apeldoorn"), null);
  assert.equal(alleenStraat("Kanaal Noord"), true);
  assert.equal(alleenStraat("Hoofdstraat 50"), false);
  assert.equal(alleenStraat(""), false);
});
