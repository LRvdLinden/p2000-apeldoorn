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

-- Beheer: corrections per alert (hide, title, category, location) without touching the original row.
CREATE TABLE IF NOT EXISTS overrides (
  guid TEXT PRIMARY KEY,
  hidden INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  categorie TEXT,
  locatie TEXT,
  lat REAL,
  lon REAL,
  updated_at INTEGER NOT NULL
);

-- Anonymous app installs (random id per install): platform, version, Sign in with Apple yes/no, push yes/no.
CREATE TABLE IF NOT EXISTS installs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  model TEXT,
  os_version TEXT,
  app_version TEXT,
  build TEXT,
  apple_login INTEGER NOT NULL DEFAULT 0,
  push INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS install_days (day TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (day, id));

-- Website visitors without cookies: a daily-salted hash (salt is thrown away the next day).
CREATE TABLE IF NOT EXISTS visits (
  day TEXT NOT NULL,
  visitor TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 1,
  device TEXT,
  PRIMARY KEY (day, visitor)
);
CREATE TABLE IF NOT EXISTS pageviews (day TEXT NOT NULL, path TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, path));

-- P2000Beheer app devices (push for outages).
CREATE TABLE IF NOT EXISTS admin_devices (
  token TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  platform TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- A-Alerts: NL-Alert, Burgernet and KNMI warnings for the working area.
CREATE TABLE IF NOT EXISTS waarschuwingen (
  id TEXT PRIMARY KEY,            -- "nlalert:<id>", "burgernet:<id>", "knmi:<event>:<start>"
  bron TEXT NOT NULL,             -- nlalert | burgernet | knmi
  titel TEXT, tekst TEXT, tekst_en TEXT, plaats TEXT,
  niveau TEXT,                    -- KNMI: yellow | orange | red
  soort TEXT,                     -- KNMI phenomenon, Burgernet kind
  start_at INTEGER NOT NULL, end_at INTEGER,
  status TEXT NOT NULL,           -- actief | verwacht | beeindigd
  gebied TEXT,                    -- JSON rings of [lon, lat]
  lat REAL, lon REAL, link TEXT,
  first_seen INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  notified TEXT                   -- level (KNMI) or "1" once pushed
);
CREATE INDEX IF NOT EXISTS waarschuwingen_start ON waarschuwingen (start_at);
-- Per-device choices for the new sources (old app versions have no row and get no warning pushes).
CREATE TABLE IF NOT EXISTS device_prefs (token TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER);
-- Beheer: a warning hidden from the apps, or ended by hand (ended_at), without touching the source data.
CREATE TABLE IF NOT EXISTS waarschuwing_overrides (id TEXT PRIMARY KEY, hidden INTEGER NOT NULL DEFAULT 0, ended_at INTEGER, updated_at INTEGER);
-- Beheer devices: switch for outage pushes of NL-Alert, Burgernet and KNMI (no row = on).
CREATE TABLE IF NOT EXISTS admin_prefs (token TEXT PRIMARY KEY, bronnen INTEGER NOT NULL DEFAULT 1, updated_at INTEGER);
-- A-Alerts Android: APK downloads from a-alerts.nl, once per anonymous visitor per day and version.
CREATE TABLE IF NOT EXISTS downloads (
  day TEXT NOT NULL, app TEXT NOT NULL, version TEXT NOT NULL, visitor TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (day, app, version, visitor)
);
