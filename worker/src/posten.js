// Figures per station: how often it was called out, at which hours and on which days, and which vehicles and
// capcodes belong to it. One row per station per incident, so a repeat or scale-up of one incident counts once.
import KAZERNES from "./kazernes.js";

const SOORT = { brandweer: "brandweer", ambulance: "ambulance", politie: "politie" };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heeft = (tekst, alias) => new RegExp(`(^|[^a-z])${esc(alias.toLowerCase()).replace(/[-\s]/g, "[-\\s]")}([^a-z]|$)`).test(tekst);

/** The stations named in an alert (in its units, vehicles or text), of the service of the alert. */
export function genoemdePosten(m, list = KAZERNES) {
  const soort = SOORT[m.dienst];
  if (!soort) return [];
  const tekst = [...(m.eenheden || []).map((u) => u?.naam || ""), ...(m.voertuigen || []).map((v) => v?.label || ""), m.full_melding || m.title || ""].join(" | ").toLowerCase();
  return list.filter((k) => k.soort === soort && (k.aliassen || []).some((a) => heeft(tekst, a)));
}

/** Vehicles and capcodes of an alert that carry the name of this station. */
export function eigenVanPost(m, post) {
  const mijn = (s) => (post.aliassen || []).some((a) => heeft(String(s || "").toLowerCase(), a));
  return {
    voertuigen: (m.voertuigen || []).filter((v) => v?.nrb && mijn(v.label)).map((v) => [v.nrb, String(v.label).replace(/^.*? - /, "")]),
    capcodes: (m.eenheden || []).filter((u) => u?.code && mijn(u.naam)).map((u) => [u.code, String(u.naam).replace(/\s*\(.*\)\s*$/, "")]),
  };
}

/** Notes the stations of new alerts: one row per station per incident, and what is new about vehicles and capcodes. */
export async function noteerPosten(env, meldingen) {
  const rijen = [], info = new Map();
  for (const m of meldingen) {
    for (const p of genoemdePosten(m)) {
      rijen.push(env.DB.prepare("INSERT OR IGNORE INTO post_inzet (post, incident, at) VALUES (?, ?, ?)").bind(p.id, m.incident || m.guid, m.datum));
      const e = eigenVanPost(m, p);
      if (e.voertuigen.length || e.capcodes.length) {
        const i = info.get(p.id) || { voertuigen: [], capcodes: [] };
        i.voertuigen.push(...e.voertuigen); i.capcodes.push(...e.capcodes); info.set(p.id, i);
      }
    }
  }
  for (let i = 0; i < rijen.length; i += 50) await env.DB.batch(rijen.slice(i, i + 50));
  for (const [id, nieuw] of info) {
    const key = `post_info:${id}`;
    const raw = (await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first())?.value;
    const oud = raw ? JSON.parse(raw) : { voertuigen: {}, capcodes: {} };
    let anders = false;
    for (const [nr, label] of nieuw.voertuigen) if (oud.voertuigen[nr] !== label) { oud.voertuigen[nr] = label; anders = true; }
    for (const [code, naam] of nieuw.capcodes) if (oud.capcodes[code] !== naam) { oud.capcodes[code] = naam; anders = true; }
    if (anders) await env.DB.prepare("INSERT INTO kv (key, value, at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at").bind(key, JSON.stringify(oud), Date.now()).run();
  }
  return rijen.length;
}

/** Once: the alerts that are in the database already (the last days) are counted too. */
export async function postenInhalen(env) {
  if ((await env.DB.prepare("SELECT value FROM kv WHERE key = 'post_inhalen'").first())?.value) return 0;
  const { results } = await env.DB.prepare("SELECT guid, title, full_melding, dienst, datum, eenheden, voertuigen, incident FROM meldingen ORDER BY datum ASC LIMIT 1000").all();
  const parse = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
  const n = await noteerPosten(env, (results || []).map((r) => ({ ...r, eenheden: parse(r.eenheden), voertuigen: parse(r.voertuigen) })));
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES ('post_inhalen', '1', ?)").bind(Date.now()).run();
  return n;
}

const AMS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hourCycle: "h23", weekday: "short" });
const DAGEN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Counts per hour of the day and per day of the week (Monday first), in Dutch time. */
export function verdeling(tijden) {
  const per_uur = Array(24).fill(0), per_dag = Array(7).fill(0);
  for (const t of tijden) {
    const d = Object.fromEntries(AMS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    per_uur[Number(d.hour) % 24]++;
    const i = DAGEN.indexOf(d.weekday);
    if (i >= 0) per_dag[i]++;
  }
  return { per_uur, per_dag };
}

/** Everything about one station, or null when the id is unknown. */
export async function postInfo(env, id, now = Date.now()) {
  const post = KAZERNES.find((k) => k.id === id);
  if (!post) return null;
  const { results } = await env.DB.prepare("SELECT incident, at FROM post_inzet WHERE post = ? AND at > ? ORDER BY at DESC LIMIT 2000").bind(id, now - 366 * 86400_000).all();
  const rijen = results || [];
  const raw = (await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(`post_info:${id}`).first())?.value;
  const info = raw ? JSON.parse(raw) : { voertuigen: {}, capcodes: {} };
  return {
    id: post.id, naam: post.naam, soort: post.soort, plaats: post.plaats, lat: post.lat, lon: post.lon,
    inzetten: rijen.length,
    sinds: rijen.length ? new Date(rijen[rijen.length - 1].at).toISOString() : null,
    laatste: rijen.length ? new Date(rijen[0].at).toISOString() : null,
    ...verdeling(rijen.map((r) => r.at)),
    voertuigen: Object.entries(info.voertuigen).map(([nr, label]) => ({ nr, label })).sort((a, b) => a.nr.localeCompare(b.nr)),
    capcodes: Object.entries(info.capcodes).map(([code, naam]) => ({ code, naam })).sort((a, b) => a.naam.localeCompare(b.naam)),
    recent: rijen.slice(0, 8).map((r) => ({ incident: r.incident, at: new Date(r.at).toISOString() })),
  };
}
