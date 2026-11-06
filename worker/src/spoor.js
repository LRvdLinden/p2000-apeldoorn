// Route trail and flight history of the trauma and police helicopters. The Worker stores the positions it
// already reads from adsb.lol (ODbL) a few times per minute in D1 (kept 3 days) and cuts them into flights.
import { helikopters } from "./heli.js";

const KEEP_DAYS = 3;
const GAP_MS = 10 * 60_000; // no position for 10 minutes = flight over (landed or out of range)
const MIN_MOVE_KM = 0.05;   // do not store a new point when the helicopter stood still

const km = (a, b) => {
  const r = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

/** Stores the current positions (one row per helicopter, only when it moved or a minute passed). */
export async function recordPositions(env, data) {
  const list = data?.helikopters || (await helikopters(env)).helikopters || [];
  if (!list.length) return 0;
  const ids = list.map((h) => h.id);
  const { results: last } = await env.DB.prepare(
    `SELECT p.heli, p.at, p.lat, p.lon, p.grond FROM heli_posities p
     JOIN (SELECT heli, MAX(at) AS at FROM heli_posities WHERE heli IN (${ids.map(() => "?").join(",")}) GROUP BY heli) m
     ON m.heli = p.heli AND m.at = p.at`,
  ).bind(...ids).all();
  const prev = new Map(last.map((r) => [r.heli, r]));
  const rows = [];
  for (const h of list) {
    const at = Date.parse(h.gezien) || Date.now();
    const p = prev.get(h.id);
    if (p && at <= p.at) continue;
    const ground = h.op_grond ? 1 : 0;
    if (p && ground === p.grond && at - p.at < 60_000 && km(p, h) < MIN_MOVE_KM) continue;
    rows.push(env.DB.prepare("INSERT OR IGNORE INTO heli_posities (heli, at, lat, lon, hoogte_ft, snelheid_kt, koers, grond) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(h.id, at, h.lat, h.lon, h.hoogte_ft, h.snelheid_kt, h.koers, ground));
  }
  if (rows.length) await env.DB.batch(rows);
  return rows.length;
}

export async function spoorHousekeeping(env) {
  await env.DB.prepare("DELETE FROM heli_posities WHERE at < ?").bind(Date.now() - KEEP_DAYS * 86_400_000).run();
}

const punt = (r) => ({ t: new Date(r.at).toISOString(), lat: r.lat, lon: r.lon, hoogte_ft: r.hoogte_ft, snelheid_kt: r.snelheid_kt, koers: r.koers, grond: Boolean(r.grond) });

/** Cuts positions (old → new) into flights: a flight ends on the ground or after a gap of 10 minutes. */
export function vluchtenUit(rows, now = Date.now()) {
  const out = [];
  let cur = null;
  const close = (end) => {
    if (cur && cur.punten.length >= 2) {
      const pts = cur.punten;
      const lastAt = pts[pts.length - 1].at;
      out.push({
        start: new Date(pts[0].at).toISOString(),
        einde: end ? new Date(lastAt).toISOString() : null,
        onderweg: !end,
        duur_min: Math.max(1, Math.round((lastAt - pts[0].at) / 60_000)),
        van: { lat: pts[0].lat, lon: pts[0].lon },
        naar: { lat: pts[pts.length - 1].lat, lon: pts[pts.length - 1].lon },
        afstand_km: Math.round(pts.slice(1).reduce((s, p, i) => s + km(pts[i], p), 0) * 10) / 10,
        max_hoogte_ft: Math.max(0, ...pts.map((p) => p.hoogte_ft || 0)),
      });
    }
    cur = null;
  };
  for (const r of rows) {
    if (cur && r.at - cur.punten[cur.punten.length - 1].at > GAP_MS) close(true);
    if (r.grond) { if (cur) { cur.punten.push(r); close(true); } continue; }
    if (!cur) cur = { punten: [] };
    cur.punten.push(r);
  }
  if (cur) close(now - cur.punten[cur.punten.length - 1].at > GAP_MS);
  return out.reverse(); // newest first
}

/**
 * Trail of one helicopter. scope: "vlucht" (the current or last flight), "kort" (last 30 minutes),
 * "vandaag" (since midnight, Dutch time). Points old → new.
 */
export async function spoor(env, id, scope = "vlucht") {
  const now = Date.now();
  const since = scope === "kort" ? now - 30 * 60_000
    : scope === "vandaag" ? startOfDayAmsterdam(now)
      : now - 24 * 3600_000;
  const { results } = await env.DB.prepare("SELECT * FROM heli_posities WHERE heli = ? AND at >= ? ORDER BY at ASC LIMIT 5000").bind(id, since).all();
  let rows = results;
  let vlucht = null;
  if (scope === "vlucht") {
    const vl = vluchtenUit(results, now);
    vlucht = vl[0] || null;
    rows = vlucht ? results.filter((r) => r.at >= Date.parse(vlucht.start) && (!vlucht.einde || r.at <= Date.parse(vlucht.einde))) : [];
  }
  return { id, scope, vlucht, punten: rows.map(punt), bron: "adsb.lol (ODbL)" };
}

export async function vluchten(env, id, days = 2) {
  const since = Date.now() - Math.min(Math.max(Number(days) || 2, 1), KEEP_DAYS) * 86_400_000;
  const { results } = await env.DB.prepare("SELECT * FROM heli_posities WHERE heli = ? AND at >= ? ORDER BY at ASC LIMIT 20000").bind(id, since).all();
  return { id, vluchten: vluchtenUit(results).slice(0, 30), bron: "adsb.lol (ODbL)" };
}

function startOfDayAmsterdam(now) {
  const d = new Date(now);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour").value) % 24;
  const mins = d.getUTCMinutes(), secs = d.getUTCSeconds();
  return now - ((hour * 60 + mins) * 60 + secs) * 1000 - d.getUTCMilliseconds();
}
