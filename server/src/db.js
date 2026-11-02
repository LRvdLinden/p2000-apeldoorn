import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(join(config.dataDir, "p2000.sqlite"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS meldingen (
    guid TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    full_melding TEXT,
    dienst TEXT,
    prioriteit TEXT,
    datum INTEGER NOT NULL,          -- unix ms
    locatie TEXT,
    lat REAL,
    lon REAL,
    stad TEXT,
    regio TEXT,
    capcode TEXT,
    categorie TEXT,
    grip TEXT,
    opschaling TEXT,
    eenheden TEXT,                   -- JSON
    voertuigen TEXT,                 -- JSON
    link TEXT,
    views INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meldingen_datum ON meldingen(datum DESC);

  CREATE TABLE IF NOT EXISTS devices (
    token TEXT PRIMARY KEY,
    platform TEXT NOT NULL,          -- ios | macos
    environment TEXT NOT NULL,       -- sandbox | production
    language TEXT,
    app_version TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    plaatsen TEXT NOT NULL DEFAULT '[]',
    diensten TEXT NOT NULL DEFAULT '[]',
    prioriteiten TEXT NOT NULL DEFAULT '[]',
    quiet INTEGER NOT NULL DEFAULT 0,
    quiet_from INTEGER NOT NULL DEFAULT 1380,
    quiet_to INTEGER NOT NULL DEFAULT 420,
    critical INTEGER NOT NULL DEFAULT 1,
    radius_km REAL,
    lat REAL,
    lon REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pushed (
    guid TEXT PRIMARY KEY,
    pushed_at INTEGER NOT NULL,
    recipients INTEGER NOT NULL DEFAULT 0
  );
`);

const json = (v) => JSON.stringify(v ?? []);
const parse = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };

// ------------------------------------------------------------------ meldingen

const insertStmt = db.prepare(`
  INSERT INTO meldingen (guid, title, full_melding, dienst, prioriteit, datum, locatie, lat, lon, stad, regio, capcode,
                         categorie, grip, opschaling, eenheden, voertuigen, link, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(guid) DO NOTHING`);

/** Returns true when the alert is new. */
export function insertMelding(m) {
  const r = insertStmt.run(m.guid, m.title, m.full_melding ?? null, m.dienst, m.prioriteit ?? null, m.datum,
    m.locatie ?? null, m.lat ?? null, m.lon ?? null, m.stad ?? null, m.regio ?? null, m.capcode ?? null,
    m.categorie ?? null, m.grip ?? null, m.opschaling ?? null, json(m.eenheden), json(m.voertuigen), m.link ?? null, Date.now());
  return r.changes > 0;
}

/** Same JSON shape the app already decodes (keys of the former website API). */
export function toAPI(row) {
  if (!row) return null;
  return {
    id: row.guid,
    guid: row.guid,
    title: row.title,
    full_melding: row.full_melding,
    dienst: row.dienst,
    prioriteit: row.prioriteit,
    datum_tijd: new Date(row.datum).toISOString(),
    locatie: row.locatie,
    lat: row.lat,
    lon: row.lon,
    stad: row.stad,
    regio: row.regio,
    provincie: "Gelderland",
    capcode: row.capcode,
    categorie: row.categorie,
    grip: row.grip,
    opschaling: row.opschaling,
    eenheden: parse(row.eenheden),
    voertuigen: parse(row.voertuigen),
    link: row.link,
    views: row.views,
  };
}

export function listMeldingen({ limit = 300, before } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 300, 1), 1000);
  const rows = before
    ? db.prepare("SELECT * FROM meldingen WHERE datum < ? ORDER BY datum DESC LIMIT ?").all(Number(new Date(before)), lim)
    : db.prepare("SELECT * FROM meldingen ORDER BY datum DESC LIMIT ?").all(lim);
  return rows.map(toAPI);
}

export const hasMelding = (guid) => Boolean(db.prepare("SELECT 1 FROM meldingen WHERE guid = ?").get(guid));

export const getMelding = (guid) => toAPI(db.prepare("SELECT * FROM meldingen WHERE guid = ?").get(guid));

export function addView(guid) {
  db.prepare("UPDATE meldingen SET views = views + 1 WHERE guid = ?").run(guid);
  return db.prepare("SELECT views FROM meldingen WHERE guid = ?").get(guid)?.views ?? null;
}

export function meldingenBetween(from, to) {
  return db.prepare("SELECT dienst, prioriteit, categorie, datum FROM meldingen WHERE datum >= ? AND datum < ?").all(from, to);
}

export function prune(days) {
  db.prepare("DELETE FROM meldingen WHERE datum < ?").run(Date.now() - days * 86_400_000);
  db.prepare("DELETE FROM pushed WHERE pushed_at < ?").run(Date.now() - 30 * 86_400_000);
}

// ------------------------------------------------------------------ devices

export function upsertDevice(d) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO devices (token, platform, environment, language, app_version, enabled, plaatsen, diensten, prioriteiten,
                         quiet, quiet_from, quiet_to, critical, radius_km, lat, lon, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET platform = excluded.platform, environment = excluded.environment,
      language = excluded.language, app_version = excluded.app_version, enabled = excluded.enabled,
      plaatsen = excluded.plaatsen, diensten = excluded.diensten, prioriteiten = excluded.prioriteiten,
      quiet = excluded.quiet, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, critical = excluded.critical,
      radius_km = excluded.radius_km, lat = excluded.lat, lon = excluded.lon, updated_at = excluded.updated_at`)
    .run(d.token, d.platform, d.environment, d.language ?? null, d.app_version ?? null, d.enabled ? 1 : 0,
      json(d.plaatsen), json(d.diensten), json(d.prioriteiten), d.quiet ? 1 : 0, d.quiet_from, d.quiet_to,
      d.critical ? 1 : 0, d.radius_km ?? null, d.lat ?? null, d.lon ?? null, now, now);
}

export const deleteDevice = (token) => db.prepare("DELETE FROM devices WHERE token = ?").run(token).changes > 0;
export const getDevice = (token) => db.prepare("SELECT * FROM devices WHERE token = ?").get(token);

export function activeDevices() {
  return db.prepare("SELECT * FROM devices WHERE enabled = 1").all().map((d) => ({
    ...d,
    plaatsen: parse(d.plaatsen),
    diensten: parse(d.diensten),
    prioriteiten: parse(d.prioriteiten),
  }));
}

export const deviceCount = () => db.prepare("SELECT COUNT(*) AS n FROM devices WHERE enabled = 1").get().n;

// ------------------------------------------------------------------ push bookkeeping

export const wasPushed = (guid) => Boolean(db.prepare("SELECT 1 FROM pushed WHERE guid = ?").get(guid));
export const markPushed = (guid, n) =>
  db.prepare("INSERT OR REPLACE INTO pushed (guid, pushed_at, recipients) VALUES (?, ?, ?)").run(guid, Date.now(), n);
