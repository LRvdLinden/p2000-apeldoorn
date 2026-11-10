// Traffic in the region (closures, roadworks, accidents, breakdowns, jams and fixed speed cameras) from the separate
// A-Alerts verkeer service on Koyeb (repo LRvdLinden/a-alerts_file_verkeer_info), which reads the NDW open data.
// The NDW file is too big to read within the CPU limit of this Worker, so the service does that and this Worker asks
// for the small result once a minute (which also keeps the free Koyeb instance awake).
// Secrets: VERKEER_URL (https://<name>.koyeb.app) and VERKEER_TOKEN. Without them the layer is simply empty.
import { kvWrite } from "./kv.js";

const KEY = "verkeer";
export const verkeerConfigured = (env) => Boolean(env.VERKEER_URL && env.VERKEER_TOKEN);

async function lees(env) {
  const v = (await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(KEY).first())?.value;
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}

/** Once a minute from the cron: the list from the service, stored when it changed (ETag, 304 otherwise). */
export async function verkeerRun(env, budget) {
  if (!verkeerConfigured(env)) return { ok: false, reden: "niet ingesteld" };
  if (budget && !budget.take()) return { ok: false, reden: "budget" };
  const now = Date.now();
  try {
    const r = await ophalen(env, now);
    // The service answers, but its NDW data is old: the NDW (or the service's read) is failing.
    if (r.ndwOud) await kvWrite(env, "bron_fout:verkeer", `NDW-gegevens zijn ${Math.round(r.ndwOud / 60_000)} min oud`, now);
    else await kvWrite(env, "bron_ok:verkeer", String(now), now);
    return r;
  } catch (e) {
    await kvWrite(env, "bron_fout:verkeer", String(e.message || e), now);
    throw e;
  }
}

async function ophalen(env, now) {
  const oud = await lees(env);
  const res = await fetch(`${String(env.VERKEER_URL).replace(/\/+$/, "")}/verkeer`, {
    headers: { authorization: `Bearer ${env.VERKEER_TOKEN}`, ...(oud?.etag ? { "if-none-match": oud.etag } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const ndwOud = (d) => { const t = Date.parse(d?.opgehaald || 0) || 0; return t && now - t > 10 * 60_000 ? now - t : 0; };
  if (res.status === 304) return { ok: true, nieuw: false, ndwOud: ndwOud(oud?.data) };
  if (!res.ok) throw new Error(`verkeer HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.items)) throw new Error("verkeer: geen lijst");
  await kvWrite(env, KEY, JSON.stringify({ etag: res.headers.get("etag"), at: Date.now(), data }));
  return { ok: true, nieuw: true, items: data.items.length, ndwOud: ndwOud(data) };
}

/** GET /v1/verkeer: the traffic layer for the apps, the website and Homey. */
export async function verkeer(env) {
  const v = await lees(env);
  if (!v?.data) return { beschikbaar: verkeerConfigured(env), bijgewerkt: null, items: [], gepland: [], flitsers: [] };
  const { bijgewerkt, opgehaald, items, flitsers, gepland } = v.data;
  // Older than 15 minutes: the service is down; then no items (an old accident on the map is worse than none).
  const oud = Date.now() - (Date.parse(opgehaald || 0) || v.at || 0) > 15 * 60_000;
  return { beschikbaar: true, bijgewerkt, verouderd: oud, items: oud ? [] : items, gepland: gepland || [], flitsers: flitsers || [],
    bron: "NDW open data (Rijkswaterstaat, provincies en gemeenten); flitsers © OpenStreetMap-bijdragers" };
}
