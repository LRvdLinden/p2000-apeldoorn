// A-Alerts extras: helicopter zones (push on take-off, landing or entering a zone), the prediction of the alert a
// Lifeliner is flying to, "groot incident" pushes with a place filter, and user feedback on a wrong alert.
import locaties from "./locaties.js";
import { km, genoemd, heliVoorMelding } from "./heliplus.js";
import { SELECT, toAPI as meldingAPI } from "./db.js";
import { isQuiet, isUrgent, HttpError } from "./rules.js";
import { matchesPlaatsen } from "./werkgebied.js";

const bool = (v, d) => (typeof v === "boolean" ? v : d);
const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const SOORTEN = ["trauma", "politie"];
export const MAX_ZONES = 5;

// ------------------------------------------------------------------ preferences

/** settings.heli from the app: up to five zones, which events, which helicopters, paused until. */
export function heliPrefsFrom(s) {
  if (!s || typeof s !== "object") return null;
  const zones = (Array.isArray(s.zones) ? s.zones : []).map((z, i) => {
    const lat = num(z?.lat, 50, 54), lon = num(z?.lon, 2, 8), r = num(z?.km, 0.5, 50);
    if (lat == null || lon == null || r == null) return null;
    return { id: str(z.id, 40) || `z${i}`, naam: str(z.naam, 40) || "Zone", lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, km: r };
  }).filter(Boolean).slice(0, MAX_ZONES);
  const soorten = Array.isArray(s.soorten) ? s.soorten.filter((x) => SOORTEN.includes(x)) : ["trauma"];
  return {
    zones,
    opstijgen: bool(s.opstijgen, true), landen: bool(s.landen, true), binnen: bool(s.binnen, true),
    soorten: soorten.length ? [...new Set(soorten)] : ["trauma"],
    pauze_tot: num(s.pauze_tot, 0, 4e12),
  };
}

/** settings.groot: push for large incidents, optionally only in some places (empty = whole area). */
export function grootPrefsFrom(s) {
  if (!s || typeof s !== "object") return null;
  const plaatsen = Array.isArray(s.plaatsen) ? s.plaatsen.filter((x) => typeof x === "string" && x.length < 64).slice(0, 40) : [];
  return { aan: s.aan === true, plaatsen };
}

// ------------------------------------------------------------------ groot incident

const GROOT = /\bGRIP\s*[1-5]\b|zeer\s+grote\s+brand|\bgrote\s+brand\b|middel\s*brand|\bopschaling\b|\bramp\b|\bCoPI\b|\bOvD\b.*\bHOvD\b|grootschalig|\bMMA\b|multi\s*trauma/i;

/** A large incident: GRIP, a (very) large or medium fire, scaling up, or ten units or more on one call. */
export function isGrootIncident(m) {
  // opschaling is the size of the fire from P2000 ("klein", "middel", "groot", "zeer groot"): only middel and up count.
  if (Number(m.grip) > 0 || /middel|groot|grip/i.test(m.opschaling || "")) return true;
  const tekst = [m.title, m.full_melding, m.categorie].filter(Boolean).join(" ");
  if (GROOT.test(tekst)) return true;
  return Array.isArray(m.eenheden) && m.eenheden.length >= 10;
}

/** Whether a device wants this alert as a large incident (outside its normal filters; quiet hours still apply). */
export function grootWanted(device, prefs, m, date = new Date()) {
  const g = prefs?.groot;
  if (!device.enabled || !g?.aan || !isGrootIncident(m)) return false;
  if (g.plaatsen?.length && !matchesPlaatsen(g.plaatsen, m)) return false;
  return !(isQuiet(device, date) && !(device.critical && isUrgent(m)));
}

// ------------------------------------------------------------------ helicopter zones

/** Take-off, landing and moves (in the air) since the previous stored position. */
export function heliEvents(list, prev, now = Date.now()) {
  const out = [];
  for (const h of list) {
    const p = prev.get(h.id);
    if (!p || h.lat == null || h.lon == null || now - p.at > 15 * 60_000) continue;
    const grond = !!h.op_grond;
    if (p.grond === 1 && !grond) out.push({ h, kind: "opgestegen", lat: h.lat, lon: h.lon });
    else if (p.grond === 0 && grond) out.push({ h, kind: "geland", lat: h.lat, lon: h.lon });
    else if (!grond) out.push({ h, kind: "beweging", van: { lat: p.lat, lon: p.lon }, lat: h.lat, lon: h.lon });
  }
  return out;
}

/** The nearest hospital or base within 3 km, for "bij Gelre Apeldoorn". */
export function plekBij(lat, lon) {
  let best = null;
  for (const l of [...(locaties.ziekenhuizen || []), ...(locaties.bases || [])]) {
    const d = km({ lat, lon }, l);
    if (d < 3 && (!best || d < best.d)) best = { naam: l.naam, d };
  }
  return best?.naam || null;
}

const binnenZone = (z, p) => km(z, p) <= z.km;
const soortVan = (h) => (h.soort === "politie" ? "politie" : "trauma");

function zoneTekst(kind, h, zone, plek, lang) {
  const nl = !lang || String(lang).startsWith("nl");
  const titel = {
    opgestegen: nl ? `${h.naam} is opgestegen` : `${h.naam} has taken off`,
    geland: nl ? `${h.naam} is geland` : `${h.naam} has landed`,
    binnen: nl ? `${h.naam} vliegt je zone in` : `${h.naam} is entering your zone`,
  }[kind];
  const waar = plek ? (nl ? `bij ${plek}` : `near ${plek}`) : "";
  const body = [nl ? `Zone ${zone.naam}` : `Zone ${zone.naam}`, waar].filter(Boolean).join(" · ");
  return { title: titel, body };
}

/**
 * Pushes for the helicopter zones: one per device, event and helicopter (not again within 15 minutes for the same
 * kind). Returns [{ key, texts, tokens }] for the broadcast queue.
 */
export function heliZonePushes(devices, prefs, events, now = Date.now(), seen = new Set()) {
  const groups = new Map();
  const date = new Date(now);
  for (const d of devices) {
    const hp = prefs.get(d.token)?.heli;
    if (!d.enabled || !hp?.zones?.length) continue;
    if (hp.pauze_tot && hp.pauze_tot > now) continue;
    if (isQuiet(d, date)) continue;
    for (const e of events) {
      if (!hp.soorten.includes(soortVan(e.h))) continue;
      let kind = e.kind;
      let zone = null;
      if (kind === "beweging") {
        if (!hp.binnen) continue;
        zone = hp.zones.find((z) => binnenZone(z, e) && !binnenZone(z, e.van));
        kind = "binnen";
      } else {
        if ((kind === "opgestegen" && !hp.opstijgen) || (kind === "geland" && !hp.landen)) continue;
        zone = hp.zones.find((z) => binnenZone(z, e));
      }
      if (!zone) continue;
      const bucket = Math.floor(now / (15 * 60_000));
      const dedupe = `${e.h.id}:${kind}:${d.token}`;
      if (seen.has(dedupe)) continue;
      const key = `hz:${e.h.id}:${kind}:${bucket}:${zone.naam.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)}`;
      if (!groups.has(key)) {
        const plek = plekBij(e.lat, e.lon);
        groups.set(key, { key, dedupe: `${e.h.id}:${kind}`, heli: e.h.id, texts: { nl: zoneTekst(kind, e.h, zone, plek, "nl"), en: zoneTekst(kind, e.h, zone, plek, "en") }, tokens: [] });
      }
      groups.get(key).tokens.push(d.token);
    }
  }
  return [...groups.values()];
}

// ------------------------------------------------------------------ prediction: the alert a Lifeliner flies to

const isHeliMelding = (m) => m.dienst === "traumaheli" || m.dienst === "lifeliner" || genoemd(m) != null;

/** Nearest trauma centre (or hospital with helipad) to a spot: where the patient probably goes afterwards. */
export function ziekenhuisBij(p) {
  const lijst = (locaties.ziekenhuizen || []).filter((z) => z.trauma || z.helipad);
  let best = null;
  for (const z of lijst) {
    const d = km(p, z) / (z.trauma ? 1.4 : 1);
    if (!best || d < best.d) best = { z, d };
  }
  return best ? { id: best.z.id, naam: best.z.naam, lat: best.z.lat, lon: best.z.lon } : null;
}

/** Recent Lifeliner alerts (last hour) with a location. */
export async function recenteHeliMeldingen(env, now = Date.now()) {
  const { results } = await env.DB.prepare(`${SELECT} WHERE COALESCE(o.hidden, 0) = 0 AND m.datum >= ? ORDER BY m.datum DESC LIMIT 80`)
    .bind(now - 60 * 60_000).all();
  return results.map(meldingAPI).filter((m) => isHeliMelding(m) && m.lat != null && m.lon != null);
}

/**
 * For a helicopter in the air that belongs to a recent alert and has not been on scene yet: the alert as its
 * destination, with the expected time and the hospital it probably flies to afterwards.
 */
export function meldingVoorspelling(h, meldingen, terPlaatse, now = Date.now()) {
  if (!h || h.op_grond || h.soort !== "trauma") return null;
  const lucht = [h];
  for (const m of meldingen) {
    if (heliVoorMelding(m, lucht) !== h) continue;
    if (terPlaatse.has(`${h.id}:${m.guid}`)) continue;
    if (now - Date.parse(m.datum_tijd) > 50 * 60_000) continue;
    const d = km(h, m);
    if (d < 1.5) continue;
    const kmh = Math.max((h.snelheid_kt || 0) * 1.852, 180);
    const daarna = ziekenhuisBij(m);
    return {
      id: `melding-${m.guid}`, guid: m.guid, naam: m.title || "Melding", plaats: m.stad || null, soort: "melding",
      lat: m.lat, lon: m.lon, afstand_km: Math.round(d * 10) / 10,
      eta_min: Math.max(1, Math.round((d / kmh) * 60)), zekerheid: genoemd(m) === h.id ? 0.95 : 0.7,
      ...(daarna ? { daarna } : {}),
    };
  }
  return null;
}

/** Marks Lifeliners that are (or were) at their alert, so the prediction moves on to the hospital. */
export async function noteerTerPlaatse(env, list, meldingen, now = Date.now()) {
  for (const h of list.filter((x) => x.soort === "trauma")) {
    for (const m of meldingen) {
      if (heliVoorMelding(m, [h]) !== h) continue;
      if (km(h, m) <= (h.op_grond ? 3 : 1.5)) {
        await env.DB.prepare("INSERT OR IGNORE INTO kv (key, value, at) VALUES (?, '1', ?)").bind(`heli_scene:${h.id}:${m.guid}`, now).run();
      }
    }
  }
}

export async function terPlaatseSet(env) {
  const { results } = await env.DB.prepare("SELECT key FROM kv WHERE key LIKE 'heli_scene:%'").all();
  return new Set(results.map((r) => r.key.slice(11)));
}

// ------------------------------------------------------------------ "Klopt deze melding niet?"

export const REDENEN = ["locatie", "dienst", "prioriteit", "dubbel", "test", "anders"];

export async function saveFeedback(env, req, guid, body) {
  const reden = REDENEN.includes(body?.reden) ? body.reden : null;
  if (!reden) throw new HttpError(400, "Kies een reden");
  const exists = await env.DB.prepare("SELECT 1 FROM meldingen WHERE guid = ?").bind(guid).first();
  if (!exists) throw new HttpError(404, "Melding niet gevonden");
  const ip = req.headers.get("cf-connecting-ip") || "";
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fb:${ip}`))))
    .slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM melding_feedback WHERE bron = ? AND at > ?").bind(hash, now - 3600_000).first();
  if ((recent?.n || 0) >= 10) throw new HttpError(429, "Te veel meldingen, probeer het later opnieuw");
  const lat = num(body.lat, 50, 54), lon = num(body.lon, 2, 8);
  const r = await env.DB.prepare(
    "INSERT INTO melding_feedback (guid, reden, toelichting, lat, lon, platform, bron, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')",
  ).bind(guid, reden, str(body.toelichting, 500) || null, lat, lat == null ? null : lon, str(body.platform, 20) || null, hash, now).run();
  return { ok: true, id: r.meta?.last_row_id ?? null };
}

export async function feedbackLijst(env, url) {
  const status = url.searchParams.get("status");
  const where = status === "open" || status === "afgehandeld" ? "WHERE f.status = ?" : "";
  const stmt = env.DB.prepare(
    `SELECT f.id, f.guid, f.reden, f.toelichting, f.lat, f.lon, f.platform, f.at, f.status, m.title, m.stad, m.dienst, m.datum
     FROM melding_feedback f LEFT JOIN meldingen m ON m.guid = f.guid ${where} ORDER BY f.at DESC LIMIT 200`,
  );
  const { results } = await (where ? stmt.bind(status) : stmt).all();
  const open = await env.DB.prepare("SELECT COUNT(*) AS n FROM melding_feedback WHERE status = 'open'").first();
  return {
    open: open?.n || 0,
    items: results.map((r) => ({ ...r, at: new Date(r.at).toISOString(), datum: r.datum ? new Date(r.datum).toISOString() : null })),
  };
}

export async function updateFeedback(env, id, body) {
  const status = body?.status === "afgehandeld" ? "afgehandeld" : "open";
  await env.DB.prepare("UPDATE melding_feedback SET status = ? WHERE id = ?").bind(status, id).run();
  return { ok: true, id, status };
}

export async function deleteFeedback(env, id) {
  await env.DB.prepare("DELETE FROM melding_feedback WHERE id = ?").bind(id).run();
  return { ok: true };
}
