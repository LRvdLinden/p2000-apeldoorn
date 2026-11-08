import { isFcmToken, sendFcm, isDeadFcm } from "./fcm.js";
// Apple services from the Worker, using WebCrypto (ES256) and fetch:
//  - APNs pushmeldingen
//  - MapKit JS tokens for the website map
//  - WeatherKit REST (weather at the time and place of an alert)
//  - Apple Maps Server API (street → coordinates)

const enc = new TextEncoder();
const b64url = (data) => {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};

/** GitHub/Cloudflare secrets may store the .p8 with literal "\n". */
export const pem = (v) => String(v || "").replace(/\\n/g, "\n").trim();
export const hasKey = (keyId, teamId, p8) => Boolean(keyId && teamId && pem(p8).includes("PRIVATE KEY"));

const keyCache = new Map();
async function importKey(p8) {
  const text = pem(p8);
  if (keyCache.has(text)) return keyCache.get(text);
  const body = text.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  keyCache.set(text, key);
  return key;
}

/** ES256 JWT. WebCrypto already returns the raw r||s signature that JWT needs. */
export async function es256(header, claims, p8) {
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await importKey(p8), enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

// ------------------------------------------------------------------ APNs

/**
 * Provider token, reused for 50 minutes. Apple refuses tokens that change more often than every
 * 20 minutes, so the token is kept in D1 and shared by all Worker instances.
 */
async function apnsToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT value, at FROM kv WHERE key = 'apns_jwt'").first();
  if (row && now - row.at < 50 * 60) return row.value;
  const token = await es256({ alg: "ES256", kid: env.APN_KEY_ID }, { iss: env.APN_TEAM_ID, iat: now }, env.APN_P8_CERT);
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES ('apns_jwt', ?, ?)").bind(token, now).run();
  return token;
}

export const apnsConfigured = (env) => hasKey(env.APN_KEY_ID, env.APN_TEAM_ID, env.APN_P8_CERT);

/** Resolves to { ok, status, reason }. */
export async function sendPush(env, device, payload, { urgent = false, collapseId, topic } = {}) {
  // Android (A-Alerts APK): same payload, sent through Firebase Cloud Messaging.
  if (isFcmToken(device.token)) return sendFcm(env, device.token, payload, { urgent, collapseId });
  if (!apnsConfigured(env)) return { ok: false, status: 0, reason: "APNs not configured" };
  const host = device.environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  try {
    const res = await fetch(`${host}/3/device/${device.token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${await apnsToken(env)}`,
        "apns-topic": topic || env.APN_TOPIC || "nl.lrvdlinden.p2000apeldoorn",
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + (urgent ? 3600 : 6 * 3600)),
        ...(collapseId ? { "apns-collapse-id": collapseId.slice(0, 64) } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    let reason = null;
    if (!res.ok) { try { reason = (await res.json()).reason; } catch {} }
    return { ok: res.status === 200, status: res.status, reason };
  } catch (e) {
    return { ok: false, status: 0, reason: String(e.message || e) };
  }
}

export const isDeadToken = (r) => r.fcm ? isDeadFcm(r) : r.status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(r.reason);

// ------------------------------------------------------------------ MapKit JS

export const mapkitConfigured = (env) => hasKey(env.WEB_MAPKIT_JS_KEY_ID, env.WEB_MAPKIT_JS_TEAM_ID || env.APN_TEAM_ID, env.WEB_MAPKIT_JS_P8);

const DEFAULT_ORIGINS = "https://a-alerts.nl,https://www.a-alerts.nl,https://beheer.a-alerts.nl,https://p2000-apeldoorn.nl,https://www.p2000-apeldoorn.nl,https://lrvdlinden.github.io";

export async function mapkitToken(env, origin) {
  if (!mapkitConfigured(env)) return null;
  const origins = String(env.SITE_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
  if (origin && !origins.includes(origin) && !local) return null;
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: env.WEB_MAPKIT_JS_TEAM_ID || env.APN_TEAM_ID, iat: now, exp: now + 30 * 60 };
  if (origin && !local) claims.origin = origin;
  return es256({ alg: "ES256", kid: env.WEB_MAPKIT_JS_KEY_ID, typ: "JWT" }, claims, env.WEB_MAPKIT_JS_P8);
}

// ------------------------------------------------------------------ WeatherKit

export const weatherConfigured = (env) => hasKey(env.WEB_WEATHERKIT_KEY_ID, env.WEB_WEATHERKIT_TEAM_ID || env.APN_TEAM_ID, env.WEB_WEATHERKIT_P8);
const APELDOORN = [52.2112, 5.9699];

export async function weatherFor(env, m) {
  if (!m) return null;
  const cached = await env.DB.prepare("SELECT data FROM weather WHERE guid = ?").bind(m.guid).first();
  if (cached) return JSON.parse(cached.data);
  if (!weatherConfigured(env)) return null;

  const team = env.WEB_WEATHERKIT_TEAM_ID || env.APN_TEAM_ID;
  const service = env.WEB_WEATHERKIT_SERVICE_ID || "nl.lrvdlinden.p2000apeldoorn.weatherkit";
  const now = Math.floor(Date.now() / 1000);
  const token = await es256({ alg: "ES256", kid: env.WEB_WEATHERKIT_KEY_ID, id: `${team}.${service}` },
    { iss: team, iat: now, exp: now + 3600, sub: service }, env.WEB_WEATHERKIT_P8);

  const [lat, lon] = m.lat != null && m.lon != null ? [m.lat, m.lon] : APELDOORN;
  const t = new Date(m.datum_tijd);
  const hour = new Date(t); hour.setUTCMinutes(0, 0, 0);
  const url = `https://weatherkit.apple.com/api/v1/weather/nl/${lat.toFixed(4)}/${lon.toFixed(4)}` +
    `?dataSets=forecastHourly&hourlyStart=${new Date(hour - 3600_000).toISOString()}` +
    `&hourlyEnd=${new Date(+hour + 2 * 3600_000).toISOString()}&timezone=Europe/Amsterdam`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error("[weather]", res.status); return null; }
  const hours = (await res.json()).forecastHourly?.hours || [];
  const h = hours.reduce((best, x) => (!best || Math.abs(new Date(x.forecastStart) - t) < Math.abs(new Date(best.forecastStart) - t) ? x : best), null);
  if (!h) return null;
  const data = {
    time: h.forecastStart, condition: h.conditionCode, temperature: h.temperature, apparent: h.temperatureApparent,
    humidity: h.humidity, cloudCover: h.cloudCover, windSpeed: h.windSpeed, windGust: h.windGust,
    windDirection: h.windDirection, precipitation: h.precipitationIntensity, visibility: h.visibility, daylight: h.daylight,
    attribution: "https://weatherkit.apple.com/legal-attribution.html",
  };
  // Cache once the hour is over (then it no longer changes).
  if (Date.now() - t.getTime() > 3600_000) {
    await env.DB.prepare("INSERT OR REPLACE INTO weather (guid, data, fetched_at) VALUES (?, ?, ?)").bind(m.guid, JSON.stringify(data), Date.now()).run();
  }
  return data;
}

/**
 * The weather right now in Apeldoorn (WeatherKit currentWeather), for a weather warning: live, not at the warning's start.
 * Kept 10 minutes in kv so many viewers cost one WeatherKit call.
 */
export async function weatherNow(env) {
  const row = await env.DB.prepare("SELECT value, at FROM kv WHERE key = 'weer_nu'").first();
  if (row && Date.now() - row.at < 10 * 60_000) return JSON.parse(row.value);
  if (!weatherConfigured(env)) return null;
  const team = env.WEB_WEATHERKIT_TEAM_ID || env.APN_TEAM_ID;
  const service = env.WEB_WEATHERKIT_SERVICE_ID || "nl.lrvdlinden.p2000apeldoorn.weatherkit";
  const now = Math.floor(Date.now() / 1000);
  const token = await es256({ alg: "ES256", kid: env.WEB_WEATHERKIT_KEY_ID, id: `${team}.${service}` },
    { iss: team, iat: now, exp: now + 3600, sub: service }, env.WEB_WEATHERKIT_P8);
  const [lat, lon] = APELDOORN;
  const res = await fetch(`https://weatherkit.apple.com/api/v1/weather/nl/${lat}/${lon}?dataSets=currentWeather&timezone=Europe/Amsterdam`,
    { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) { console.error("[weather-nu]", res.status); return row ? JSON.parse(row.value) : null; }
  const c = (await res.json()).currentWeather;
  if (!c) return null;
  const data = {
    time: c.asOf, live: true, condition: c.conditionCode, temperature: c.temperature, apparent: c.temperatureApparent,
    humidity: c.humidity, cloudCover: c.cloudCover, windSpeed: c.windSpeed, windGust: c.windGust,
    windDirection: c.windDirection, precipitation: c.precipitationIntensity, visibility: c.visibility, daylight: c.daylight,
    attribution: "https://weatherkit.apple.com/legal-attribution.html",
  };
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES ('weer_nu', ?, ?)").bind(JSON.stringify(data), Date.now()).run();
  return data;
}

// ------------------------------------------------------------------ Apple Maps Server API

export const mapsServerConfigured = (env) => hasKey(env.MAPS_SERVER_API_KEY_ID, env.MAPS_SERVER_API_TEAM_ID || env.APN_TEAM_ID, env.MAPS_SERVER_API_P8);

async function mapsAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT value, at FROM kv WHERE key = 'maps_access'").first();
  if (row && row.at - now > 60) return row.value; // "at" holds the expiry here
  const auth = await es256({ alg: "ES256", kid: env.MAPS_SERVER_API_KEY_ID, typ: "JWT" },
    { iss: env.MAPS_SERVER_API_TEAM_ID || env.APN_TEAM_ID, iat: now, exp: now + 3600 }, env.MAPS_SERVER_API_P8);
  const res = await fetch("https://maps-api.apple.com/v1/token", { headers: { authorization: `Bearer ${auth}` } });
  if (!res.ok) throw new Error(`Maps token HTTP ${res.status}`);
  const body = await res.json();
  const exp = now + Number(body.expiresInSeconds || 1800);
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES ('maps_access', ?, ?)").bind(body.accessToken, exp).run();
  return body.accessToken;
}

/**
 * Road route by car from → to ([lat, lon]) with Apple Maps Server API, at the given departure time.
 * → { km, min, punten: [[lat, lon], …] } or null.
 */
export async function mapsDirections(env, from, to, vertrek) {
  if (!mapsServerConfigured(env)) return null;
  const q = new URLSearchParams({ origin: from.join(","), destination: to.join(","), transportType: "Automobile", lang: "nl-NL" });
  if (vertrek && vertrek > Date.now() - 60_000) q.set("departureDate", new Date(vertrek).toISOString());
  const res = await fetch(`https://maps-api.apple.com/v1/directions?${q}`, { headers: { authorization: `Bearer ${await mapsAccessToken(env)}` } });
  if (!res.ok) { console.error("[directions]", res.status); return null; }
  const b = await res.json();
  const r = b.routes?.[0];
  if (!r) return null;
  const punten = [];
  for (const si of r.stepIndexes || []) {
    const pad = b.stepPaths?.[b.steps?.[si]?.stepPathIndex] || [];
    for (const p of pad) {
      const pt = [Math.round(p.latitude * 1e5) / 1e5, Math.round(p.longitude * 1e5) / 1e5];
      const last = punten[punten.length - 1];
      if (!last || last[0] !== pt[0] || last[1] !== pt[1]) punten.push(pt);
    }
  }
  return { km: Number(r.distanceMeters || 0) / 1000, min: Number(r.durationSeconds || 0) / 60, punten };
}

/** Street + place → [lat, lon] near Apeldoorn, or null. */
export async function geocode(env, locatie, stad) {
  if (!mapsServerConfigured(env) || !locatie) return null;
  try {
    const q = `${locatie}, ${stad || "Apeldoorn"}`;
    const url = `https://maps-api.apple.com/v1/geocode?q=${encodeURIComponent(q)}&limitToCountries=NL&lang=nl-NL&searchLocation=${APELDOORN.join(",")}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${await mapsAccessToken(env)}` } });
    if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`);
    const r = (await res.json()).results?.[0]?.coordinate;
    const ok = r && Math.abs(r.latitude - APELDOORN[0]) < 0.3 && Math.abs(r.longitude - APELDOORN[1]) < 0.45;
    return ok ? [Math.round(r.latitude * 1e5) / 1e5, Math.round(r.longitude * 1e5) / 1e5] : null;
  } catch (e) {
    console.error("[geocode]", e.message);
    return null;
  }
}
