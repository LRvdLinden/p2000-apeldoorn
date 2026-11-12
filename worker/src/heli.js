// Live positions of the Dutch trauma helicopters (Lifeliner 1–4) and police helicopters (Zulu) from adsb.lol.
// Data: adsb.lol, Open Database License (ODbL). One request for the whole of the Netherlands, cached briefly
// so many apps polling at the same time cost one upstream call.

import { luchtLijst, luchtGeleerd, luchtLeer } from "./lucht.js";

export const HELIS = [
  { id: "lifeliner1", naam: "Lifeliner 1", soort: "trauma", basis: "Amsterdam", callsigns: ["LIFELN1", "LIFELN01"] },
  { id: "lifeliner2", naam: "Lifeliner 2", soort: "trauma", basis: "Rotterdam", callsigns: ["LIFELN2", "LIFELN02"] },
  { id: "lifeliner3", naam: "Lifeliner 3", soort: "trauma", basis: "Volkel", callsigns: ["LIFELN3", "LIFELN03"] },
  { id: "lifeliner4", naam: "Lifeliner 4", soort: "trauma", basis: "Groningen", callsigns: ["LIFELN4", "LIFELN04"] },
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
let memo = null;

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
    const h = identify(ac, learned);
    if (!h || typeof ac.lat !== "number" || typeof ac.lon !== "number") continue;
    const seen = Number(ac.seen_pos ?? ac.seen ?? 0);
    const item = {
      id: h.id, naam: h.naam, soort: h.soort, basis: h.basis || null, herkenning: h.herkenning,
      callsign: String(ac.flight || "").trim() || null, registratie: ac.r || null, type: ac.t || null, hex: ac.hex || null,
      lat: ac.lat, lon: ac.lon,
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
    const value = JSON.stringify({ id: h.id, naam: h.naam, soort: h.soort, basis: h.basis || null, callsigns: [] });
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(`heli_hex:${hex}`, value, Date.now()).run();
    } catch (e) { console.warn("[heli] learn", e.message || e); }
  }
}

let omwegTot = 0; // until when adsb.lol is read via the verkeer service (after a refusal)
export async function helikopters(env) {
  if (memo && Date.now() - memo.at < TTL) return memo.data;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request("https://cache.a-alerts.internal/helikopters");
  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const data = await hit.json();
      memo = { at: Date.now(), data };
      return data;
    }
  }
  let data;
  try {
    const direct = () => fetch(`https://api.adsb.lol/v2/point/${POINT.lat}/${POINT.lon}/${POINT.nm}`, {
      headers: { accept: "application/json", "user-agent": "A-Alerts/1.0 (+https://a-alerts.nl)" },
      signal: AbortSignal.timeout(8_000),
    });
    // adsb.lol sometimes refuses Cloudflare's shared addresses (HTTP 429). Then the same request goes via the A-Alerts
    // verkeer service (own address, VERKEER_URL/VERKEER_TOKEN), and for 10 minutes straight there.
    const viaService = () => fetch(`${String(env.VERKEER_URL).replace(/\/+$/, "")}/adsb?lat=${POINT.lat}&lon=${POINT.lon}&nm=${POINT.nm}`, {
      headers: { authorization: `Bearer ${env.VERKEER_TOKEN}` }, signal: AbortSignal.timeout(12_000),
    });
    const kanService = Boolean(env?.VERKEER_URL && env?.VERKEER_TOKEN);
    let res = null;
    if (!(kanService && Date.now() < omwegTot)) {
      res = await direct().catch(() => null);
      if (!res?.ok && kanService) omwegTot = Date.now() + 10 * 60_000;
    }
    if (!res?.ok && kanService) res = await viaService().catch(() => null);
    if (!res?.ok && !kanService) { await new Promise((r) => setTimeout(r, 1500)); res = await direct(); }
    if (!res?.ok) throw new Error(`HTTP ${res?.status ?? "geen antwoord"}`);
    const body = await res.json();
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
    data = { bijgewerkt: new Date().toISOString(), bron: "adsb.lol (ODbL)", helikopters: list, lucht };
  } catch (e) {
    console.warn("[heli]", e.message || e);
    // Show the last positions for a short while instead of an empty map.
    if (memo && Date.now() - memo.at < 120_000) return { ...memo.data, verouderd: true };
    return { bijgewerkt: new Date().toISOString(), bron: "adsb.lol (ODbL)", helikopters: [], fout: true };
  }
  memo = { at: Date.now(), data };
  if (cache) {
    await cache.put(key, new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": `max-age=${TTL / 1000}` } }));
  }
  return data;
}
