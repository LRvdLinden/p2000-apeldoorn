// Live positions of the Dutch trauma helicopters (Lifeliner 1–4) and police helicopters (Zulu) from adsb.lol.
// Data: adsb.lol, Open Database License (ODbL). One request for the whole of the Netherlands, cached briefly
// so many apps polling at the same time cost one upstream call.

import { NOOIT_TONEN, luchtLijst, luchtGeleerd, luchtLeer, positie, vulAan } from "./lucht.js";
import { plaatsBij } from "./plaats.js";

export const HELIS = [
  { id: "lifeliner1", naam: "Lifeliner 1", soort: "trauma", basis: "Amsterdam", callsigns: ["LIFELN1", "LIFELN01"] },
  { id: "lifeliner2", naam: "Lifeliner 2", soort: "trauma", basis: "Rotterdam", callsigns: ["LIFELN2", "LIFELN02"] },
  { id: "lifeliner3", naam: "Lifeliner 3", soort: "trauma", basis: "Volkel", callsigns: ["LIFELN3", "LIFELN03"] },
  { id: "lifeliner4", naam: "Lifeliner 4", soort: "trauma", basis: "Groningen", callsigns: ["LIFELN4", "LIFELN04"] },
  // Medic 01: the ambulance helicopter for the Wadden islands. Not a trauma helicopter with a doctor on board, so it
  // never counts as a Lifeliner for a P2000 alert (medic: true). For the apps it keeps soort "trauma" (same drawing).
  { id: "medic01", naam: "Medic 01", soort: "trauma", medic: true, basis: "Leeuwarden", callsigns: ["MEDIC01", "MEDIC1"], regs: ["PH-OOP"] },
  { id: "zulu01", naam: "Zulu 01", soort: "politie", callsigns: ["ZXP01"], regs: ["PH-PXA"] },
  { id: "zulu02", naam: "Zulu 02", soort: "politie", callsigns: ["ZXP02"], regs: ["PH-PXB"] },
  { id: "zulu03", naam: "Zulu 03", soort: "politie", callsigns: ["ZXP03"], regs: ["PH-PXC"] },
  { id: "zulu04", naam: "Zulu 04", soort: "politie", callsigns: ["ZXP04"], regs: ["PH-PXD"] },
  { id: "zulu05", naam: "Zulu 05", soort: "politie", callsigns: ["ZXP05"], regs: ["PH-PXE"] },
  { id: "zulu06", naam: "Zulu 06", soort: "politie", callsigns: ["ZXP06"], regs: ["PH-PXF"] },
  { id: "zulu24", naam: "Zulu 24", soort: "politie", callsigns: ["ZXP24"], regs: ["PH-PXX"] },
  { id: "zulu25", naam: "Zulu 25", soort: "politie", callsigns: ["ZXP25"], regs: ["PH-PXY"] },
  { id: "zulu26", naam: "Zulu 26", soort: "politie", callsigns: ["ZXP26"], regs: ["PH-PXZ"] },
];

/** Netherlands: one circle around the centre of the country (radius in nautical miles). */
const POINT = { lat: 52.2, lon: 5.4, nm: 160 };
const TTL = 12_000;
/** adsb.lol answered 429 (out of requests): until then the reserve adsb.fi is asked directly. */
let adsbLolPauzeTot = 0;
let memo = null;
/** The last item of every aircraft in this isolate, to fill what a later answer leaves out. */
const laatste = new Map();

const HELI_TYPES = new Set(["EC35", "EC45", "A139", "H135", "H145", "EC30", "A169", "H160"]);
const byId = (id) => HELIS.find((h) => h.id === id) || null;

/**
 * Finds our helicopter for one adsb.lol aircraft. In order:
 *  1. the known callsign or registration;
 *  2. a callsign pattern (LIFELN3, LIFELINER3, ZXP25, ZULU25 …), so a new spelling still works;
 *  3. the airframe (ICAO hex) remembered from an earlier flight, when the crew flies under another callsign;
 *  4. the operator in the aircraft database (ANWB Medical Air Assistance, Politie) for a Dutch helicopter.
 * `learned` maps hex → helicopter (from the database); `herkenning` says which rule matched.
 */
export function identify(ac, learned = new Map()) {
  const cs = String(ac.flight || "").trim().toUpperCase();
  const reg = String(ac.r || "").trim().toUpperCase();
  const hex = String(ac.hex || "").trim().toLowerCase();
  const exact = HELIS.find((h) => (cs && h.callsigns.includes(cs)) || (reg && (h.regs || []).includes(reg)));
  if (exact) return { ...exact, herkenning: cs && exact.callsigns.includes(cs) ? "callsign" : "registratie" };

  let m = cs.match(/^(?:LIFELN|LIFELINER|LIFE)0?([1-9])$/);
  if (m && byId(`lifeliner${m[1]}`)) return { ...byId(`lifeliner${m[1]}`), herkenning: "callsign" };
  m = cs.match(/^MEDIC0?([1-9])$/);
  if (m) return { ...(byId(`medic0${m[1]}`) || { id: `medic0${m[1]}`, naam: `Medic 0${m[1]}`, soort: "trauma", medic: true, callsigns: [] }), herkenning: "callsign" };
  m = cs.match(/^(?:ZXP|ZULU|POLITIE)0?(\d{1,2})$/);
  if (m) {
    const nr = m[1].padStart(2, "0");
    return { ...(byId(`zulu${nr}`) || { id: `zulu${nr}`, naam: `Zulu ${nr}`, soort: "politie", callsigns: [] }), herkenning: "callsign" };
  }

  if (hex && learned.has(hex)) return { ...learned.get(hex), herkenning: "toestel" };

  const owner = `${ac.ownOp || ""} ${ac.desc || ""}`;
  const isHeli = HELI_TYPES.has(String(ac.t || "").toUpperCase()) || ac.category === "A7";
  if (isHeli && reg.startsWith("PH-")) {
    if (/ANWB|MEDICAL AIR|LIFELINER|TRAUMA/i.test(owner)) {
      return { id: `trauma-${hex || reg}`, naam: `Traumaheli ${reg}`, soort: "trauma", callsigns: [], herkenning: "operator" };
    }
    if (/POLITIE|POLICE|KLPD/i.test(owner)) {
      return { id: `politie-${hex || reg}`, naam: `Politieheli ${reg}`, soort: "politie", callsigns: [], herkenning: "operator" };
    }
  }
  return null;
}

/** Converts adsb.lol aircraft into the app's shape. */
export function fromAdsb(list, now = Date.now(), learned = new Map()) {
  const out = new Map();
  for (const ac of Array.isArray(list) ? list : []) {
    if (NOOIT_TONEN.has(String(ac?.hex || "").trim().toLowerCase())) continue;
    const h = identify(ac, learned);
    const p = positie(ac);
    if (!h || !p) continue;
    const seen = p.oud;
    const item = {
      id: h.id, naam: h.naam, soort: h.soort, ...(h.medic ? { medic: true } : {}), basis: h.basis || null, herkenning: h.herkenning,
      callsign: String(ac.flight || "").trim() || null, registratie: ac.r || null, type: ac.t || null, hex: ac.hex || null,
      lat: p.lat, lon: p.lon,
      koers: typeof ac.track === "number" ? Math.round(ac.track) : (typeof ac.true_heading === "number" ? Math.round(ac.true_heading) : null),
      hoogte_ft: typeof ac.alt_baro === "number" ? Math.round(ac.alt_baro) : null,
      op_grond: ac.alt_baro === "ground",
      snelheid_kt: typeof ac.gs === "number" ? Math.round(ac.gs) : null,
      stijgsnelheid_fpm: typeof ac.baro_rate === "number" ? Math.round(ac.baro_rate) : null,
      gezien: new Date(now - seen * 1000).toISOString(),
    };
    // Keep the freshest position when an aircraft shows up twice.
    const prev = out.get(h.id);
    if (!prev || prev.gezien < item.gezien) out.set(h.id, item);
  }
  return [...out.values()].sort((a, b) => a.naam.localeCompare(b.naam));
}

/** Airframes (ICAO hex) seen before under a known callsign or registration. */
async function loadLearned(env) {
  const map = new Map();
  if (!env?.DB) return map;
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM kv WHERE key LIKE 'heli_hex:%'").all();
    for (const r of results) {
      try { map.set(r.key.slice(9), JSON.parse(r.value)); } catch {}
    }
  } catch (e) { console.warn("[heli] learned", e.message || e); }
  return map;
}

/** Remember which airframe flew as which helicopter, so it is still recognised under another callsign. */
async function learn(env, list, learned) {
  if (!env?.DB) return;
  for (const h of list) {
    if (!h.hex || !["callsign", "registratie"].includes(h.herkenning)) continue;
    const hex = h.hex.toLowerCase();
    const prev = learned.get(hex);
    if (prev && prev.id === h.id) continue;
    const value = JSON.stringify({ id: h.id, naam: h.naam, soort: h.soort, ...(h.medic ? { medic: true } : {}), basis: h.basis || null, callsigns: [] });
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(`heli_hex:${hex}`, value, Date.now()).run();
    } catch (e) { console.warn("[heli] learn", e.message || e); }
  }
}

// Avoid map flicker during one or two missed ADS-B updates, but never display offline aircraft.
// Positions older than 90 seconds are removed from the public flight layer.
const AIRCRAFT_SNAPSHOT_KEY = "lucht:last-known-v1";
export const AIRCRAFT_HOLD_MS = 90_000;
const AIRCRAFT_STALE_MS = 60_000;
let snapshotMemo = null;
let snapshotReadAt = 0;
let snapshotWriteAt = 0;

export function retainAircraft(current, previous, now = Date.now(), failing = false) {
  const live = new Map();
  for (const h of current || []) {
    const at = Date.parse(h.gezien);
    if (!h?.id || !Number.isFinite(at) || now - at >= AIRCRAFT_HOLD_MS || at > now + 10_000) continue;
    live.set(h.id, { ...h, verouderd: now - at > AIRCRAFT_STALE_MS });
  }
  for (const h of previous || []) {
    if (!h?.id) continue;
    const at = Date.parse(h.gezien);
    if (!Number.isFinite(at) || now - at >= AIRCRAFT_HOLD_MS || at > now + 10_000) continue;
    const newer = live.get(h.id);
    // Never roll a track backwards because a delayed HTTP response has an older fix.
    if (!newer || Date.parse(newer.gezien) < at)
      live.set(h.id, { ...h, verouderd: now - at > AIRCRAFT_STALE_MS });
  }
  return [...live.values()].sort((a, b) => a.naam.localeCompare(b.naam));
}
async function readAircraftSnapshot(env) {
  if (snapshotMemo && Date.now() - snapshotReadAt < 25_000) return snapshotMemo;
  try {
    const row = await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(AIRCRAFT_SNAPSHOT_KEY).first();
    const saved = row ? JSON.parse(row.value) : null;
    snapshotMemo = saved && Array.isArray(saved.helikopters) && Array.isArray(saved.lucht) ? saved : { helikopters: [], lucht: [] };
    snapshotReadAt = Date.now();
  } catch (e) {
    console.warn("[lucht snapshot read]", e.message || e);
    snapshotMemo ||= { helikopters: [], lucht: [] };
    snapshotReadAt = Date.now();
  }
  return snapshotMemo;
}
async function preserveAircraft(env, fresh, failing = false) {
  const now = Date.now();
  const old = await readAircraftSnapshot(env);
  const h = retainAircraft(fresh.helikopters || [], old.helikopters, now, failing);
  const l = retainAircraft(fresh.lucht || [], old.lucht, now, failing);
  const result = { ...fresh, helikopters: h, lucht: l };
  // Avoid turning a momentary empty upstream answer into an empty visible map.
  // A missing flight is only removed when its authentic last-seen age exceeds the grace period.
  snapshotMemo = { helikopters: h, lucht: l };
  if (!failing) snapshotReadAt = now;
  if (!failing && now - snapshotWriteAt > 30_000 && (h.some(x => !x.verouderd) || l.some(x => !x.verouderd))) {
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)")
        .bind(AIRCRAFT_SNAPSHOT_KEY, JSON.stringify(snapshotMemo), now).run();
      snapshotWriteAt = now;
    } catch (e) { console.warn("[lucht snapshot write]", e.message || e); }
  }
  return result;
}

function onlyRecent(data) {
  if (!data) return data;
  const now = Date.now();
  return { ...data, helikopters: retainAircraft(data.helikopters, [], now), lucht: retainAircraft(data.lucht, [], now) };
}

export async function helikopters(env) {
  if (memo && Date.now() - memo.at < TTL) return onlyRecent(memo.data);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request("https://cache.a-alerts.internal/helikopters");
  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const data = await hit.json();
      memo = { at: Date.now(), data };
      return onlyRecent(data);
    }
  }
  let data;
  try {
    // adsb.lol now allows 500 requests a day per address (x-ratelimit-limit "500;w=86400"); the shared Cloudflare
    // addresses run out of that quickly. Then adsb.fi (same readsb format, "aircraft" instead of "ac") is the reserve.
    // Aircraft positions must NEVER depend on the unrelated NDW/traffic service: do not route them through VERKEER_URL.
    const haal = (url, extra = {}) => fetch(url, {
      headers: { accept: "application/json", "user-agent": "A-Alerts/1.0 (+https://a-alerts.nl)", ...extra },
      signal: AbortSignal.timeout(8_000),
    });
    let body = null, fout = null;
    if (Date.now() >= adsbLolPauzeTot) {
      try {
        const res = await haal(`https://api.adsb.lol/v2/point/${POINT.lat}/${POINT.lon}/${POINT.nm}`, env.ADSB_LOL_API_KEY ? { "api-auth": env.ADSB_LOL_API_KEY } : {});
        if (res.ok) body = await res.json();
        else {
          fout = `adsb.lol HTTP ${res.status}`;
          // Out of requests: rest until the reset it names (at most an hour), otherwise one minute.
          const reset = Number(res.headers.get("x-ratelimit-reset"));
          if (res.status === 429) adsbLolPauzeTot = Date.now() + (reset > 0 ? Math.min(reset, 3600) * 1000 : 60_000);
        }
      } catch (e) { fout = `adsb.lol ${e.message || e}`; }
    }
    let bron = "adsb.lol (ODbL)";
    if (!body || !Array.isArray(body.ac)) {
      const res = await haal(`https://opendata.adsb.fi/api/v2/lat/${POINT.lat}/lon/${POINT.lon}/dist/${POINT.nm}`).catch(() => null);
      if (res?.ok) {
        const fi = await res.json();
        // "now" is in seconds at some readsb services, in milliseconds at adsb.lol.
        const n = Number(fi?.now) || 0;
        body = { ac: fi?.ac || fi?.aircraft, now: n > 0 && n < 1e11 ? n * 1000 : n };
        bron = "adsb.fi";
      } else fout = `adsb.fi HTTP ${res?.status ?? "geen antwoord"}${fout ? `, ${fout}` : ""}`;
    }
    // Last reserve: the raw read of the own server api.a-alerts.nl (same adsb.lol/adsb.fi data, other address). adsb.lol
    // runs out of requests on the shared Cloudflare addresses and adsb.fi refuses some of them (HTTP 403), e.g. the cron.
    if (!body || !Array.isArray(body.ac)) {
      const res = await haal(`${env.AALERTS_API_EIGEN || "https://api.a-alerts.nl"}/v1/adsb`).catch(() => null);
      const ruw = res?.ok ? await res.json().catch(() => null) : null;
      if (!Array.isArray(ruw?.ac)) throw new Error(`ADS-B HTTP ${res?.status ?? "geen antwoord"} (api.a-alerts.nl; ${fout})`);
      body = { ac: ruw.ac, now: Number(ruw.now) || Date.now() };
      bron = ruw.bron === "adsb.fi" ? "adsb.fi" : "adsb.lol (ODbL)";
    }
    if (!body || !Array.isArray(body.ac)) throw new Error("Invalid ADS-B payload");
    const learned = await loadLearned(env);
    const list = fromAdsb(body.ac, Number(body.now) || Date.now(), learned);
    await learn(env, list, learned);
    // Defence and government aircraft (own map layer); the helicopters above are never repeated there.
    let lucht = [];
    try {
      const geleerd = await luchtGeleerd(env);
      lucht = luchtLijst(body.ac, Number(body.now) || Date.now(), new Set(list.map((h) => String(h.hex || "").toLowerCase())), geleerd);
      await luchtLeer(env, lucht, geleerd);
    } catch (e) { console.warn("[lucht]", e.message || e); }
    // "Now above …": the nearest Dutch place, or null above sea or abroad.
    // What this answer left out (weak reception): taken from the answer before it, at most three minutes old.
    vulAan([...list, ...lucht], laatste);
    for (const h of [...list, ...lucht]) laatste.set(h.id, { ...h });
    for (const [id, v] of laatste) if (Date.now() - Date.parse(v.gezien) > 600_000) laatste.delete(id);
    for (const h of [...list, ...lucht]) h.boven = h.op_grond ? null : plaatsBij(h.lat, h.lon)?.tekst || null;
    data = await preserveAircraft(env, { bijgewerkt: new Date().toISOString(), bron, helikopters: list, lucht });
  } catch (e) {
    console.warn("[heli]", e.message || e);
    // A failed provider request must not erase aircraft on the map. Persisted last-known
    // positions survive other Worker instances and deployments; never present them as live.
    const cached = await preserveAircraft(env, {
      bijgewerkt: new Date().toISOString(), bron: "adsb.lol (ODbL)",
      helikopters: [], lucht: [], fout: true, verouderd: true,
    }, true);
    memo = { at: Date.now(), data: cached };
    // Why it failed (for the status page and the beheer), never shown in the apps.
    return { ...cached, fout_tekst: String(e.message || e).slice(0, 160) };
  }
  memo = { at: Date.now(), data };
  if (cache) {
    try { await cache.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": `max-age=${TTL / 1000}` } })); } catch (e) { console.warn("[adsb edge cache]", e.message || e); }
  }
  return data;
}
