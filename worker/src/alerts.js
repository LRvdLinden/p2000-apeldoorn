// A-Alerts: NL-Alert, Burgernet and KNMI weather warnings for the working area (municipality of Apeldoorn + Teuge).
// Read once per cron run, filtered on the working area, stored in D1 (table waarschuwingen) and pushed to devices
// that opted in (table device_prefs). Pure parsing lives here too, so the tests can run it without I/O.
import { polygonOverlaps, inWerkgebied, inRing, distanceKm, PLAATSEN_ALL, plaatsKey, matchesPlaatsen } from "./werkgebied.js";

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
  return {
    id: `burgernet:${id}`, bron: "burgernet",
    titel: firstSentence.replace(/\s*(Tips\?|Bel nu 112).*$/is, "").slice(0, 140),
    tekst: afloop && ended ? `${report}\n\n${afloop}` : report, tekst_en: null,
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

/** One record per warning period, with only the parts that cover the working area. */
export function fromKnmi(data, now = Date.now()) {
  const out = [];
  for (const [ei, ev] of (data?.warning_events || []).entries()) {
    const phenomenon = txt(ev.phenomenon);
    for (const period of ev.periods || []) {
      const start = Date.parse(period.starts_at), end = Date.parse(period.ends_at);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const parts = (period.parts || []).map((p) => ({ level: normLevel(p.level), area: txt(p.area_description), rings: geomRings(p.geometry) }))
        .filter((p) => p.level !== "green" && (p.rings.length ? polygonOverlaps(p.rings) : /gelderland|heel nederland|alle provincies/i.test(p.area)));
      if (!parts.length) continue;
      const niveau = parts.reduce((m, p) => (levelRank(p.level) > levelRank(m) ? p.level : m), "green");
      const rings = parts.flatMap((p) => p.rings);
      const [lat, lon] = rings.length ? centroid(rings) : [52.2112, 5.9699];
      const description = txt(period.description) || txt(ev.description) || txt(period.text) || txt(ev.text);
      out.push({
        id: `knmi:${ev.id ?? ei}:${period.starts_at}`, bron: "knmi",
        titel: phenomenon || "Weerwaarschuwing", tekst: description || `${[...new Set(parts.map((p) => p.area).filter(Boolean))].join(", ")}`,
        tekst_en: null, plaats: [...new Set(parts.map((p) => p.area).filter(Boolean))].join(", ") || null,
        niveau, soort: phenomenon, start_at: start, end_at: end,
        status: end < now ? "beeindigd" : start > now ? "verwacht" : "actief",
        gebied: rings.length ? simplify(rings, 400) : null, lat, lon, link: "https://www.knmi.nl/nederland-nu/weer/waarschuwingen",
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ device preferences

/** settings.waarschuwingen from the app: { nlalert, burgernet, knmi: ["yellow","orange","red"] }. */
export function prefsFrom(s) {
  if (!s || typeof s !== "object") return null;
  const knmi = Array.isArray(s.knmi) ? s.knmi.map(normLevel).filter((l) => l !== "green") : [];
  return { nlalert: s.nlalert !== false, burgernet: s.burgernet === true, knmi: [...new Set(knmi)] };
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
  nl: { nlalert: "NL-Alert", burgernet: "Burgernet", knmi: { yellow: "Code geel", orange: "Code oranje", red: "Code rood" }, update: "Update", upgrade: "Opgeschaald naar" },
  en: { nlalert: "NL-Alert", burgernet: "Burgernet", knmi: { yellow: "Code yellow", orange: "Code orange", red: "Code red" }, update: "Update", upgrade: "Raised to" },
};

export function payloadForWarning(w, lang = "nl", { upgrade = false } = {}) {
  const L = LABELS[(lang || "nl").startsWith("nl") ? "nl" : "en"];
  const head = w.bron === "knmi" ? `${upgrade ? `${L.upgrade} ` : ""}${L.knmi[w.niveau] || "KNMI"} · ${w.soort || ""}`.trim()
    : w.bron === "burgernet" ? `${L.burgernet} · ${w.plaats || "Apeldoorn"}` : L.nlalert;
  const body = w.bron === "knmi" ? (w.tekst || w.plaats || "") : w.bron === "nlalert" ? w.tekst : `${w.titel}`;
  const urgent = w.bron === "nlalert" || w.niveau === "red";
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
    id: row.id, bron: row.bron, titel: row.titel, tekst: row.tekst, tekst_en: row.tekst_en, plaats: row.plaats,
    niveau: row.niveau, soort: row.soort, status: row.status,
    start: new Date(row.start_at).toISOString(), einde: row.end_at ? new Date(row.end_at).toISOString() : null,
    lat: row.lat, lon: row.lon, link: row.link, gebied: withArea ? parse(row.gebied) : undefined,
    eerst_gezien: new Date(row.first_seen).toISOString(), bijgewerkt: new Date(row.updated_at).toISOString(),
  };
}

// Beheer can hide a warning or end it by hand (table waarschuwing_overrides).
const PUBLIC_SELECT = `SELECT w.*, wo.ended_at AS ov_ended FROM waarschuwingen w
  LEFT JOIN waarschuwing_overrides wo ON wo.id = w.id WHERE COALESCE(wo.hidden, 0) = 0`;
const withOverride = (row) => (row?.ov_ended && row.status !== "beeindigd" ? { ...row, status: "beeindigd", end_at: Math.min(row.end_at || row.ov_ended, row.ov_ended) } : row);

export async function listWarnings(env, days = 7) {
  const since = Date.now() - Math.min(Number(days) || 7, 14) * DAY;
  const { results } = await env.DB.prepare(
    `${PUBLIC_SELECT} AND (COALESCE(w.end_at, w.start_at) >= ? OR w.status != 'beeindigd') ORDER BY w.start_at DESC LIMIT 200`,
  ).bind(since).all();
  return results.map((r) => toAPI(withOverride(r)));
}

export async function getWarning(env, id) {
  return toAPI(withOverride(await env.DB.prepare(`${PUBLIC_SELECT} AND w.id = ?`).bind(id).first()));
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
 * An action page is only read again while the action runs; finished actions in the database are skipped.
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
    const prev = await env.DB.prepare("SELECT status FROM waarschuwingen WHERE id = ?").bind(`burgernet:${id}`).first();
    if (prev?.status === "beeindigd") continue;
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

  try {
    // Only download the full set when KNMI's revision changed.
    const v = await fetchJSON(`${SOURCES.knmi}/version`, budget);
    const rev = String(v?.revision || "");
    const last = await kv.get("knmi_revision");
    if (!rev || rev !== last?.value || Date.now() - Number(last?.at || 0) > 30 * 60_000) {
      const d = await fetchJSON(`${SOURCES.knmi}.json`, budget);
      const list = fromKnmi(d, now);
      await handle("knmi", list);
      await kv.set("knmi_revision", rev);
      status.knmi = `ok ${list.length}`;
    } else status.knmi = "ongewijzigd";
    // Status follows the clock (verwacht → actief → beeindigd) even when KNMI did not change.
    await env.DB.batch([
      env.DB.prepare("UPDATE waarschuwingen SET status = 'beeindigd' WHERE bron = 'knmi' AND end_at < ? AND status != 'beeindigd'").bind(now),
      env.DB.prepare("UPDATE waarschuwingen SET status = 'actief' WHERE bron = 'knmi' AND start_at <= ? AND end_at >= ? AND status = 'verwacht'").bind(now, now),
      env.DB.prepare("UPDATE waarschuwingen SET status = 'beeindigd' WHERE bron = 'nlalert' AND end_at IS NOT NULL AND end_at < ? AND status != 'beeindigd'").bind(now),
    ]);
  } catch (e) { status.knmi = `fout: ${e.message}`; }

  await kv.set("warnings_status", JSON.stringify({ at: new Date(now).toISOString(), ...status }));
  return toPush;
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
  ]);
}

export { inWerkgebied };
