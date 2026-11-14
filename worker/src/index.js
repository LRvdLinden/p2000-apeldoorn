// A-Alerts API as a Cloudflare Worker (no server to maintain), at
// p2000-apeldoorn-api.lrvdlinden.workers.dev.
//  - Cron (every minute): reads the p2000.page feed 3× per run, stores Apeldoorn alerts in D1 and sends pushes.
//  - HTTP: the same REST API the app, the widgets and the website use.
import { verkeer, verkeerRun } from "./verkeer.js";
import { widgetPing, widgetSites, widgetBlok, widgetHousekeeping } from "./widget.js";
import { fromFeed, matches, payloadFor, isUrgent, deviceFrom, HttpError, categorie } from "./rules.js";
import {
  insertStmt, knownGuids, listMeldingen, getMelding, incidentMeldingen, addView, meldingCount, upsertDevice, deleteDevice, getDevice,
  activeDevices, deviceCount, housekeeping,
} from "./db.js";
import {
  sendPush, isDeadToken, apnsConfigured, mapkitToken, mapkitConfigured, weatherFor, weatherNow, weatherConfigured, geocode,
  mapsServerConfigured,
} from "./apple.js";
import {
  login, requireAdmin, beheerConfigured, recordInstall, recordVisit, overview, adminMeldingen, updateMelding, broadcast,
  broadcastHistory, contentFor, saveContent, CONTENT_NAMES, registerAdminDevice, pushAdmins, checkOutage, adminHousekeeping,
  recordDownload, downloadStats,
} from "./admin.js";
import privacy from "../content/privacy.json";
import terms from "../content/terms.json";
import disclaimer from "../content/disclaimer.json";
import cookies from "../content/cookies.json";
import hulp from "../content/hulp.json";
import changelog from "../content/changelog.json";
import {
  ingestWarnings, listWarnings, getWarning, linkedMeldingen, payloadForWarning, wantsPush, devicePrefs, savePrefs, prefsFrom,
  warningsHousekeeping,
} from "./alerts.js";
import { SELECT, toAPI as meldingAPI } from "./db.js";
import { routesVoor } from "./routes.js";
import { profielenFrom, capcodesFrom, meldingWanted, warningWanted } from "./profielen.js";
import { helikopters } from "./heli.js";
import { recordPositions, recordLucht, spoor, vluchten, spoorHousekeeping } from "./spoor.js";
import { koppelInstall, zoekToestel, testToestel } from "./toestel.js";
import { radarInfo, radarImage, radarTile, radarConfigured } from "./radar.js";
import { locatiesData, metVoorspelling, checkOpstijgen, heliPlusHousekeeping } from "./heliplus.js";
import { heliPrefsFrom, grootPrefsFrom, isGrootIncident, grootWanted, heliEvents, heliZonePushes, volgPushes, volgInzetten, heliInzetten, inzetPush, recenteHeliMeldingen, meldingVoorspelling,
  noteerTerPlaatse, terPlaatseSet, saveFeedback, feedbackLijst, updateFeedback, deleteFeedback } from "./extra.js";
import { statusOverzicht, statusTick, statusHousekeeping, notePushes, noteWeer, noteHeli, checkWebsite, maakIncident, updateIncident, verwijderIncident } from "./status.js";
import { fcmConfigured } from "./fcm.js";
import { notifyHomey, homeyConfigured } from "./homey.js";
import { kaartImage } from "./kaart.js";
import { kiesStockFotos, listNieuws, getNieuws, fotoResponse, wijzigNieuws, voegToe, wijzigUpdate, verwijderUpdate, stockLijst, zetStock, syncPolitie,
  syncWaarschuwingen, sync112, payloadVoorNieuws, nieuwsOntvangers, nieuwsHousekeeping } from "./nieuws.js";
import { adminWarnings, updateWarning, alertsOverview, setAdminPrefs, checkBronnen, recordBronnen } from "./admin-alerts.js";
import { kvWrite } from "./kv.js";
import { hmPaal, hmPunt, hmHerstel, straatPunt, straatHerstel } from "./hm.js";
import { pandVoor } from "./pand.js";
import { kenToe, recenteVoorIncident, incidentHerstel } from "./incident.js";
import { noteerPosten, postenInhalen, postInfo } from "./posten.js";
import REGIO from "./veiligheidsregio.js";

/** Last run of the hectometre-post repair in this isolate (it reads the alerts of 48 hours, so not every round). */
let hmLaatst = 0;

const CONTENT = { privacy, cookies, terms, disclaimer, changelog, hulp, mededeling: { title: "", content: "", version: "", updated_at: "" } };
/** Path part → devices.token: hex tokens are lower case, Android tokens keep their case. */
const deviceKey = (s) => {
  const t = decodeURIComponent(s);
  return /^fcm:/i.test(t) ? `fcm:${t.slice(4)}` : t.toLowerCase();
};
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

async function readJSON(req, max = 32_768) {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, "Body too large");
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
}

async function kvGet(env, key) {
  return env.DB.prepare("SELECT value, at FROM kv WHERE key = ?").bind(key).first();
}
async function kvSet(env, key, value) {
  await kvWrite(env, key, value);
}

async function handle(req, env, ctx) {
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
      apns: apnsConfigured(env), fcm: fcmConfigured(env), mapkit: mapkitConfigured(env), weatherkit: weatherConfigured(env), mapsServer: mapsServerConfigured(env), radar: radarConfigured(env),
      devices: await deviceCount(env),
      waarschuwingen: JSON.parse((await kvGet(env, "warnings_status"))?.value || "null"),
      nieuws: JSON.parse((await kvGet(env, "nieuws_politie_status"))?.value || "null"),
      nieuws112: JSON.parse((await kvGet(env, "n112_status"))?.value || "null"),
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
  // Alerted stations with road route and estimated arrival (once per alert, then from D1).
  m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/routes$/);
  if (method === "GET" && m) {
    const item = await getMelding(env, m[1]);
    if (!item) return reply(404, { error: "Not found" });
    if (!String(item.locatie || "").trim() || item.lat == null) return reply(200, { guid: item.guid, kazernes: [] });
    return reply(200, await routesVoor(env, item), { "cache-control": "public, max-age=3600" });
  }
  // Every alert of the incident this alert belongs to, oldest first.
  m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/verloop$/);
  if (method === "GET" && m) {
    const item = await getMelding(env, m[1]);
    if (!item) return reply(404, { error: "Not found" });
    const meldingen = item.incident ? await incidentMeldingen(env, item.incident) : [item];
    return reply(200, { guid: item.guid, incident: item.incident, meldingen }, { "cache-control": "public, max-age=20" });
  }
  // Building facts (year built, use) from the BAG, for an alert at an address with a house number.
  m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/pand$/);
  if (method === "GET" && m) {
    const item = await getMelding(env, m[1]);
    if (!item) return reply(404, { error: "Not found" });
    return reply(200, { guid: item.guid, pand: await pandVoor(env, item) }, { "cache-control": "public, max-age=3600" });
  }
  m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/weather$/);
  if (method === "GET" && m) {
    const item = await getMelding(env, m[1]);
    if (!item) return reply(404, { error: "Not found" });
    const w = await weatherFor(env, item);
    if (item.lat != null) await noteWeer(env, Boolean(w)).catch(() => {});
    return w ? reply(200, w, { "cache-control": "public, max-age=3600" }) : reply(503, { error: "Weather unavailable" });
  }

  // A-Alerts: NL-Alert, Burgernet and KNMI for the working area.
  if (method === "GET" && path === "/v1/waarschuwingen") {
    return reply(200, await listWarnings(env, url.searchParams.get("days"), { kind: url.searchParams.get("kind") === "1" }), { "cache-control": "public, max-age=30" });
  }
  // Weather at the place and time of a warning (same WeatherKit data as for an alert).
  m = path.match(/^\/v1\/waarschuwingen\/([\w:.\-%+]{4,160})\/weather$/);
  if (method === "GET" && m) {
    const w = await getWarning(env, decodeURIComponent(m[1]));
    if (!w) return reply(404, { error: "Not found" });
    // KNMI: the weather right now (a weather code is about now), not at the start of the warning.
    if (w.bron === "knmi") {
      const nu = await weatherNow(env);
      await noteWeer(env, Boolean(nu)).catch(() => {});
      return nu ? reply(200, nu, { "cache-control": "public, max-age=300" }) : reply(503, { error: "Weather unavailable" });
    }
    const data = await weatherFor(env, { guid: `w:${w.id}`, lat: w.lat ?? null, lon: w.lon ?? null, datum_tijd: w.start });
    if (w.lat != null) await noteWeer(env, Boolean(data)).catch(() => {});
    return data ? reply(200, data, { "cache-control": "public, max-age=3600" }) : reply(503, { error: "Weather unavailable" });
  }
  m = path.match(/^\/v1\/waarschuwingen\/([\w:.\-%+]{4,160})$/);
  if (method === "GET" && m) {
    const w = await getWarning(env, decodeURIComponent(m[1]));
    if (!w) return reply(404, { error: "Not found" });
    // A weather code covers a whole region: no "alerts nearby" for KNMI.
    const meldingen = w.bron === "knmi" ? [] : await linkedMeldingen(env, w, meldingAPI, SELECT);
    return reply(200, { ...w, meldingen }, { "cache-control": "public, max-age=30" });
  }

  // Tab Nieuws: police news about our places, weather articles and liveblogs.
  if (method === "GET" && path === "/v1/nieuws") {
    const q = url.searchParams;
    return reply(200, await listNieuws(env, url.origin, { soort: q.get("soort"), limit: q.get("limit"), before: q.get("before") }), { "cache-control": "public, max-age=30" });
  }
  m = path.match(/^\/v1\/nieuws\/foto\/([0-9a-f]{32})$/);
  if (method === "GET" && m) return fotoResponse(env, m[1]);
  m = path.match(/^\/v1\/nieuws\/([pwlr]-[0-9a-f]{12})$/);
  if (method === "GET" && m) {
    const item = await getNieuws(env, url.origin, m[1]);
    return item ? reply(200, item, { "cache-control": "public, max-age=20" }) : reply(404, { error: "Not found" });
  }

  // A-Alerts: live positions of the trauma and police helicopters (adsb.lol, ODbL).
  // Route trail and flight history of one helicopter (stored by the Worker, 3 days).
  m = path.match(/^\/v1\/helikopters\/([a-z0-9-]{3,40})\/spoor$/);
  if (method === "GET" && m) {
    const scope = ["vlucht", "kort", "vandaag"].includes(url.searchParams.get("scope")) ? url.searchParams.get("scope") : "vlucht";
    return reply(200, await spoor(env, m[1], scope), { "cache-control": "public, max-age=10" });
  }
  m = path.match(/^\/v1\/helikopters\/([a-z0-9-]{3,40})\/vluchten$/);
  if (method === "GET" && m) return reply(200, await vluchten(env, m[1]), { "cache-control": "public, max-age=30" });
  // Map layer "Defensie en overheid": defence, coastguard, Marechaussee and the government aircraft.
  if (method === "GET" && path === "/v1/lucht") {
    const d = await helikopters(env);
    return reply(200, { bijgewerkt: d.bijgewerkt, bron: d.bron, toestellen: d.lucht || [], ...(d.fout ? { fout: true } : {}) }, { "cache-control": "public, max-age=10" });
  }
  if (method === "GET" && path === "/v1/helikopters") {
    const { lucht: _lucht, ...alleenHelis } = await helikopters(env);
    const data = metVoorspelling(alleenHelis);
    // A Lifeliner on its way to a recent alert: that alert is the destination, then the hospital.
    try {
      const lucht = (data.helikopters || []).filter((h) => h.soort === "trauma" && !h.op_grond);
      if (lucht.length) {
        const [meldingen, ter] = [await recenteHeliMeldingen(env), await terPlaatseSet(env)];
        data.helikopters = data.helikopters.map((h) => {
          const v = meldingVoorspelling(h, meldingen, ter);
          return v ? { ...h, voorspelling: v } : h;
        });
      }
    } catch (e) { console.error("[voorspelling]", e.message || e); }
    // Lifeliners that were probably cancelled on their way to an alert, or did not take off.
    try { data.inzet = await heliInzetten(env); } catch (e) { console.error("[inzet]", e.message || e); data.inzet = []; }
    return reply(200, data, { "cache-control": "public, max-age=10" });
  }
  if (method === "GET" && path === "/v1/status") {
    return reply(200, await statusOverzicht(env), { "cache-control": "public, max-age=30" });
  }
  if (method === "GET" && path === "/v1/locaties") {
    return reply(200, locatiesData(), { "cache-control": "public, max-age=86400" });
  }

  if (method === "GET" && path === "/v1/mapkit-token") {
    const token = await mapkitToken(env, req.headers.get("origin") || "");
    if (!token) return reply(mapkitConfigured(env) ? 403 : 503, { error: "MapKit JS unavailable" });
    return new Response(token, { headers: { "content-type": "text/plain", "cache-control": "no-store", ...CORS } });
  }

  m = path.match(/^\/v1\/content\/(privacy|cookies|terms|disclaimer|hulp)$/);
  if (method === "GET" && m) return reply(200, await contentFor(env, m[1], CONTENT), { "cache-control": "public, max-age=300" });
  // What the apps need at start-up: the lowest build that still works (below it the app asks to update). No database.
  if (method === "GET" && path === "/v1/app") {
    const n = (v) => Math.max(0, Number.parseInt(v || "0", 10) || 0);
    // A message of the makers for everyone (set in beheer): shown once as a banner in the apps and on the site.
    let mededeling = null;
    try {
      const c = await contentFor(env, "mededeling", { mededeling: null });
      const tekst = String(c?.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (tekst) mededeling = { id: c.updated_at || c.version || "1", titel: String(c.title || "").trim() || "Mededeling", tekst: tekst.slice(0, 600) };
    } catch (e) { console.warn("[mededeling]", e.message || e); }
    return reply(200, { min_build: { ios: n(env.MIN_BUILD_IOS), android: n(env.MIN_BUILD_ANDROID) }, mededeling }, { "cache-control": "public, max-age=600" });
  }
  // The border of the safety region (map layer).
  if (method === "GET" && path === "/v1/veiligheidsregio") return reply(200, REGIO, { "cache-control": "public, max-age=86400" });
  // Figures of one station: call-outs (an incident counts once), per hour and per day, vehicles and capcodes.
  m = path.match(/^\/v1\/posten\/([\w-]{3,60})$/);
  if (method === "GET" && m) {
    const post = await postInfo(env, m[1]);
    return post ? reply(200, post, { "cache-control": "public, max-age=120" }) : reply(404, { error: "Not found" });
  }
  if (method === "GET" && path === "/v1/changelog") return reply(200, await contentFor(env, "changelog", CONTENT), { "cache-control": "public, max-age=300" });

  // Anonymous counters for the beheer statistics.
  if (method === "POST" && path === "/v1/installs") {
    await recordInstall(env, await readJSON(req));
    return reply(200, { ok: true });
  }
  // A-Alerts APK downloaded from a-alerts.nl (sendBeacon from the download button).
  if (method === "POST" && path === "/v1/downloads") {
    await recordDownload(env, req, await readJSON(req));
    return reply(200, { ok: true });
  }
  if (method === "POST" && path === "/v1/visit") {
    await recordVisit(env, req, await readJSON(req));
    return reply(200, { ok: true });
  }

  if (method === "POST" && path === "/v1/devices") {
    const body = await readJSON(req);
    const device = deviceFrom(body);
    await upsertDevice(env, device);
    await koppelInstall(env, device.token, body.install_id).catch(() => {});
    const w = prefsFrom(body.settings?.waarschuwingen);
    const profielen = profielenFrom(body.settings?.profielen);
    const capcodes = capcodesFrom(body.settings?.capcodes);
    const heli = heliPrefsFrom(body.settings?.heli);
    const groot = grootPrefsFrom(body.settings?.groot);
    if (w || profielen || capcodes || heli || groot) await savePrefs(env, device.token, { ...(w || { nlalert: true, burgernet: false, knmi: ["orange", "red"] }),
      ...(profielen ? { profielen } : {}), ...(capcodes ? { capcodes } : {}), ...(heli ? { heli } : {}), ...(groot ? { groot } : {}) });
    return reply(200, { ok: true });
  }
  // APNs token (hex) or Android token ("fcm:<token>", URL-encoded by the app).
  m = path.match(/^\/v1\/devices\/([0-9a-f]{64,200}|fcm(?::|%3A)[A-Za-z0-9_:%-]{100,420})$/i);
  if (method === "DELETE" && m) return reply(200, { ok: await deleteDevice(env, deviceKey(m[1])) });
  m = path.match(/^\/v1\/devices\/([0-9a-f]{64,200}|fcm(?::|%3A)[A-Za-z0-9_:%-]{100,420})\/test$/i);
  if (method === "POST" && m) {
    const device = await getDevice(env, deviceKey(m[1]));
    if (!device) { console.log("[push-test] onbekend toestel"); return reply(404, { error: "Unknown device" }); }
    const nl = (device.language || "nl").startsWith("nl");
    const r = await sendPush(env, device, {
      aps: { alert: { title: "A-Alerts", body: nl ? "Testmelding: je pushmeldingen werken! 🚨" : "Test notification: your push notifications work! 🚨" }, sound: "default" },
    });
    console.log(`[push-test] ${device.platform}/${device.environment} ${r.ok ? "ok" : "fout"} ${r.status || ""} ${r.reason || ""}`);
    if (isDeadToken(r)) await deleteDevice(env, device.token);
    return reply(r.ok ? 200 : 502, { ...r, platform: device.platform, environment: device.environment });
  }

  // Rain radar (KNMI): one image of the Netherlands, or map tiles.
  if (method === "GET" && path === "/v1/widget/ping") return reply(200, await widgetPing(env, url.searchParams), { "cache-control": "no-store" });
  if (method === "GET" && path === "/v1/verkeer") return reply(200, await verkeer(env), { "cache-control": "public, max-age=60" });
  if (method === "GET" && path === "/v1/radar") return reply(200, radarInfo(env, url.origin), { "cache-control": "public, max-age=60" });
  if (method === "GET" && path === "/v1/radar.png") return radarImage(env, ctx);
  // Square map with a marker, for the image tags in Homey.
  if (method === "GET" && path === "/v1/kaart.png") return kaartImage(env, ctx, url);
  m = path.match(/^\/v1\/radar\/(\d{1,2})\/(\d{1,5})\/(\d{1,5})\.png$/);
  if (method === "GET" && m) return radarTile(env, ctx, Number(m[1]), Number(m[2]), Number(m[3]));

  // "Klopt deze melding niet?": a user reports a wrong alert (reason, note, optionally the right spot).
  m = path.match(/^\/v1\/meldingen\/([\w-]{8,64})\/feedback$/);
  if (method === "POST" && m) {
    const r = await saveFeedback(env, req, m[1], await readJSON(req));
    try { await pushAdmins(env, "Melding gemeld als onjuist", "Bekijk het in het beheer onder Gemelde fouten."); } catch {}
    return reply(200, r);
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
    apns: apnsConfigured(env), fcm: fcmConfigured(env), homey: homeyConfigured(env), weatherkit: weatherConfigured(env), mapkit: mapkitConfigured(env), mapsServer: mapsServerConfigured(env), radar: radarConfigured(env),
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
  if (method === "GET" && path === "/v1/beheer/overview") {
    const [base, aAlerts, android] = await Promise.all([overview(env, await statusInfo(env)), alertsOverview(env), downloadStats(env)]);
    return reply(200, { ...base, aAlerts, android });
  }
  // Widgets on other websites: where they are embedded, and blocking a site.
  if (method === "GET" && path === "/v1/beheer/widgets") return reply(200, { sites: await widgetSites(env) });
  if ((method === "POST" || method === "PUT") && path === "/v1/beheer/widgets/blok") {
    return (await widgetBlok(env, await readJSON(req))) ? reply(200, { sites: await widgetSites(env) }) : reply(400, { error: "Ongeldige site" });
  }
  if (method === "GET" && path === "/v1/beheer/downloads") return reply(200, await downloadStats(env));
  // A-Alerts: NL-Alert, Burgernet and KNMI in the beheer.
  if (method === "GET" && path === "/v1/beheer/waarschuwingen") return reply(200, await adminWarnings(env, url));
  let w = path.match(/^\/v1\/beheer\/waarschuwingen\/([\w:.\-%+]{4,160})$/);
  if (w && (method === "PATCH" || method === "PUT")) {
    const item = await updateWarning(env, decodeURIComponent(w[1]), await readJSON(req));
    return item ? reply(200, item) : reply(404, { error: "Niet gevonden" });
  }

  // Tab Nieuws: hide, own photo, add/change/remove messages in the timeline, stock images for police news.
  if (method === "GET" && path === "/v1/beheer/nieuws") {
    const q = url.searchParams;
    return reply(200, await listNieuws(env, url.origin, { soort: q.get("soort"), limit: q.get("limit") || 100, before: q.get("before"), beheer: true }));
  }
  if (path === "/v1/beheer/nieuws/stock") {
    if (method === "GET") return reply(200, await stockLijst(env, url.origin));
    if (method === "PUT" || method === "POST") { await zetStock(env, await readJSON(req, 3_000_000)); return reply(200, await stockLijst(env, url.origin)); }
  }
  let n = path.match(/^\/v1\/beheer\/nieuws\/([pwlr]-[0-9a-f]{12})$/);
  if (n && method === "GET") { const item = await getNieuws(env, url.origin, n[1], { beheer: true }); return item ? reply(200, item) : reply(404, { error: "Niet gevonden" }); }
  if (n && (method === "PATCH" || method === "PUT")) {
    const ok = await wijzigNieuws(env, n[1], await readJSON(req, 3_000_000));
    return ok ? reply(200, await getNieuws(env, url.origin, n[1], { beheer: true })) : reply(404, { error: "Niet gevonden" });
  }
  n = path.match(/^\/v1\/beheer\/nieuws\/([pwlr]-[0-9a-f]{12})\/updates$/);
  if (n && method === "POST") {
    const body = await readJSON(req, 3_000_000);
    const r = await voegToe(env, n[1], body);
    if (!r) return reply(404, { error: "Niet gevonden" });
    let ontvangers = 0;
    if (body.push !== false) ontvangers = await pushNieuws(env, n[1], "a", r.id);
    return reply(200, { ...(await getNieuws(env, url.origin, n[1], { beheer: true })), ontvangers });
  }
  n = path.match(/^\/v1\/beheer\/nieuws\/([pwlr]-[0-9a-f]{12})\/updates\/(\d+)$/);
  if (n && (method === "PATCH" || method === "PUT")) {
    const ok = await wijzigUpdate(env, n[1], Number(n[2]), await readJSON(req, 3_000_000));
    return ok ? reply(200, await getNieuws(env, url.origin, n[1], { beheer: true })) : reply(404, { error: "Niet gevonden" });
  }
  if (n && method === "DELETE") {
    const ok = await verwijderUpdate(env, n[1], Number(n[2]));
    return ok ? reply(200, await getNieuws(env, url.origin, n[1], { beheer: true })) : reply(404, { error: "Niet gevonden" });
  }

  if (method === "GET" && path === "/v1/beheer/meldingen") return reply(200, await adminMeldingen(env, url));
  let m = path.match(/^\/v1\/beheer\/meldingen\/([\w-]{8,64})$/);
  if (m && method === "GET") {
    const item = await getMelding(env, m[1], { includeHidden: true });
    return item ? reply(200, item) : reply(404, { error: "Niet gevonden" });
  }
  if (m && (method === "PATCH" || method === "PUT")) return reply(200, await updateMelding(env, m[1], await readJSON(req)));

  if (method === "POST" && path === "/v1/beheer/push") return reply(200, await broadcast(env, await readJSON(req), queue));

  // Toestel-ID from the app (support): find the install and its push registration, or send it a test.
  m = path.match(/^\/v1\/beheer\/toestel\/([0-9A-Fa-f-]{6,9})$/);
  if (method === "GET" && m) return reply(200, await zoekToestel(env, m[1]));
  m = path.match(/^\/v1\/beheer\/toestel\/([0-9A-Fa-f-]{6,9})\/test$/);
  if (method === "POST" && m) return reply(200, await testToestel(env, m[1]));

  // Reports from users that an alert is wrong.
  if (method === "GET" && path === "/v1/beheer/feedback") return reply(200, await feedbackLijst(env, url));
  m = path.match(/^\/v1\/beheer\/feedback\/(\d+)$/);
  if (m && (method === "POST" || method === "PATCH")) return reply(200, await updateFeedback(env, Number(m[1]), await readJSON(req)));
  if (m && method === "DELETE") return reply(200, await deleteFeedback(env, Number(m[1])));
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

  // Status: the same overview with the raw errors, plus outages and maintenance.
  if (method === "GET" && path === "/v1/beheer/status") return reply(200, await statusOverzicht(env, { beheer: true }));
  if (method === "POST" && path === "/v1/beheer/status/incidenten") {
    try { return reply(200, await maakIncident(env, await readJSON(req))); } catch (e) { return reply(e.status || 500, { error: e.message }); }
  }
  m = path.match(/^\/v1\/beheer\/status\/incidenten\/(\d+)$/);
  if (m && method === "POST") { const r = await updateIncident(env, Number(m[1]), await readJSON(req)); return r ? reply(200, r) : reply(404, { error: "Not found" }); }
  if (m && method === "DELETE") { await verwijderIncident(env, Number(m[1])); return reply(200, { ok: true }); }

  if (method === "POST" && path === "/v1/beheer/devices") {
    const body = await readJSON(req);
    await registerAdminDevice(env, body);
    await setAdminPrefs(env, String(body.token || "").toLowerCase(), body);
    return reply(200, { ok: true });
  }
  if (method === "POST" && path === "/v1/beheer/devices/test") {
    return reply(200, await pushAdmins(env, "A-Alerts-beheer", "Testmelding: meldingen van het A-Alerts-beheer werken. ✅"));
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
    const res = await fetch(env.P2000_PAGE_API_URL, { headers: { accept: "application/json", "user-agent": "A-Alerts/2.0 (+https://a-alerts.nl)" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const parsed = (Array.isArray(list) ? list : []).map(fromFeed).filter(Boolean);
    const known = await knownGuids(env, parsed.map((m) => m.guid));
    const fresh = parsed.filter((m) => !known.has(m.guid));
    for (const m of fresh) {
      // A hectometre post on a motorway ("A50 Re 211,2"): the spot of that post itself.
      const paal = hmPaal(m.title);
      const hp = paal && budget.left > 20 ? await hmPunt(env, budget, paal) : null;
      if (hp) { [m.lat, m.lon] = hp; continue; }
      // Precise coordinates for the street (keep a few requests over for the pushes).
      // Only a street name: the middle of that street from the road register (PDOK), so the marker is on the street.
      // Not when the source says it is a crossing: then its own coordinate is the crossing itself.
      const kruising = String(m.vlaggen || "").includes("kruising") && m.lat != null;
      if (kruising) continue;
      const sp = m.locatie && budget.left > 20 ? await straatPunt(env, budget, m.locatie, m.stad) : null;
      if (sp) { [m.lat, m.lon] = sp; continue; }
      if (m.locatie && budget.left > 20 && budget.take()) {
        const c = await geocode(env, m.locatie, m.stad);
        if (c) [m.lat, m.lon] = c;
      }
    }
    // Which incident does each new alert belong to? (guid of the first alert of that incident)
    if (fresh.length) {
      try { kenToe(fresh, (await recenteVoorIncident(env)).filter((r) => r.incident)); }
      catch (e) { console.warn("[incident]", e.message || e); for (const m of fresh) m.incident ||= m.guid; }
    }
    if (fresh.length) await env.DB.batch(fresh.map((m) => insertStmt(env, m)));
    // Figures per station: one row per station per incident.
    if (fresh.length) { try { await noteerPosten(env, fresh); } catch (e) { console.warn("[posten]", e.message || e); } }
    // Earlier messages on a motorway that are not on their post yet.
    // Only after a new alert, and otherwise once per 15 minutes (a lookup that failed earlier gets another chance).
    if (budget.left > 20 && (fresh.length || Date.now() - hmLaatst > 15 * 60_000)) {
        hmLaatst = Date.now();
        try { await hmHerstel(env, budget); } catch (e) { console.warn("[hm herstel]", e.message || e); }
        try { await straatHerstel(env, budget); } catch (e) { console.warn("[straat herstel]", e.message || e); }
        try { await categorieHerstel(env); } catch (e) { console.warn("[categorie herstel]", e.message || e); }
        try { await incidentHerstel(env); } catch (e) { console.warn("[incident herstel]", e.message || e); }
        try { await postenInhalen(env); } catch (e) { console.warn("[posten inhalen]", e.message || e); }
    }
    await kvSet(env, "feed_ok", String(Date.now()));
    await env.DB.prepare("DELETE FROM kv WHERE key = 'feed_error'").run();

    // Queue pushes for new, recent alerts (oldest first).
    const recent = fresh.filter((m) => Date.now() - m.datum < 15 * 60_000).sort((a, b) => a.datum - b.datum);
    if (recent.length) {
      const devices = await activeDevices(env);
      const prefs = await devicePrefs(env);
      for (const m of recent) await queue(env, m.guid, devices.filter((d) => meldingWanted(d, prefs.get(d.token), m) || grootWanted(d, prefs.get(d.token), m)).map((d) => d.token));
    }
  } catch (e) {
    await kvSet(env, "feed_error", String(e.message || e));
    console.error("[ingest]", e.message || e);
  }
}

/** Broadcast (beheer) or take-off push; the latter has an English text and the helicopter. */
function broadcastPayload(b, lang) {
  const t = b.en && !String(lang || "nl").startsWith("nl") ? b.en : b;
  return {
    aps: { alert: { title: t.title, body: t.body }, sound: "default", ...(b.heli ? { "thread-id": "lifeliner", "interruption-level": "time-sensitive" } : {}) },
    ...(b.guid ? { guid: b.guid } : {}),
    ...(b.heli ? { heli: b.heli } : {}),
  };
}

/** The alert push; a large incident gets "Groot incident" in front of the title. */
function meldingPayload(m, lang) {
  const p = payloadFor(m, lang);
  if (isGrootIncident(m)) {
    p.aps.alert.title = `${String(lang || "nl").startsWith("nl") ? "Groot incident" : "Large incident"} · ${p.aps.alert.title}`;
    p.groot = true;
  }
  return p;
}

async function drain(env, budget) {
  if (budget.left <= 0) return;
  const { results } = await env.DB.prepare(`
    SELECT o.guid, o.token, o.created_at, d.environment, d.language FROM outbox o JOIN devices d ON d.token = o.token
    ORDER BY o.created_at LIMIT ?`).bind(budget.left).all();
  if (!results.length) return;
  const items = new Map();
  for (const row of results) {
    if (!items.has(row.guid)) {
      if (row.guid.startsWith("w:")) {
        const [, kind, ...rest] = row.guid.split(":");
        const w = await getWarning(env, rest.join(":"));
        items.set(row.guid, w ? { warning: w, kind } : null);
      } else if (row.guid.startsWith("n:")) {
        const [, kind, id, uid] = row.guid.split(":");
        const item = await env.DB.prepare("SELECT id, soort, bron, titel, plaats FROM nieuws WHERE id = ? AND hidden = 0").bind(id).first();
        const update = kind === "a" ? await env.DB.prepare("SELECT titel, tekst FROM nieuws_updates WHERE id = ?").bind(Number(uid)).first() : null;
        items.set(row.guid, item && (kind !== "a" || update) ? { nieuws: item, kind, update } : null);
      } else if (row.guid.startsWith("broadcast:")) {
        const b = await kvGet(env, row.guid);
        items.set(row.guid, b ? { broadcast: JSON.parse(b.value) } : null);
      } else {
        const m = await getMelding(env, row.guid);
        items.set(row.guid, m ? { melding: { ...m, datum: Date.parse(m.datum_tijd) } } : null);
      }
    }
  }
  const verstuurd = [];
  await Promise.all(results.map(async (row) => {
    const item = items.get(row.guid);
    const done = env.DB.prepare("DELETE FROM outbox WHERE guid = ? AND token = ?").bind(row.guid, row.token);
    if (!item || !budget.take()) { if (!item) await done.run(); return; }
    const r = item.nieuws
      ? await sendPush(env, row, payloadVoorNieuws(item.nieuws, row.language, item.kind, item.update), { collapseId: row.guid.slice(-64) })
      : item.warning
      ? await sendPush(env, row, payloadForWarning(item.warning, row.language, { kind: item.kind }),
        { urgent: ["amber", "vermistkind"].includes(item.warning.bron) ? item.kind !== "a" : item.kind !== "g" && (item.warning.bron === "nlalert" || item.warning.niveau === "red"),
          collapseId: item.warning.id.slice(0, 64) })
      : item.melding
      ? await sendPush(env, row, meldingPayload(item.melding, row.language), { urgent: isUrgent(item.melding), collapseId: row.guid })
      : await sendPush(env, row, broadcastPayload(item.broadcast, row.language), item.broadcast.heli ? { collapseId: row.guid.slice(-64) } : {});
    const dead = isDeadToken(r);
    verstuurd.push({ platform: row.token.startsWith("fcm:") ? "android" : "apple", ok: r.ok, dead, latency: item.melding && r.ok ? Date.now() - row.created_at : null });
    if (dead) await deleteDevice(env, row.token);
    else if (!r.ok) {
      console.warn("[push]", row.token.slice(0, 8), r.status, r.reason);
      // Last failure (no token) for the beheer: which platform, what Apple/Google said.
      await kvSet(env, "push_laatste_fout", JSON.stringify({ at: new Date().toISOString(), platform: row.token.startsWith("fcm:") ? "android" : row.environment, status: r.status, reason: r.reason || null, soort: row.guid.split(":")[0] }));
    }
    await done.run();
  }));
  try { await notePushes(env, verstuurd); } catch (e) { console.error("[status]", e.message || e); }
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

/** NL-Alert, Burgernet and KNMI: read once per run, queue pushes for new warnings (and KNMI upgrades). */
async function warnings(env, budget) {
  const kv = { get: (k) => kvGet(env, k), set: (k, v) => kvSet(env, k, v) };
  const toPush = await ingestWarnings(env, budget, kv);
  try { await recordBronnen(env, JSON.parse((await kvGet(env, "warnings_status"))?.value || "{}")); } catch (e) { console.error("[bronnen]", e.message || e); }
  if (!toPush.length) return;
  const devices = await activeDevices(env);
  const prefs = await devicePrefs(env);
  for (const { id, upgrade, kind = upgrade ? "u" : "n", levels } of toPush) {
    const w = await getWarning(env, id);
    if (!w) continue;
    const wr = { ...w, gebied: w.gebied };
    // "v" (one hour before) and "g" (lifted) only for devices that keep those on; "g" for anyone who wanted one of its codes.
    const extra = (p) => kind === "v" ? p?.knmiVooraf !== false : kind === "g" ? p?.knmiOpgeheven !== false : true;
    const tokens = devices.filter((d) => {
      const p = prefs.get(d.token);
      if (!extra(p)) return false;
      return kind === "g" ? (levels || [w.niveau]).some((niveau) => warningWanted(d, p, { ...wr, niveau, status: "actief" })) : warningWanted(d, p, wr);
    }).map((d) => d.token);
    if (tokens.length) await queue(env, `w:${kind}:${id}`, tokens);
  }
}

/** Queues a push for a news item: "p" new police article, "a" message from the beheer (update id). Returns the number of devices. */
async function pushNieuws(env, id, kind, updateId = 0) {
  const row = await env.DB.prepare("SELECT id, soort, bron, ref, titel, plaats, data FROM nieuws WHERE id = ? AND hidden = 0").bind(id).first();
  if (!row) return 0;
  const data = JSON.parse(row.data || "{}");
  const item = { ...row, plaatsen: data.plaatsen || null };
  const warning = row.soort === "politie" || row.soort === "regionaal" ? null : await getWarning(env, row.ref);
  const tokens = nieuwsOntvangers(await activeDevices(env), await devicePrefs(env), item, warningWanted, warning);
  if (tokens.length) await queue(env, `n:${kind}:${id}:${updateId}`, tokens);
  return tokens.length;
}

/** Tab Nieuws: police news every 10 minutes, weather articles and liveblogs follow the warnings. */
async function nieuwsRun(env, budget) {
  const kv = { get: (k) => kvGet(env, k), set: (k, v) => kvSet(env, k, v) };
  // One time: read everything again with the stricter place filter (title, intro and area only).
  if (!(await kvGet(env, "nieuws_v2"))) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM nieuws WHERE soort = 'politie' AND foto IS NULL AND hidden = 0 AND id NOT IN (SELECT nieuws_id FROM nieuws_updates)"),
      env.DB.prepare("DELETE FROM kv WHERE key IN ('nieuws_politie_at', 'nieuws_sync')"),
    ]);
    await kvSet(env, "nieuws_v2", "1");
  }
  // One time: existing weather articles in the new layout (like knmi.nl).
  if (!(await kvGet(env, "nieuws_weer_v4"))) {
    try { await syncWaarschuwingen(env, kv, Date.now(), { alleWeer: true }); await kvSet(env, "nieuws_weer_v4", "1"); }
    catch (e) { console.error("[nieuws-weer-v3]", e.message || e); }
  }
  try { await syncWaarschuwingen(env, kv); } catch (e) { console.error("[nieuws-sync]", e.message || e); }
  try { await kiesStockFotos(env); } catch (e) { console.error("[nieuws-foto]", e.message || e); }
  try {
    for (const id of await syncPolitie(env, budget, kv)) {
      await env.DB.prepare("UPDATE nieuws SET notified = '1' WHERE id = ?").bind(id).run();
      await pushNieuws(env, id, "p");
    }
  } catch (e) {
    await kvSet(env, "nieuws_politie_status", JSON.stringify({ ok: false, at: Date.now(), fout: String(e.message || e) }));
    console.error("[nieuws-politie]", e.message || e);
  }
  // 112 Nieuws: title and intro per place, with permission (never their photos).
  try {
    for (const id of await sync112(env, budget, kv)) {
      await env.DB.prepare("UPDATE nieuws SET notified = '1' WHERE id = ?").bind(id).run();
      await pushNieuws(env, id, "p");
    }
  } catch (e) { console.error("[nieuws-112]", e.message || e); }
}

/** Stores the helicopter positions and queues a push when a Lifeliner takes off for an alert in Apeldoorn. */
/**
 * Alerts of the last two days (not the ambulance: those go by priority) get their category worked out again with the
 * current rules, so a fix of a rule also reaches alerts that are in already. Only rows that really change are written.
 */
async function categorieHerstel(env) {
  const { results } = await env.DB.prepare(
    "SELECT guid, title, full_melding, dienst, prioriteit, categorie, locatie FROM meldingen WHERE datum > ? AND dienst != 'ambulance' ORDER BY datum DESC LIMIT 150",
  ).bind(Date.now() - 2 * 86400_000).all();
  for (const r of results || []) {
    const nieuw = categorie(r.dienst, r.prioriteit, r.full_melding || r.title || "", r.locatie);
    if (nieuw && nieuw !== r.categorie) await env.DB.prepare("UPDATE meldingen SET categorie = ? WHERE guid = ?").bind(nieuw, r.guid).run();
  }
}

async function heliRun(env) {
  const data = await helikopters(env);
  await noteHeli(env, !data.fout);
  const { prev } = await recordPositions(env, data);
  let luchtPrev = new Map();
  try { luchtPrev = (await recordLucht(env, data.lucht)).prev; } catch (e) { console.warn("[lucht spoor]", e.message || e); }
  if (!prev || data.fout) return;
  let devices = null, prefs = null;
  // The bell on one aircraft: a push when a followed helicopter or aircraft takes off.
  try {
    const vliegend = [...(data.helikopters || []), ...(data.lucht || [])];
    const vorige = new Map([...luchtPrev, ...[...prev].map(([id, p]) => [id, { at: p.at, grond: p.grond }])]);
    const kandidaat = vliegend.some((h) => {
      const p = vorige.get(h.id);
      if (h.lat == null) return false;
      return h.op_grond ? Boolean(p && p.grond === 0 && Date.now() - p.at <= 15 * 60_000) : (!p || p.grond === 1 || Date.now() - p.at > 15 * 60_000);
    });
    if (kandidaat) {
      devices ||= await activeDevices(env);
      prefs ||= await devicePrefs(env);
      // When did the followed aircraft land last? (kept for 90 minutes, to tell a flight back from a new call-out)
      const gevolgd = new Set([...prefs.values()].flatMap((p) => p?.heli?.volg || []));
      const geland = new Map();
      for (const h of vliegend) {
        if (!gevolgd.has(h.id)) continue;
        const p = vorige.get(h.id);
        if (h.op_grond && p && p.grond === 0) await kvSet(env, `heli_land:${h.id}`, String(Date.now()));
        else if (!h.op_grond) { const l = await kvGet(env, `heli_land:${h.id}`); if (l) geland.set(h.id, Number(l.value)); }
      }
      for (const g of volgPushes(devices, prefs, vliegend, vorige, Date.now(), geland)) {
        if (await kvGet(env, `broadcast:${g.key}`)) continue;
        await kvSet(env, `broadcast:${g.key}`, JSON.stringify({ ...g.texts.nl, en: g.texts.en, heli: g.heli }));
        await queue(env, `broadcast:${g.key}`, g.tokens);
      }
    }
  } catch (e) { console.error("[heli-volg]", e.message || e); }
  // Helicopter zones: take-off, landing or entering a zone of a device.
  try {
    const events = heliEvents(data.helikopters || [], prev);
    if (events.length) {
      devices ||= await activeDevices(env);
      prefs ||= await devicePrefs(env);
      for (const g of heliZonePushes(devices, prefs, events)) {
        if (await kvGet(env, `broadcast:${g.key}`)) continue;
        await kvSet(env, `broadcast:${g.key}`, JSON.stringify({ ...g.texts.nl, en: g.texts.en, heli: g.heli, zone: true }));
        await queue(env, `broadcast:${g.key}`, g.tokens);
      }
    }
    const lucht = (data.helikopters || []).filter((h) => h.soort === "trauma");
    if (lucht.length) {
      const meldingen = await recenteHeliMeldingen(env);
      await noteerTerPlaatse(env, lucht, meldingen);
      // A Lifeliner that turned back before it reached its alert: probably cancelled (P2000 sends no cancellation).
      if (meldingen.length) {
        for (const x of await volgInzetten(env, lucht, meldingen, await terPlaatseSet(env))) {
          devices ||= await activeDevices(env);
          prefs ||= await devicePrefs(env);
          const g = inzetPush(devices, prefs, x);
          if (!g.tokens.length || await kvGet(env, `broadcast:${g.key}`)) continue;
          await kvSet(env, `broadcast:${g.key}`, JSON.stringify({ ...g.texts.nl, en: g.texts.en, heli: g.heli, guid: g.guid }));
          await queue(env, `broadcast:${g.key}`, g.tokens);
        }
      }
    }
  } catch (e) { console.error("[heli-zones]", e.message || e); }
  await checkOpstijgen(env, data.helikopters || [], prev, async (m, key, texts) => {
    devices ||= await activeDevices(env);
    prefs ||= await devicePrefs(env);
    const melding = { ...m, datum: Date.parse(m.datum_tijd) };
    const tokens = devices.filter((d) => meldingWanted(d, prefs.get(d.token), melding)).map((d) => d.token);
    if (!tokens.length) return;
    await kvSet(env, `broadcast:${key}`, JSON.stringify({ ...texts.nl, en: texts.en, guid: m.guid, heli: texts.heli }));
    await queue(env, `broadcast:${key}`, tokens);
  });
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
    try { await notifyHomey(env, budget); } catch (e) { console.error("[homey]", e.message || e); }
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
  try { await warnings(env, budget); } catch (e) { console.error("[waarschuwingen]", e.message || e); }
  await nieuwsRun(env, budget);
  try { await verkeerRun(env, budget); } catch (e) { console.error("[verkeer]", e.message || e); }
  const homey = async () => { try { await notifyHomey(env, budget); } catch (e) { console.error("[homey]", e.message || e); } };
  await homey();
  // Five reads per minute: new alerts show up (and are pushed) within ~12 seconds.
  const runs = Number(env.POLLS_PER_RUN || 5);
  for (let i = 0; i < runs; i++) {
    await poll(env, budget);
    await drain(env, budget);
    await homey();
    // Helicopters: the first read of the minute always runs (also on a busy morning when the budget is used up by
    // alerts and pushes), the later ones when there is budget left.
    if (i % 2 === 0) { try { if (i === 0 || budget.take()) await heliRun(env); } catch (e) { console.error("[spoor]", e.message || e); } }
    if (i < runs - 1) await sleep(Math.floor(57_000 / runs));
  }
  // Status page and beheer pushes (replaces the old P2000 and source outage checks).
  try { await checkWebsite(env, budget); await statusTick(env, pushAdmins); } catch (e) { console.error("[status]", e.message || e); }
  if (new Date(event.scheduledTime).getUTCMinutes() === 7) {
    await housekeeping(env, Number(env.RETENTION_DAYS || 3));
    await warningsHousekeeping(env);
    try { await nieuwsHousekeeping(env); } catch (e) { console.error("[nieuws]", e.message || e); }
    await env.DB.prepare("DELETE FROM melding_routes WHERE at < ?").bind(Date.now() - 14 * 86_400_000).run().catch(() => {});
    await env.DB.prepare("DELETE FROM melding_feedback WHERE at < ?").bind(Date.now() - 90 * 86_400_000).run().catch(() => {});
    await env.DB.prepare("DELETE FROM kv WHERE (key LIKE 'heli_scene:%' OR key LIKE 'heli_inzet:%' OR key LIKE 'heli_land:%' OR key LIKE 'broadcast:hz:%' OR key LIKE 'broadcast:hx:%' OR key LIKE 'broadcast:hl:%') AND at < ?").bind(Date.now() - 86_400_000).run().catch(() => {});
    try { await spoorHousekeeping(env); await heliPlusHousekeeping(env); } catch (e) { console.error("[spoor]", e.message || e); }
    await adminHousekeeping(env);
    try { await statusHousekeeping(env); } catch (e) { console.error("[status]", e.message || e); }
    await widgetHousekeeping(env).catch(() => {});
  }
}

export default {
  async fetch(req, env, ctx) {
    try {
      // Backup for the cron: an API call also reads the feed when the last read is over 45 s old.
      if (req.method === "GET" && new URL(req.url).pathname.startsWith("/v1/meldingen")) ctx.waitUntil(catchUp(env));
      return await handle(req, env, ctx);
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
