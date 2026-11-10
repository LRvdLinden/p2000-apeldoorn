// Tab "Nieuws": police news about our places, an article per KNMI weather warning and a liveblog per
// Burgernet, AMBER Alert and Vermist Kind Alert. Beheer can add messages (text, photo, link) to any item.
//
// Police news comes from the open API of the police (the same messages as politie.nl/nieuws).
// Text may be reused with the source named; the images of politie.nl may NOT be used. So a police article never
// carries a photo of politie.nl: it gets an A-Alerts image per subject (or one chosen in the beheer).
import { PLAATSEN_ALL, distanceKm, inWerkgebied } from "./werkgebied.js";
import { getWarning } from "./alerts.js";

export const POLITIE_API = "https://api.politie.nl/v4/nieuws";
export const NIEUWS_SOORTEN = ["politie", "weer", "liveblog", "regionaal"];
const LIVE_BRONNEN = ["burgernet", "amber", "vermistkind", "nlalert"];
const KIND = ["amber", "vermistkind"];
const IMG = "https://a-alerts.nl/assets/img/nieuws/";
// New version of the images (browsers keep them 30 days): raise when an image is replaced under the same name.
// Raise when images change or are added: the site caches images 30 days, also a 404 seen before a new file was live.
const IMG_V = "?v=4";
const SITE = "https://a-alerts.nl/nieuws/";
const DAY = 86_400_000;
const CENTRUM = { lat: 52.2112, lon: 5.9699 };
export const VERWIJDERD = "Dit bericht is na afloop verwijderd.";
export const MAX_FOTO = 1_800_000; // bytes; D1 keeps a value up to 2 MB

// ------------------------------------------------------------------ helpers

/** Short stable id: prefix + 12 hex of SHA-1 of the source id (clean share links). */
export async function nieuwsId(prefix, bron) {
  const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(String(bron)));
  return `${prefix}-${[...new Uint8Array(h)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euml: "ë", eacute: "é", egrave: "è", iuml: "ï", ouml: "ö", uuml: "ü", auml: "ä", ecirc: "ê", ccedil: "ç", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", euro: "€" };
export function decodeEntities(s) {
  return String(s || "").replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** HTML of the police API → plain paragraphs (no tags, no scripts, no images). */
export function htmlNaarAlineas(html) {
  const s = String(html || "")
    .replace(/<(script|style|iframe|figure)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s).split(/\n{2,}/).map((p) => p.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n")).filter(Boolean);
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Names that also exist elsewhere (or are ordinary words): only counted when the article clearly is about our area.
const ZWAK = new Set(["Engeland", "De Krim", "Groenendaal", "Meerveld", "Hooilanden", "De Jonas", "Oosterhuizen", "Lieren", "Assel", "Loenen", "De Haere", "Woeste Hoeve", "Gerritsflesch", "Teuge"]);
const REGIO = /\b(apeldoorn|veluwe|oost-nederland|noord-?\s?en oost-gelderland|gelderland)\b/i;
const PLAATS_RE = PLAATSEN_ALL.map((p) => ({ naam: p.naam, zwak: ZWAK.has(p.naam),
  re: new RegExp(`(^|[^\\p{L}])(${[p.naam, ...(p.aliassen || [])].map(esc).join("|")})(?![\\p{L}])`, "iu") }));

/** Our places mentioned in a text (police API: title, intro, paragraphs, area). */
export function plaatsenIn(tekst, { regio = false } = {}) {
  const t = String(tekst || "");
  const hits = PLAATS_RE.filter((p) => p.re.test(t));
  const sterk = hits.filter((p) => !p.zwak);
  if (sterk.length || regio || REGIO.test(t)) return hits.map((p) => p.naam);
  return [];
}

const CATEGORIEEN = [
  ["vermist", /\b(vermist|vermiste|vermissing)\b/i],
  ["verkeer", /\b(aanrijding|verkeer\w*|ongeval|ongeluk|snelheid|rijbewijs|bestuurder|automobilist|fietser|scooter|rijden|flitser|A1|A50|alcohol(controle)?)\b/i],
  ["inbraak", /\b(inbra(ak|ken|ker|kers)|ingebroken|diefstal|gestolen|beroving|overval)\b/i],
  ["drugs", /\b(drugs|hennep|cocaïne|xtc|wietplantage|drugslab|ondermijning)\b/i],
  ["brand", /\b(brand|brandstichting|explosie|vuurwerk)\b/i],
  ["getuigen", /\b(getuigen|tips|opsporing|gezocht|camerabeelden|signalement)\b/i],
];
export function categorieVan(tekst) {
  const t = String(tekst || "");
  return (CATEGORIEEN.find(([, re]) => re.test(t)) || ["algemeen"])[0];
}
export const STOCK_CATEGORIEEN = ["algemeen", "verkeer", "inbraak", "getuigen", "drugs", "brand", "vermist"];

/** "2026-11-09 14:05:00" (Dutch time) → ms. */
export function politieTijd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ""));
  if (!m) return null;
  const [y, mo, d, h, mi, se = "0"] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  // Offset of Europe/Amsterdam at that moment (CET +1 / CEST +2).
  const local = new Date(guess).toLocaleString("en-US", { timeZone: "Europe/Amsterdam", hour12: false });
  const [md, tm] = local.split(", ");
  const [M, D, Y] = md.split("/").map(Number);
  const [H, MI, SE] = tm.split(":").map(Number);
  const asLocal = Date.UTC(Y, M - 1, D, H % 24, MI, SE);
  return guess - (asLocal - guess);
}

/** One message of the police API → article, or null when it is not about our places. */
export function politieItem(n) {
  if (!n || !n.titel || !(n.uid || n.url)) return null;
  const alineas = [];
  for (const a of Array.isArray(n.alineas) ? n.alineas : []) {
    const delen = htmlNaarAlineas(a.opgemaaktetekst || a.tekst || "");
    if (!delen.length) continue;
    alineas.push({ titel: a.titel ? decodeEntities(String(a.titel)).trim() || null : null, tekst: delen.join("\n\n") });
  }
  const intro = htmlNaarAlineas(n.introductie || "").join("\n\n");
  // Only what the message is about: its area, title and intro (a place named once deep in the text does not count).
  const alles = [n.gebied || "", n.titel, intro].join("\n");
  const locs = (Array.isArray(n.locaties) ? n.locaties : []).map((l) => ({ lat: Number(l.latitude), lon: Number(l.longitude) })).filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon));
  const inGebied = locs.some((l) => inWerkgebied(l.lat, l.lon, 2));
  const plaatsen = plaatsenIn(alles, { regio: inGebied });
  if (!plaatsen.length && !inGebied) return null;
  const at = politieTijd(n.publicatiedatum) || Date.now();
  const loc = locs.find((l) => inWerkgebied(l.lat, l.lon, 2)) || null;
  const plaats = plaatsen.find((p) => p !== "Apeldoorn") || plaatsen[0] || "Apeldoorn";
  return {
    bronId: String(n.uid || n.url), titel: decodeEntities(n.titel).trim(), intro, alineas, at, url: n.url || "https://www.politie.nl/nieuws",
    plaats, plaatsen, gebied: n.gebied || null, lat: loc?.lat ?? null, lon: loc?.lon ?? null, categorie: categorieVan(`${n.titel} ${intro}`),
  };
}

// ------------------------------------------------------------------ storage

const parse = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

/** Stores a news item, only when something changed (the feeds are read every few minutes; D1 counts every written row). */
async function upsertNieuws(env, it, now = Date.now()) {
  const prev = await env.DB.prepare("SELECT id, titel, intro, plaats, lat, lon, url, categorie, status, niveau, at, data, notified FROM nieuws WHERE id = ?").bind(it.id).first();
  const data = JSON.stringify(it.data || {});
  const nieuw = [it.titel, it.intro ?? null, it.plaats ?? null, it.lat ?? null, it.lon ?? null, it.url ?? null, it.categorie ?? null, it.status ?? null, it.niveau ?? null, it.at, data];
  if (prev && nieuw.every((v, i) => (v ?? null) === ([prev.titel, prev.intro, prev.plaats, prev.lat, prev.lon, prev.url, prev.categorie, prev.status, prev.niveau, prev.at, prev.data][i] ?? null))) return prev;
  await env.DB.prepare(`INSERT INTO nieuws (id, soort, bron, ref, titel, intro, plaats, lat, lon, url, categorie, status, niveau, at, updated_at, data, hidden, notified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    ON CONFLICT(id) DO UPDATE SET titel = excluded.titel, intro = excluded.intro, plaats = excluded.plaats, lat = excluded.lat, lon = excluded.lon,
      url = excluded.url, categorie = excluded.categorie, status = excluded.status, niveau = excluded.niveau, at = excluded.at,
      updated_at = excluded.updated_at, data = excluded.data`)
    .bind(it.id, it.soort, it.bron, it.ref ?? null, it.titel, it.intro ?? null, it.plaats ?? null, it.lat ?? null, it.lon ?? null, it.url ?? null,
      it.categorie ?? null, it.status ?? null, it.niveau ?? null, it.at, now, data, now).run();
  return prev;
}

/** Reads the police news (every 10 minutes) and stores the articles about our places. Returns new ones to push. */
export async function syncPolitie(env, budget, kv, now = Date.now()) {
  const last = Number((await kv.get("nieuws_politie_at"))?.value || 0);
  if (now - last < 10 * 60_000 || !budget.take()) return [];
  await kv.set("nieuws_politie_at", String(now));
  const eerste = !last;
  const q = new URLSearchParams({ language: "nl", lat: String(CENTRUM.lat), lon: String(CENTRUM.lon), radius: "25", maxnumberofitems: "25", offset: "0" });
  const res = await fetch(`${POLITIE_API}?${q}`, { headers: { accept: "application/json", "user-agent": "A-Alerts/2.0 (+https://a-alerts.nl)" }, signal: AbortSignal.timeout(12_000) });
  if (res.status === 204) { await kv.set("nieuws_politie_status", JSON.stringify({ ok: true, at: now, n: 0 })); return []; }
  if (!res.ok) { await kv.set("nieuws_politie_status", JSON.stringify({ ok: false, at: now, fout: `HTTP ${res.status}` })); return []; }
  const data = await res.json();
  const lijst = (Array.isArray(data?.nieuwsberichten) ? data.nieuwsberichten : []).map(politieItem).filter(Boolean);
  const nieuw = [];
  for (const p of lijst) {
    const id = await nieuwsId("p", p.bronId);
    const prev = await upsertNieuws(env, {
      id, soort: "politie", bron: "politie", ref: p.bronId, titel: p.titel, intro: p.intro, plaats: p.plaats, lat: p.lat, lon: p.lon, url: p.url,
      categorie: p.categorie, status: null, at: p.at, data: { alineas: p.alineas, plaatsen: p.plaatsen, gebied: p.gebied },
    }, now);
    if (!prev && !eerste && now - p.at < 6 * 3_600_000) nieuw.push(id);
    if (!prev && eerste) await env.DB.prepare("UPDATE nieuws SET notified = '1' WHERE id = ?").bind(id).run();
  }
  await kv.set("nieuws_politie_status", JSON.stringify({ ok: true, at: now, n: lijst.length, totaal: data?.nieuwsberichten?.length ?? 0 }));
  return nieuw;
}

// ------------------------------------------------------------------ 112 Nieuws (112nieuws.net)
// With permission of 112 Nieuws Nederland: title and a short intro with a clear link to their article.
// Their photos may NOT be used: every article gets a royalty-free photo (Pixabay) of A-Alerts.
// One RSS feed per place: https://112nieuws.net/tag/<plaats>/feed/

export const FEED_112 = "https://112nieuws.net/tag/";
export const SLUGS_112 = PLAATSEN_ALL.map((p) => ({ naam: p.naam, slug: p.naam.toLowerCase().replace(/\s+/g, "-") }));
// Names that also exist elsewhere in the Netherlands: only articles tagged Gelderland or Apeldoorn.
const ZWAK_112 = new Set(["Loenen", "Lieren", "Engeland", "De Krim", "Groenendaal", "Meerveld", "Hooilanden", "De Jonas", "Oosterhuizen", "Assel", "De Haere", "Woeste Hoeve", "Gerritsflesch"]);

const cdata = (s) => String(s || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
const tag = (xml, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i").exec(xml); return m ? cdata(m[1]).trim() : ""; };

/** Short intro: the first sentences of the description, at most ~260 characters. */
export function korteIntro(html, max = 260) {
  const t = htmlNaarAlineas(html).join(" ").replace(/\s+/g, " ").replace(/\[…\]|\[\.\.\.\]|The post .*$/i, "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const punt = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return punt > 80 ? cut.slice(0, punt + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

/** RSS of one place → items (only title, link, time, categories and a short intro; never the media). */
export function parse112(xml, plaats) {
  const out = [];
  for (const deel of String(xml || "").split(/<item>/i).slice(1)) {
    const it = deel.split(/<\/item>/i)[0];
    const titel = decodeEntities(tag(it, "title"));
    const link = tag(it, "link");
    if (!titel || !/^https:\/\/112nieuws\.net\//.test(link)) continue;
    const cats = [...it.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map((m) => decodeEntities(cdata(m[1]).trim()));
    if (ZWAK_112.has(plaats) && !cats.some((c) => /^(gelderland|apeldoorn)$/i.test(c))) continue;
    const at = Date.parse(tag(it, "pubDate")) || Date.now();
    out.push({ bronId: tag(it, "guid") || link, titel, link, at, cats, plaats, intro: korteIntro(tag(it, "description")) });
  }
  return out;
}

export function categorie112(cats) {
  const c = cats.map((x) => x.toLowerCase());
  // Most accidents also carry "Brandweer": helicopter and traffic first, then fire.
  if (c.some((x) => /traumaheli|lifeliner|helikopter/.test(x))) return "traumaheli";
  if (c.some((x) => /ongeval|aanrijding|verkeer|eenzijdig|file/.test(x))) return "verkeer";
  if (c.some((x) => /^brand$|uitslaande|explosie|rook|bosbrand|autobrand|woningbrand/.test(x))) return "brand";
  if (c.some((x) => /brandweer/.test(x)) && !c.some((x) => /politie|ambulance/.test(x))) return "brand";
  if (c.some((x) => /ambulance|reanimatie|medisch|letsel/.test(x))) return "ambulance";
  if (c.some((x) => /politie|steekpartij|schiet|overval|inbraak|aanhouding|vermis/.test(x))) return "politie";
  return "algemeen";
}

/** Apeldoorn every 5 minutes, the other places one by one (one per run). Returns new ids to push. */
export async function sync112(env, budget, kv, now = Date.now()) {
  const doelen = [];
  const lastA = Number((await kv.get("n112_apeldoorn_at"))?.value || 0);
  if (now - lastA >= 5 * 60_000) { doelen.push(SLUGS_112[0]); await kv.set("n112_apeldoorn_at", String(now)); }
  const rest = SLUGS_112.slice(1);
  const i = Number((await kv.get("n112_i"))?.value || 0) % rest.length;
  doelen.push(rest[i]);
  await kv.set("n112_i", String(i + 1));
  const nieuw = [];
  const status = JSON.parse((await kv.get("n112_status"))?.value || "{}");
  for (const d of doelen) {
    if (!budget.take()) break;
    const eerste = !status[d.slug];
    try {
      const res = await fetch(`${FEED_112}${d.slug}/feed/`, { headers: { accept: "application/rss+xml, application/xml", "user-agent": "A-Alerts/2.0 (+https://a-alerts.nl)" }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) { status[d.slug] = { at: now, fout: `HTTP ${res.status}` }; continue; }
      const items = parse112(await res.text(), d.naam);
      for (const x of items) {
        const id = await nieuwsId("r", x.bronId);
        const bestaand = await env.DB.prepare("SELECT id, plaats FROM nieuws WHERE id = ?").bind(id).first();
        // The same article can be in more feeds: keep the first place, unless that was Apeldoorn and a village is more precise.
        const plaats = bestaand && !(bestaand.plaats === "Apeldoorn" && d.naam !== "Apeldoorn") ? bestaand.plaats : d.naam;
        await upsertNieuws(env, { id, soort: "regionaal", bron: "112nieuws", ref: x.bronId, titel: x.titel, intro: x.intro, plaats, url: x.link,
          categorie: categorie112(x.cats), status: null, at: x.at, data: { categorieen: x.cats.slice(0, 12), plaatsen: [plaats] } }, now);
        if (!bestaand && !eerste && now - x.at < 3 * 3_600_000) nieuw.push(id);
        if (!bestaand && eerste) await env.DB.prepare("UPDATE nieuws SET notified = '1' WHERE id = ?").bind(id).run();
      }
      status[d.slug] = { at: now, n: items.length };
    } catch (e) { status[d.slug] = { at: now, fout: String(e.message || e).slice(0, 80) }; }
  }
  await kv.set("n112_status", JSON.stringify(status));
  return [...new Set(nieuw)];
}

/**
 * Stock photos per subject. Photos of JS Fotografie (js-*, used with permission, credited) come first and are used
 * as often as possible; the others are Pixabay and photos supplied by A-Alerts. Each article gets the first photo of its
 * subject that is not the photo of the article before it, so two articles in a row never share a photo.
 */
const FOTOS_112 = {
  brand: ["js-brand-1", "112-brand-4", "112-brand-1", "112-brand-2", "112-brand-3"],
  ambulance: ["js-ambulance-1", "js-ambulance-2", "112-ambulance-4", "112-ambulance-1", "112-ambulance-2", "112-ambulance-3", "112-ambulance-5"],
  traumaheli: ["js-traumaheli-1", "js-traumaheli-2", "112-traumaheli-1"],
  verkeer: ["js-ambulance-2", "politie-motor-2", "112-ambulance-5", "politie-verkeer", "112-ambulance-2"],
  politie: ["politie-auto", "politie-motor-1", "politie-algemeen", "politie-getuigen", "politie-drugs"],
  algemeen: ["js-ambulance-1", "js-brand-1", "js-traumaheli-2", "politie-auto", "112-ambulance-4", "112-brand-4"],
};
const POLITIE_FOTOS = {
  algemeen: ["politie-algemeen", "politie-auto", "politie-motor-1"], verkeer: ["politie-verkeer", "politie-motor-2", "js-ambulance-2"],
  brand: ["politie-brand", "js-brand-1", "112-brand-4"], inbraak: ["politie-inbraak", "politie-auto"], getuigen: ["politie-getuigen", "politie-motor-1"],
  drugs: ["politie-drugs", "politie-auto"], vermist: ["politie-vermist", "politie-algemeen"],
};
const kiesOpId = (lijst, id) => lijst[(parseInt(String(id).slice(2, 10), 16) || 0) % lijst.length];
const fotoLijst = (soort, categorie) => (soort === "politie" ? POLITIE_FOTOS[categorie] || POLITIE_FOTOS.algemeen : FOTOS_112[categorie] || FOTOS_112.algemeen);
/** Credit for photos that need one. */
export const fotoBron = (foto) => (String(foto || "").startsWith("js-") ? "JS Fotografie" : null);

/** Gives every police and 112 Nieuws article without a photo yet its photo, oldest first (also the existing ones, once). */
export async function kiesStockFotos(env, now = Date.now()) {
  const { results } = await env.DB.prepare(`SELECT n.id, n.soort, n.categorie, n.at FROM nieuws n LEFT JOIN nieuws_stockfoto s ON s.id = n.id
    WHERE n.soort IN ('politie', 'regionaal') AND s.id IS NULL ORDER BY n.at ASC LIMIT 150`).all();
  if (!results.length) return 0;
  let vorige = (await env.DB.prepare(`SELECT s.foto FROM nieuws_stockfoto s JOIN nieuws n ON n.id = s.id WHERE n.at <= ? ORDER BY n.at DESC LIMIT 1`)
    .bind(results[0].at).first())?.foto || null;
  const stmts = [];
  for (const r of results) {
    const lijst = fotoLijst(r.soort, r.categorie);
    const foto = lijst.find((f) => f !== vorige) || lijst[0];
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO nieuws_stockfoto (id, foto, at) VALUES (?, ?, ?)").bind(r.id, foto, now));
    vorige = foto;
  }
  await env.DB.batch(stmts);
  return stmts.length;
}

export function foto112(row) {
  const f = row.stock_foto || kiesOpId(FOTOS_112[row.categorie] || FOTOS_112.algemeen, row.id);
  return `${IMG}${f}.webp${IMG_V}`;
}

const CODE = { yellow: "Code geel", orange: "Code oranje", red: "Code rood", green: "Code groen" };
const tijdNL = (iso) => new Date(iso).toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

/** KNMI warning (API shape) → weather article. */
const TZ = "Europe/Amsterdam";
const deel = (iso, opts) => new Date(iso).toLocaleString("nl-NL", { timeZone: TZ, ...opts });
const dagKey = (iso) => deel(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const uurMin = (iso) => deel(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdag = (iso) => deel(iso, { weekday: "long" });
/** "maandag 23:30 tot dinsdag 12:00", "dinsdag 06:00 tot 11:00" (same day), "vanaf maandag 23:30" (no end). Like knmi.nl. */
export function tijdvakTekst(start, einde) {
  if (!start) return "";
  const van = `${weekdag(start)} ${uurMin(start)}`;
  if (!einde) return `vanaf ${van}`;
  return `${van} tot ${dagKey(einde) === dagKey(start) ? "" : `${weekdag(einde)} `}${uurMin(einde)}`;
}
const hoofd = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const KNMI_ICOON = [[/mist/i, "fog"], [/wind/i, "wind"], [/onweer|tornado|hagel/i, "thunderstorm"], [/regen/i, "rain"], [/sneeuw/i, "snow"],
  [/glad|ijzel|vorst/i, "ice"], [/hitte/i, "heat"], [/kou/i, "cold"], [/kust/i, "waterspout"]];

/** KNMI "Risico's en advies": the impact and instruction texts, one point per sentence. */
export function adviezen(...teksten) {
  const uit = [];
  for (const t of teksten) {
    for (const regel of String(t || "").split(/\n+/)) {
      for (const zin of regel.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)) {
        const z = zin.replace(/^[-•›>\s]+/, "").trim();
        if (z && !uit.includes(z)) uit.push(z);
      }
    }
  }
  return uit;
}

/**
 * Weather article, built like the warning on knmi.nl: map of the Netherlands with the areas in their code and the
 * time window, the KNMI headline, the code, the description, the issue time, "Risico's en advies" and the details.
 * The same content as paragraphs (alineas) for app versions that do not know "weer" yet.
 */
export function weerArtikel(w) {
  const code = CODE[w.niveau] || "Weerwaarschuwing";
  const soort = w.soort || "het weer";
  const opgeheven = w.status === "beeindigd" || w.niveau === "green";
  const vakken = Array.isArray(w.alleTijdvakken) && w.alleTijdvakken.length ? w.alleTijdvakken
    : Array.isArray(w.tijdvakken) && w.tijdvakken.length ? w.tijdvakken : [{ niveau: w.niveau, start: w.start, einde: w.einde }];
  const begin = vakken.reduce((m, v) => (!m || Date.parse(v.start) < Date.parse(m) ? v.start : m), null) || w.start;
  const eind = vakken.reduce((m, v) => (v.einde && (!m || Date.parse(v.einde) > Date.parse(m)) ? v.einde : m), null) || w.einde;
  const tijdvak = tijdvakTekst(begin, eind);
  const kop = w.kop || `${code} voor ${soort.toLowerCase()}`;
  const titel = opgeheven ? `Opgeheven: ${kop.charAt(0).toLowerCase()}${kop.slice(1)}` : kop;
  const omschrijving = w.omschrijving || w.verwachting || w.tekst || "";
  const advies = adviezen(w.omschrijving ? w.verwachting : null, w.advies);
  const weer = {
    kop, code, niveau: w.niveau, soort, icoon: (KNMI_ICOON.find(([re]) => re.test(soort)) || [null, "warning"])[1],
    omschrijving, uitgifte: w.uitgifte || null, details: w.details || null, adviezen: advies, opgeheven,
    tijdvak, datumKop: begin ? hoofd(deel(begin, { weekday: "long", day: "numeric", month: "long" })) : null,
    vanafTot: begin ? hoofd(`vanaf ${uurMin(begin)}${eind ? ` tot ${dagKey(eind) === dagKey(begin) ? "" : `${weekdag(eind)} `}${uurMin(eind)}` : ""}`) : null,
    tijdvakken: vakken.length > 1 ? vakken.map((v) => ({ niveau: v.niveau, code: CODE[v.niveau] || code, tekst: tijdvakTekst(v.start, v.einde) })) : null,
    gebieden: Array.isArray(w.landelijk) && w.landelijk.length ? w.landelijk : w.gebied ? [{ niveau: w.niveau, gebied: w.gebied }] : [],
  };
  const alineas = [];
  if (opgeheven) alineas.push({ titel: null, tekst: "Het KNMI heeft deze waarschuwing opgeheven. Er geldt nu code groen." });
  alineas.push({ titel: "Wanneer", tekst: weer.tijdvakken ? weer.tijdvakken.map((v) => `${v.code}: ${v.tekst}`).join("\n") : `${code}: ${tijdvak}` });
  if (omschrijving) alineas.push({ titel: null, tekst: omschrijving });
  if (advies.length) alineas.push({ titel: "Risico's en advies", tekst: advies.map((a) => `› ${a}`).join("\n") });
  if (w.details) alineas.push({ titel: "Details", tekst: String(w.details) });
  if (w.uitgifte) alineas.push({ titel: null, tekst: `Uitgifte: ${w.uitgifte}` });
  return { titel, intro: omschrijving, alineas, opgeheven, weer };
}

/** Burgernet / AMBER / Vermist Kind (API shape) → liveblog with the official timeline. */
export function liveblogVan(w) {
  const berichten = (Array.isArray(w.berichten) ? w.berichten : []).filter((b) => b && (b.tekst || b.at)).map((b, i) => ({
    key: `b${i}:${b.id || b.at || ""}`, at: b.at || w.start, soort: b.soort || "update", plaats: b.plaats || null, tekst: b.tekst || "", door: w.bron,
  }));
  if (!berichten.length && w.tekst) berichten.push({ key: "b0", at: w.start, soort: "start", plaats: w.plaats || null, tekst: w.tekst, door: w.bron });
  return { titel: w.titel || "", intro: w.tekst || "", berichten };
}

/** Weather articles and liveblogs follow the warnings: every changed warning updates its item (a new weather code: a new article). */
export async function syncWaarschuwingen(env, kv, now = Date.now(), { alleWeer = false } = {}) {
  const last = Number((await kv.get("nieuws_sync"))?.value || 0);
  const since = last ? last - 2 * 60_000 : now - 14 * DAY;
  // alleWeer: once after a change in how weather articles are built, so the existing ones get the new layout too.
  const { results } = alleWeer
    ? await env.DB.prepare("SELECT ref AS id FROM nieuws WHERE soort = 'weer' AND ref IS NOT NULL").all()
    : await env.DB.prepare(`SELECT w.id FROM waarschuwingen w LEFT JOIN waarschuwing_overrides wo ON wo.id = w.id
    WHERE w.bron IN ('knmi','burgernet','amber','vermistkind','nlalert') AND (w.updated_at > ? OR w.first_seen > ? OR COALESCE(wo.updated_at, 0) > ?)
    ORDER BY w.updated_at LIMIT 60`).bind(since, since, since).all();
  for (const { id } of results) {
    const w = await getWarning(env, id);
    if (!w) continue;
    if (w.bron === "knmi") {
      const a = weerArtikel(w);
      // One article per code: as long as the code stays the same the article follows the warning; a new code
      // (higher, lower, or lifted = code groen) gets a new article and the earlier one stays as it was.
      const code = a.opgeheven ? "green" : w.niveau || "yellow";
      const { results: eerder } = await env.DB.prepare("SELECT id, niveau, status, at FROM nieuws WHERE soort = 'weer' AND ref = ? ORDER BY created_at DESC, at DESC").bind(w.id).all();
      const laatste = eerder[0];
      const codeVan = (r) => (r.status === "afgerond" ? "green" : r.niveau || "yellow");
      let id, at;
      if (!laatste) { id = await nieuwsId("w", w.id); at = Date.parse(w.eerst_gezien) || Date.parse(w.start); }
      else if (codeVan(laatste) === code) { id = laatste.id; at = laatste.at; }
      else { id = await nieuwsId("w", `${w.id}#${code}#${eerder.length}`); at = now; }
      await upsertNieuws(env, { id, soort: "weer", bron: "knmi", ref: w.id, titel: a.titel, intro: a.intro, plaats: "Gelderland",
        url: w.link, categorie: a.weer.icoon, status: a.opgeheven ? "afgerond" : "actief", niveau: w.niveau, at, data: { alineas: a.alineas, weer: a.weer } }, now);
    } else if (LIVE_BRONNEN.includes(w.bron)) {
      const l = liveblogVan(w);
      const nid = await nieuwsId("l", w.id);
      const klaar = w.status === "beeindigd";
      // "at" of a liveblog is the time of its newest official message (sorting), the start is kept in data.
      const laatste = Math.max(Date.parse(w.start) || 0, ...l.berichten.map((b) => Date.parse(b.at) || 0));
      await upsertNieuws(env, { id: nid, soort: "liveblog", bron: w.bron, ref: w.id, titel: l.titel, intro: l.intro, plaats: w.plaats, lat: w.lat, lon: w.lon,
        url: w.link, categorie: null, status: klaar ? "afgerond" : "actief", niveau: null, at: laatste || now, data: { berichten: l.berichten, start: w.start } }, now);
      // A missing child: after the end no photo and no description any more, also not in what the beheer added.
      if (klaar && KIND.includes(w.bron)) await wisKindAanvullingen(env, nid);
    }
  }
  if (!alleWeer) await kv.set("nieuws_sync", String(now));
}

export async function wisKindAanvullingen(env, nid) {
  const { results } = await env.DB.prepare("SELECT foto FROM nieuws_updates WHERE nieuws_id = ? AND foto IS NOT NULL").bind(nid).all();
  await env.DB.batch([
    env.DB.prepare("UPDATE nieuws_updates SET tekst = ?, foto = NULL, url = NULL WHERE nieuws_id = ? AND tekst != ?").bind(VERWIJDERD, nid, VERWIJDERD),
    env.DB.prepare("UPDATE nieuws SET foto = NULL WHERE id = ?").bind(nid),
    ...results.map((r) => env.DB.prepare("DELETE FROM nieuws_fotos WHERE id = ?").bind(r.foto)),
  ]);
}

// ------------------------------------------------------------------ API shape

async function stockFotos(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM kv WHERE key LIKE 'nieuws_stock:%'").all();
  return new Map(results.map((r) => [r.key.slice("nieuws_stock:".length), r.value]));
}

export function afbeeldingVoor(row, origin, stock = new Map()) {
  if (row.foto) return `${origin}/v1/nieuws/foto/${row.foto}`;
  if (row.soort === "politie") {
    const cat = STOCK_CATEGORIEEN.includes(row.categorie) ? row.categorie : "algemeen";
    const eigen = stock.get(cat) || stock.get("algemeen");
    return eigen ? `${origin}/v1/nieuws/foto/${eigen}` : `${IMG}${row.stock_foto || kiesOpId(POLITIE_FOTOS[cat] || POLITIE_FOTOS.algemeen, row.id)}.webp${IMG_V}`;
  }
  // Weather: the banner of the code and the kind of weather (knmi-<code>-<icon>.webp), green once lifted.
  if (row.soort === "weer") {
    const code = row.status === "afgerond" || row.niveau === "green" ? "green" : ["yellow", "orange", "red"].includes(row.niveau) ? row.niveau : "yellow";
    return `${IMG}knmi-${code}-${WEER_ICONEN.includes(row.categorie) ? row.categorie : "warning"}${row.is_liveblog ? "-live" : ""}.webp${IMG_V}`;
  }
  if (row.soort === "regionaal") return foto112(row);
  // Burgernet, AMBER Alert, Vermist Kind, NL-Alert: with "LIVEBLOG" on the banner when the beheer switched it on.
  // Ended: the "afgerond" banner (also when it was a liveblog).
  if (row.status === "afgerond" && LIVE_BRONNEN.includes(row.bron)) return `${IMG}${row.bron}-afgerond.webp${IMG_V}`;
  return `${IMG}${row.bron}${row.is_liveblog ? "-live" : ""}.webp${IMG_V}`;
}
const WEER_ICONEN = ["fog", "wind", "thunderstorm", "rain", "snow", "ice", "heat", "cold", "waterspout", "warning"];

function samenvatting(row, origin, stock, extra = {}) {
  return {
    id: row.id, soort: row.soort, bron: row.bron, titel: row.titel, intro: row.intro || null, plaats: row.plaats || null,
    // at: publication (police, weather) or newest message (liveblog); bijgewerkt: also counts the beheer messages.
    at: new Date(row.at).toISOString(), bijgewerkt: new Date(Math.max(row.laatste_update || 0, row.at)).toISOString(),
    start: row.soort === "liveblog" ? (row.start || new Date(row.at).toISOString()) : null,
    status: row.status || null, niveau: row.niveau || null, categorie: row.categorie || null,
    afbeelding: afbeeldingVoor(row, origin, stock), link: `${SITE}${row.id}/`, bron_url: row.url || null,
    waarschuwing: row.soort === "politie" ? null : row.ref, aantal: row.aantal ?? null, liveblog: Boolean(row.is_liveblog),
    foto_bron: !row.foto && (row.soort === "politie" || row.soort === "regionaal") ? fotoBron(row.stock_foto) : null,
    ...(row.hidden !== undefined && extra.beheer ? { hidden: Boolean(row.hidden) } : {}),
  };
}

const LIST_SQL = `SELECT n.*, (SELECT MAX(at) FROM nieuws_updates u WHERE u.nieuws_id = n.id) AS laatste_update,
  EXISTS (SELECT 1 FROM nieuws_liveblog lb WHERE lb.id = n.id) AS is_liveblog,
  (SELECT foto FROM nieuws_stockfoto sf WHERE sf.id = n.id) AS stock_foto,
  (SELECT COUNT(*) FROM nieuws_updates u WHERE u.nieuws_id = n.id) AS n_updates FROM nieuws n`;

/** Newest first: liveblogs by their last message, the rest by publication. */
export async function listNieuws(env, origin, { soort, limit, before, beheer = false } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const where = [beheer ? "1=1" : "n.hidden = 0"], args = [];
  // "liveblog" follows the beheer switch; the other kinds the kind of item.
  if (soort === "liveblog" && !beheer) where.push("EXISTS (SELECT 1 FROM nieuws_liveblog lb WHERE lb.id = n.id)");
  else if (NIEUWS_SOORTEN.includes(soort)) { where.push("n.soort = ?"); args.push(soort); }
  const sortKey = "MAX(n.at, COALESCE((SELECT MAX(at) FROM nieuws_updates u WHERE u.nieuws_id = n.id), 0))";
  if (before) { where.push(`${sortKey} < ?`); args.push(Number(new Date(before)) || Number(before)); }
  const { results } = await env.DB.prepare(`${LIST_SQL} WHERE ${where.join(" AND ")} ORDER BY ${sortKey} DESC, n.created_at DESC LIMIT ?`).bind(...args, lim).all();
  const stock = await stockFotos(env);
  return results.map((r) => {
    const d = parse(r.data, {});
    const aantal = r.soort === "liveblog" ? (d.berichten?.length || 0) + (r.n_updates || 0) : r.n_updates || 0;
    // Sort time of a liveblog: its newest message (official or from the beheer).
    return samenvatting({ ...r, aantal, start: d.start || null }, origin, stock, { beheer });
  });
}

export async function getNieuws(env, origin, id, { beheer = false } = {}) {
  const row = await env.DB.prepare(`${LIST_SQL} WHERE n.id = ?`).bind(id).first();
  if (!row || (row.hidden && !beheer)) return null;
  const d = parse(row.data, {});
  const { results: ups } = await env.DB.prepare("SELECT * FROM nieuws_updates WHERE nieuws_id = ? ORDER BY at DESC").bind(id).all();
  const eigen = ups.map((u) => ({ id: u.id, at: new Date(u.at).toISOString(), soort: "aanvulling", door: "a-alerts", titel: u.titel || null, tekst: u.tekst || "",
    foto: u.foto ? `${origin}/v1/nieuws/foto/${u.foto}` : null, url: u.url || null }));
  const officieel = (d.berichten || []).map((b) => ({ id: null, at: b.at, soort: b.soort, door: b.door || row.bron, titel: null, tekst: b.tekst, plaats: b.plaats || null, foto: null, url: null }));
  const tijdlijn = [...eigen, ...officieel].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const laatste = Math.max(row.at, ...tijdlijn.map((t) => Date.parse(t.at) || 0));
  const stock = await stockFotos(env);
  return {
    ...samenvatting({ ...row, aantal: tijdlijn.length, laatste_update: laatste, start: d.start || null }, origin, stock, { beheer }),
    alineas: d.alineas || [], plaatsen: d.plaatsen || null, tijdlijn, weer: d.weer || null,
    bron_naam: row.soort === "regionaal" ? "112 Nieuws" : row.soort === "politie" ? "politie.nl" : row.soort === "weer" ? "KNMI" : row.bron === "burgernet" ? "Burgernet" : "Politie (AMBER Alert)",
  };
}

// ------------------------------------------------------------------ beheer

/** "data:image/jpeg;base64,…" → { mime, bytes } or an error. */
export function leesFoto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ""));
  if (!m) throw Object.assign(new Error("Foto moet een JPEG, PNG of WebP zijn"), { status: 400 });
  const bin = atob(m[2].replace(/\s+/g, ""));
  if (bin.length > MAX_FOTO) throw Object.assign(new Error("Foto is te groot (max. 1,8 MB)"), { status: 413 });
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

export async function bewaarFoto(env, dataUrl) {
  const { mime, bytes } = leesFoto(dataUrl);
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare("INSERT INTO nieuws_fotos (id, mime, data, at) VALUES (?, ?, ?, ?)").bind(id, mime, bytes, Date.now()).run();
  return id;
}

export async function fotoResponse(env, id) {
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Niet gevonden", { status: 404 });
  const row = await env.DB.prepare("SELECT mime, data FROM nieuws_fotos WHERE id = ?").bind(id).first();
  if (!row) return new Response("Niet gevonden", { status: 404 });
  const data = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data);
  return new Response(data, { headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } });
}

const isKindAfgerond = (row) => row && KIND.includes(row.bron) && row.status === "afgerond";

/** PATCH: hide/show, own photo (data URL) or remove it (null), title. */
export async function wijzigNieuws(env, id, body) {
  const row = await env.DB.prepare("SELECT * FROM nieuws WHERE id = ?").bind(id).first();
  if (!row) return null;
  if ("hidden" in body) await env.DB.prepare("UPDATE nieuws SET hidden = ? WHERE id = ?").bind(body.hidden ? 1 : 0, id).run();
  // Liveblog yes/no (label and banner in apps and website); updated_at moves so the share page follows.
  if ("liveblog" in body) {
    await env.DB.batch([
      body.liveblog ? env.DB.prepare("INSERT OR IGNORE INTO nieuws_liveblog (id, at) VALUES (?, ?)").bind(id, Date.now())
        : env.DB.prepare("DELETE FROM nieuws_liveblog WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE nieuws SET updated_at = ? WHERE id = ?").bind(Date.now(), id),
    ]);
  }
  if ("foto" in body) {
    if (body.foto && isKindAfgerond(row)) throw Object.assign(new Error("Na afloop van een kind-alert kan er geen foto meer bij"), { status: 400 });
    const foto = body.foto ? await bewaarFoto(env, body.foto) : null;
    await env.DB.batch([
      env.DB.prepare("UPDATE nieuws SET foto = ? WHERE id = ?").bind(foto, id),
      ...(row.foto ? [env.DB.prepare("DELETE FROM nieuws_fotos WHERE id = ?").bind(row.foto)] : []),
    ]);
  }
  return true;
}

/** New message in the timeline of an item. Returns the stored update. */
export async function voegToe(env, id, body) {
  const row = await env.DB.prepare("SELECT * FROM nieuws WHERE id = ?").bind(id).first();
  if (!row) return null;
  const tekst = String(body.tekst || "").trim().slice(0, 4000);
  const titel = String(body.titel || "").trim().slice(0, 160) || null;
  const url = String(body.url || "").trim();
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw Object.assign(new Error("Link moet met https:// beginnen"), { status: 400 });
  if (!tekst && !body.foto && !url) throw Object.assign(new Error("Vul een tekst, foto of link in"), { status: 400 });
  if (body.foto && isKindAfgerond(row)) throw Object.assign(new Error("Na afloop van een kind-alert kan er geen foto meer bij"), { status: 400 });
  const foto = body.foto ? await bewaarFoto(env, body.foto) : null;
  const at = body.at && Number.isFinite(Date.parse(body.at)) ? Math.min(Date.parse(body.at), Date.now()) : Date.now();
  const r = await env.DB.prepare("INSERT INTO nieuws_updates (nieuws_id, titel, tekst, url, foto, at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")
    .bind(id, titel, tekst, url || null, foto, at, Date.now()).first();
  return { id: r.id, nieuws: row };
}

export async function wijzigUpdate(env, id, uid, body) {
  const u = await env.DB.prepare("SELECT u.*, n.bron, n.status FROM nieuws_updates u JOIN nieuws n ON n.id = u.nieuws_id WHERE u.id = ? AND u.nieuws_id = ?").bind(uid, id).first();
  if (!u) return null;
  const sets = [], args = [];
  if ("tekst" in body) { sets.push("tekst = ?"); args.push(String(body.tekst || "").trim().slice(0, 4000)); }
  if ("titel" in body) { sets.push("titel = ?"); args.push(String(body.titel || "").trim().slice(0, 160) || null); }
  if ("url" in body) {
    const url = String(body.url || "").trim();
    if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw Object.assign(new Error("Link moet met https:// beginnen"), { status: 400 });
    sets.push("url = ?"); args.push(url || null);
  }
  const extra = [];
  if ("foto" in body) {
    if (body.foto && isKindAfgerond(u)) throw Object.assign(new Error("Na afloop van een kind-alert kan er geen foto meer bij"), { status: 400 });
    sets.push("foto = ?"); args.push(body.foto ? await bewaarFoto(env, body.foto) : null);
    if (u.foto) extra.push(env.DB.prepare("DELETE FROM nieuws_fotos WHERE id = ?").bind(u.foto));
  }
  if (sets.length) await env.DB.batch([env.DB.prepare(`UPDATE nieuws_updates SET ${sets.join(", ")} WHERE id = ?`).bind(...args, uid), ...extra]);
  return true;
}

export async function verwijderUpdate(env, id, uid) {
  const u = await env.DB.prepare("SELECT foto FROM nieuws_updates WHERE id = ? AND nieuws_id = ?").bind(uid, id).first();
  if (!u) return false;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM nieuws_updates WHERE id = ?").bind(uid),
    ...(u.foto ? [env.DB.prepare("DELETE FROM nieuws_fotos WHERE id = ?").bind(u.foto)] : []),
  ]);
  return true;
}

/** Stock images per subject for police articles: { categorie: dataURL | null }. */
export async function stockLijst(env, origin) {
  const s = await stockFotos(env);
  return STOCK_CATEGORIEEN.map((c) => ({ categorie: c, eigen: s.has(c), afbeelding: s.has(c) ? `${origin}/v1/nieuws/foto/${s.get(c)}` : `${IMG}politie-${c}.webp${IMG_V}` }));
}
export async function zetStock(env, body) {
  for (const c of STOCK_CATEGORIEEN) {
    if (!(c in (body || {}))) continue;
    const oud = await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(`nieuws_stock:${c}`).first();
    if (body[c]) {
      const id = await bewaarFoto(env, body[c]);
      await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(`nieuws_stock:${c}`, id, Date.now()).run();
    } else await env.DB.prepare("DELETE FROM kv WHERE key = ?").bind(`nieuws_stock:${c}`).run();
    if (oud?.value) await env.DB.prepare("DELETE FROM nieuws_fotos WHERE id = ?").bind(oud.value).run();
  }
}

// ------------------------------------------------------------------ push

const L = {
  nl: { live: { burgernet: "Liveblog · Burgernet", amber: "Liveblog · AMBER Alert", vermistkind: "Liveblog · Vermist Kind" }, politie: "Politienieuws", weer: "Weer", regio: "112 Nieuws" },
  en: { live: { burgernet: "Live blog · Burgernet", amber: "Live blog · AMBER Alert", vermistkind: "Live blog · Missing Child" }, politie: "Police news", weer: "Weather", regio: "112 Nieuws" },
};

/** kind "p": new police article, "a": message added by the beheer. */
export function payloadVoorNieuws(item, lang = "nl", kind = "p", update = null) {
  const t = L[(lang || "nl").startsWith("nl") ? "nl" : "en"];
  const head = item.soort === "liveblog" ? t.live[item.bron] || "Liveblog" : item.soort === "weer" ? `${t.weer} · ${item.titel}`
    : `${item.soort === "regionaal" ? t.regio : t.politie}${item.plaats ? ` · ${item.plaats}` : ""}`;
  const body = kind === "a" && update ? [update.titel, update.tekst].filter(Boolean).join(" – ") || item.titel : item.titel;
  return {
    aps: { alert: { title: head.slice(0, 120), body: String(body || "").slice(0, 400), ...(kind === "a" && item.soort !== "liveblog" ? { subtitle: item.titel.slice(0, 120) } : {}) },
      sound: "default", "thread-id": `nieuws-${item.id}`, "interruption-level": "active", "relevance-score": 0.5, category: "NIEUWS" },
    nieuws: item.id,
  };
}

/** Prefs (from settings.waarschuwingen): only apps with the tab send these; liveblogs default on in the app. */
export function nieuwsPrefs(p) {
  return { liveblog: p?.nieuwsLiveblog === true, politie: p?.nieuwsPolitie === true, regio: p?.nieuwsRegio === true };
}

/** Which devices get a push for a new police article or a beheer message on an item. */
export function nieuwsOntvangers(devices, prefs, item, warningWanted, warning) {
  return devices.filter((d) => {
    if (!d.enabled) return false;
    const p = prefs.get(d.token);
    const n = nieuwsPrefs(p);
    if (item.soort === "politie" || item.soort === "regionaal") {
      if (item.soort === "politie" ? !n.politie : !n.regio) return false;
      const chosen = d.plaatsen || [];
      return !chosen.length || chosen.some((c) => (item.plaatsen || [item.plaats]).some((x) => String(x).toLowerCase() === String(c).toLowerCase()));
    }
    if (!n.liveblog) return false;
    // Only for those who follow the source of the liveblog / weather warning.
    return warning ? warningWanted(d, p, { ...warning, status: "actief" }) : true;
  }).map((d) => d.token);
}

export async function nieuwsHousekeeping(env) {
  const grens = Date.now() - 90 * DAY;
  const { results } = await env.DB.prepare("SELECT id FROM nieuws WHERE at < ? AND updated_at < ?").bind(grens, grens).all();
  for (const { id } of results) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM nieuws_fotos WHERE id IN (SELECT foto FROM nieuws_updates WHERE nieuws_id = ? AND foto IS NOT NULL)").bind(id),
      env.DB.prepare("DELETE FROM nieuws_fotos WHERE id IN (SELECT foto FROM nieuws WHERE id = ? AND foto IS NOT NULL)").bind(id),
      env.DB.prepare("DELETE FROM nieuws_updates WHERE nieuws_id = ?").bind(id),
      env.DB.prepare("DELETE FROM nieuws_liveblog WHERE id = ?").bind(id),
      env.DB.prepare("DELETE FROM nieuws_stockfoto WHERE id = ?").bind(id),
      env.DB.prepare("DELETE FROM nieuws WHERE id = ?").bind(id),
    ]);
  }
}

export { distanceKm };
