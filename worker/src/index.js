// P2000 Apeldoorn API as a Cloudflare Worker (no server to maintain).
//  - Cron (every minute): reads the p2000.page feed 3× per run, stores Apeldoorn alerts in D1 and sends pushes.
//  - HTTP: the same REST API the app, the widgets and the website use.
import { fromFeed, matches, payloadFor, isUrgent, deviceFrom, HttpError } from "./rules.js";
import {
  insertStmt, knownGuids, listMeldingen, getMelding, addView, meldingCount, upsertDevice, deleteDevice, getDevice,
  activeDevices, deviceCount, housekeeping,
} from "./db.js";
import {
  sendPush, isDeadToken, apnsConfigured, mapkitToken, mapkitConfigured, weatherFor, weatherConfigured, geocode,
  mapsServerConfigured,
} from "./apple.js";
import {
  login, requireAdmin, beheerConfigured, recordInstall, recordVisit, overview, adminMeldingen, updateMelding, broadcast,
  broadcastHistory, contentFor, saveContent, CONTENT_NAMES, registerAdminDevice, pushAdmins, checkOutage, adminHousekeeping,
} from "./admin.js";
import privacy from "../content/privacy.json";
import terms from "../content/terms.json";
import disclaimer from "../content/disclaimer.json";
import changelog from "../content/changelog.json";

const CONTENT = { privacy, terms, disclaimer, changelog };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listCache = new Map();

// ------------------------------------------------------------------ HTTP

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
const reply = (status, body, extra = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });

async function readJSON(req) {
  const text = await req.text();
  if (text.length > 32_768) throw new HttpError(413, "Body too large");
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
}

async function kvGet(env, key) {
  return env.DB.prepare("SELECT value, at FROM kv WHERE key = ?").bind(key).first();
}
async function kvSet(env, key, value) {
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(key, value, Date.now()).run();
}

async function handle(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (path === "/" || path === "/health") {
    const ok = await kvGet(env, "feed_ok"), err = await kvGet(env, "feed_error"), bf = await kvGet(env, "backfill_error");
    const cronRun = await kvGet(env, "cron_run");
    return reply(200, {
      ok: true,
      feed: { configured: Boolean(env.P2000_PAGE_API_URL), lastOk: ok ? new Date(Number(ok.value)).toISOString() : null, lastError: err?.value || null },
      cron: cronRun ? new Date(Number(cronRun.value)).toISOString() : null,
      lastTry: (await kvGet(env, "feed_try"))?.value ? new Date(Number((await kvGet(env, "feed_try")).value)).toISOString() : null,
      backfill: (await kvGet(env, "backfill_status"))?.value || null,
      backfillError: bf?.value || null,
      meldingen: await meldingCount(env),
      apns: apnsConfigured(env), mapkit: mapkitConfigured(env), weatherkit: weatherConfigured(env), mapsServer: mapsServerConfigured(env),
      devices: await deviceCount(env),
    });
  }

  if (method === "GET" && path === "/v1/meldingen") {
    const limit = url.searchParams.get("limit"), before = url.searchParams.get("before");
    // Short in-memory cache per Worker instance: many apps polling at once cost one database read.
    const key = `${limit}|${before}`;
    const hit = listCache.get(key);
    if (hit && Date.now() - hit.at < 8_000) return reply(200, hit.data, { "cache-control": "public, max-age=5" });
    const data = await listMeldingen(env, { limit, before });
    listCache.set(key, { at: Date.now(), data });
    if (listCache.size > 20) listCache.delete(listCache.keys().next().value);
    return reply(200, data, { "cache-control": "public, max-age=5" });
  }
  let m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})$/);
  if (method === "GET" && m) {
    const item = await getMelding(env, m[1]);
    return item ? reply(200, item) : reply(404, { error: "Not found" });
  }
  m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/view$/);
  if (method === "POST" && m) return reply(200, { views: await addView(env, m[1]) });
  m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/weather$/);
  if (method === "GET" && m) {
    const item = await getMelding(env, m[1]);
    if (!item) return reply(404, { error: "Not found" });
    const w = await weatherFor(env, item);
    return w ? reply(200, w, { "cache-control": "public, max-age=3600" }) : reply(503, { error: "Weather unavailable" });
  }

  if (method === "GET" && path === "/v1/mapkit-token") {
    const token = await mapkitToken(env, req.headers.get("origin") || "");
    if (!token) return reply(mapkitConfigured(env) ? 403 : 503, { error: "MapKit JS unavailable" });
    return new Response(token, { headers: { "content-type": "text/plain", "cache-control": "no-store", ...CORS } });
  }

  m = path.match(/^\/v1\/content\/(privacy|terms|disclaimer)$/);
  if (method === "GET" && m) return reply(200, await contentFor(env, m[1], CONTENT), { "cache-control": "public, max-age=300" });
  if (method === "GET" && path === "/v1/changelog") return reply(200, await contentFor(env, "changelog", CONTENT), { "cache-control": "public, max-age=300" });

  // Anonymous counters for the beheer statistics.
  if (method === "POST" && path === "/v1/installs") {
    await recordInstall(env, await readJSON(req));
    return reply(200, { ok: true });
  }
  if (method === "POST" && path === "/v1/visit") {
    await recordVisit(env, req, await readJSON(req));
    return reply(200, { ok: true });
  }

  if (method === "POST" && path === "/v1/devices") {
    await upsertDevice(env, deviceFrom(await readJSON(req)));
    return reply(200, { ok: true });
  }
  m = path.match(/^\/v1\/devices\/([0-9a-f]{64,200})$/);
  if (method === "DELETE" && m) return reply(200, { ok: await deleteDevice(env, m[1]) });
  m = path.match(/^\/v1\/devices\/([0-9a-f]{64,200})\/test$/);
  if (method === "POST" && m) {
    const device = await getDevice(env, m[1]);
    if (!device) return reply(404, { error: "Unknown device" });
    const nl = (device.language || "nl").startsWith("nl");
    const r = await sendPush(env, device, {
      aps: { alert: { title: "P2000 Apeldoorn", body: nl ? "Testmelding: je pushmeldingen werken! 🚨" : "Test notification: your push notifications work! 🚨" }, sound: "default" },
    });
    if (isDeadToken(r)) await deleteDevice(env, device.token);
    return reply(r.ok ? 200 : 502, r);
  }

  if (path.startsWith("/v1/beheer/")) return handleBeheer(req, env, url, path, method);

  return reply(404, { error: "Not found" });
}

// ------------------------------------------------------------------ P2000Beheer

async function statusInfo(env) {
  const get = async (k) => (await kvGet(env, k))?.value || null;
  const ok = await get("feed_ok"), cron = await get("cron_run");
  return {
    feed: { lastOk: ok ? new Date(Number(ok)).toISOString() : null, lastError: await get("feed_error") },
    cron: cron ? new Date(Number(cron)).toISOString() : null,
    apns: apnsConfigured(env), weatherkit: weatherConfigured(env), mapkit: mapkitConfigured(env), mapsServer: mapsServerConfigured(env),
    meldingenInDatabase: await meldingCount(env),
    outbox: (await env.DB.prepare("SELECT COUNT(*) AS n FROM outbox").first()).n,
    beheerApparaten: (await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_devices").first()).n,
  };
}

async function handleBeheer(req, env, url, path, method) {
  if (method === "POST" && path === "/v1/beheer/login") return reply(200, await login(env, req, await readJSON(req)));
  if (method === "GET" && path === "/v1/beheer/ping") return reply(200, { configured: beheerConfigured(env) });

  const admin = await requireAdmin(env, req);
  if (method === "GET" && path === "/v1/beheer/me") return reply(200, { user: admin.u, expires: new Date(admin.exp).toISOString() });
  if (method === "GET" && path === "/v1/beheer/overview") return reply(200, await overview(env, await statusInfo(env)));

  if (method === "GET" && path === "/v1/beheer/meldingen") return reply(200, await adminMeldingen(env, url));
  let m = path.match(/^\/v1\/beheer\/meldingen\/([\w-]{8,64})$/);
  if (m && method === "GET") {
    const item = await getMelding(env, m[1], { includeHidden: true });
    return item ? reply(200, item) : reply(404, { error: "Niet gevonden" });
  }
  if (m && (method === "PATCH" || method === "PUT")) return reply(200, await updateMelding(env, m[1], await readJSON(req)));

  if (method === "POST" && path === "/v1/beheer/push") return reply(200, await broadcast(env, await readJSON(req), queue));
  if (method === "GET" && path === "/v1/beheer/push") return reply(200, await broadcastHistory(env));

  m = path.match(/^\/v1\/beheer\/content\/(\w+)$/);
  if (m && CONTENT_NAMES.includes(m[1])) {
    if (method === "GET") return reply(200, await contentFor(env, m[1], CONTENT));
    if (method === "PUT") return reply(200, await saveContent(env, m[1], await readJSON(req)));
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM kv WHERE key = ?").bind(`content:${m[1]}`).run();
      return reply(200, CONTENT[m[1]]);
    }
  }

  if (method === "POST" && path === "/v1/beheer/devices") {
    await registerAdminDevice(env, await readJSON(req));
    return reply(200, { ok: true });
  }
  if (method === "POST" && path === "/v1/beheer/devices/test") {
    return reply(200, await pushAdmins(env, "P2000Beheer", "Testmelding: meldingen van P2000Beheer werken. ✅"));
  }
  return reply(404, { error: "Not found" });
}

// ------------------------------------------------------------------ ingest + push

/** Counts outgoing requests: the free Workers plan allows 50 per invocation. */
class Budget {
  constructor(n) { this.left = n; }
  take() { if (this.left <= 0) return false; this.left--; return true; }
}

async function queue(env, guid, tokens) {
  const now = Date.now();
  for (let i = 0; i < tokens.length; i += 50) {
    await env.DB.batch(tokens.slice(i, i + 50).map((t) =>
      env.DB.prepare("INSERT OR IGNORE INTO outbox (guid, token, created_at) VALUES (?, ?, ?)").bind(guid, t, now)));
  }
}

async function poll(env, budget) {
  if (!env.P2000_PAGE_API_URL || !budget.take()) return;
  try {
    const res = await fetch(env.P2000_PAGE_API_URL, { headers: { accept: "application/json", "user-agent": "P2000Apeldoorn/1.0 (+https://p2000-apeldoorn.nl)" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const parsed = (Array.isArray(list) ? list : []).map(fromFeed).filter(Boolean);
    const known = await knownGuids(env, parsed.map((m) => m.guid));
    const fresh = parsed.filter((m) => !known.has(m.guid));
    for (const m of fresh) {
      // Precise coordinates for the street (keep a few requests over for the pushes).
      if (m.locatie && budget.left > 20 && budget.take()) {
        const c = await geocode(env, m.locatie, m.stad);
        if (c) [m.lat, m.lon] = c;
      }
    }
    if (fresh.length) await env.DB.batch(fresh.map((m) => insertStmt(env, m)));
    await kvSet(env, "feed_ok", String(Date.now()));
    await env.DB.prepare("DELETE FROM kv WHERE key = 'feed_error'").run();

    // Queue pushes for new, recent alerts (oldest first).
    const recent = fresh.filter((m) => Date.now() - m.datum < 15 * 60_000).sort((a, b) => a.datum - b.datum);
    if (recent.length) {
      const devices = await activeDevices(env);
      for (const m of recent) await queue(env, m.guid, devices.filter((d) => matches(d, m)).map((d) => d.token));
    }
  } catch (e) {
    await kvSet(env, "feed_error", String(e.message || e));
    console.error("[ingest]", e.message || e);
  }
}

async function drain(env, budget) {
  if (budget.left <= 0) return;
  const { results } = await env.DB.prepare(`
    SELECT o.guid, o.token, d.environment, d.language FROM outbox o JOIN devices d ON d.token = o.token
    ORDER BY o.created_at LIMIT ?`).bind(budget.left).all();
  if (!results.length) return;
  const items = new Map();
  for (const row of results) {
    if (!items.has(row.guid)) {
      if (row.guid.startsWith("broadcast:")) {
        const b = await kvGet(env, row.guid);
        items.set(row.guid, b ? { broadcast: JSON.parse(b.value) } : null);
      } else {
        const m = await getMelding(env, row.guid);
        items.set(row.guid, m ? { melding: { ...m, datum: Date.parse(m.datum_tijd) } } : null);
      }
    }
  }
  await Promise.all(results.map(async (row) => {
    const item = items.get(row.guid);
    const done = env.DB.prepare("DELETE FROM outbox WHERE guid = ? AND token = ?").bind(row.guid, row.token);
    if (!item || !budget.take()) { if (!item) await done.run(); return; }
    const r = item.melding
      ? await sendPush(env, row, payloadFor(item.melding, row.language), { urgent: isUrgent(item.melding), collapseId: row.guid })
      : await sendPush(env, row, { aps: { alert: { title: item.broadcast.title, body: item.broadcast.body }, sound: "default" }, ...(item.broadcast.guid ? { guid: item.broadcast.guid } : {}) });
    if (isDeadToken(r)) await deleteDevice(env, row.token);
    else if (!r.ok) console.warn("[push]", row.token.slice(0, 8), r.status, r.reason);
    await done.run();
  }));
}

/** One-time import of the last ~2 days from the old website (set BACKFILL = "1"). */
async function backfill(env, budget) {
  if (env.BACKFILL !== "1" || (await meldingCount(env)) >= 100 || !budget.take()) return;
  const path = `/api/apps/69b6661a41c2b1b46f95682e/entities/P2000Melding?sort=-datum_tijd&limit=${Number(env.BACKFILL_LIMIT || 400)}`;
  let res = null;
  for (const host of ["https://app.base44.com", "https://p2000-apeldoorn.nl"]) {
    res = await fetch(host + path, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    await kvSet(env, "backfill_status", `${host}: ${res ? "HTTP " + res.status : "geen verbinding"}`);
    if (res?.ok) break;
  }
  if (!res?.ok) return;
  const rows = (await res.json()).filter((r) => r.guid && r.datum_tijd && !Number.isNaN(Date.parse(r.datum_tijd))).map((r) => ({
    guid: r.guid, title: r.title || r.description || "", full_melding: r.full_melding, dienst: r.dienst,
    prioriteit: r.prioriteit && r.prioriteit !== "onbekend" ? r.prioriteit : null, datum: Date.parse(r.datum_tijd),
    locatie: r.locatie, lat: r.lat, lon: r.lon, stad: r.stad, regio: r.regio, capcode: r.capcode, categorie: r.categorie,
    grip: r.grip, opschaling: r.opschaling, eenheden: r.eenheden, voertuigen: r.voertuigen, link: r.link,
  }));
  for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50).map((m) => insertStmt(env, m)));
  console.log(`[backfill] ${rows.length} meldingen`);
}

async function catchUp(env) {
  try {
    const last = await kvGet(env, "feed_try");
    if (last && Date.now() - Number(last.value) < 45_000) return;
    await kvSet(env, "feed_try", String(Date.now()));
    const budget = new Budget(40);
    try { await backfill(env, budget); } catch (e) { await kvSet(env, "backfill_error", String(e.message || e)); }
    await poll(env, budget);
    await drain(env, budget);
  } catch (e) {
    console.error("[catch-up]", e.message || e);
  }
}

async function cron(env, event) {
  await kvSet(env, "cron_run", String(Date.now()));
  await kvSet(env, "feed_try", String(Date.now()));
  const budget = new Budget(Number(env.SUBREQUEST_BUDGET || 45));
  try {
    await backfill(env, budget);
  } catch (e) {
    await kvSet(env, "backfill_error", String(e.message || e));
    console.error("[backfill]", e.message || e);
  }
  // Three reads per minute: new alerts show up (and are pushed) within ~20 seconds.
  const runs = Number(env.POLLS_PER_RUN || 3);
  for (let i = 0; i < runs; i++) {
    await poll(env, budget);
    await drain(env, budget);
    if (i < runs - 1) await sleep(Math.floor(57_000 / runs));
  }
  try { await checkOutage(env); } catch (e) { console.error("[outage]", e.message || e); }
  if (new Date(event.scheduledTime).getUTCMinutes() === 7) {
    await housekeeping(env, Number(env.RETENTION_DAYS || 3));
    await adminHousekeeping(env);
  }
}

export default {
  async fetch(req, env, ctx) {
    try {
      // Backup for the cron: an API call also reads the feed when the last read is over 45 s old.
      if (req.method === "GET" && new URL(req.url).pathname.startsWith("/v1/meldingen")) ctx.waitUntil(catchUp(env));
      return await handle(req, env);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return reply(status, { error: err.message || "Server error" });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cron(env, event));
  },
};
