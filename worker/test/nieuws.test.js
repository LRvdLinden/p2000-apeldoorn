// Tab Nieuws: police news filter, weather articles, liveblogs and the beheer messages (against real SQLite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  politieItem, plaatsenIn, categorieVan, htmlNaarAlineas, politieTijd, weerArtikel, liveblogVan, nieuwsId, syncPolitie, syncWaarschuwingen,
  listNieuws, getNieuws, voegToe, kiesStockFotos, wijzigUpdate, verwijderUpdate, wijzigNieuws, payloadVoorNieuws, nieuwsOntvangers, leesFoto, VERWIJDERD,
} from "../src/nieuws.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); } };
}
const kvOf = (env) => ({
  get: (k) => env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(k).first(),
  set: (k, v) => env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(k, v, Date.now()).run(),
});
const budget = () => ({ left: 10, take() { return this.left-- > 0; } });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("police text: html to paragraphs, places, subject, time", () => {
  assert.deepEqual(htmlNaarAlineas("<p>Een &amp; twee</p><p>Drie<br>vier</p><img src=x>"), ["Een & twee", "Drie\nvier"]);
  assert.deepEqual(plaatsenIn("Inbraak in Ugchelen en Apeldoorn"), ["Apeldoorn", "Ugchelen"]);
  assert.deepEqual(plaatsenIn("Wedstrijd tegen Engeland"), [], "Engeland alone is not our hamlet");
  assert.deepEqual(plaatsenIn("Ongeval in Engeland bij Beekbergen"), ["Beekbergen", "Engeland"]);
  assert.deepEqual(plaatsenIn("Apeldoornseweg"), [], "a word that only starts with a place does not count");
  assert.equal(categorieVan("Getuigen gezocht van aanrijding"), "verkeer");
  assert.equal(categorieVan("Woninginbraak: man aangehouden"), "algemeen");
  assert.equal(categorieVan("Inbraak in woning"), "inbraak");
  assert.equal(new Date(politieTijd("2026-11-09 14:05:00")).toISOString(), "2026-11-09T13:05:00.000Z");
  assert.equal(new Date(politieTijd("2026-07-01 14:05:00")).toISOString(), "2026-07-01T12:05:00.000Z");
});

test("police item: only about our places, never with the politie.nl image", () => {
  const raw = { uid: "abc", titel: "Getuigen gezocht na inbraak in Ugchelen", introductie: "<p>De politie zoekt getuigen.</p>", publicatiedatum: "2026-11-09 10:00:00",
    url: "https://www.politie.nl/nieuws/x.html", gebied: "Apeldoorn", afbeelding: { url: "https://www.politie.nl/foto.jpg" },
    alineas: [{ titel: "Tips", opgemaaktetekst: "<p>Bel 0900-8844.</p>" }] };
  const p = politieItem(raw);
  assert.equal(p.plaats, "Ugchelen");
  assert.equal(p.intro, "De politie zoekt getuigen.");
  assert.deepEqual(p.alineas, [{ titel: "Tips", tekst: "Bel 0900-8844." }]);
  assert.ok(!JSON.stringify(p).includes("foto.jpg"));
  assert.equal(politieItem({ uid: "z", titel: "Aanhouding in Zwolle", introductie: "", publicatiedatum: "2026-11-09 10:00:00" }), null);
});

test("weather article and liveblog content", () => {
  const a = weerArtikel({ niveau: "orange", soort: "Zware windstoten", status: "actief", start: "2026-11-09T12:00:00Z", einde: "2026-11-09T18:00:00Z", verwachting: "Windstoten tot 100 km/u.", advies: "Blijf binnen." });
  assert.equal(a.titel, "Code oranje voor zware windstoten");
  assert.deepEqual(a.alineas.map((x) => x.titel), ["Wanneer", null, "Risico's en advies"]);
  assert.equal(a.weer.tijdvak, "maandag 13:00 tot 19:00");
  assert.deepEqual(a.weer.adviezen, ["Blijf binnen."]);
  assert.equal(a.weer.icoon, "wind");
  const k = weerArtikel({ niveau: "yellow", soort: "Mist", status: "actief", start: "2026-11-09T22:30:00Z", einde: "2026-11-10T11:00:00Z", kop: "Plaatselijk dichte mist",
    omschrijving: "Mist met een zicht van minder dan 200 m.", verwachting: "Houd rekening met vertragingen. Er is kans op gevaarlijke situaties.", advies: "Rijd langzamer.",
    landelijk: [{ niveau: "yellow", gebied: [[[5, 52], [6, 52], [6, 51], [5, 52]]] }, { niveau: "yellow", gebied: [[[6, 53], [7, 53], [7, 52], [6, 53]]] }] });
  assert.equal(k.titel, "Plaatselijk dichte mist");
  assert.equal(k.weer.tijdvak, "maandag 23:30 tot dinsdag 12:00");
  assert.equal(k.weer.vanafTot, "Vanaf 23:30 tot dinsdag 12:00");
  assert.equal(k.weer.datumKop, "Maandag 9 november");
  assert.deepEqual(k.weer.adviezen, ["Houd rekening met vertragingen.", "Er is kans op gevaarlijke situaties.", "Rijd langzamer."]);
  assert.equal(k.weer.gebieden.length, 2);
  assert.match(weerArtikel({ niveau: "orange", soort: "Gladheid", status: "beeindigd", start: "2026-11-09T12:00:00Z" }).titel, /^Opgeheven/);
  const l = liveblogVan({ bron: "burgernet", titel: "Gezocht", tekst: "Man", start: "2026-11-09T20:00:00Z", berichten: [{ soort: "start", at: "2026-11-09T20:00:00Z", tekst: "Man op scooter" }] });
  assert.equal(l.berichten.length, 1);
  assert.equal(l.berichten[0].door, "burgernet");
});

test("photos: only images, not too large", () => {
  assert.equal(leesFoto(PNG).mime, "image/png");
  assert.throws(() => leesFoto("data:text/html;base64,PGI+"), /JPEG/);
});

test("sync: police (first run silent, later new ones pushed), warnings, beheer messages, kind privacy", async () => {
  const env = { DB: d1() };
  const kv = kvOf(env);
  const now = Date.now();
  const iso = (ms) => new Date(ms).toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const bericht = (uid, titel) => ({ uid, titel, introductie: "<p>Tekst</p>", publicatiedatum: iso(now - 3_600_000), url: `https://www.politie.nl/${uid}`, alineas: [] });
  let feed = [bericht("1", "Aanrijding in Apeldoorn"), bericht("2", "Inbraak in Deventer")];
  globalThis.fetch = async () => new Response(JSON.stringify({ nieuwsberichten: feed, iterator: { last: true } }), { status: 200 });
  assert.deepEqual(await syncPolitie(env, budget(), kv, now), [], "first run: nothing pushed");
  assert.deepEqual(await syncPolitie(env, budget(), kv, now + 60_000), [], "not again within 10 minutes");
  feed = [...feed, bericht("3", "Getuigen gezocht in Beekbergen")];
  const nieuw = await syncPolitie(env, budget(), kv, now + 11 * 60_000);
  assert.equal(nieuw.length, 1);
  const lijst = await listNieuws(env, "https://api.test", { soort: "politie" });
  assert.equal(lijst.length, 2, "Deventer is not ours");
  assert.equal(lijst[0].afbeelding, "https://a-alerts.nl/assets/img/nieuws/politie-getuigen.webp?v=4");
  assert.match(lijst[0].link, /^https:\/\/a-alerts\.nl\/nieuws\/p-[0-9a-f]{12}\/$/);

  // A missing child alert with its official messages.
  const wid = "vermistkind:42";
  await env.DB.prepare(`INSERT INTO waarschuwingen (id, bron, titel, tekst, plaats, start_at, status, first_seen, updated_at) VALUES (?, 'vermistkind', 'Vermist Kind Alert', 'Meisje, 8 jaar', 'Apeldoorn', ?, 'actief', ?, ?)`)
    .bind(wid, now - 600_000, now - 600_000, now - 600_000).run();
  await env.DB.prepare("INSERT INTO waarschuwing_knmi (id, data) VALUES (?, ?)").bind(wid, JSON.stringify({ berichten: [{ id: "m1", soort: "start", at: new Date(now - 600_000).toISOString(), tekst: "Meisje, 8 jaar" }] })).run();
  await env.DB.prepare(`INSERT INTO waarschuwingen (id, bron, titel, tekst, niveau, soort, start_at, end_at, status, first_seen, updated_at) VALUES ('knmi:wind:1', 'knmi', 'Wind', 'Harde wind', 'yellow', 'Windstoten', ?, ?, 'actief', ?, ?)`)
    .bind(now, now + 3_600_000, now, now).run();
  await syncWaarschuwingen(env, kv, now + 1000);
  const lid = await nieuwsId("l", wid);
  const live = await getNieuws(env, "https://api.test", lid);
  assert.equal(live.soort, "liveblog");
  assert.equal(live.tijdlijn.length, 1);
  assert.equal(live.afbeelding, "https://a-alerts.nl/assets/img/nieuws/vermistkind.webp?v=4");
  const weer = (await listNieuws(env, "https://api.test", { soort: "weer" }))[0];
  assert.equal(weer.titel, "Code geel voor windstoten");

  // Beheer adds a message with a photo and a link; the newest is on top.
  const r = await voegToe(env, lid, { tekst: "Extra info", url: "https://www.politie.nl/x", foto: PNG });
  await assert.rejects(voegToe(env, lid, { url: "http://onveilig" }), /https/);
  let item = await getNieuws(env, "https://api.test", lid);
  assert.equal(item.tijdlijn[0].tekst, "Extra info");
  assert.equal(item.tijdlijn[0].door, "a-alerts");
  assert.match(item.tijdlijn[0].foto, /\/v1\/nieuws\/foto\/[0-9a-f]{32}$/);
  await wijzigUpdate(env, lid, r.id, { tekst: "Aangepast" });
  assert.equal((await getNieuws(env, "https://api.test", lid)).tijdlijn[0].tekst, "Aangepast");

  // The child is found: everything the beheer added loses its text, photo and link too.
  await env.DB.prepare("UPDATE waarschuwingen SET status = 'beeindigd', updated_at = ? WHERE id = ?").bind(now + 5000, wid).run();
  await syncWaarschuwingen(env, kv, now + 10_000);
  item = await getNieuws(env, "https://api.test", lid);
  assert.equal(item.status, "afgerond");
  const eigen = item.tijdlijn.find((t) => t.door === "a-alerts");
  assert.equal(eigen.tekst, VERWIJDERD);
  assert.equal(eigen.foto, null);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM nieuws_fotos").first()).n, 0);
  await assert.rejects(voegToe(env, lid, { foto: PNG }), /geen foto/);

  // Hide and delete.
  await wijzigNieuws(env, lid, { hidden: true });
  assert.equal(await getNieuws(env, "https://api.test", lid), null);
  assert.ok(await verwijderUpdate(env, lid, r.id));
});

test("push: payload and who gets it", () => {
  const item = { id: "l-000000000001", soort: "liveblog", bron: "burgernet", titel: "Gezocht", plaats: "Ugchelen" };
  const p = payloadVoorNieuws(item, "nl", "a", { tekst: "Zoekactie afgerond" });
  assert.equal(p.aps.alert.title, "Liveblog · Burgernet");
  assert.equal(p.aps.alert.body, "Zoekactie afgerond");
  assert.equal(p.nieuws, item.id);
  const devices = [{ token: "a", enabled: 1, plaatsen: [] }, { token: "b", enabled: 1, plaatsen: [] }, { token: "c", enabled: 1, plaatsen: ["Uddel"] }];
  const prefs = new Map([["a", { nieuwsLiveblog: true, nieuwsPolitie: true }], ["b", { nieuwsLiveblog: false }], ["c", { nieuwsPolitie: true }]]);
  assert.deepEqual(nieuwsOntvangers(devices, prefs, item, () => true, { bron: "burgernet" }), ["a"]);
  const pol = { id: "p-000000000001", soort: "politie", bron: "politie", titel: "x", plaats: "Ugchelen", plaatsen: ["Ugchelen"] };
  assert.deepEqual(nieuwsOntvangers(devices, prefs, pol, () => true, null), ["a"], "c only follows Uddel");
  assert.equal(payloadVoorNieuws(pol, "en").aps.alert.title, "Police news · Ugchelen");
});

test("112 Nieuws: title, short intro and link only; Loenen only when in Gelderland", async () => {
  const { parse112, categorie112, korteIntro, foto112 } = await import("../src/nieuws.js");
  const item = (titel, cats, beschrijving = "<p>In de nacht van zondag op maandag is er bij een tattooshop aan de Hoofdstraat in Apeldoorn een explosie geweest. De brandweer kwam ter plaatse. De politie doet onderzoek en zoekt getuigen die iets hebben gezien of camerabeelden hebben.</p>") =>
    `<item><title>${titel}</title><link>https://112nieuws.net/2026/11/09/x/</link><pubDate>Mon, 09 Nov 2026 07:18:47 +0000</pubDate>${cats.map((c) => `<category><![CDATA[${c}]]></category>`).join("")}<guid isPermaLink="false">https://112nieuws.net/?p=${titel.length}</guid><description><![CDATA[${beschrijving}]]></description><media:content url="https://112nieuws.net/wp-content/uploads/foto.jpg" medium="image"/></item>`;
  const xml = `<rss><channel>${item("Explosie bij tattooshop", ["Gelderland", "Apeldoorn", "Brand", "Politie"])}</channel></rss>`;
  const [x] = parse112(xml, "Apeldoorn");
  assert.equal(x.titel, "Explosie bij tattooshop");
  assert.equal(x.link, "https://112nieuws.net/2026/11/09/x/");
  assert.ok(x.intro.length <= 261 && x.intro.startsWith("In de nacht"));
  assert.ok(!JSON.stringify(x).includes("foto.jpg"), "never their photo");
  assert.equal(categorie112(x.cats), "brand");
  assert.equal(parse112(`<rss>${item("Ongeval in Loenen", ["Utrecht", "Loenen aan de Vecht"])}</rss>`, "Loenen").length, 0);
  assert.equal(parse112(`<rss>${item("Ongeval in Loenen", ["Gelderland", "Loenen"])}</rss>`, "Loenen").length, 1);
  assert.equal(korteIntro("<p>Kort.</p>"), "Kort.");
  assert.match(foto112({ id: "r-0123456789ab", categorie: "brand" }), /\/nieuws\/112-brand-\d\.webp\?v=4$/);
});

test("stock photos: JS Fotografie first, never the same photo twice in a row, credit in the API", async () => {
  const env = { DB: d1() };
  const t0 = Date.parse("2026-11-10T08:00:00Z");
  const zet = (id, cat, i) => env.DB.prepare(`INSERT INTO nieuws (id, soort, bron, titel, categorie, at, updated_at, created_at, data, hidden)
    VALUES (?, 'regionaal', '112nieuws', ?, ?, ?, ?, ?, '{}', 0)`).bind(id, `Artikel ${i}`, cat, t0 + i * 60_000, t0, t0).run();
  const cats = ["ambulance", "ambulance", "ambulance", "brand", "brand", "traumaheli", "traumaheli"];
  for (const [i, c] of cats.entries()) await zet(`r-00000000000${i}`, c, i);
  assert.equal(await kiesStockFotos(env, t0), 7);
  const { results } = await env.DB.prepare("SELECT s.foto FROM nieuws_stockfoto s JOIN nieuws n ON n.id = s.id ORDER BY n.at").all();
  const fotos = results.map((r) => r.foto);
  assert.deepEqual(fotos, ["js-ambulance-1", "js-ambulance-2", "js-ambulance-1", "js-brand-1", "112-brand-4", "js-traumaheli-1", "js-traumaheli-2"]);
  for (let i = 1; i < fotos.length; i++) assert.notEqual(fotos[i], fotos[i - 1]);
  assert.equal(await kiesStockFotos(env, t0), 0, "chosen once, then kept");
  const lijst = await listNieuws(env, "https://api", { limit: 10 });
  const brand = lijst.find((x) => x.id === "r-000000000003");
  assert.match(brand.afbeelding, /js-brand-1\.webp/);
  assert.equal(brand.foto_bron, "JS Fotografie");
  assert.equal(lijst.find((x) => x.id === "r-000000000004").foto_bron, null);
});
