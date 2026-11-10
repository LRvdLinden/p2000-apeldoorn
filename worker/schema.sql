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
-- KNMI texts for the detail page (JSON): verwachting, advies (feed) and kop, omschrijving, details, uitgifte (knmi.nl page).
DROP TABLE IF EXISTS waarschuwing_extra;
CREATE TABLE IF NOT EXISTS waarschuwing_knmi (id TEXT PRIMARY KEY, data TEXT);
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
-- A-Alerts: positions of the trauma and police helicopters (adsb.lol, ODbL) for the route trail and flight history (3 days).
CREATE TABLE IF NOT EXISTS heli_posities (
  heli TEXT NOT NULL, at INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
  hoogte_ft INTEGER, snelheid_kt INTEGER, koers INTEGER, grond INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (heli, at)
);

-- A-Alerts status (a-alerts.nl/status): minutes per state per component per day (90 days),
-- pushes per 10 minutes and platform (2 days), and the outages/maintenance posted from the beheer (90 days).
CREATE TABLE IF NOT EXISTS status_dag (
  onderdeel TEXT NOT NULL, dag TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, warn INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0, maint INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (onderdeel, dag)
);
CREATE TABLE IF NOT EXISTS status_push (
  bucket INTEGER NOT NULL, platform TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0,
  lat_sum INTEGER NOT NULL DEFAULT 0, lat_n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bucket, platform)
);
CREATE TABLE IF NOT EXISTS status_incidenten (
  id INTEGER PRIMARY KEY AUTOINCREMENT, titel TEXT NOT NULL, titel_en TEXT, soort TEXT NOT NULL, onderdelen TEXT NOT NULL,
  start_at INTEGER NOT NULL, eind_at INTEGER, gepland_start INTEGER, gepland_eind INTEGER, updates TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
-- A-Alerts: alerted stations with road route and estimated arrival per alert (computed once; JSON).
CREATE TABLE IF NOT EXISTS melding_routes (guid TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL);

-- "Klopt deze melding niet?": reports from users (90 days), handled in the beheer.
CREATE TABLE IF NOT EXISTS melding_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT NOT NULL, reden TEXT NOT NULL, toelichting TEXT, lat REAL, lon REAL, platform TEXT,
  bron TEXT, at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS melding_feedback_at ON melding_feedback (at);

-- Toestel-ID: which install (anonymous install ID) belongs to which push registration, for support in the beheer.
CREATE TABLE IF NOT EXISTS device_install (token TEXT PRIMARY KEY, install_id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS device_install_id ON device_install (install_id);

-- Tab Nieuws: police news, weather articles and liveblogs (+ messages and photos from the beheer).
CREATE TABLE IF NOT EXISTS nieuws (
  id TEXT PRIMARY KEY,            -- p-<hash> police, w-<hash> weather, l-<hash> liveblog
  soort TEXT NOT NULL,            -- politie | weer | liveblog
  bron TEXT NOT NULL,             -- politie | knmi | burgernet | amber | vermistkind
  ref TEXT,                       -- police uid or warning id
  titel TEXT NOT NULL, intro TEXT, plaats TEXT, lat REAL, lon REAL, url TEXT,
  categorie TEXT, status TEXT, niveau TEXT,
  at INTEGER NOT NULL, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  data TEXT,                      -- JSON: alineas, berichten, plaatsen
  foto TEXT,                      -- own image from the beheer (nieuws_fotos.id)
  hidden INTEGER NOT NULL DEFAULT 0,
  notified TEXT
);
CREATE INDEX IF NOT EXISTS nieuws_at ON nieuws (at);
CREATE TABLE IF NOT EXISTS nieuws_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nieuws_id TEXT NOT NULL, titel TEXT, tekst TEXT, url TEXT, foto TEXT,
  at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nieuws_updates_n ON nieuws_updates (nieuws_id);
-- Items the beheer marked as liveblog (label and banner); default none.
CREATE TABLE IF NOT EXISTS nieuws_liveblog (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
-- Stock photo chosen per police / 112 Nieuws article (never the same photo as the article before it).
CREATE TABLE IF NOT EXISTS nieuws_stockfoto (id TEXT PRIMARY KEY, foto TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS nieuws_fotos (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, at INTEGER NOT NULL);
