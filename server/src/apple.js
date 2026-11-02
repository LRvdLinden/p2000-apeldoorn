// Apple web services used by the website and the server:
//  - MapKit JS tokens for the website map (short-lived, per origin)
//  - WeatherKit REST: weather at the time and place of an alert (cached per alert)
//  - Apple Maps Server API: geocoding street names to precise coordinates
import { sign } from "node:crypto";
import { config, mapkitConfigured, weatherConfigured, mapsServerConfigured } from "./config.js";
import { db } from "./db.js";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

export function es256(header, claims, key) {
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  return `${data}.${b64url(sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" }))}`;
}

// ------------------------------------------------------------------ MapKit JS

export function mapkitToken(origin) {
  if (!mapkitConfigured()) return null;
  const c = config.mapkitJS;
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: c.teamId, iat: now, exp: now + 30 * 60 };
  if (origin && c.origins.includes(origin)) claims.origin = origin;
  else if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return null;
  return es256({ alg: "ES256", kid: c.keyId, typ: "JWT" }, claims, c.key);
}

// ------------------------------------------------------------------ WeatherKit

db.exec(`CREATE TABLE IF NOT EXISTS weather (guid TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL)`);

let wkToken = { token: "", exp: 0 };
function weatherToken() {
  const now = Math.floor(Date.now() / 1000);
  if (wkToken.token && wkToken.exp - now > 300) return wkToken.token;
  const c = config.weatherKit;
  const exp = now + 3600;
  wkToken = {
    exp,
    token: es256({ alg: "ES256", kid: c.keyId, id: `${c.teamId}.${c.serviceId}` },
      { iss: c.teamId, iat: now, exp, sub: c.serviceId }, c.key),
  };
  return wkToken.token;
}

const APELDOORN = [52.2112, 5.9699];

/** Hourly weather around the alert. Returns null when WeatherKit is not configured or fails. */
export async function weatherFor(m) {
  if (!m) return null;
  const cached = db.prepare("SELECT data FROM weather WHERE guid = ?").get(m.guid);
  if (cached) return JSON.parse(cached.data);
  if (!weatherConfigured()) return null;

  const [lat, lon] = m.lat != null && m.lon != null ? [m.lat, m.lon] : APELDOORN;
  const t = new Date(m.datum_tijd);
  const hour = new Date(t); hour.setUTCMinutes(0, 0, 0);
  const start = new Date(hour.getTime() - 3600_000).toISOString();
  const end = new Date(hour.getTime() + 2 * 3600_000).toISOString();
  const url = `https://weatherkit.apple.com/api/v1/weather/nl/${lat.toFixed(4)}/${lon.toFixed(4)}` +
    `?dataSets=forecastHourly&hourlyStart=${start}&hourlyEnd=${end}&timezone=Europe/Amsterdam`;
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${weatherToken()}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`WeatherKit HTTP ${res.status}`);
    const body = await res.json();
    const hours = body.forecastHourly?.hours || [];
    const h = hours.reduce((best, x) => (!best || Math.abs(new Date(x.forecastStart) - t) < Math.abs(new Date(best.forecastStart) - t) ? x : best), null);
    if (!h) return null;
    const data = {
      time: h.forecastStart,
      condition: h.conditionCode,
      temperature: h.temperature,
      apparent: h.temperatureApparent,
      humidity: h.humidity,
      cloudCover: h.cloudCover,
      windSpeed: h.windSpeed,
      windGust: h.windGust,
      windDirection: h.windDirection,
      precipitation: h.precipitationIntensity,
      visibility: h.visibility,
      daylight: h.daylight,
      attribution: "https://weatherkit.apple.com/legal-attribution.html",
    };
    // Only cache once the hour is in the past (then it is final).
    if (Date.now() - t.getTime() > 3600_000) {
      db.prepare("INSERT OR REPLACE INTO weather (guid, data, fetched_at) VALUES (?, ?, ?)").run(m.guid, JSON.stringify(data), Date.now());
    }
    return data;
  } catch (e) {
    console.error("[weather]", e.message);
    return null;
  }
}

export function pruneWeather(days) {
  db.prepare("DELETE FROM weather WHERE fetched_at < ?").run(Date.now() - days * 86_400_000);
}

// ------------------------------------------------------------------ Maps Server API (geocoding)

let mapsAccess = { token: "", exp: 0 };
async function mapsAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (mapsAccess.token && mapsAccess.exp - now > 60) return mapsAccess.token;
  const c = config.mapsServer;
  const auth = es256({ alg: "ES256", kid: c.keyId, typ: "JWT" }, { iss: c.teamId, iat: now, exp: now + 3600 }, c.key);
  const res = await fetch("https://maps-api.apple.com/v1/token", { headers: { authorization: `Bearer ${auth}` }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Maps token HTTP ${res.status}`);
  const body = await res.json();
  mapsAccess = { token: body.accessToken, exp: now + Number(body.expiresInSeconds || 1800) };
  return mapsAccess.token;
}

const geoCache = new Map();

/** Street + place → [lat, lon] within the Apeldoorn area, or null. */
export async function geocode(locatie, stad) {
  if (!mapsServerConfigured() || !locatie) return null;
  const q = `${locatie}, ${stad || "Apeldoorn"}`;
  if (geoCache.has(q)) return geoCache.get(q);
  try {
    const url = `https://maps-api.apple.com/v1/geocode?q=${encodeURIComponent(q)}&limitToCountries=NL&lang=nl-NL` +
      `&searchLocation=${APELDOORN[0]},${APELDOORN[1]}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${await mapsAccessToken()}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`);
    const r = (await res.json()).results?.[0]?.coordinate;
    // Sanity check: must be within ~30 km of Apeldoorn.
    const ok = r && Math.abs(r.latitude - APELDOORN[0]) < 0.3 && Math.abs(r.longitude - APELDOORN[1]) < 0.45;
    const value = ok ? [Math.round(r.latitude * 1e5) / 1e5, Math.round(r.longitude * 1e5) / 1e5] : null;
    if (geoCache.size > 2000) geoCache.clear();
    geoCache.set(q, value);
    return value;
  } catch (e) {
    console.error("[geocode]", e.message);
    return null;
  }
}
