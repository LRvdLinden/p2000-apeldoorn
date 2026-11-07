// P2000Beheer: login, statistics and admin actions, plus the anonymous app/website counters.
import { HttpError, PLAATSEN, plaatsKey, TIME_ZONE } from "./rules.js";
import { SELECT, toAPI, getMelding, activeDevices } from "./db.js";
import { sendPush, isDeadToken } from "./apple.js";

const enc = new TextEncoder();
const b64url = (buf) => {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};
const fromB64url = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export const BEHEER_TOPIC = "nl.lrvdlinden.p2000beheer";
/** LRbeheer (centrale beheer-app) registreert zich via dezelfde route; zijn token hoort bij dit topic. */
export const LRBEHEER_TOPIC = "app.lrvdlinden.lrbeheer";
export const dayKey = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
const daysAgo = (n) => dayKey(new Date(Date.now() - n * 86_400_000));

// ------------------------------------------------------------------ sessions

async function hmacKey(env) {
  // Signed with the password: changing BEHEER_PASSWORD logs everyone out.
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`p2000beheer|${env.BEHEER_USER}|${env.BEHEER_PASSWORD}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export const beheerConfigured = (env) => Boolean(env.BEHEER_USER && env.BEHEER_PASSWORD && String(env.BEHEER_PASSWORD).length >= 6);

async function timingSafeEqual(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(String(a))), crypto.subtle.digest("SHA-256", enc.encode(String(b)))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

export async function login(env, req, body) {
  if (!beheerConfigured(env)) throw new HttpError(503, "Beheer is nog niet ingesteld (BEHEER_USER / BEHEER_PASSWORD)");
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  const key = `login_fail:${ip}`;
  const fail = await env.DB.prepare("SELECT value, at FROM kv WHERE key = ?").bind(key).first();
  const recent = fail && Date.now() - fail.at < 15 * 60_000 ? Number(fail.value) : 0;
  if (recent >= 8) throw new HttpError(429, "Te veel pogingen. Probeer het over een kwartier opnieuw.");
  const userOk = String(body.user || "").toLowerCase() === String(env.BEHEER_USER).toLowerCase();
  const passOk = await timingSafeEqual(body.password || "", env.BEHEER_PASSWORD);
  if (!userOk || !passOk) {
    await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(key, String(recent + 1), Date.now()).run();
    throw new HttpError(401, "Gebruikersnaam of wachtwoord klopt niet");
  }
  await env.DB.prepare("DELETE FROM kv WHERE key = ?").bind(key).run();
  const payload = b64url(enc.encode(JSON.stringify({ u: env.BEHEER_USER, exp: Date.now() + 30 * 86_400_000 })));
  const sig = b64url(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload)));
  return { token: `${payload}.${sig}`, user: env.BEHEER_USER, expires: new Date(Date.now() + 30 * 86_400_000).toISOString() };
}

export async function requireAdmin(env, req) {
  if (!beheerConfigured(env)) throw new HttpError(503, "Beheer is nog niet ingesteld");
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new HttpError(401, "Niet ingelogd");
  const sigBytes = Uint8Array.from(fromB64url(sig), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), sigBytes, enc.encode(payload));
  if (!ok) throw new HttpError(401, "Sessie ongeldig");
  const data = JSON.parse(fromB64url(payload));
  if (!data.exp || data.exp < Date.now()) throw new HttpError(401, "Sessie verlopen");
  return data;
}

// ------------------------------------------------------------------ anonymous counters (public)

const PLATFORMS = new Set(["ios", "ipados", "macos", "watchos", "tvos", "visionos", "android"]);
const str = (v, n) => (typeof v === "string" && v ? v.slice(0, n) : null);

/** App ping: one row per install (random UUID), updated at most a few times a day. */
export async function recordInstall(env, body) {
  const id = String(body.id || "").toLowerCase();
  if (!/^[0-9a-f-]{32,40}$/.test(id)) throw new HttpError(400, "Invalid id");
  const platform = PLATFORMS.has(body.platform) ? body.platform : "ios";
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO installs (id, platform, model, os_version, app_version, build, apple_login, push, language, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET platform = excluded.platform, model = excluded.model, os_version = excluded.os_version,
        app_version = excluded.app_version, build = excluded.build, apple_login = excluded.apple_login, push = excluded.push,
        language = excluded.language, last_seen = excluded.last_seen`)
      .bind(id, platform, str(body.model, 40), str(body.os, 20), str(body.app_version, 20), str(String(body.build ?? ""), 10),
        body.apple_login ? 1 : 0, body.push ? 1 : 0, str(body.language, 8), now, now),
    env.DB.prepare("INSERT OR IGNORE INTO install_days (day, id) VALUES (?, ?)").bind(dayKey(), id),
  ]);
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python|node-fetch/i;

/** Website visit without cookies: SHA-256(daily random salt + IP + user agent). The salt is deleted the next day. */
/** Anonymous visitor key for today (or null for bots): SHA-256(daily salt + IP + user agent), 22 characters. */
async function visitorKey(env, req, day) {
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return null;
  let salt = await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(`visit_salt:${day}`).first();
  if (!salt) {
    const value = b64url(crypto.getRandomValues(new Uint8Array(24)));
    await env.DB.prepare("INSERT OR IGNORE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(`visit_salt:${day}`, value, Date.now()).run();
    salt = await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(`visit_salt:${day}`).first();
  }
  const ip = req.headers.get("cf-connecting-ip") || "";
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(`${salt.value}|${ip}|${ua}`))).slice(0, 22);
}

export async function recordVisit(env, req, body) {
  const day = dayKey();
  const visitor = await visitorKey(env, req, day);
  if (!visitor) return;
  const ua = req.headers.get("user-agent") || "";
  const device = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "mobiel" : "desktop";
  let path = String(body.path || "/").split("?")[0].slice(0, 80);
  if (/^\/(p2000-apeldoorn\/)?(pager|melding)/.test(path)) path = "/pager/";
  else if (/^\/(p2000-apeldoorn\/)?info/.test(path)) path = "/info/";
  else if (/^\/android/.test(path)) path = "/android/";
  else if (/melding/.test(path)) path = "/melding/";
  else path = "/";
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO visits (day, visitor, pages, device) VALUES (?, ?, 1, ?)
      ON CONFLICT(day, visitor) DO UPDATE SET pages = pages + 1`).bind(day, visitor, device),
    env.DB.prepare(`INSERT INTO pageviews (day, path, n) VALUES (?, ?, 1)
      ON CONFLICT(day, path) DO UPDATE SET n = n + 1`).bind(day, path),
  ]);
}

/**
 * A-Alerts APK downloaded from a-alerts.nl (button "Download APK"). Counted once per visitor per day and version,
 * without cookies (same anonymous key as the visits).
 */
export async function recordDownload(env, req, body) {
  const day = dayKey();
  const visitor = await visitorKey(env, req, day);
  if (!visitor) return false;
  const app = body.app === "android" ? "android" : null;
  if (!app) throw new HttpError(400, "Unknown app");
  const version = /^[\w.\- ()]{1,24}$/.test(String(body.version || "")) ? String(body.version) : "onbekend";
  await env.DB.prepare("INSERT OR IGNORE INTO downloads (day, app, version, visitor, at) VALUES (?, ?, ?, ?, ?)")
    .bind(day, app, version, visitor, Date.now()).run();
  return true;
}

/** Downloads of the Android APK for the beheer: total, last 30 days, per day and per version. */
export async function downloadStats(env) {
  const [tot, perDay, perVersion, devices] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN day >= ? THEN 1 ELSE 0 END) AS d30, SUM(CASE WHEN day = ? THEN 1 ELSE 0 END) AS vandaag FROM downloads WHERE app = 'android'")
      .bind(daysAgo(29), dayKey()).first(),
    rows(env, "SELECT day, COUNT(*) AS n FROM downloads WHERE app = 'android' AND day >= ? GROUP BY day", daysAgo(29)),
    rows(env, "SELECT version, COUNT(*) AS n, MAX(day) AS laatst FROM downloads WHERE app = 'android' GROUP BY version ORDER BY laatst DESC, n DESC LIMIT 10"),
    count(env, "SELECT COUNT(*) AS n FROM devices WHERE enabled = 1 AND platform = 'android'"),
  ]);
  const installs = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN last_seen > ? THEN 1 ELSE 0 END) AS actief FROM installs WHERE platform = 'android'")
    .bind(Date.now() - 30 * 86_400_000).first();
  return {
    totaal: Number(tot?.n || 0),
    dagen30: Number(tot?.d30 || 0),
    vandaag: Number(tot?.vandaag || 0),
    perDag: series(30, perDay),
    perVersie: perVersion.map((r) => ({ version: r.version, n: r.n, laatst: r.laatst })),
    installaties: Number(installs?.n || 0),
    actief: Number(installs?.actief || 0),
    pushToestellen: devices,
  };
}

// ------------------------------------------------------------------ overview

const count = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).first())?.n ?? 0;
const rows = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;

function series(days, list, key = "n") {
  const map = new Map(list.map((r) => [r.day, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = daysAgo(i);
    out.push({ day, ...(map.get(day) ? Object.fromEntries(Object.entries(map.get(day)).filter(([k]) => k !== "day")) : { [key]: 0 }) });
  }
  return out;
}

export async function overview(env, status) {
  const today = dayKey(), yesterday = daysAgo(1);
  const active30 = Date.now() - 30 * 86_400_000;


  const [meldingenRows, installTotals, platforms, versions, newPerDay, activePerDay, visitsPerDay, pagesPerDay, topPages, devicesSplit, topViewed, pushDevices] = await Promise.all([
    rows(env, `SELECT dienst, datum FROM meldingen m LEFT JOIN overrides o ON o.guid = m.guid WHERE COALESCE(o.hidden, 0) = 0 AND m.datum > ?`, Date.now() - 2.2 * 86_400_000),
    env.DB.prepare(`SELECT COUNT(*) AS totaal,
        SUM(CASE WHEN last_seen > ? THEN 1 ELSE 0 END) AS actief,
        SUM(CASE WHEN last_seen > ? AND apple_login = 1 THEN 1 ELSE 0 END) AS apple,
        SUM(CASE WHEN last_seen > ? AND push = 1 THEN 1 ELSE 0 END) AS push
      FROM installs`).bind(active30, active30, active30).first(),
    rows(env, `SELECT platform, COUNT(*) AS n FROM installs WHERE last_seen > ? GROUP BY platform ORDER BY n DESC`, active30),
    rows(env, `SELECT app_version AS version, build, COUNT(*) AS n FROM installs WHERE last_seen > ? GROUP BY app_version, build ORDER BY n DESC LIMIT 8`, active30),
    rows(env, `SELECT strftime('%Y-%m-%d', first_seen / 1000, 'unixepoch', '+1 hour') AS day, COUNT(*) AS n FROM installs WHERE first_seen > ? GROUP BY day`, Date.now() - 31 * 86_400_000),
    rows(env, `SELECT day, COUNT(*) AS n FROM install_days WHERE day >= ? GROUP BY day`, daysAgo(29)),
    rows(env, `SELECT day, COUNT(*) AS bezoekers, SUM(pages) AS paginas FROM visits WHERE day >= ? GROUP BY day`, daysAgo(29)),
    rows(env, `SELECT day, SUM(n) AS n FROM pageviews WHERE day >= ? GROUP BY day`, daysAgo(29)),
    rows(env, `SELECT path, SUM(n) AS n FROM pageviews WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 6`, daysAgo(29)),
    rows(env, `SELECT device, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY device`, daysAgo(29)),
    rows(env, `${SELECT} WHERE m.views > 0 ORDER BY m.views DESC LIMIT 8`),
    count(env, "SELECT COUNT(*) AS n FROM devices WHERE enabled = 1"),
  ]);

  const perDienst = {}, perDienstGisteren = {};
  let vandaag = 0, gisteren = 0;
  for (const r of meldingenRows) {
    const d = dayKey(new Date(r.datum));
    if (d === today) { vandaag++; perDienst[r.dienst] = (perDienst[r.dienst] || 0) + 1; }
    else if (d === yesterday) { gisteren++; perDienstGisteren[r.dienst] = (perDienstGisteren[r.dienst] || 0) + 1; }
  }
  const visits = series(30, visitsPerDay, "bezoekers").map((r) => ({ day: r.day, bezoekers: r.bezoekers || 0, paginas: r.paginas || 0 }));
  const actief = Number(installTotals?.actief || 0);
  const apple = Number(installTotals?.apple || 0);

  return {
    generated: new Date().toISOString(),
    status,
    meldingen: { vandaag, gisteren, perDienst, perDienstGisteren },
    app: {
      totaal: Number(installTotals?.totaal || 0),
      actief,
      appleLogin: { ja: apple, nee: actief - apple },
      push: { aan: Number(installTotals?.push || 0), uit: actief - Number(installTotals?.push || 0), toestellen: pushDevices },
      platforms,
      versies: versions,
      nieuwPerDag: series(30, newPerDay),
      actiefPerDag: series(30, activePerDay),
    },
    website: {
      vandaag: visits.at(-1).bezoekers,
      gisteren: visits.at(-2).bezoekers,
      bezoeken7: visits.slice(-7).reduce((a, r) => a + r.bezoekers, 0),
      bezoeken30: visits.reduce((a, r) => a + r.bezoekers, 0),
      paginasVandaag: visits.at(-1).paginas,
      perDag: visits,
      paginas: series(30, pagesPerDay),
      topPaginas: topPages,
      apparaten: devicesSplit,
    },
    topBekeken: topViewed.map((r) => ({ guid: r.guid, title: r.title, dienst: r.dienst, views: r.views, datum_tijd: new Date(r.datum).toISOString() })),
  };
}

// ------------------------------------------------------------------ meldingen

export async function adminMeldingen(env, url) {
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const onlyHidden = url.searchParams.get("hidden") === "1";
  const lim = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
  let where = "WHERE 1 = 1";
  const args = [];
  if (onlyHidden) where += " AND COALESCE(o.hidden, 0) = 1";
  if (q) {
    where += " AND (LOWER(COALESCE(o.title, m.title)) LIKE ? OR LOWER(m.stad) LIKE ? OR LOWER(COALESCE(o.locatie, m.locatie, '')) LIKE ? OR m.capcode LIKE ? OR LOWER(COALESCE(o.categorie, m.categorie, '')) LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }
  return (await env.DB.prepare(`${SELECT} ${where} ORDER BY m.datum DESC LIMIT ?`).bind(...args, lim).all()).results.map(toAPI);
}

const numOrNull = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

export async function updateMelding(env, guid, body) {
  const exists = await env.DB.prepare("SELECT 1 FROM meldingen WHERE guid = ?").bind(guid).first();
  if (!exists) throw new HttpError(404, "Melding niet gevonden");
  if (body.reset) {
    await env.DB.prepare("DELETE FROM overrides WHERE guid = ?").bind(guid).run();
  } else {
    const cur = (await env.DB.prepare("SELECT * FROM overrides WHERE guid = ?").bind(guid).first()) || {};
    const pick = (k, fn) => (k in body ? fn(body[k]) : cur[k] ?? null);
    const text = (n) => (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
    await env.DB.prepare(`INSERT OR REPLACE INTO overrides (guid, hidden, title, categorie, locatie, lat, lon, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(guid, pick("hidden", (v) => (v ? 1 : 0)) ?? 0, pick("title", text(200)), pick("categorie", text(80)), pick("locatie", text(120)),
        pick("lat", (v) => numOrNull(v, 50, 54)), pick("lon", (v) => numOrNull(v, 3, 8)), Date.now()).run();
  }
  return getMelding(env, guid, { includeHidden: true });
}

// ------------------------------------------------------------------ push

/** Queues a message; the cron sends it within a minute. Empty plaatsen = everyone with push on. */
export async function broadcast(env, body, queue) {
  const title = String(body.title || "").trim().slice(0, 120), text = String(body.body || "").trim().slice(0, 1000);
  if (!title || !text) throw new HttpError(400, "Titel en tekst zijn verplicht");
  const plaatsen = (Array.isArray(body.plaatsen) ? body.plaatsen : []).filter((p) => PLAATSEN.includes(p));
  const keys = plaatsen.map(plaatsKey);
  const devices = (await activeDevices(env)).filter((d) =>
    !keys.length || !d.plaatsen.length || d.plaatsen.some((p) => keys.includes(plaatsKey(p))));
  const id = `broadcast:${Date.now()}`;
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)")
    .bind(id, JSON.stringify({ title, body: text, guid: body.guid || null, plaatsen, ontvangers: devices.length }), Date.now()).run();
  await queue(env, id, devices.map((d) => d.token));
  return { queued: devices.length };
}

export async function broadcastHistory(env) {
  const list = await rows(env, "SELECT key, value, at FROM kv WHERE key LIKE 'broadcast:%' AND key NOT LIKE 'broadcast:heli:%' ORDER BY at DESC LIMIT 25");
  return list.map((r) => ({ id: r.key, at: new Date(r.at).toISOString(), ...JSON.parse(r.value) }));
}

// ------------------------------------------------------------------ texts

export const CONTENT_NAMES = ["privacy", "cookies", "terms", "disclaimer", "changelog"];

export async function contentFor(env, name, bundled) {
  const row = await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(`content:${name}`).first();
  return row ? JSON.parse(row.value) : bundled[name];
}

export async function saveContent(env, name, body) {
  if (!CONTENT_NAMES.includes(name)) throw new HttpError(404, "Onbekende tekst");
  let value;
  if (name === "changelog") {
    if (!Array.isArray(body)) throw new HttpError(400, "Changelog moet een lijst zijn");
    value = body.slice(0, 200).map((e) => ({
      id: String(e.id || e.version || Date.now()), title: String(e.title || "").slice(0, 120), version: String(e.version || "").slice(0, 20),
      release_date: e.release_date || new Date().toISOString(), content: String(e.content || "").slice(0, 20_000),
    }));
  } else {
    if (typeof body.content !== "string") throw new HttpError(400, "Tekst ontbreekt");
    value = { title: String(body.title || "").slice(0, 120), content: body.content.slice(0, 100_000), version: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() };
  }
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(`content:${name}`, JSON.stringify(value), Date.now()).run();
  return value;
}

// ------------------------------------------------------------------ beheer devices + outage alerts

export async function registerAdminDevice(env, body) {
  const token = String(body.token || "").toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(token)) throw new HttpError(400, "Invalid token");
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO admin_devices (token, environment, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET environment = excluded.environment, platform = excluded.platform, updated_at = excluded.updated_at`)
    .bind(token, body.environment === "sandbox" ? "sandbox" : "production", body.platform === "macos" ? "macos" : "ios", now, now).run();
}

export async function pushAdmins(env, title, body, { kind } = {}) {
  // kind "bronnen": only devices that did not switch off "Storing bronnen".
  const list = kind === "bronnen"
    ? await rows(env, "SELECT a.* FROM admin_devices a LEFT JOIN admin_prefs p ON p.token = a.token WHERE COALESCE(p.bronnen, 1) = 1")
    : await rows(env, "SELECT * FROM admin_devices");
  let sent = 0;
  for (const d of list) {
    let r = await sendPush(env, d, { aps: { alert: { title, body }, sound: "default" } }, { topic: BEHEER_TOPIC });
    if (!r.ok && r.reason === "DeviceTokenNotForTopic") {
      r = await sendPush(env, d, { aps: { alert: { title, body }, sound: "default" }, lrenv: "p2000" }, { topic: env.LRBEHEER_TOPIC || LRBEHEER_TOPIC });
    }
    if (r.ok) sent++;
    else if (isDeadToken(r)) await env.DB.prepare("DELETE FROM admin_devices WHERE token = ?").bind(d.token).run();
  }
  return { sent, total: list.length };
}

/** Called by the cron: a push to the beheer app when the feed has been down for 10 minutes, and when it is back. */
export async function checkOutage(env) {
  const ok = await env.DB.prepare("SELECT value FROM kv WHERE key = 'feed_ok'").first();
  const alerted = await env.DB.prepare("SELECT value FROM kv WHERE key = 'outage_alerted'").first();
  const down = !ok || Date.now() - Number(ok.value) > 10 * 60_000;
  if (down && !alerted) {
    const err = await env.DB.prepare("SELECT value FROM kv WHERE key = 'feed_error'").first();
    await pushAdmins(env, "⚠️ A-Alerts: P2000-feed ligt eruit", `Al meer dan 10 minuten geen nieuwe gegevens${err ? `: ${err.value}` : ""}.`);
    await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES ('outage_alerted', '1', ?)").bind(Date.now()).run();
  } else if (!down && alerted) {
    await pushAdmins(env, "✅ A-Alerts: P2000-feed werkt weer", "De meldingen komen weer binnen.");
    await env.DB.prepare("DELETE FROM kv WHERE key = 'outage_alerted'").run();
  }
}

export async function adminHousekeeping(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM install_days WHERE day < ?").bind(daysAgo(90)),
    env.DB.prepare("DELETE FROM visits WHERE day < ?").bind(daysAgo(400)),
    env.DB.prepare("DELETE FROM pageviews WHERE day < ?").bind(daysAgo(400)),
    env.DB.prepare("DELETE FROM installs WHERE last_seen < ?").bind(Date.now() - 400 * 86_400_000),
    env.DB.prepare("DELETE FROM kv WHERE key LIKE 'visit_salt:%' AND key <> ?").bind(`visit_salt:${dayKey()}`),
    env.DB.prepare("DELETE FROM kv WHERE key LIKE 'broadcast:%' AND at < ?").bind(Date.now() - 90 * 86_400_000),
  ]);
}
