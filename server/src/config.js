// All settings come from environment variables (Railway variables, filled from the GitHub secrets).

const env = process.env;

export const config = {
  port: Number(env.PORT || 8080),
  dataDir: env.DATA_DIR || "/data",

  // p2000.page feed (personal key, never shipped in the app)
  feedURL: env.P2000_PAGE_API_URL || "",
  feedIntervalMs: Number(env.FEED_INTERVAL_MS || 10_000),

  // Apple Push Notification service
  apns: {
    keyId: env.APN_KEY_ID || "",
    teamId: env.APN_TEAM_ID || "",
    // The .p8 contents; GitHub/Railway may store new lines as "\n".
    key: (env.APN_P8_CERT || "").replace(/\\n/g, "\n").trim(),
    topic: env.APN_TOPIC || "nl.lrvdlinden.p2000apeldoorn",
  },

  adminToken: env.ADMIN_TOKEN || "",
  retentionDays: Number(env.RETENTION_DAYS || 730),
  timeZone: "Europe/Amsterdam",
};

// Places in the municipality of Apeldoorn (same list as the website and the app).
export const PLAATSEN = [
  "Apeldoorn", "Beekbergen", "Beemte-Broekland", "Hoenderloo", "Hoog Soeren", "Klarenbeek",
  "Lieren", "Loenen", "Radio Kootwijk", "Teuge", "Uddel", "Ugchelen", "Wenum-Wiesel",
];

export const plaatsKey = (s) => String(s || "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
export const PLAATS_KEYS = new Set(PLAATSEN.map(plaatsKey));

export const apnsConfigured = () => Boolean(config.apns.keyId && config.apns.teamId && config.apns.key.includes("PRIVATE KEY"));
