// Hospitals and bases for the map, the prediction where a helicopter is heading, and the push when a
// Lifeliner takes off for an alert in gemeente Apeldoorn.
import locaties from "./locaties.js";
import { SELECT, toAPI as meldingAPI } from "./db.js";

const R = Math.PI / 180;
export const km = (a, b) => {
  const s = Math.sin(((b.lat - a.lat) * R) / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(((b.lon - a.lon) * R) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const bearing = (a, b) => {
  const y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
};
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

export function locatiesData() {
  return {
    bron: locaties.bron || "OpenStreetMap (ODbL)",
    ziekenhuizen: locaties.ziekenhuizen || [],
    bases: (locaties.bases || []).map(({ heli, ...b }) => ({ ...b, helikopters: heli })),
  };
}

/**
 * Where a helicopter in the air is probably heading: the hospital (with helipad) or its own base that lies
 * closest to its course. Trauma centres and the own base weigh a bit more. null when nothing fits the course.
 */
export function voorspel(h) {
  if (!h || h.op_grond || h.koers == null || (h.snelheid_kt ?? 0) < 50) return null;
  const isBase = (b) => (b.heli || []).some((x) => x === h.id || (x === "zulu" && h.soort === "politie"));
  const kandidaten = [
    ...(h.soort === "trauma" ? (locaties.ziekenhuizen || []).map((z) => ({ ...z, soort: "ziekenhuis", w: z.trauma ? 2 : 1 })) : []),
    ...(locaties.bases || []).filter(isBase).map((b) => ({ ...b, soort: "basis", w: 1.6 })),
  ];
  let best = null, totaal = 0;
  for (const k of kandidaten) {
    const d = km(h, k);
    if (d < 1.5 || d > 220) continue;
    const diff = angle(h.koers, bearing(h, k));
    // Further away a small course error matters less; nearby the cone is wider.
    const kegel = d < 10 ? 35 : d < 40 ? 22 : 14;
    if (diff > kegel) continue;
    const score = (Math.cos((diff / kegel) * (Math.PI / 2)) ** 2) * k.w / (1 + d / 60);
    totaal += score;
    if (!best || score > best.score) best = { k, d, score };
  }
  if (!best) return null;
  const kmh = (h.snelheid_kt || 0) * 1.852;
  return {
    id: best.k.id, naam: best.k.naam, soort: best.k.soort, lat: best.k.lat, lon: best.k.lon,
    afstand_km: Math.round(best.d * 10) / 10,
    eta_min: kmh > 40 ? Math.max(1, Math.round((best.d / kmh) * 60)) : null,
    zekerheid: Math.round((best.score / totaal) * 100) / 100,
  };
}

/** Adds the prediction to every helicopter in the /v1/helikopters answer. */
export const metVoorspelling = (data) => ({ ...data, helikopters: (data.helikopters || []).map((h) => ({ ...h, voorspelling: voorspel(h) })) });

// ------------------------------------------------------------------ take-off push

const GAP_MS = 10 * 60_000;
export function genoemd(m) {
  const tekst = [...(m.eenheden || []).map((u) => u?.naam || ""), m.full_melding || "", m.title || ""].join(" ");
  const ll = /life\s*liner\s*0?([1-4])/i.exec(tekst);
  if (ll) return `lifeliner${ll[1]}`;
  return null;
}
const isHeliMelding = (m) => m.dienst === "traumaheli" || m.dienst === "lifeliner" || genoemd(m) != null;

/** The Lifeliner meant by an alert: the one named, otherwise the closest trauma helicopter (< 120 km). */
export function heliVoorMelding(m, helis) {
  const id = genoemd(m);
  if (id) return helis.find((h) => h.id === id) || null;
  if (!isHeliMelding(m) || m.lat == null) return null;
  const best = helis.filter((h) => h.soort === "trauma").sort((a, b) => km(a, m) - km(b, m))[0];
  return best && km(best, m) < 120 ? best : null;
}

/** Trauma helicopters that just left the ground (or appeared in the air after a gap). */
export function opgestegen(list, prev, now = Date.now()) {
  return list.filter((h) => {
    if (h.soort !== "trauma" || h.op_grond) return false;
    const p = prev.get(h.id);
    return !p || p.grond === 1 || now - p.at > GAP_MS;
  });
}

function payload(h, m, lang) {
  const nl = !lang || String(lang).startsWith("nl");
  const plaats = m.stad || "Apeldoorn";
  const title = nl ? `${h.naam} is opgestegen` : `${h.naam} has taken off`;
  const eta = (() => {
    if (m.lat == null || !h.snelheid_kt) return "";
    const min = Math.max(1, Math.round((km(h, m) / Math.max(h.snelheid_kt * 1.852, 150)) * 60));
    return nl ? ` · ± ${min} min` : ` · ± ${min} min`;
  })();
  const body = `${nl ? "Voor de melding in" : "For the alert in"} ${plaats}: ${m.title}${eta}`;
  return { title, body };
}

/**
 * Checks the helicopters after each position update. Take-off moments are kept in kv; a Lifeliner that
 * took off within the last 20 minutes and belongs to an alert from the last 30 minutes gets one push per alert.
 * `queuePush(guid, key, texts, melding)` queues it for the devices whose filters want that alert.
 */
export async function checkOpstijgen(env, list, prev, queuePush, now = Date.now()) {
  for (const h of opgestegen(list, prev, now)) {
    await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(`heli_start:${h.id}`, String(now), now).run();
  }
  const lucht = list.filter((h) => h.soort === "trauma" && !h.op_grond);
  if (!lucht.length) return 0;
  const { results: starts } = await env.DB.prepare("SELECT key, value FROM kv WHERE key LIKE 'heli_start:%'").all();
  const start = new Map(starts.map((r) => [r.key.slice(11), Number(r.value)]));
  const recent = lucht.filter((h) => start.has(h.id) && now - start.get(h.id) < 20 * 60_000);
  if (!recent.length) return 0;
  const { results } = await env.DB.prepare(`${SELECT} WHERE COALESCE(o.hidden, 0) = 0 AND m.datum >= ? ORDER BY m.datum DESC LIMIT 60`)
    .bind(now - 30 * 60_000).all();
  let n = 0;
  for (const m of results.map(meldingAPI).filter(isHeliMelding)) {
    const h = heliVoorMelding(m, lucht);
    if (!h || !recent.includes(h)) continue;
    // The alert should be about this take-off: not more than 25 minutes before it.
    if (Date.parse(m.datum_tijd) < start.get(h.id) - 25 * 60_000) continue;
    const key = `heli_push:${h.id}:${m.guid}`;
    if (await env.DB.prepare("SELECT 1 FROM kv WHERE key = ?").bind(key).first()) continue;
    await env.DB.prepare("INSERT INTO kv (key, value, at) VALUES (?, '1', ?)").bind(key, now).run();
    await queuePush(m, `heli:${h.id}:${m.guid}`, { nl: payload(h, m, "nl"), en: payload(h, m, "en"), heli: h.id });
    n++;
  }
  return n;
}

export async function heliPlusHousekeeping(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM kv WHERE (key LIKE 'heli_push:%' OR key LIKE 'heli_start:%') AND at < ?").bind(now - 24 * 3600_000).run();
}
