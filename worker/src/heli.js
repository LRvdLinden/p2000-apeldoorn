// Live positions of the Dutch trauma helicopters (Lifeliner 1–4) and police helicopters (Zulu) from adsb.lol.
// Data: adsb.lol, Open Database License (ODbL). One request for the whole of the Netherlands, cached briefly
// so many apps polling at the same time cost one upstream call.

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

/** Finds our helicopter for one adsb.lol aircraft (by callsign or registration). */
export function identify(ac) {
  const cs = String(ac.flight || "").trim().toUpperCase();
  const reg = String(ac.r || "").trim().toUpperCase();
  return HELIS.find((h) => h.callsigns.includes(cs) || (h.regs || []).includes(reg)) || null;
}

/** Converts adsb.lol aircraft into the app's shape. */
export function fromAdsb(list, now = Date.now()) {
  const out = new Map();
  for (const ac of Array.isArray(list) ? list : []) {
    const h = identify(ac);
    if (!h || typeof ac.lat !== "number" || typeof ac.lon !== "number") continue;
    const seen = Number(ac.seen_pos ?? ac.seen ?? 0);
    const item = {
      id: h.id, naam: h.naam, soort: h.soort, basis: h.basis || null,
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
    const res = await fetch(`https://api.adsb.lol/v2/point/${POINT.lat}/${POINT.lon}/${POINT.nm}`, {
      headers: { accept: "application/json", "user-agent": "A-Alerts/1.0 (+https://p2000-apeldoorn.nl)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    data = { bijgewerkt: new Date().toISOString(), bron: "adsb.lol (ODbL)", helikopters: fromAdsb(body.ac, Number(body.now) || Date.now()) };
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
