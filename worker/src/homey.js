// A-Alerts for Homey: new alerts and changed warnings go straight to every Homey with the app, through the
// Homey webhook service (https://apps.developer.homey.app/cloud/webhooks, key path routing on body.channel).
// Secret HOMEY_WEBHOOK_ID = the webhook id from the Homey developer tools. Without it nothing is sent.
// The Homey app works out the events itself (new, ended, opened, closed) and also reads the API at start-up,
// so a missed webhook never loses an alert.
import { SELECT, toAPI } from "./db.js";
import { warningsSince } from "./alerts.js";

const CURSOR = "homey_cursor";
export const homeyConfigured = (env) => Boolean(env.HOMEY_WEBHOOK_ID);

async function kvGet(env, key) {
  return (await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first())?.value ?? null;
}
const kvSet = (env, key, value) => env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)").bind(key, String(value), Date.now()).run();

/** What changed since the last send: alerts stored after the cursor and warnings updated after it. */
export async function homeyChanges(env, since) {
  const [m, w] = await Promise.all([
    env.DB.prepare(`${SELECT} WHERE COALESCE(o.hidden, 0) = 0 AND m.created_at > ? ORDER BY m.datum ASC LIMIT 40`).bind(since).all(),
    warningsSince(env, since),
  ]);
  return { meldingen: m.results.map(toAPI), waarschuwingen: w };
}

export async function notifyHomey(env, budget) {
  if (!homeyConfigured(env)) return { sent: false, reason: "not configured" };
  const now = Date.now();
  const raw = await kvGet(env, CURSOR);
  if (!raw) { await kvSet(env, CURSOR, now); return { sent: false, reason: "cursor set" }; }
  const since = Math.max(Number(raw) || now, now - 30 * 60_000); // never resend more than 30 minutes
  const changes = await homeyChanges(env, since);
  if (!changes.meldingen.length && !changes.waarschuwingen.length) { await kvSet(env, CURSOR, now); return { sent: false, reason: "nothing new" }; }
  if (budget && !budget.take()) return { sent: false, reason: "budget" };
  const res = await fetch(`https://webhooks.athom.com/webhook/${env.HOMEY_WEBHOOK_ID}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel: "aalerts", sent_at: new Date(now).toISOString(), ...changes }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => ({ ok: false, status: 0, statusText: String(e.message || e) }));
  // On failure the cursor stays, so the next run sends the same changes again.
  if (res.ok) await kvSet(env, CURSOR, now);
  else console.error("[homey]", res.status, res.statusText);
  await kvSet(env, "homey_last", JSON.stringify({ at: now, ok: res.ok, status: res.status, meldingen: changes.meldingen.length, waarschuwingen: changes.waarschuwingen.length }));
  return { sent: res.ok, status: res.status, ...changes };
}
