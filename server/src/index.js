import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, apnsConfigured } from "./config.js";
import { listMeldingen, getMelding, addView, upsertDevice, deleteDevice, getDevice, deviceCount, prune } from "./db.js";
import { startIngest, feedStatus } from "./ingest.js";
import { notify, sendTest, broadcast } from "./push.js";
import { monthStats } from "./stats.js";

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, "..", "content");

// ------------------------------------------------------------------ helpers

function reply(res, status, body, extra = {}) {
  const data = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    ...extra,
  });
  res.end(data);
}

async function readBody(req, limit = 32_768) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

// Very small per-IP rate limit for write endpoints.
const hits = new Map();
function limited(req, max = 30) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now();
  const e = hits.get(ip) || { n: 0, t: now };
  if (now - e.t > 60_000) { e.n = 0; e.t = now; }
  e.n++;
  hits.set(ip, e);
  return e.n > max;
}
setInterval(() => hits.clear(), 10 * 60_000).unref();

const strList = (v, max = 40) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length < 64).slice(0, max) : []);
const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

function deviceFrom(body) {
  const token = String(body.token || "").toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(token)) throw Object.assign(new Error("Invalid token"), { status: 400 });
  const s = body.settings || {};
  const radius = num(s.radius_km, 0.5, 100);
  const lat = num(s.lat, -90, 90), lon = num(s.lon, -180, 180);
  return {
    token,
    platform: body.platform === "macos" ? "macos" : "ios",
    environment: body.environment === "sandbox" ? "sandbox" : "production",
    language: typeof body.language === "string" ? body.language.slice(0, 8) : "nl",
    app_version: typeof body.app_version === "string" ? body.app_version.slice(0, 32) : null,
    enabled: s.enabled !== false,
    plaatsen: strList(s.plaatsen),
    diensten: strList(s.diensten),
    prioriteiten: strList(s.prioriteiten).map((p) => p.toUpperCase()),
    quiet: Boolean(s.quiet),
    quiet_from: num(s.quiet_from, 0, 1439) ?? 1380,
    quiet_to: num(s.quiet_to, 0, 1439) ?? 420,
    critical: s.critical !== false,
    // Radius only when a centre is given; rounded to ~100 m for privacy.
    radius_km: radius && lat != null && lon != null ? radius : null,
    lat: radius && lat != null ? Math.round(lat * 1000) / 1000 : null,
    lon: radius && lon != null ? Math.round(lon * 1000) / 1000 : null,
  };
}

function content(name) {
  const file = join(contentDir, `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

// ------------------------------------------------------------------ routes

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method;
    if (method === "OPTIONS") return reply(res, 204);

    if (path === "/" || path === "/health") {
      return reply(res, 200, { ok: true, feed: feedStatus(), apns: apnsConfigured(), devices: deviceCount() });
    }

    // Alerts
    if (method === "GET" && path === "/v1/meldingen") {
      return reply(res, 200, listMeldingen({ limit: url.searchParams.get("limit"), before: url.searchParams.get("before") }),
        { "cache-control": "public, max-age=5" });
    }
    let m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})$/);
    if (method === "GET" && m) {
      const item = getMelding(m[1]);
      return item ? reply(res, 200, item) : reply(res, 404, { error: "Not found" });
    }
    m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/view$/);
    if (method === "POST" && m) {
      if (limited(req, 120)) return reply(res, 429, { error: "Too many requests" });
      return reply(res, 200, { views: addView(m[1]) });
    }

    // Statistics
    m = path.match(/^\/v1\/stats\/(\d{4}-\d{2})$/);
    if (method === "GET" && m) {
      const stats = monthStats(m[1]);
      return stats ? reply(res, 200, stats, { "cache-control": "public, max-age=60" }) : reply(res, 400, { error: "Bad month" });
    }

    // Texts (privacy, terms, disclaimer) and changelog
    m = path.match(/^\/v1\/content\/(privacy|terms|disclaimer)$/);
    if (method === "GET" && m) return reply(res, 200, content(m[1]), { "cache-control": "public, max-age=3600" });
    if (method === "GET" && path === "/v1/changelog") return reply(res, 200, content("changelog") || []);

    // Devices (push)
    if (method === "POST" && path === "/v1/devices") {
      if (limited(req)) return reply(res, 429, { error: "Too many requests" });
      const device = deviceFrom(await readBody(req));
      upsertDevice(device);
      return reply(res, 200, { ok: true });
    }
    m = path.match(/^\/v1\/devices\/([0-9a-f]{64,200})$/);
    if (method === "DELETE" && m) {
      if (limited(req)) return reply(res, 429, { error: "Too many requests" });
      return reply(res, 200, { ok: deleteDevice(m[1]) });
    }
    m = path.match(/^\/v1\/devices\/([0-9a-f]{64,200})\/test$/);
    if (method === "POST" && m) {
      if (limited(req, 5)) return reply(res, 429, { error: "Too many requests" });
      const device = getDevice(m[1]);
      if (!device) return reply(res, 404, { error: "Unknown device" });
      const r = await sendTest(device);
      return reply(res, r.ok ? 200 : 502, r);
    }

    // Admin broadcast
    if (method === "POST" && path === "/v1/broadcast") {
      if (!config.adminToken || req.headers.authorization !== `Bearer ${config.adminToken}`) return reply(res, 401, { error: "Unauthorized" });
      const body = await readBody(req);
      if (!body.title || !body.body) return reply(res, 400, { error: "title and body required" });
      return reply(res, 200, await broadcast({ title: String(body.title).slice(0, 120), body: String(body.body).slice(0, 1000), guid: body.guid }));
    }

    return reply(res, 404, { error: "Not found" });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    return reply(res, status, { error: err.message || "Server error" });
  }
});

server.listen(config.port, () => {
  console.log(`[api] P2000 Apeldoorn API op poort ${config.port} · APNs ${apnsConfigured() ? "aan" : "UIT"}`);
});

startIngest(notify);
prune(config.retentionDays);
setInterval(() => prune(config.retentionDays), 24 * 3600_000).unref();

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
