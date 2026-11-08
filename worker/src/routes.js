// Alerted stations with a road route and an estimated arrival, computed once per alert and kept in D1, so every
// app and the website show the same. Route: Apple Maps Server API (own keys) via mapsDirections; the apps never ask
// a map service themselves. Without a route: straight line × 1.3 at 50 km/h. Always an estimate, never vehicle positions.
import KAZERNES from "./kazernes.js";
import { mapsDirections } from "./apple.js";

const SOORT = { brandweer: "brandweer", ambulance: "ambulance", politie: "politie" };
/** Usual turnout time (alarm → driving), minutes. */
export const UITRUK = { brandweer: 4, ambulance: 1, politie: 0 };
/** Driving with lights and siren (A0/A1/P1): a quarter faster. A2/P2 drive with the traffic. */
export const isSpoed = (m) => ["A0", "A1", "P1"].includes(String(m.prioriteit || "").toUpperCase());

const rad = (x) => (x * Math.PI) / 180;
export function km(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The stations named in the alert (by alias), else the nearest one of the service; at most 5, within 40 km. */
export function kiesKazernes(m, list = KAZERNES) {
  const soort = SOORT[m.dienst];
  if (!soort || m.lat == null || m.lon == null) return { gekozen: [], genoemd: false };
  const kandidaten = list.filter((k) => k.soort === soort);
  const namen = [...(m.eenheden || []).map((u) => String(u?.naam || "").toLowerCase()), String(m.full_melding || "").toLowerCase()];
  let gekozen = kandidaten.filter((k) => (k.aliassen || []).some((a) => namen.some((n) => new RegExp(`\\b${esc(a.toLowerCase())}\\b`).test(n))));
  const genoemd = gekozen.length > 0;
  if (!gekozen.length && kandidaten.length) gekozen = [kandidaten.reduce((b, k) => (km(k.lat, k.lon, m.lat, m.lon) < km(b.lat, b.lon, m.lat, m.lon) ? k : b))];
  return { gekozen: gekozen.filter((k) => km(k.lat, k.lon, m.lat, m.lon) < 40).slice(0, 5), genoemd };
}

/** Thin a polyline to at most `max` points, keeping the ends. */
export function dun(points, max = 160) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Routes and estimates for one alert. `directions(from, to, vertrek)` → {km, min, punten} or null (injectable for tests). */
export async function berekenRoutes(m, directions, list = KAZERNES) {
  const { gekozen, genoemd } = kiesKazernes(m, list);
  const alarm = Date.parse(m.datum_tijd || m.datum);
  const spoed = isSpoed(m);
  const kazernes = [];
  for (const k of gekozen) {
    const uitruk = UITRUK[k.soort] ?? 0;
    const vertrek = alarm + uitruk * 60_000;
    let r = null;
    try { r = await directions([k.lat, k.lon], [m.lat, m.lon], vertrek); } catch { r = null; }
    const afstand = r?.km ?? km(k.lat, k.lon, m.lat, m.lon) * 1.3;
    let rij = r?.min ?? (afstand / 50) * 60;
    if (spoed) rij *= 0.75;
    kazernes.push({
      id: k.id, naam: k.naam, soort: k.soort, lat: k.lat, lon: k.lon, genoemd,
      km: Math.round(afstand * 10) / 10, rij_min: Math.round(rij * 10) / 10, uitruk_min: uitruk,
      alarm: new Date(alarm).toISOString(), vertrek: new Date(vertrek).toISOString(),
      aankomst: new Date(vertrek + rij * 60_000).toISOString(),
      via: r ? "route" : "schatting",
      route: r?.punten?.length > 1 ? dun(r.punten) : [[k.lat, k.lon], [m.lat, m.lon]],
    });
  }
  kazernes.sort((a, b) => Date.parse(a.aankomst) - Date.parse(b.aankomst));
  return { guid: m.guid, spoed, kazernes };
}

/** Cached in D1 (table melding_routes); computed on the first request for an alert with a street. */
export async function routesVoor(env, m) {
  const row = await env.DB.prepare("SELECT data FROM melding_routes WHERE guid = ?").bind(m.guid).first();
  if (row) return JSON.parse(row.data);
  const data = await berekenRoutes(m, (from, to, vertrek) => mapsDirections(env, from, to, vertrek));
  if (data.kazernes.length) {
    await env.DB.prepare("INSERT OR REPLACE INTO melding_routes (guid, data, at) VALUES (?, ?, ?)").bind(m.guid, JSON.stringify(data), Date.now()).run();
  }
  return data;
}
