-- D1 schema. Safe to run again: everything is "IF NOT EXISTS".
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
  platform TEXT NOT NULL,
  environment TEXT NOT NULL,
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

-- Pushes still to send (spread over cron runs because of the Workers subrequest limit).
CREATE TABLE IF NOT EXISTS outbox (
  guid TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guid, token)
);

CREATE TABLE IF NOT EXISTS weather (guid TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT, at INTEGER);
