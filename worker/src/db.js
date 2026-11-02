// D1 helpers.
const json = (v) => JSON.stringify(v ?? []);
const parse = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };

/** Same JSON shape the app decodes. */
export function toAPI(row) {
  if (!row) return null;
  return {
    id: row.guid, guid: row.guid, title: row.title, full_melding: row.full_melding, dienst: row.dienst,
    prioriteit: row.prioriteit, datum_tijd: new Date(row.datum).toISOString(), locatie: row.locatie,
    lat: row.lat, lon: row.lon, stad: row.stad, regio: row.regio, provincie: "Gelderland", capcode: row.capcode,
    categorie: row.categorie, grip: row.grip, opschaling: row.opschaling, eenheden: parse(row.eenheden),
    voertuigen: parse(row.voertuigen), link: row.link, views: row.views,
  };
}

export const insertStmt = (env, m) => env.DB.prepare(`
  INSERT INTO meldingen (guid, title, full_melding, dienst, prioriteit, datum, locatie, lat, lon, stad, regio, capcode,
                         categorie, grip, opschaling, eenheden, voertuigen, link, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(guid) DO NOTHING`)
  .bind(m.guid, m.title, m.full_melding ?? null, m.dienst, m.prioriteit ?? null, m.datum, m.locatie ?? null,
    m.lat ?? null, m.lon ?? null, m.stad ?? null, m.regio ?? null, m.capcode ?? null, m.categorie ?? null,
    m.grip ?? null, m.opschaling ?? null, json(m.eenheden), json(m.voertuigen), m.link ?? null, Date.now());

export async function knownGuids(env, guids) {
  if (!guids.length) return new Set();
  const { results } = await env.DB.prepare(`SELECT guid FROM meldingen WHERE guid IN (${guids.map(() => "?").join(",")})`).bind(...guids).all();
  return new Set(results.map((r) => r.guid));
}

export async function listMeldingen(env, { limit, before } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 300, 1), 1000);
  const stmt = before
    ? env.DB.prepare("SELECT * FROM meldingen WHERE datum < ? ORDER BY datum DESC LIMIT ?").bind(Number(new Date(before)), lim)
    : env.DB.prepare("SELECT * FROM meldingen ORDER BY datum DESC LIMIT ?").bind(lim);
  return (await stmt.all()).results.map(toAPI);
}

export const getMelding = async (env, guid) => toAPI(await env.DB.prepare("SELECT * FROM meldingen WHERE guid = ?").bind(guid).first());

export async function addView(env, guid) {
  const row = await env.DB.prepare("UPDATE meldingen SET views = views + 1 WHERE guid = ? RETURNING views").bind(guid).first();
  return row?.views ?? null;
}

export const meldingCount = async (env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM meldingen").first()).n;

export async function upsertDevice(env, d) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO devices (token, platform, environment, language, app_version, enabled, plaatsen, diensten, prioriteiten,
                         quiet, quiet_from, quiet_to, critical, radius_km, lat, lon, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET platform = excluded.platform, environment = excluded.environment,
      language = excluded.language, app_version = excluded.app_version, enabled = excluded.enabled,
      plaatsen = excluded.plaatsen, diensten = excluded.diensten, prioriteiten = excluded.prioriteiten,
      quiet = excluded.quiet, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, critical = excluded.critical,
      radius_km = excluded.radius_km, lat = excluded.lat, lon = excluded.lon, updated_at = excluded.updated_at`)
    .bind(d.token, d.platform, d.environment, d.language ?? null, d.app_version ?? null, d.enabled ? 1 : 0,
      json(d.plaatsen), json(d.diensten), json(d.prioriteiten), d.quiet ? 1 : 0, d.quiet_from, d.quiet_to,
      d.critical ? 1 : 0, d.radius_km ?? null, d.lat ?? null, d.lon ?? null, now, now).run();
}

export const deleteDevice = async (env, token) => {
  const r = await env.DB.batch([
    env.DB.prepare("DELETE FROM devices WHERE token = ?").bind(token),
    env.DB.prepare("DELETE FROM outbox WHERE token = ?").bind(token),
  ]);
  return r[0].meta.changes > 0;
};

const deviceRow = (d) => d && { ...d, plaatsen: parse(d.plaatsen), diensten: parse(d.diensten), prioriteiten: parse(d.prioriteiten) };
export const getDevice = async (env, token) => deviceRow(await env.DB.prepare("SELECT * FROM devices WHERE token = ?").bind(token).first());
export const activeDevices = async (env) => (await env.DB.prepare("SELECT * FROM devices WHERE enabled = 1").all()).results.map(deviceRow);
export const deviceCount = async (env) => (await env.DB.prepare("SELECT COUNT(*) AS n FROM devices WHERE enabled = 1").first()).n;

export async function housekeeping(env, retentionDays) {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM meldingen WHERE datum < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM weather WHERE fetched_at < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM outbox WHERE created_at < ?").bind(Date.now() - 30 * 60_000),
  ]);
}
