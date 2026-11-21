// Which alerts belong to the same incident? Worked out once, on the server, when an alert comes in: every alert gets
// the guid of the first alert of its incident. The apps and the site show the same links, and a fix is one place.
import { distanceKm } from "./werkgebied.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const hasStreet = (m) => Boolean(m.locatie && String(m.locatie).trim() && String(m.locatie).toLowerCase() !== "onbekend");
const plaats = (m) => norm(m.stad) || "apeldoorn";
/** Never part of an incident: planned patient transport (B1–B3), restaffing a station, a test alarm. */
export const los = (m) => ["B1", "B2", "B3"].includes(String(m.prioriteit || "").toUpperCase()) || /herbezet|kazerneren|proefalarm/i.test(m.title || "");

/**
 * The incident numbers in the text: the ride number of the ambulance ("Rit 356390") and the GMS number of the control
 * room ("GMS 888026", "GMS:888026", and the six digits at the end of a police call or of "Graag contact OC Apeldoorn
 * 889629"). The same number is the strongest proof that two alerts are one incident (like 112radar links on it).
 */
export function nummers(m) {
  const t = String(m.title || m.full_melding || "");
  const uit = {};
  const rit = t.match(/\bRit\s*:?\s*(\d{5,7})\b/i);
  if (rit) uit.rit = Number(rit[1]);
  const gms = t.match(/\bGMS\s*:?\s*(\d{5,7})\b/i)
    || ((m.dienst === "politie" || /\bcontact\s+(oc|meldkamer)\b/i.test(t)) && !rit ? t.match(/\b(\d{6})\s*$/) : null);
  if (gms) uit.gms = Number(gms[1]);
  return uit;
}

/**
 * Score from the numbers: the same ride or GMS number within two hours (also "Einde VWS" an hour later) counts as the
 * same incident. Ride numbers 1 to 3 apart within 5 minutes, in the same place and for the same kind of call (a
 * resuscitation with two ambulances gets 358289 and 358290), too. A different number says nothing: one incident can
 * have several rides.
 */
function nummerScore(m, o) {
  const a = nummers(m), b = nummers(o), dt = Math.abs(o.datum - m.datum);
  if (dt > 120 * 60_000) return 0;
  if ((a.rit && a.rit === b.rit) || (a.gms && a.gms === b.gms)) return 4;
  if (a.rit && b.rit && Math.abs(a.rit - b.rit) <= 3 && dt <= 5 * 60_000 && plaats(m) === plaats(o)
    && soortAmbu(m) != null && soortAmbu(m) === soortAmbu(o)) return 3;
  return 0;
}

/**
 * How sure is it that two alerts are one incident? 3 and up counts as the same incident: the same ride or GMS number,
 * the same address in the same place, or within 350 m with the same unit, each a point stronger when two services are
 * involved.
 */
export function score(m, o) {
  if (los(m) || los(o)) return 0;
  const n = nummerScore(m, o);
  if (n) return n + (o.dienst !== m.dienst ? 1 : 0);
  const groot = m.grip || m.opschaling || o.grip || o.opschaling;
  if (Math.abs(o.datum - m.datum) > (groot ? 120 : 45) * 60_000) return 0;
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
const REANIMATIE = /reanimatie/i;
/** The kind of call an ambulance without an address can be joined on: a road accident or a resuscitation. */
const soortAmbu = (m) => (REANIMATIE.test(m.title || "") ? "reanimatie" : HV_WEG.test(m.title || "") ? "verkeer" : null);
const ambuZonderAdres = (m) => m.dienst === "ambulance" && !hasStreet(m) && !los(m) && soortAmbu(m) != null;
// The alert that carries the address: for a road accident police or fire brigade, for a resuscitation any service
// (fire brigade, police, or a second ambulance that does name the street).
const metAdres = (m, soort) => hasStreet(m) && !los(m)
  && (soort === "reanimatie" ? REANIMATIE.test(m.title || "") : m.dienst !== "ambulance" && VERKEER.test(m.title || ""));

/**
 * The ambulance for a road accident comes in without an address ("Ambu 06121 HV weg letsel Apeldoorn"), so place and
 * distance say nothing. It joins the road accident of police or fire brigade in the same place within 5 minutes, and
 * only when there is exactly one such incident (two accidents at once: no guess). Works both ways, whichever came first.
 * Returns the incident, or null.
 */
export function zonderAdres(m, bekend) {
  const dichtbij = (o) => o.guid !== m.guid && Math.abs(o.datum - m.datum) <= 5 * 60_000 && plaats(o) === plaats(m);
  const een = (kand) => { const i = new Set(kand.map((o) => o.incident || o.guid)); return i.size === 1 ? [...i][0] : null; };
  if (ambuZonderAdres(m)) {
    const soort = soortAmbu(m);
    // First the incident that has the address. Only when there is none (yet): for a resuscitation the other ambulances
    // without an address in the same place ("Reanimatie Lieren" three times within two minutes is one call).
    const adres = bekend.filter((o) => dichtbij(o) && metAdres(o, soort));
    if (adres.length) return een(adres);
    return soort === "reanimatie" ? een(bekend.filter((o) => dichtbij(o) && ambuZonderAdres(o) && soortAmbu(o) === soort)) : null;
  }
  for (const soort of ["reanimatie", "verkeer"]) {
    if (metAdres(m, soort)) return een(bekend.filter((o) => dichtbij(o) && ambuZonderAdres(o) && soortAmbu(o) === soort));
  }
  return null;
}

/** The first alert of an incident that has a street and a spot on the map. */
export const adresVan = (incident, lijst) => lijst.filter((o) => (o.incident || o.guid) === incident && hasStreet(o) && o.lat != null).sort((a, b) => a.datum - b.datum)[0] || null;

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
    // An ambulance without an address that joined a road accident: on the map at the address of that accident.
    if (m.incident !== m.guid && ambuZonderAdres(m)) {
      const bron = adresVan(m.incident, bekend);
      if (bron) { m.lat = bron.lat; m.lon = bron.lon; m.locatie = bron.locatie; }
    }
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
  // And on the map it stands at the address of that accident (also when the ambulance came in first).
  for (const m of alle) {
    if (!ambuZonderAdres(m) || !m.incident) continue;
    const bron = adresVan(m.incident, alle.filter((o) => o.guid !== m.guid && metAdres(o, soortAmbu(m))));
    if (!bron) continue;
    Object.assign(m, { lat: bron.lat, lon: bron.lon, locatie: bron.locatie });
    await env.DB.prepare("UPDATE meldingen SET lat = ?, lon = ?, locatie = ? WHERE guid = ?").bind(bron.lat, bron.lon, bron.locatie, m.guid).run();
  }
  const zonder = alle.filter((r) => !r.incident);
  if (!zonder.length) return 0;
  kenToe(zonder, alle.filter((r) => r.incident));
  for (let i = 0; i < zonder.length; i += 50) {
    await env.DB.batch(zonder.slice(i, i + 50).map((m) => env.DB.prepare("UPDATE meldingen SET incident = ? WHERE guid = ? AND incident IS NULL").bind(m.incident, m.guid)));
  }
  return zonder.length;
}
