// A-Alerts in het beheer: waarschuwingen (verbergen, handmatig beëindigen), status van de bronnen,
// helikopters in de lucht, statistiek van de notificatieprofielen, en een beheer-push bij een storing van een bron.
import { kvWrite } from "./kv.js";
import { toAPI } from "./alerts.js";
import { helikopters } from "./heli.js";

const DAY = 86_400_000;
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
const rows = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
const kvGet = (env, key) => env.DB.prepare("SELECT value, at FROM kv WHERE key = ?").bind(key).first();
const kvSet = (env, key, value) => kvWrite(env, key, value);

// Sources that are read (status); "kind" = Burgernet's API for AMBER Alert and Vermist Kind Alert.
export const BRONNEN = ["nlalert", "burgernet", "knmi", "kind", "vnog", "verkeer"];
const NAMEN = { nlalert: "NL-Alert", burgernet: "Burgernet", knmi: "KNMI", kind: "AMBER Alert / Vermist Kind", amber: "AMBER Alert", vermistkind: "Vermist Kind Alert", verkeer: "Verkeer (NDW, Koyeb)", vnog: "VNOG" };
const SOORTEN = ["nlalert", "burgernet", "knmi", "amber", "vermistkind", "vnog"];
/** A source counts as down after 30 minutes without a successful read. */
export const BRON_STORING_MS = 30 * 60_000;

/** Called after each read of the sources: remembers when each one last worked. */
export async function recordBronnen(env, status) {
  const now = String(Date.now());
  for (const b of BRONNEN) {
    const s = String(status?.[b] || "");
    // "uit": switched off in the beheer, which is not an outage.
    if (s.startsWith("ok") || s === "ongewijzigd" || s === "uit") await kvSet(env, `bron_ok:${b}`, now);
    else if (s) await kvSet(env, `bron_fout:${b}`, s);
  }
}

/** Beheer overrides on the public lists: hidden warnings are left out, ended ones show as ended. */
export const OVERRIDE_JOIN = "LEFT JOIN waarschuwing_overrides wo ON wo.id = w.id";
export function applyOverride(row) {
  if (!row) return row;
  if (row.ov_ended && row.status !== "beeindigd") return { ...row, status: "beeindigd", end_at: row.end_at && row.end_at < row.ov_ended ? row.end_at : row.ov_ended };
  return row;
}

export async function adminWarnings(env, url) {
  const bron = url.searchParams.get("bron");
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const days = Math.min(Number(url.searchParams.get("days")) || 14, 60);
  const list = await rows(env, `SELECT w.*, COALESCE(wo.hidden, 0) AS ov_hidden, wo.ended_at AS ov_ended, wo.updated_at AS ov_at,
      CASE WHEN w.bron = 'vnog' THEN wk.data END AS knmi_data
    FROM waarschuwingen w ${OVERRIDE_JOIN} LEFT JOIN waarschuwing_knmi wk ON wk.id = w.id
    WHERE (COALESCE(w.end_at, w.start_at) >= ? OR w.status != 'beeindigd') ORDER BY w.start_at DESC LIMIT 300`, Date.now() - days * DAY);
  return list.map(applyOverride)
    .filter((r) => (!bron || r.bron === bron) && (!status || r.status === status))
    .filter((r) => !q || [r.titel, r.tekst, r.plaats, r.soort].some((v) => String(v || "").toLowerCase().includes(q)))
    .map((r) => ({ ...toAPI(r, { withArea: false }), verborgen: Boolean(r.ov_hidden), handmatig_beeindigd: Boolean(r.ov_ended) }));
}

export async function updateWarning(env, id, body) {
  const row = await env.DB.prepare("SELECT id, bron FROM waarschuwingen WHERE id = ?").bind(id).first();
  if (!row) return null;
  if (row.bron === "vnog") await vnogPlek(env, id, body);
  const cur = await env.DB.prepare("SELECT hidden, ended_at FROM waarschuwing_overrides WHERE id = ?").bind(id).first();
  const hidden = typeof body.verborgen === "boolean" ? (body.verborgen ? 1 : 0) : (cur?.hidden || 0);
  const ended = typeof body.beeindigd === "boolean" ? (body.beeindigd ? (cur?.ended_at || Date.now()) : null) : (cur?.ended_at ?? null);
  if (!hidden && !ended) await env.DB.prepare("DELETE FROM waarschuwing_overrides WHERE id = ?").bind(id).run();
  else await env.DB.prepare("INSERT OR REPLACE INTO waarschuwing_overrides (id, hidden, ended_at, updated_at) VALUES (?, ?, ?, ?)")
    .bind(id, hidden, ended, Date.now()).run();
  const url = new URL("https://x/?days=60");
  return (await adminWarnings(env, url)).find((w) => w.id === id) || null;
}

/**
 * VNOG incident: the beheer corrects the spot or the link with a P2000 incident.
 *  - melding: guid of a P2000 alert → its incident is linked and its spot is taken;
 *  - lat + lon: a spot by hand;  - plek: "auto" → back to what the server finds itself;  - plek: "geen" → no marker.
 * A spot set here stays (extra.plek = "beheer").
 */
async function vnogPlek(env, id, body) {
  const heeft = (k) => Object.prototype.hasOwnProperty.call(body || {}, k);
  if (!heeft("melding") && !heeft("lat") && !heeft("plek")) return;
  const extra = parse((await env.DB.prepare("SELECT data FROM waarschuwing_knmi WHERE id = ?").bind(id).first())?.data) || {};
  let lat, lon;
  if (body.plek === "auto") { extra.plek = null; extra.incident = null; lat = null; lon = null; }
  else if (body.plek === "geen") { extra.plek = "beheer"; extra.incident = null; lat = null; lon = null; }
  else if (body.melding) {
    const m = await env.DB.prepare(`SELECT m.guid, m.incident, COALESCE(o.lat, m.lat) AS lat, COALESCE(o.lon, m.lon) AS lon FROM meldingen m
      LEFT JOIN overrides o ON o.guid = m.guid WHERE m.guid = ?`).bind(String(body.melding)).first();
    if (!m) return;
    extra.plek = "beheer"; extra.incident = m.incident || m.guid; lat = m.lat; lon = m.lon;
  } else {
    lat = Number(body.lat); lon = Number(body.lon);
    if (!(lat > 50 && lat < 54 && lon > 3 && lon < 8)) return;
    extra.plek = "beheer";
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE waarschuwingen SET lat = ?, lon = ?, updated_at = ? WHERE id = ?").bind(lat, lon, now, id),
    env.DB.prepare("INSERT INTO waarschuwing_knmi (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").bind(id, JSON.stringify(extra)),
  ]);
}

/** A source the beheer can switch off (now only VNOG): nothing is read, what is stored stays. */
export async function setBron(env, bron, aan) {
  if (bron !== "vnog" || typeof aan !== "boolean") return null;
  await kvSet(env, "vnog_uit", aan ? "0" : "1");
  return { bron, aan };
}

/** Status of the sources, helicopters in the air, warning counts and how the notification profiles are used. */
export async function alertsOverview(env) {
  const now = Date.now();
  const last = parse((await kvGet(env, "warnings_status"))?.value) || {};
  const bronnen = {};
  for (const b of BRONNEN) {
    const ok = await kvGet(env, `bron_ok:${b}`);
    const fout = await kvGet(env, `bron_fout:${b}`);
    const laatstOk = ok ? Number(ok.value) : null;
    bronnen[b] = {
      naam: NAMEN[b],
      laatsteStatus: last[b] || null,
      ...(b === "vnog" ? { schakelbaar: true, aan: (await kvGet(env, "vnog_uit"))?.value !== "1" } : {}),
      laatstOk: laatstOk ? new Date(laatstOk).toISOString() : null,
      laatsteFout: fout?.value || null,
      storing: !laatstOk || now - laatstOk > BRON_STORING_MS,
    };
  }
  const heli = await helikopters(env).catch(() => ({ helikopters: [], fout: true }));
  bronnen.helikopters = {
    naam: "adsb.lol",
    laatsteStatus: heli.fout ? "fout" : heli.verouderd ? "verouderd" : `ok ${heli.helikopters.length}`,
    laatstOk: heli.fout ? null : heli.bijgewerkt,
    laatsteFout: heli.fout ? "geen antwoord" : null,
    storing: Boolean(heli.fout),
  };

  const ws = (await rows(env, `SELECT w.bron, w.status, w.niveau, w.start_at, w.end_at, COALESCE(wo.hidden, 0) AS ov_hidden, wo.ended_at AS ov_ended
    FROM waarschuwingen w ${OVERRIDE_JOIN} WHERE COALESCE(w.end_at, w.start_at) >= ? OR w.status != 'beeindigd'`, now - 7 * DAY)).map(applyOverride);
  const perBron = Object.fromEntries(SOORTEN.map((b) => [b, { actief: 0, week: 0 }]));
  let verborgen = 0;
  for (const w of ws) {
    if (w.ov_hidden) { verborgen++; continue; }
    if (!perBron[w.bron]) continue;
    perBron[w.bron].week++;
    if (w.status === "actief") perBron[w.bron].actief++;
  }

  // Notification profiles (only devices with push on).
  const prefs = await rows(env, "SELECT p.data FROM device_prefs p JOIN devices d ON d.token = p.token WHERE d.enabled = 1");
  const verdeling = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const plaatsen = new Map();
  const wil = { nlalert: 0, burgernet: 0, amber: 0, vermistkind: 0, vnog: 0, knmi: { yellow: 0, orange: 0, red: 0 } };
  let metProfielen = 0, profielenTotaal = 0, metTijden = 0, uit = 0;
  for (const r of prefs) {
    const p = parse(r.data);
    if (p?.amber) wil.amber++;
    if (p?.vermistkind) wil.vermistkind++;
    if (p?.vnog) wil.vnog++;
    const list = Array.isArray(p?.profielen) ? p.profielen : null;
    if (!list?.length) continue;
    metProfielen++;
    profielenTotaal += list.length;
    verdeling[Math.min(5, list.length)]++;
    const actief = list.filter((x) => x.actief !== false);
    if (!actief.length) uit++;
    if (actief.some((x) => x.altijd === false)) metTijden++;
    if (actief.some((x) => x.nlalert)) wil.nlalert++;
    if (actief.some((x) => x.burgernet)) wil.burgernet++;
    for (const lvl of ["yellow", "orange", "red"]) if (actief.some((x) => (x.knmi || []).includes(lvl))) wil.knmi[lvl]++;
    const own = new Set(actief.flatMap((x) => x.plaatsen || []));
    for (const pl of own) plaatsen.set(pl, (plaatsen.get(pl) || 0) + 1);
  }
  const pushToestellen = (await env.DB.prepare("SELECT COUNT(*) AS n FROM devices WHERE enabled = 1").first())?.n ?? 0;

  return {
    bronnen,
    inDeLucht: heli.helikopters.map((h) => ({
      naam: h.naam, soort: h.soort, hoogte_m: h.op_grond ? 0 : h.hoogte_ft == null ? null : Math.round(h.hoogte_ft * 0.3048),
      snelheid_kmh: h.snelheid_kt == null ? null : Math.round(h.snelheid_kt * 1.852), gezien: h.gezien,
    })),
    waarschuwingen: { perBron, verborgen },
    profielen: {
      pushToestellen,
      metProfielen,
      zonderProfielen: Math.max(0, pushToestellen - metProfielen),
      gemiddeld: metProfielen ? Math.round((profielenTotaal / metProfielen) * 10) / 10 : 0,
      verdeling,
      metTijden,
      allesUit: uit,
      waarschuwingen: wil,
      topPlaatsen: [...plaatsen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([plaats, n]) => ({ plaats, n })),
    },
  };
}

/** Beheer devices that want outage pushes for the sources (switch "Storing bronnen", on by default). */
export async function setAdminPrefs(env, token, body) {
  if (typeof body?.bronnen !== "boolean") return;
  await env.DB.prepare("INSERT OR REPLACE INTO admin_prefs (token, bronnen, updated_at) VALUES (?, ?, ?)")
    .bind(token, body.bronnen ? 1 : 0, Date.now()).run();
}

/** Called by the cron: a beheer push when a source has been down for 30 minutes, and when it works again. */
export async function checkBronnen(env, pushAdmins) {
  for (const b of BRONNEN) {
    const ok = await kvGet(env, `bron_ok:${b}`);
    if (!ok) continue; // never worked yet (fresh database): nothing to report
    const alerted = await kvGet(env, `bron_alerted:${b}`);
    const down = Date.now() - Number(ok.value) > BRON_STORING_MS;
    if (down && !alerted) {
      const fout = await kvGet(env, `bron_fout:${b}`);
      await pushAdmins(env, `⚠️ ${NAMEN[b]} ligt eruit`, `Al meer dan 30 minuten geen gegevens${fout ? `: ${fout.value}` : ""}.`, { kind: "bronnen" });
      await kvSet(env, `bron_alerted:${b}`, "1");
    } else if (!down && alerted) {
      await pushAdmins(env, `✅ ${NAMEN[b]} werkt weer`, "De gegevens komen weer binnen.", { kind: "bronnen" });
      await env.DB.prepare("DELETE FROM kv WHERE key = ?").bind(`bron_alerted:${b}`).run();
    }
  }
}
