import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromBurgernetSite, burgernetSiteIds, amsterdamTime } from "../src/alerts.js";

const html = readFileSync(new URL("./fixtures/burgernet-3967274.html", import.meta.url), "utf8");

test("burgernet.nl actiepagina: afgeronde actie in Apeldoorn", () => {
  const w = fromBurgernetSite("3967274", html);
  assert.equal(w.id, "burgernet:3967274");
  assert.equal(w.plaats, "Apeldoorn");
  assert.equal(w.status, "beeindigd");
  assert.equal(new Date(w.start_at).toISOString(), "2026-11-06T12:15:00.000Z");
  assert.equal(new Date(w.end_at).toISOString(), "2026-11-06T12:19:00.000Z");
  assert.match(w.titel, /^De Politie Apeldoorn is op zoek naar een vrouw/);
  assert.ok(!/Tips/.test(w.titel));
  assert.match(w.tekst, /dankt u voor het uitkijken/);
  assert.ok(Math.abs(w.lat - 52.2103) < 0.001 && Math.abs(w.lon - 5.9952) < 0.001);
  assert.equal(w.link, "https://www.burgernet.nl/burgernet/3967274");
});

test("burgernet.nl actiepagina: lopende actie en andere gemeente", () => {
  const lopend = html.replace("Afgeronde actie APELDOORN", "Actie APELDOORN").replace(/Afgeronde actie<\/p>/, "Lopende actie</p>")
    .replace(/<p class="content-block__intro-body-strong">Einde actie<\/p>\s*<p[^>]*>[^<]*<\/p>/, "");
  const w = fromBurgernetSite("1", lopend);
  assert.equal(w.status, "actief");
  assert.equal(w.end_at, null);
  assert.equal(fromBurgernetSite("2", html.replace(/>APELDOORN</g, ">DEVENTER<")), null);
});

test("burgernet.nl gemeentepagina: ids", () => {
  assert.deepEqual(burgernetSiteIds('<a href="/burgernet/3967274" class="x"></a><a href="/burgernet/3967274"></a><a href="/burgernet/123456">'), ["3967274", "123456"]);
});

test("Nederlandse tijd met zomer- en wintertijd", () => {
  assert.equal(new Date(amsterdamTime("06/11/2026", "13:15")).toISOString(), "2026-11-06T12:15:00.000Z");
  assert.equal(new Date(amsterdamTime("06/07/2026", "13:15")).toISOString(), "2026-07-06T11:15:00.000Z");
});

test("burgernetBerichten: start, update and closing message as a timeline, oldest first", async () => {
  const { burgernetBerichten } = await import("../src/alerts.js");
  const blok = (label, tijd, tekst) => `<h5 class="action-detail-block__title">${label}</h5><div class="c-action-message"><div class="action-message__body">
    <span class="action-message__heading"><span class="action-message__heading-item">APELDOORN</span><span class="action-message__heading-item">09/11/2026</span>
    <span class="action-message__heading-item">${tijd}</span></span><h3 class="action-message__title">${tekst}<span class="action-message__title-icon"><svg></svg></span></h3></div></div>`;
  const b = burgernetBerichten(blok("Afloopbericht", "10:41", "Blijf uitkijken.") + blok("Update", "09:30", "Rode pet.") + blok("Startbericht", "09:06", "Twee mannen."));
  assert.deepEqual(b.map((x) => [x.soort, x.plaats, x.at, x.tekst]), [
    ["start", "Apeldoorn", "2026-11-09T08:06:00.000Z", "Twee mannen."],
    ["update", "Apeldoorn", "2026-11-09T08:30:00.000Z", "Rode pet."],
    ["afloop", "Apeldoorn", "2026-11-09T09:41:00.000Z", "Blijf uitkijken."],
  ]);
});
