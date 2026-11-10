// Writing to the kv table without wasting D1 writes (free plan: 100,000 written rows a day; the cron runs every minute).
//  - An upsert instead of INSERT OR REPLACE: REPLACE counts as a delete plus an insert, an upsert as one row.
//  - Nothing is written when the value is the same.
//  - "I am alive" timestamps are written at most once per interval; the status thresholds are much longer
//    (P2000 3 min, helicopters 5 min, the other sources 10 min), so the status stays the same.

const HARTSLAG = [
  [/^(cron_run|feed_ok)$/, 90_000],
  [/^status_heli_ok$/, 120_000],
  [/^(bron_ok:.+|status_weer_ok)$/, 240_000],
  [/^verkeer$/, 120_000], // traffic list: at most every 2 minutes (delays change every minute)
];

export const kvInterval = (key) => HARTSLAG.find(([re]) => re.test(key))?.[1] || 0;

export function kvWrite(env, key, value, now = Date.now()) {
  return env.DB.prepare(`INSERT INTO kv (key, value, at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at
    WHERE kv.value IS NOT excluded.value AND excluded.at - COALESCE(kv.at, 0) >= ?`)
    .bind(key, value == null ? null : String(value), now, kvInterval(key)).run();
}
