// Above which Dutch place is this position? Nearest place centre from a fixed list (no outside request per position).
import PLAATSEN from "./woonplaatsen.js";

const RAD = Math.PI / 180;
/** Further than this from every place centre counts as "above sea or outside the Netherlands". */
const MAX_KM = 7;

/** { plaats, gemeente, tekst } of the nearest place, or null above sea or abroad. */
export function plaatsBij(lat, lon) {
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const c = Math.cos(lat * RAD);
  let best = null, bd = Infinity;
  for (const p of PLAATSEN) {
    const dy = p[2] - lat, dx = (p[3] - lon) * c;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = p; }
  }
  if (!best || Math.sqrt(bd) * 111.2 > MAX_KM) return null;
  const [plaats, gemeente] = best;
  return { plaats, gemeente, tekst: gemeente && gemeente !== plaats && !plaats.includes(gemeente) ? `${plaats}, ${gemeente}` : plaats };
}

/**
 * A flight as a readable list of places, newest first: [{ van, tot, plaats, gemeente }]. One line per stretch above a
 * place; a stretch shorter than 45 seconds is joined with its neighbours (no jumping back and forth between two
 * villages), and a short stretch above sea between two places is left out.
 */
export function plaatsenUit(punten) {
  const runs = [];
  for (const p of punten) {
    if (p.grond) continue;
    const at = typeof p.at === "number" ? p.at : Date.parse(p.t);
    const pl = plaatsBij(p.lat, p.lon);
    const key = pl ? `${pl.plaats}|${pl.gemeente}` : "";
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.tot = at;
    else runs.push({ key, van: at, tot: at, plaats: pl?.plaats || null, gemeente: pl?.gemeente || null });
  }
  // Drop short stretches: under 45 seconds above a place, under 3 minutes above sea.
  const lang = runs.filter((r, i) => i === runs.length - 1 || r.tot - r.van >= (r.key ? 45_000 : 180_000));
  const uit = [];
  for (const r of lang) {
    const last = uit[uit.length - 1];
    if (last && last.key === r.key) last.tot = r.tot;
    else uit.push({ ...r });
  }
  // Each stretch runs until the next one starts, so the times join up.
  for (let i = 0; i < uit.length - 1; i++) uit[i].tot = uit[i + 1].van;
  return uit.reverse().slice(0, 40).map((r) => ({ van: new Date(r.van).toISOString(), tot: new Date(r.tot).toISOString(), plaats: r.plaats, gemeente: r.gemeente }));
}
