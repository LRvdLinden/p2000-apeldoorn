// A-Alerts: NL-Alert, Burgernet and KNMI weather warnings for the working area (municipality of Apeldoorn + Teuge).
// Read once per cron run, filtered on the working area, stored in D1 (table waarschuwingen) and pushed to devices
// that opted in (table device_prefs). Pure parsing lives here too, so the tests can run it without I/O.
import { polygonOverlaps, inWerkgebied, inRing, distanceKm, PLAATSEN_ALL, plaatsKey, matchesPlaatsen } from "./werkgebied.js";
import { KIND_API, KIND_BRONNEN, groepeer, kindWarning } from "./kind.js";

export const SOURCES = {
  nlalert: "https://api.public-warning.app/api/v1/providers/nl-alert/alerts",
  burgernet: "https://api.112meldkamer.nl/v1/burgernet",
  // Burgernet's own site: the list of recent actions per municipality, and one page per action.
  burgernetSite: "https://www.burgernet.nl",
  knmi: "https://www.knmi.nl/api/v1/weather-warnings",
};
const UA = { accept: "application/json", "user-agent": "A-Alerts/1.0 (+https://a-alerts.nl)" };
const DAY = 86_400_000;
export const LEVELS = ["green", "yellow", "orange", "red"];
const levelRank = (l) => LEVELS.indexOf(l);

// ------------------------------------------------------------------ parsing (pure)

/** "52.1,5.9 52.2,6.0 …" (lat,lon pairs) → ring of [lon, lat]. */
export function parseNlAlertRing(text) {
  return String(text || "").trim().split(/\s+/).map((pair) => pair.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite)).map(([lat, lon]) => [lon, lat]);
}

/** Keep at most n points per ring (enough for an overlay; the full shape is only needed for the overlap test). */
export function simplify(rings, n = 160) {
  return rings.map((ring) => {
    if (ring.length <= n) return ring;
    const step = ring.length / n;
    const out = [];
    for (let i = 0; i < n; i++) out.push(ring[Math.floor(i * step)]);
    out.push(ring[0]);
    return out;
  });
}

const centroid = (rings) => {
  const pts = rings.flat();
  if (!pts.length) return [null, null];
  return [pts.reduce((t, p) => t + p[1], 0) / pts.length, pts.reduce((t, p) => t + p[0], 0) / pts.length];
};

/** The Dutch part of a bilingual NL-Alert ("… *** English …"). */
export function nlPart(message) {
  return String(message || "").split("***")[0].replace(/\s+/g, " ").trim();
}
export function enPart(message) {
  const parts = String(message || "").split("***");
  return parts.length > 1 ? parts.slice(1).join(" ").replace(/\s+/g, " ").trim() : null;
}

export function fromNlAlert(a, now = Date.now()) {
  if (!a?.id) return null;
  const rings = (Array.isArray(a.area) ? a.area : [a.area]).map(parseNlAlertRing).filter((r) => r.length >= 3);
  if (!rings.length || !polygonOverlaps(rings)) return null;
  const start = Date.parse(a.start_at), stop = Date.parse(a.stop_at);
  const nl = nlPart(a.message);
  const [lat, lon] = centroid(rings);
  const firstSentence = nl.split(/(?<=[.!?])\s/)[0] || nl;
  return {
    id: `nlalert:${a.id}`, bron: "nlalert",
    titel: firstSentence.replace(/[.!]$/, "").slice(0, 140), tekst: nl, tekst_en: enPart(a.message),
    plaats: null, niveau: null, soort: a.type || "alert",
    start_at: Number.isFinite(start) ? start : now, end_at: Number.isFinite(stop) ? stop : null,
    status: Number.isFinite(stop) && stop < now ? "beeindigd" : "actief",
    gebied: rings, lat, lon, link: `https://actueel.nl-alert.nl/alert/${encodeURIComponent(a.id)}/`,
  };
}

const BURGERNET_SOORT = [
  [/vermis|vermist/i, "Vermissing"],
  [/kenteken|voertuig|auto|scooter|motor/i, "Voertuig"],
  [/inbra|overval|diefstal|beroving|steek|verdachte|gevlucht|vluchtte/i, "Verdachte"],
];

/** "Ugchelen" when the text names one of our places, else the municipality. */
function burgernetPlaats(report, location) {
  const text = ` ${String(report || "").toLowerCase()} `;
  const named = PLAATSEN_ALL
    .filter((p) => p.naam !== "Apeldoorn")
    .sort((a, b) => b.naam.length - a.naam.length)
    .find((p) => [p.naam, ...(p.aliassen || [])].some((n) => new RegExp(`[^a-z]${n.toLowerCase().replace(/[-\s]/g, "[-\\s]")}[^a-z]`).test(text)));
  if (named) return named;
  if (plaatsKey(location) === "apeldoorn") return PLAATSEN_ALL.find((p) => p.naam === "Apeldoorn");
  return null;
}

export function fromBurgernet(a, now = Date.now()) {
  const location = String(a?.location || "").trim();
  const key = plaatsKey(location);
  // Burgernet sends the municipality: Apeldoorn, or Voorst for Teuge.
  if (key !== "apeldoorn" && key !== "voorst") return null;
  const plaats = burgernetPlaats(a.report, location);
  if (!plaats || (key === "voorst" && plaats.naam !== "Teuge")) return null;
  const link = String(a.link || "");
  const idMatch = link.match(/\/burgernet\/([^/?#]+)/);
  const id = idMatch ? idMatch[1] : `${key}-${a.date}-${String(a.report || "").slice(0, 40)}`;
  const report = String(a.report || "").replace(/\r/g, "").trim();
  const clean = report.replace(/^\d{4}\s?[A-Z]{2}\s+/, "");
  const firstSentence = clean.split(/(?<=[.:!?])\s/)[0] || clean;
  const [d, mth, y] = String(a.date || "").split("/").map(Number);
  let start = y ? Date.UTC(y, mth - 1, d, 12) : now;
  const t = String(a.time || "").match(/(\d{1,2}):(\d{2})/);
  if (y && t) start = amsterdamTime(a.date, `${t[1]}:${t[2]}`) ?? start;
  return {
    id: `burgernet:${id}`, bron: "burgernet",
    titel: firstSentence.replace(/\s*(Tips\?|Bel nu 112).*$/i, "").slice(0, 140), tekst: report, tekst_en: null,
    plaats: plaats.naam, niveau: null, soort: (BURGERNET_SOORT.find(([re]) => re.test(report)) || [null, "Zoekactie"])[1],
    start_at: start, end_at: null, status: a.isClosed === true ? "beeindigd" : "actief",
    gebied: null, lat: plaats.lat, lon: plaats.lon, link: link || null,
  };
}

/** Dutch local time ("06/11/2026", "13:15") to epoch ms, with the right summer/winter offset. */
export function amsterdamTime(dmy, hm = "12:00") {
  const [d, m, y] = String(dmy || "").split("/").map(Number);
  const [h, mi] = String(hm || "12:00").split(":").map(Number);
  if (!y || !m || !d) return null;
  const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23", day: "2-digit" }).formatToParts(new Date(guess));
  const get = (k) => Number(parts.find((x) => x.type === k)?.value);
  let diff = (get("hour") * 60 + get("minute")) - ((h || 0) * 60 + (mi || 0));
  if (get("day") !== new Date(guess).getUTCDate()) diff += get("day") > new Date(guess).getUTCDate() || (get("day") === 1 && new Date(guess).getUTCDate() > 27) ? 1440 : -1440;
  return guess - diff * 60_000;
}

const decode = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

/** The ids on a municipality page of burgernet.nl (/gemeente/Oost-Nederland/APELDOORN), newest first. */
export function burgernetSiteIds(html) {
  return [...new Set([...String(html || "").matchAll(/href="\/burgernet\/(\d{4,})"/g)].map((m) => m[1]))];
}

/** The messages of an action page (Startbericht, updates, Afloopbericht), each with place and time, oldest first. */
export function burgernetBerichten(html) {
  const delen = String(html || "").split(/<h5[^>]*action-detail-block__title[^>]*>/i).slice(1);
  const out = [];
  for (const deel of delen) {
    const label = decode(deel.slice(0, deel.indexOf("</h5>")));
    const tekst = decode((deel.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || "");
    if (!label || !tekst) continue;
    const items = [...deel.slice(0, deel.search(/<h3/i)).matchAll(/action-message__heading-item[^>]*>([^<]*)</gi)].map((m) => decode(m[1]));
    const datum = items.find((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(x));
    const tijd = items.find((x) => /^\d{1,2}:\d{2}$/.test(x));
    const plaats = items.find((x) => x !== datum && x !== tijd) || null;
    const soort = /start/i.test(label) ? "start" : /afloop|einde|gesloten/i.test(label) ? "afloop" : "update";
    const at = datum ? amsterdamTime(datum, tijd || "00:00") : null;
    out.push({ soort, label, plaats: plaats ? plaats.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : null, at: at ? new Date(at).toISOString() : null, tekst });
  }
  const rang = { start: 0, update: 1, afloop: 2 };
  // Burgernet lists newest first; sort by time, and by kind when times are missing or equal.
  return out.reverse().sort((a, b) => (a.at && b.at && a.at !== b.at ? Date.parse(a.at) - Date.parse(b.at) : rang[a.soort] - rang[b.soort]));
}

/** One action page of burgernet.nl (/burgernet/<id>) in the shape of fromBurgernet. */
export function fromBurgernetSite(id, html, now = Date.now()) {
  const h = String(html || "");
  const spec = (label) => {
    const m = h.match(new RegExp(`${label}</p>\\s*<p[^>]*>([^<]*)</p>`, "i"));
    return m ? decode(m[1]) : "";
  };
  const message = (label) => {
    const m = h.match(new RegExp(`>${label}</h5>[\\s\\S]*?<h3[^>]*>([\\s\\S]*?)</h3>`, "i"));
    return m ? decode(m[1]) : "";
  };
  const location = spec("Locatie");
  const key = plaatsKey(location);
  if (key !== "apeldoorn" && key !== "voorst") return null;
  const report = message("Startbericht") || message("Afloopbericht");
  const plaats = burgernetPlaats(report, location);
  if (!plaats || (key === "voorst" && plaats.naam !== "Teuge")) return null;
  const [sd, st] = spec("Start actie").split(/\s+/);
  const [ed2, et] = spec("Einde actie").split(/\s+/);
  const status = spec("Status van deze actie");
  const ended = /afgerond|be[eë]indigd|gesloten/i.test(status) || /Afgeronde actie/i.test(h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || "");
  const center = h.match(/data-center="(-?\d+\.\d+),(-?\d+\.\d+)"/);
  let lat = center ? Number(center[1]) : plaats.lat, lon = center ? Number(center[2]) : plaats.lon;
  // Burgernet centres on the town when it has no address; outside the area means a wrong guess.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || distanceKm({ lat, lon }, plaats) > 25) { lat = plaats.lat; lon = plaats.lon; }
  const clean = report.replace(/^\d{4}\s?[A-Z]{2}\s+/, "");
  const firstSentence = clean.split(/(?<=[.:!?])\s/)[0] || clean;
  const afloop = message("Afloopbericht");
  const berichten = burgernetBerichten(h);
  return {
    id: `burgernet:${id}`, bron: "burgernet",
    titel: firstSentence.replace(/\s*(Tips\?|Bel nu 112).*$/is, "").slice(0, 140),
    tekst: afloop && ended ? `${report}\n\n${afloop}` : report, tekst_en: null,
    // Start and closing message apart, so the apps and Homey can show the closing message on its own.
    startbericht: report, afloop: afloop || null,
    // Every message on its own with place and time (start, updates, closing), oldest first: a timeline.
    berichten: berichten.length ? berichten : null,
    plaats: plaats.naam, niveau: null, soort: (BURGERNET_SOORT.find(([re]) => re.test(report)) || [null, "Zoekactie"])[1],
    start_at: amsterdamTime(sd, st) ?? now, end_at: ended ? (amsterdamTime(ed2, et) ?? now) : null,
    status: ended ? "beeindigd" : "actief",
    gebied: null, lat, lon, link: `https://www.burgernet.nl/burgernet/${id}`,
  };
}

const txt = (v) => (v == null ? "" : typeof v === "object" ? String(v.nl || v.en || Object.values(v)[0] || "") : String(v).trim());
const normLevel = (v) => {
  const s = String(v || "").toLowerCase();
  if (["red", "rood", "extreme"].includes(s)) return "red";
  if (["orange", "oranje", "amber", "severe"].includes(s)) return "orange";
  if (["yellow", "geel", "moderate"].includes(s)) return "yellow";
  return "green";
};
const geomRings = (g) => !g ? [] : g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];

// KNMI names the phenomenon in English in its feed; the apps are Dutch.
const KNMI_NL = {
  fog: "Mist", "dense fog": "Dichte mist", wind: "Wind", "strong wind": "Zware windstoten", "wind gusts": "Windstoten",
  thunderstorm: "Onweer", thunderstorms: "Onweer", lightning: "Onweer", rain: "Regen", "heavy rain": "Zware regen",
  snow: "Sneeuw", "snow/ice": "Sneeuw en gladheid", ice: "Gladheid", "slippery roads": "Gladheid", glaze: "IJzel",
  "freezing rain": "IJzel", heat: "Hitte", "high temperature": "Hitte", "low temperature": "Kou", cold: "Kou",
  "extreme cold": "Strenge vorst", hail: "Hagel", tornado: "Tornado", "coastal event": "Kustwaarschuwing",
};
const knmiNaam = (p) => KNMI_NL[String(p || "").trim().toLowerCase()] || p;

const ontHTML = (s) => String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .split("\n").map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

/**
 * The texts KNMI shows on knmi.nl/nederland-nu/weer/waarschuwingen per warning (section "waarschuwing-<event id>"):
 * headline, description, details and issue time. The JSON feed does not have these.
 */
export function knmiPagina(html) {
  const uit = new Map();
  const secties = String(html || "").split(/<section[^>]+id="waarschuwing-/i).slice(1);
  for (const s of secties) {
    const id = s.match(/^([^"]+)"/)?.[1];
    if (!id) continue;
    const pak = (re) => { const m = s.match(re); return m ? ontHTML(m[1]) || null : null; };
    uit.set(String(id), {
      kop: pak(/class="weather-warnings-details__title"[^>]*>([\s\S]*?)<\/h2>/i),
      omschrijving: pak(/class="weather-warnings-details__body"[^>]*>([\s\S]*?)<\/div>/i),
      details: pak(/<details class="weather-warnings-more">[\s\S]*?<\/summary>([\s\S]*?)<\/details>/i),
      uitgifte: pak(/class="weather-warnings-details__issued"[^>]*>\s*(?:Uitgifte:)?([\s\S]*?)<\/p>/i),
    });
  }
  return uit;
}

/**
 * One record per warning, with only the parts that cover the working area. Periods of the same warning that
 * follow each other with the same level are joined (KNMI often splits one fog warning into hourly periods).
 */
export function fromKnmi(data, now = Date.now(), pagina = new Map()) {
  const out = [];
  for (const [ei, ev] of (data?.warning_events || []).entries()) {
    const phenomenon = txt(ev.label) || knmiNaam(txt(ev.phenomenon));
    const site = pagina.get(String(ev.id ?? ei)) || {};
    for (const period of ev.periods || []) {
      const start = Date.parse(period.starts_at), end = Date.parse(period.ends_at);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const parts = (period.parts || []).map((p) => ({ level: normLevel(p.level), area: txt(p.area_description), rings: geomRings(p.geometry),
        impact: txt(p.impact), instruction: txt(p.instruction) }))
        .filter((p) => p.level !== "green" && (p.rings.length ? polygonOverlaps(p.rings) : /gelderland|heel nederland|alle provincies/i.test(p.area)));
      if (!parts.length) continue;
      const niveau = parts.reduce((m, p) => (levelRank(p.level) > levelRank(m) ? p.level : m), "green");
      const rings = parts.flatMap((p) => p.rings);
      const [lat, lon] = rings.length ? centroid(rings) : [52.2112, 5.9699];
      const description = txt(period.description) || txt(ev.description) || txt(period.text) || txt(ev.text);
      // KNMI per area part: "impact" (what to expect) and "instruction" (what to do). The highest level here counts.
      const top = parts.filter((p) => p.level === niveau);
      const uniek = (k) => [...new Set(top.map((p) => p[k]).filter(Boolean))].join("\n") || null;
      const verwachting = uniek("impact"), advies = uniek("instruction");
      out.push({
        id: `knmi:${ev.id ?? ei}:${period.starts_at}`, bron: "knmi",
        titel: phenomenon || "Weerwaarschuwing", verwachting, advies,
        kop: site.kop || null, omschrijving: site.omschrijving || null, details: site.details || null, uitgifte: site.uitgifte || null,
        tekst: description || site.omschrijving || verwachting || `${[...new Set(parts.map((p) => p.area).filter(Boolean))].join(", ")}`,
        tekst_en: null, plaats: [...new Set(parts.map((p) => p.area).filter(Boolean))].join(", ") || null,
        niveau, soort: phenomenon, start_at: start, end_at: end,
        status: end < now ? "beeindigd" : start > now ? "verwacht" : "actief",
        gebied: rings.length ? simplify(rings, 400) : null, lat, lon, link: "https://www.knmi.nl/nederland-nu/weer/waarschuwingen",
        _ev: ev.id ?? ei,
      });
    }
  }
  // Join consecutive periods of the same warning and level into one.
  out.sort((a, b) => String(a._ev).localeCompare(String(b._ev)) || a.start_at - b.start_at);
  const joined = [];
  for (const w of out) {
    const prev = joined[joined.length - 1];
    if (prev && prev._ev === w._ev && prev.niveau === w.niveau && w.start_at <= prev.end_at + 60_000) {
      prev.end_at = Math.max(prev.end_at, w.end_at);
      prev.status = prev.end_at < now ? "beeindigd" : prev.start_at > now ? "verwacht" : "actief";
      if (w.tekst && !prev.tekst.includes(w.tekst)) prev.tekst = prev.tekst || w.tekst;
      prev.verwachting ||= w.verwachting; prev.advies ||= w.advies;
      continue;
    }
    joined.push(w);
  }
  // Time slots of the whole warning for the working area, per code ("geel 06–09 · oranje 09–10"), on every record of it.
  const slots = new Map();
  for (const w of joined) {
    if (!slots.has(w._ev)) slots.set(w._ev, []);
    slots.get(w._ev).push({ niveau: w.niveau, start: new Date(w.start_at).toISOString(), einde: new Date(w.end_at).toISOString() });
  }
  return joined.map(({ _ev, ...w }) => ({ ...w, tijdvakken: slots.get(_ev) }));
}

// ------------------------------------------------------------------ device preferences

/** settings.waarschuwingen from the app: { nlalert, burgernet, knmi: ["yellow","orange","red"] }. */
export function prefsFrom(s) {
  if (!s || typeof s !== "object") return null;
  const knmi = Array.isArray(s.knmi) ? s.knmi.map(normLevel).filter((l) => l !== "green") : [];
  return { nlalert: s.nlalert !== false, burgernet: s.burgernet === true, knmi: [...new Set(knmi)],
    // AMBER Alert and Vermist Kind Alert (app 2.0.1+): only when the app sends them, so older apps never get a kind they cannot show.
    amber: s.amber === true, vermistkind: s.vermistkind === true,
    // Tab Nieuws (app 2.0.1 build 67+): liveblog messages from the beheer and new police news.
    nieuwsLiveblog: s.nieuwsLiveblog === true, nieuwsPolitie: s.nieuwsPolitie === true, nieuwsRegio: s.nieuwsRegio === true,
    // KNMI extras (default on): a push one hour before the code starts, and one when it is lifted (code green).
    knmiVooraf: s.knmiVooraf !== false, knmiOpgeheven: s.knmiOpgeheven !== false };
}

/** Whether a warning reaches the device's radius: its area covers the centre or comes within the radius. */
export function withinRadius(device, w) {
  const r = device.radius_km, lat = device.lat, lon = device.lon;
  if (Array.isArray(w.gebied) && w.gebied.length && w.bron !== "burgernet") {
    return w.gebied.some((ring) => inRing(ring, lat, lon) || ring.some(([x, y]) => distanceKm(lat, lon, y, x) <= r));
  }
  if (w.lat != null && w.lon != null) return distanceKm(lat, lon, w.lat, w.lon) <= r + 2;
  return true; // no location known: the place filter decides
}

/** Whether a device (with its prefs and places) gets a push for this warning. */
export function wantsPush(device, prefs, w) {
  if (!prefs || !device.enabled) return false;
  if (w.bron === "nlalert" && !prefs.nlalert) return false;
  if (w.bron === "burgernet" && !prefs.burgernet) return false;
  if (w.bron === "knmi" && !prefs.knmi.includes(w.niveau)) return false;
  // AMBER Alert: all of the Netherlands. Vermist Kind Alert: only kept when its search area reaches the working area.
  if (w.bron === "amber") return Boolean(prefs.amber);
  if (w.bron === "vermistkind") return Boolean(prefs.vermistkind);
  // "Mijn buurt": only warnings that reach the radius around the device (same rule as the list in the app).
  if (device.radius_km > 0 && device.lat != null && device.lon != null && !withinRadius(device, w)) return false;
  const chosen = device.plaatsen || [];
  if (!chosen.length) return true;
  if (w.bron === "burgernet") return matchesPlaatsen(chosen, { stad: w.plaats, locatie: "", lat: null, lon: null });
  // Area warnings: one of the chosen places lies in (or within 2 km of) the area.
  const places = PLAATSEN_ALL.filter((p) => chosen.some((c) => plaatsKey(c) === plaatsKey(p.naam)));
  if (!w.gebied) return true;
  return places.some((p) => w.gebied.some((ring) => inRing(ring, p.lat, p.lon) || ring.some(([lon, lat]) => distanceKm(lat, lon, p.lat, p.lon) <= 2)));
}

const LABELS = {
  nl: { nlalert: "NL-Alert", burgernet: "Burgernet", amber: "AMBER Alert", vermistkind: "Vermist Kind Alert", kindUpdate: "Update", kindEinde: "Beëindigd", knmi: { yellow: "Code geel", orange: "Code oranje", red: "Code rood", green: "Code groen" }, update: "Update", upgrade: "Opgeschaald naar",
    vooraf: (code, tijd) => `Om ${tijd} gaat ${code.toLowerCase()} in`, opgeheven: (soort) => `De waarschuwing${soort ? ` voor ${soort.toLowerCase()}` : ""} is opgeheven. Er geldt nu code groen.` },
  en: { nlalert: "NL-Alert", burgernet: "Burgernet", amber: "AMBER Alert", vermistkind: "Missing Child Alert", kindUpdate: "Update", kindEinde: "Ended", knmi: { yellow: "Code yellow", orange: "Code orange", red: "Code red", green: "Code green" }, update: "Update", upgrade: "Raised to",
    vooraf: (code, tijd) => `${code} starts at ${tijd}`, opgeheven: (soort) => `The warning${soort ? ` for ${soort.toLowerCase()}` : ""} has been lifted. Code green applies now.` },
};

/** kind: "n" new, "u" raised, "v" one hour before a KNMI code starts, "g" KNMI code lifted (green). */
export function payloadForWarning(w, lang = "nl", { upgrade = false, kind = upgrade ? "u" : "n" } = {}) {
  const L = LABELS[(lang || "nl").startsWith("nl") ? "nl" : "en"];
  const tijd = (iso) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  const code = L.knmi[w.niveau] || "KNMI";
  let head = w.bron === "knmi" ? `${kind === "u" ? `${L.upgrade} ` : ""}${code} · ${w.soort || ""}`.trim()
    : w.bron === "burgernet" ? `${L.burgernet} · ${w.plaats || "Apeldoorn"}` : L.nlalert;
  let body = w.bron === "knmi" ? (w.tekst || w.plaats || "") : w.bron === "nlalert" ? w.tekst : `${w.titel}`;
  if (w.bron === "knmi" && kind === "v") head = `${L.vooraf(code, tijd(w.start))} · ${w.soort || ""}`.replace(/ · $/, "");
  if (w.bron === "knmi" && kind === "g") { head = `${L.knmi.green} · ${w.soort || ""}`.replace(/ · $/, ""); body = L.opgeheven(w.soort); }
  if (KIND_BRONNEN.includes(w.bron)) {
    // kind: "n" new, "u" new message (update), "a" closing message
    head = `${L[w.bron]}${kind === "u" ? ` · ${L.kindUpdate}` : kind === "a" ? ` · ${L.kindEinde}` : ""}${w.bron === "vermistkind" && w.plaats ? ` · ${w.plaats}` : ""}`;
    body = kind === "a" ? w.tekst : [w.titel, w.tekst].filter(Boolean).join(" – ");
  }
  const urgent = KIND_BRONNEN.includes(w.bron) ? kind !== "a" : kind !== "g" && (w.bron === "nlalert" || w.niveau === "red");
  return {
    aps: {
      alert: { title: head, body: String(body || w.titel || "").slice(0, 400) },
      sound: "default",
      "thread-id": w.bron,
      "interruption-level": urgent ? "time-sensitive" : "active",
      "relevance-score": urgent ? 1 : 0.6,
      "mutable-content": 1,
      category: "WAARSCHUWING",
    },
    waarschuwing: w.id,
    bron: w.bron,
    ...(w.niveau ? { niveau: w.niveau } : {}),
    ...(w.lat != null && w.lon != null ? { lat: w.lat, lon: w.lon } : {}),
  };
}

// ------------------------------------------------------------------ storage

const json = (v) => (v == null ? null : JSON.stringify(v));
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export function toAPI(row, { withArea = true } = {}) {
  if (!row) return null;
  return {
    id: row.id, bron: row.bron, titel: row.bron === "knmi" ? knmiNaam(row.titel) : row.titel, tekst: row.tekst, tekst_en: row.tekst_en, plaats: row.plaats,
    niveau: row.niveau, soort: row.bron === "knmi" ? knmiNaam(row.soort) : row.soort, status: row.status,
    start: new Date(row.start_at).toISOString(), einde: row.end_at ? new Date(row.end_at).toISOString() : null,
    lat: row.lat, lon: row.lon, link: row.link, gebied: withArea ? parse(row.gebied) : undefined,
    eerst_gezien: new Date(row.first_seen).toISOString(), bijgewerkt: new Date(row.updated_at).toISOString(),
    ...(row.bron === "knmi" ? (() => {
      const k = parse(row.knmi_data) || {};
      return { verwachting: k.verwachting ?? null, advies: k.advies ?? null, kop: k.kop ?? null, omschrijving: k.omschrijving ?? null, details: k.details ?? null, uitgifte: k.uitgifte ?? null,
        tijdvakken: Array.isArray(k.tijdvakken) && k.tijdvakken.length > 1 ? k.tijdvakken : null };
    })() : {}),
    ...(KIND_BRONNEN.includes(row.bron) ? (() => {
      const k = parse(row.knmi_data) || {};
      return { berichten: Array.isArray(k.berichten) && k.berichten.length ? k.berichten : null, foto: k.foto || null, foto_klein: k.foto_klein || null,
        straal_km: k.cirkel?.km ?? null };
    })() : {}),
    ...(row.bron === "burgernet" ? (() => {
      const b = parse(row.knmi_data) || {};
      return { startbericht: b.startbericht ?? null, afloop: b.afloop ?? null, berichten: Array.isArray(b.berichten) && b.berichten.length ? b.berichten : null };
    })() : {}),
  };
}

// Beheer can hide a warning or end it by hand (table waarschuwing_overrides).
const PUBLIC_SELECT = `SELECT w.*, wo.ended_at AS ov_ended, wk.data AS knmi_data FROM waarschuwingen w
  LEFT JOIN waarschuwing_overrides wo ON wo.id = w.id LEFT JOIN waarschuwing_knmi wk ON wk.id = w.id WHERE COALESCE(wo.hidden, 0) = 0`;
const withOverride = (row) => (row?.ov_ended && row.status !== "beeindigd" ? { ...row, status: "beeindigd", end_at: Math.min(row.end_at || row.ov_ended, row.ov_ended) } : row);

/** kind = true: also AMBER Alert and Vermist Kind Alert (apps from 2.0.1, website, Homey); older apps cannot decode them. */
export async function listWarnings(env, days = 7, { kind = false } = {}) {
  const since = Date.now() - Math.min(Number(days) || 7, 14) * DAY;
  const { results } = await env.DB.prepare(
    `${PUBLIC_SELECT} AND (COALESCE(w.end_at, w.start_at) >= ? OR w.status != 'beeindigd') ORDER BY w.start_at DESC LIMIT 200`,
  ).bind(since).all();
  return results.filter((r) => kind || !KIND_BRONNEN.includes(r.bron)).map((r) => toAPI(withOverride(r)));
}

/** Warnings changed after a moment (for the Homey app): new ones, status changes and hand-ended ones. */
export async function warningsSince(env, since) {
  const { results } = await env.DB.prepare(
    `${PUBLIC_SELECT} AND (w.updated_at > ? OR w.first_seen > ? OR COALESCE(wo.updated_at, 0) > ?) ORDER BY w.start_at DESC LIMIT 40`,
  ).bind(since, since, since).all();
  return results.map((r) => toAPI(withOverride(r), { withArea: false }));
}

export async function getWarning(env, id) {
  return toAPI(withOverride(await env.DB.prepare(`${PUBLIC_SELECT} AND w.id = ?`).bind(id).first())) || knmiOpgeheven(id);
}

/**
 * A KNMI warning that is no longer in the database (cleaned up after 14 days): a shared link then shows it as lifted,
 * code green, instead of "not found". The id is "knmi:<event>:<start>".
 */
export function knmiOpgeheven(id) {
  const m = /^knmi:[^:]+:(.+)$/.exec(String(id || ""));
  const start = m ? Date.parse(m[1]) : NaN;
  if (!Number.isFinite(start)) return null;
  return {
    id, bron: "knmi", titel: "Geen weerwaarschuwing", tekst: "Deze weerwaarschuwing is opgeheven. Er geldt nu code groen.", tekst_en: null,
    plaats: null, niveau: "green", soort: null, status: "beeindigd", start: new Date(start).toISOString(), einde: null,
    lat: null, lon: null, link: "https://www.knmi.nl/nederland-nu/weer/waarschuwingen", gebied: null,
    eerst_gezien: new Date(start).toISOString(), bijgewerkt: new Date().toISOString(), opgeheven: true,
    verwachting: null, advies: null, kop: null, omschrijving: null, details: null, uitgifte: null,
  };
}

/** P2000 alerts in the warning's area (or place) around its time. Never presented as a confirmed link. */
export async function linkedMeldingen(env, w, toAPIMelding, SELECT) {
  const start = Date.parse(w.start) - 2 * 3_600_000;
  const end = (w.einde ? Date.parse(w.einde) : Date.parse(w.start) + 6 * 3_600_000) + 3_600_000;
  const { results } = await env.DB.prepare(`${SELECT} WHERE COALESCE(o.hidden, 0) = 0 AND m.datum BETWEEN ? AND ? ORDER BY m.datum DESC LIMIT 400`)
    .bind(start, Math.min(end, Date.now() + DAY)).all();
  const list = results.map(toAPIMelding).filter((m) => {
    if (w.bron === "burgernet") return w.plaats && matchesPlaatsen([w.plaats], m) && m.dienst === "politie";
    if (!w.gebied || m.lat == null || m.lon == null) return false;
    const hasStreet = String(m.locatie || "").trim() !== "";
    return hasStreet && w.gebied.some((ring) => inRing(ring, m.lat, m.lon));
  });
  return list.slice(0, 30).map((m) => ({
    ...m,
    relatie: /grip/i.test(`${m.title} ${m.grip || ""}`) ? "grip-in-gebied" : "in-gebied-rond-tijdstip",
  }));
}

async function upsert(env, w, now) {
  const prev = await env.DB.prepare("SELECT status, niveau, notified, first_seen FROM waarschuwingen WHERE id = ?").bind(w.id).first();
  await env.DB.prepare(`
    INSERT INTO waarschuwingen (id, bron, titel, tekst, tekst_en, plaats, niveau, soort, start_at, end_at, status, gebied, lat, lon, link, first_seen, updated_at, notified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET titel = excluded.titel, tekst = excluded.tekst, tekst_en = excluded.tekst_en, plaats = excluded.plaats,
      niveau = excluded.niveau, soort = excluded.soort, start_at = excluded.start_at, end_at = excluded.end_at, status = excluded.status,
      gebied = excluded.gebied, lat = excluded.lat, lon = excluded.lon, link = excluded.link, updated_at = excluded.updated_at`)
    .bind(w.id, w.bron, w.titel, w.tekst, w.tekst_en, w.plaats, w.niveau, w.soort, w.start_at, w.end_at, w.status,
      json(w.gebied), w.lat, w.lon, w.link, prev?.first_seen ?? now, now, prev?.notified ?? null).run();
  if (w.bron === "knmi") {
    const extra = { verwachting: w.verwachting, advies: w.advies, kop: w.kop, omschrijving: w.omschrijving, details: w.details, uitgifte: w.uitgifte,
      tijdvakken: w.tijdvakken || null };
    await env.DB.prepare(`INSERT INTO waarschuwing_knmi (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
      .bind(w.id, JSON.stringify(extra)).run();
  }
  if (KIND_BRONNEN.includes(w.bron) && w.extra) {
    await env.DB.prepare(`INSERT INTO waarschuwing_knmi (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
      .bind(w.id, JSON.stringify(w.extra)).run();
  }
  // Burgernet start and closing message (table waarschuwing_knmi holds the extra data of every source).
  if (w.bron === "burgernet" && (w.afloop || w.berichten?.length)) {
    await env.DB.prepare(`INSERT INTO waarschuwing_knmi (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
      .bind(w.id, JSON.stringify({ startbericht: w.startbericht || null, afloop: w.afloop || null, berichten: w.berichten || null })).run();
  }
  return prev;
}

async function markNotified(env, id, value) {
  await env.DB.prepare("UPDATE waarschuwingen SET notified = ? WHERE id = ?").bind(value, id).run();
}

async function fetchText(url, budget) {
  if (!budget.take()) throw new Error("budget");
  const res = await fetch(url, { headers: { accept: "text/html", "user-agent": UA["user-agent"] }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Burgernet from its own site: the recent actions of Apeldoorn and Voorst (for Teuge), with one action page each.
 * An action page is only read again while the action runs; finished actions are skipped once their timeline is stored.
 */
async function burgernetFromSite(env, budget, now) {
  const ids = [];
  for (const gemeente of ["APELDOORN", "VOORST"]) {
    const html = await fetchText(`${SOURCES.burgernetSite}/gemeente/Oost-Nederland/${gemeente}`, budget);
    ids.push(...burgernetSiteIds(html));
  }
  const out = [];
  let reads = 0;
  for (const id of [...new Set(ids)]) {
    const prev = await env.DB.prepare("SELECT w.status, wk.data FROM waarschuwingen w LEFT JOIN waarschuwing_knmi wk ON wk.id = w.id WHERE w.id = ?")
      .bind(`burgernet:${id}`).first();
    // Finished actions are read once more when their messages (timeline) were not stored yet, then never again.
    if (prev?.status === "beeindigd" && String(prev.data || "").includes('"berichten":[')) continue;
    if (reads >= 4) break;
    reads++;
    try {
      const w = fromBurgernetSite(id, await fetchText(`${SOURCES.burgernetSite}/burgernet/${id}`, budget), now);
      if (w) out.push(w);
    } catch (e) { console.warn("[burgernet]", id, e.message || e); }
  }
  return { ids: new Set(ids.map((i) => `burgernet:${i}`)), list: out };
}

async function fetchJSON(url, budget) {
  if (!budget.take()) throw new Error("budget");
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * One pass over the three sources. Returns the ids that need a push: new warnings (and KNMI upgrades).
 * Bursts after a fresh database (no rows yet) are not pushed: everything already active is just recorded.
 */
export async function ingestWarnings(env, budget, kv) {
  const now = Date.now();
  const toPush = [];
  const firstRun = !(await env.DB.prepare("SELECT 1 FROM waarschuwingen LIMIT 1").first());
  const status = {};
  const handle = async (bron, items) => {
    const seen = new Set();
    for (const w of items) {
      seen.add(w.id);
      const prev = await upsert(env, w, now);
      if (w.status === "beeindigd" || firstRun) {
        if (!prev?.notified) await markNotified(env, w.id, w.niveau || "1");
        continue;
      }
      if (!prev?.notified) toPush.push({ id: w.id, upgrade: false });
      else if (w.bron === "knmi" && levelRank(w.niveau) > levelRank(prev.notified)) toPush.push({ id: w.id, upgrade: true });
      if (!prev?.notified || (w.bron === "knmi" && levelRank(w.niveau) > levelRank(prev.notified))) await markNotified(env, w.id, w.niveau || "1");
    }
    return seen;
  };
  // Burgernet: an active call that is on neither source any more has ended.
  const handleBurgernet = async (items, listed) => {
    await handle("burgernet", items);
    const { results } = await env.DB.prepare("SELECT id FROM waarschuwingen WHERE bron = 'burgernet' AND status = 'actief'").all();
    for (const r of results) if (!listed.has(r.id)) {
      await env.DB.prepare("UPDATE waarschuwingen SET status = 'beeindigd', end_at = ?, updated_at = ? WHERE id = ?").bind(now, now, r.id).run();
    }
  };

  try {
    const d = await fetchJSON(SOURCES.nlalert, budget);
    const list = (Array.isArray(d?.data) ? d.data : []).map((a) => fromNlAlert(a, now)).filter(Boolean);
    await handle("nlalert", list);
    status.nlalert = `ok ${list.length}`;
  } catch (e) { status.nlalert = `fout: ${e.message}`; }

  // Burgernet: burgernet.nl first (reliable, with start, end and position), the 112meldkamer feed as extra source.
  {
    const merged = new Map();
    const listed = new Set();
    const fouten = [];
    let siteOk = false, feedOk = false;
    try {
      const d = await fetchJSON(SOURCES.burgernet, budget);
      for (const w of (Array.isArray(d) ? d : []).map((a) => fromBurgernet(a, now)).filter(Boolean)) { merged.set(w.id, w); listed.add(w.id); }
      feedOk = true;
    } catch (e) { fouten.push(`112meldkamer ${e.message}`); }
    try {
      const site = await burgernetFromSite(env, budget, now);
      site.ids.forEach((i) => listed.add(i));
      for (const w of site.list) merged.set(w.id, w);
      siteOk = true;
    } catch (e) { fouten.push(`burgernet.nl ${e.message}`); }
    if (siteOk || feedOk) {
      await handleBurgernet([...merged.values()], listed);
      status.burgernet = `ok ${[...merged.values()].filter((w) => w.status === "actief").length}${fouten.length ? ` (${fouten.join(", ")})` : ""}`;
    } else status.burgernet = `fout: ${fouten.join(", ")}`;
  }

  // AMBER Alert and Vermist Kind Alert (Burgernet's open API). Every new message is a push: start, update and closing message.
  try {
    const list = await fetchJSON(KIND_API, budget);
    const groepen = groepeer(list);
    const listed = new Set(groepen.keys());
    let actief = 0;
    for (const [id, berichten] of groepen) {
      const row = await env.DB.prepare("SELECT w.*, wk.data AS extra FROM waarschuwingen w LEFT JOIN waarschuwing_knmi wk ON wk.id = w.id WHERE w.id = ?").bind(id).first();
      const w = kindWarning(berichten, row ? { row, extra: parse(row.extra) || {} } : null, now);
      if (!w) continue;
      const { _nieuwBericht, _soortNieuw, ...opslag } = w;
      await upsert(env, opslag, now);
      if (w.status === "actief") actief++;
      if (firstRun) { await markNotified(env, w.id, "1"); continue; }
      if (!row?.notified) {
        // First time seen: a push when it is still running (an alert that already ended needs no push).
        if (w.status === "actief") toPush.push({ id: w.id, kind: "n" });
        await markNotified(env, w.id, "1");
      } else if (_nieuwBericht && row.status !== "beeindigd") {
        toPush.push({ id: w.id, kind: _soortNieuw.includes("afloop") ? "a" : "u" });
      }
    }
    // Gone from the list while still running: ended (without a closing message), photo and description removed.
    const { results: open } = await env.DB.prepare(`SELECT w.*, wk.data AS extra FROM waarschuwingen w LEFT JOIN waarschuwing_knmi wk ON wk.id = w.id
      WHERE w.bron IN ('amber', 'vermistkind') AND w.status = 'actief'`).all();
    for (const r of open) {
      if (listed.has(r.id)) continue;
      const w = kindWarning([{ id: r.id, bron: r.bron, messageId: `einde-${now}`, soort: "afloop", at: now, titel: "", tekst: "", kop: "", gebied: r.plaats, cirkel: null, link: r.link }],
        { row: r, extra: parse(r.extra) || {} }, now);
      if (w) {
        const { _nieuwBericht, _soortNieuw, ...opslag } = w;
        await upsert(env, opslag, now);
        if (r.notified && !firstRun) toPush.push({ id: w.id, kind: "a" });
      }
    }
    status.kind = `ok ${actief}`;
  } catch (e) { status.kind = `fout: ${e.message}`; }

  try {
    // Only download the full set when KNMI's revision changed.
    const v = await fetchJSON(`${SOURCES.knmi}/version`, budget);
    const rev = String(v?.revision || "");
    const last = await kv.get("knmi_revision");
    if (!rev || rev !== last?.value || Date.now() - Number(last?.at || 0) > 30 * 60_000) {
      const d = await fetchJSON(`${SOURCES.knmi}.json`, budget);
      // Headline, description and details only stand on KNMI's warnings page; without it the feed texts still work.
      let pagina = new Map();
      if (d?.warning_events?.length) {
        try { pagina = knmiPagina(await fetchText("https://www.knmi.nl/nederland-nu/weer/waarschuwingen", budget)); } catch {}
      }
      const list = fromKnmi(d, now, pagina);
      await handle("knmi", list);
      // Warnings KNMI no longer lists (withdrawn early): end them now, so a shared link still shows them as lifted (code green).
      const ids = new Set(list.map((w) => w.id));
      const { results: open } = await env.DB.prepare("SELECT id, start_at FROM waarschuwingen WHERE bron = 'knmi' AND end_at >= ? AND status != 'beeindigd'").bind(now).all();
      for (const r of open) {
        if (ids.has(r.id)) continue;
        await env.DB.prepare("UPDATE waarschuwingen SET status = 'beeindigd', end_at = ?, updated_at = ? WHERE id = ?").bind(Math.max(r.start_at, now), now, r.id).run();
      }
      await kv.set("knmi_revision", rev);
      status.knmi = `ok ${list.length}`;
    } else status.knmi = "ongewijzigd";
    // Pushes around a KNMI code: one hour before it starts (when it was issued well before), and when it is lifted.
    if (!firstRun) toPush.push(...(await knmiExtraPushes(env, kv, now)));
    // Status follows the clock (verwacht → actief → beeindigd) even when KNMI did not change.
    await env.DB.batch([
      env.DB.prepare("UPDATE waarschuwingen SET status = 'beeindigd', updated_at = ? WHERE bron = 'knmi' AND end_at < ? AND status != 'beeindigd'").bind(now, now),
      env.DB.prepare("UPDATE waarschuwingen SET status = 'actief' WHERE bron = 'knmi' AND start_at <= ? AND end_at >= ? AND status = 'verwacht'").bind(now, now),
      env.DB.prepare("UPDATE waarschuwingen SET status = 'beeindigd', updated_at = ? WHERE bron = 'nlalert' AND end_at IS NOT NULL AND end_at < ? AND status != 'beeindigd'").bind(now, now),
    ]);
  } catch (e) { status.knmi = `fout: ${e.message}`; }

  await kv.set("warnings_status", JSON.stringify({ at: new Date(now).toISOString(), ...status }));
  return toPush;
}

/**
 * "v": a KNMI code starts within the hour and was issued more than an hour before its start (else the new push said it).
 * "g": a pushed KNMI code has ended or was withdrawn and nothing of that weather type applies now or within the hour:
 *      one push for the whole warning (all its codes). Each is sent once (kv "knmi_push:<kind>:<id>").
 */
export async function knmiExtraPushes(env, kv, now = Date.now()) {
  const uit = [];
  const { results } = await env.DB.prepare(`SELECT id, titel, niveau, status, start_at, end_at, first_seen, notified FROM waarschuwingen
    WHERE bron = 'knmi' AND end_at >= ?`).bind(now - 3 * 3_600_000).all();
  const actief = results.filter((r) => r.start_at <= now && r.end_at >= now && r.status !== "beeindigd");
  for (const r of results) {
    if (!r.notified || r.status === "beeindigd") continue;
    if (r.start_at > now && r.start_at - now <= 3_600_000 && r.start_at - r.first_seen > 3_600_000) {
      const key = `knmi_push:v:${r.id}`;
      if (!(await kv.get(key))) { await kv.set(key, "1"); uit.push({ id: r.id, kind: "v" }); }
    }
  }
  const groepen = new Map();
  for (const r of results) {
    if (!r.notified || !(r.status === "beeindigd" || r.end_at < now)) continue;
    if (actief.some((a) => a.titel === r.titel)) continue;
    if (results.some((x) => x.titel === r.titel && x.status !== "beeindigd" && x.start_at > now && x.start_at - now <= 3_600_000)) continue;
    if (!groepen.has(r.titel)) groepen.set(r.titel, []);
    groepen.get(r.titel).push(r);
  }
  for (const groep of groepen.values()) {
    const open = [];
    for (const r of groep) if (!(await kv.get(`knmi_push:g:${r.id}`))) open.push(r);
    if (!open.length) continue;
    for (const r of open) await kv.set(`knmi_push:g:${r.id}`, "1");
    const top = open.reduce((a, b) => (levelRank(b.niveau) > levelRank(a.niveau) || (b.niveau === a.niveau && b.end_at > a.end_at) ? b : a));
    uit.push({ id: top.id, kind: "g", levels: [...new Set(open.map((r) => r.niveau))] });
  }
  return uit;
}

export async function devicePrefs(env) {
  const { results } = await env.DB.prepare("SELECT token, data FROM device_prefs").all();
  return new Map(results.map((r) => [r.token, parse(r.data)]));
}

export async function savePrefs(env, token, prefs) {
  if (!prefs) return;
  await env.DB.prepare("INSERT OR REPLACE INTO device_prefs (token, data, updated_at) VALUES (?, ?, ?)").bind(token, JSON.stringify(prefs), Date.now()).run();
}

export async function warningsHousekeeping(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM waarschuwingen WHERE status = 'beeindigd' AND COALESCE(end_at, updated_at) < ?").bind(Date.now() - 14 * DAY),
    env.DB.prepare("DELETE FROM device_prefs WHERE token NOT IN (SELECT token FROM devices)"),
    env.DB.prepare("DELETE FROM waarschuwing_knmi WHERE id NOT IN (SELECT id FROM waarschuwingen)"),
    env.DB.prepare("DELETE FROM kv WHERE key LIKE 'knmi_push:%' AND at < ?").bind(Date.now() - 3 * DAY),
  ]);
}

export { inWerkgebied };
