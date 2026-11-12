// A hectometre post in a P2000 message ("A50 Re 211,2") → its spot on the map.
// Source: PDOK Locatieserver (open data of the government), type hectometerpaal; the number there is in hectometres (211,2 km → 2112).
import { kvWrite } from "./kv.js";
import { distanceKm } from "./werkgebied.js";

const UA = { accept: "application/json", "user-agent": "A-Alerts/2.0 (+https://a-alerts.nl)" };
const HM_RE = /(?<![\p{L}\d])([AN])\s?(\d{1,3})\s+(?:(Re|Li|R|L)\s+)?(\d{1,3})[,.](\d)(?!\d)/iu;
const MIDDEN = [52.2112, 5.9699]; // Apeldoorn
const MAX_KM = 60;

/** "… A50 Re 211,2 Beemte Broekland" → { weg: "A50", hm: 2112, zijde: "Re" }, or null. */
export function hmPaal(tekst) {
  const m = String(tekst || "").match(HM_RE);
  if (!m) return null;
  const z = (m[3] || "").toLowerCase();
  return { weg: `${m[1].toUpperCase()}${m[2]}`, hm: Number(m[4]) * 10 + Number(m[5]), zijde: z.startsWith("r") ? "Re" : z.startsWith("l") ? "Li" : null };
}

/** The post without a letter is the main carriageway; posts with a letter are slip roads. */
export function kiesPaal(docs) {
  const punten = (docs || []).map((d) => {
    const m = String(d.centroide_ll || "").match(/POINT\((-?[\d.]+) (-?[\d.]+)\)/);
    return m ? { letter: d.hectometerletter || "", lat: Number(m[2]), lon: Number(m[1]) } : null;
  }).filter((p) => p && distanceKm(p.lat, p.lon, MIDDEN[0], MIDDEN[1]) <= MAX_KM);
  const p = punten.find((x) => !x.letter) || punten[0];
  return p ? [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5] : null;
}

/** [lat, lon] of the post, or null; cached in kv (a post does not move). */
export async function hmPunt(env, budget, paal) {
  const key = `hm:${paal.weg}|${paal.hm}`;
  const oud = (await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first())?.value;
  if (oud) return oud === "-" ? null : oud.split(",").map(Number);
  if (!budget.take()) return null;
  let punt = null;
  try {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${paal.weg}&fq=type:hectometerpaal&fq=wegnummer:${paal.weg}&fq=hectometernummer:${paal.hm}&rows=10&fl=weergavenaam,centroide_ll,hectometerletter`;
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    punt = kiesPaal((await res.json())?.response?.docs);
  } catch (e) { console.warn("[hm]", key, e.message || e); return null; }
  await kvWrite(env, key, punt ? punt.join(",") : "-");
  return punt;
}

/** Messages of the last 48 hours with a post in the title that are not on that post yet (at most `max` per round). */
export async function hmHerstel(env, budget, max = 5) {
  const { results } = await env.DB.prepare(
    "SELECT guid, title, lat, lon FROM meldingen WHERE datum > ? AND (title GLOB '*A[0-9]*[0-9][,.][0-9]*' OR title GLOB '*N[0-9]*[0-9][,.][0-9]*') ORDER BY datum DESC LIMIT 40",
  ).bind(Date.now() - 48 * 3600_000).all();
  let n = 0;
  for (const r of results || []) {
    if (n >= max) break;
    const paal = hmPaal(r.title);
    if (!paal) continue;
    const p = await hmPunt(env, budget, paal);
    if (!p || (r.lat === p[0] && r.lon === p[1])) continue;
    await env.DB.prepare("UPDATE meldingen SET lat = ?, lon = ? WHERE guid = ?").bind(p[0], p[1], r.guid).run();
    n++;
  }
  return n;
}
