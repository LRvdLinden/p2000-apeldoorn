// Which alerts belong to the same incident? Worked out once, on the server, when an alert comes in: every alert gets
// the guid of the first alert of its incident. The apps and the site show the same links, and a fix is one place.
import { distanceKm } from "./werkgebied.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const hasStreet = (m) => Boolean(m.locatie && String(m.locatie).trim() && String(m.locatie).toLowerCase() !== "onbekend");
const plaats = (m) => norm(m.stad) || "apeldoorn";
/** Never part of an incident: planned patient transport (B1–B3), restaffing a station, a test alarm. */
export const los = (m) => ["B1", "B2", "B3"].includes(String(m.prioriteit || "").toUpperCase()) || /herbezet|kazerneren|proefalarm/i.test(m.title || "");

/**
 * How sure is it that two alerts are one incident? 3 and up counts as the same incident: the same address in the same
 * place, or within 350 m with the same unit, each a point stronger when two services are involved.
 */
export function score(m, o) {
  const groot = m.grip || m.opschaling || o.grip || o.opschaling;
  if (Math.abs(o.datum - m.datum) > (groot ? 120 : 45) * 60_000 || los(m) || los(o)) return 0;
  let s = 0;
  if (hasStreet(m) && hasStreet(o) && plaats(m) === plaats(o) && norm(m.locatie) === norm(o.locatie)) s += 3;
  else if (hasStreet(m) && hasStreet(o) && m.lat != null && o.lat != null && distanceKm(m.lat, m.lon, o.lat, o.lon) <= 0.35) s += 2;
  const codes = new Set((m.eenheden || []).map((u) => u.code).filter(Boolean));
  if ((o.eenheden || []).some((u) => codes.has(u.code))) s += 2;
  if (!s) return 0;
  return s + (o.dienst !== m.dienst ? 1 : 0);
}

const HV_WEG = /\bHV\s+weg\b|\bVKO\b|aanrijding|ongeval/i;
const VERKEER = /aanrijding|ongeval|\bVKO\b|\bHV\s+weg\b|beknel|voertuig/i;
const ambuZonderAdres = (m) => m.dienst === "ambulance" && !hasStreet(m) && !los(m) && HV_WEG.test(m.title || "");
const verkeerMetAdres = (m) => m.dienst !== "ambulance" && hasStreet(m) && !los(m) && VERKEER.test(m.title || "");

/**
 * The ambulance for a road accident comes in without an address ("Ambu 06121 HV weg letsel Apeldoorn"), so place and
 * distance say nothing. It joins the road accident of police or fire brigade in the same place within 15 minutes, and
 * only when there is exactly one such incident (two accidents at once: no guess). Works both ways, whichever came first.
 * Returns the incident, or null.
 */
export function zonderAdres(m, bekend) {
  const dichtbij = (o) => o.guid !== m.guid && Math.abs(o.datum - m.datum) <= 15 * 60_000 && plaats(o) === plaats(m);
  let kand = [];
  if (ambuZonderAdres(m)) kand = bekend.filter((o) => dichtbij(o) && verkeerMetAdres(o));
  else if (verkeerMetAdres(m)) kand = bekend.filter((o) => dichtbij(o) && ambuZonderAdres(o));
  const incidenten = new Set(kand.map((o) => o.incident || o.guid));
  return incidenten.size === 1 ? [...incidenten][0] : null;
}

/**
 * Gives every new alert its incident: that of the best matching earlier alert (score 3 or more), else its own guid.
 * `eerder` are alerts that have an incident already; new alerts of the same batch can join each other too.
 */
export function kenToe(nieuw, eerder) {
  const bekend = [...eerder];
  for (const m of [...nieuw].sort((a, b) => a.datum - b.datum)) {
    let best = null, bs = 0;
    for (const o of bekend) {
      if (o.guid === m.guid) continue;
      const s = score(m, o);
      if (s > bs || (s === bs && s > 0 && best && Math.abs(o.datum - m.datum) < Math.abs(best.datum - m.datum))) { best = o; bs = s; }
    }
    m.incident = bs >= 3 && best ? (best.incident || best.guid) : (zonderAdres(m, bekend) || m.guid);
    bekend.push(m);
  }
  return nieuw;
}

const rij = (r) => ({ ...r, eenheden: (() => { try { return JSON.parse(r.eenheden || "[]"); } catch { return []; } })() });

/** The alerts of the last two hours before `tot`, as far as the linking needs them. */
export async function recenteVoorIncident(env, tot = Date.now()) {
  const { results } = await env.DB.prepare(
    "SELECT guid, title, dienst, prioriteit, datum, locatie, lat, lon, stad, grip, opschaling, eenheden, incident FROM meldingen WHERE datum > ? ORDER BY datum DESC LIMIT 150",
  ).bind(tot - 125 * 60_000).all();
  return (results || []).map(rij);
}

/** Alerts of the last six hours without an incident (from before this existed, or a missed round) get one. */
export async function incidentHerstel(env) {
  const { results } = await env.DB.prepare(
    "SELECT guid, title, dienst, prioriteit, datum, locatie, lat, lon, stad, grip, opschaling, eenheden, incident FROM meldingen WHERE datum > ? ORDER BY datum ASC LIMIT 400",
  ).bind(Date.now() - 6 * 3600_000).all();
  const alle = (results || []).map(rij);
  // An ambulance without an address that stands alone, while its road accident is known by now: join it.
  for (const m of alle) {
    if (m.incident !== m.guid || alle.some((o) => o.guid !== m.guid && o.incident === m.guid)) continue;
    if (m.dienst !== "ambulance" || hasStreet(m)) continue;
    const inc = zonderAdres(m, alle.filter((o) => o.incident));
    if (inc && inc !== m.guid) { m.incident = inc; await env.DB.prepare("UPDATE meldingen SET incident = ? WHERE guid = ?").bind(inc, m.guid).run(); }
  }
  const zonder = alle.filter((r) => !r.incident);
  if (!zonder.length) return 0;
  kenToe(zonder, alle.filter((r) => r.incident));
  for (let i = 0; i < zonder.length; i += 50) {
    await env.DB.batch(zonder.slice(i, i + 50).map((m) => env.DB.prepare("UPDATE meldingen SET incident = ? WHERE guid = ? AND incident IS NULL").bind(m.incident, m.guid)));
  }
  return zonder.length;
}
