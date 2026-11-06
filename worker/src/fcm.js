// Firebase Cloud Messaging (HTTP v1) for the A-Alerts Android app.
// Secret FCM_SERVICE_ACCOUNT = the service-account JSON from Firebase (Project settings → Service accounts).
// Android tokens are stored in the devices table as "fcm:<token>" (APNs tokens are plain hex), so the
// outbox, profiles and the rest of the push pipeline stay the same for both platforms.

const enc = new TextEncoder();
const b64url = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const FCM_PREFIX = "fcm:";
export const isFcmToken = (token) => String(token || "").startsWith(FCM_PREFIX);
/** A raw FCM registration token (letters, digits, "-", "_" and ":"), 100–400 characters. */
export const validFcmToken = (raw) => /^[A-Za-z0-9_:-]{100,400}$/.test(String(raw || ""));

function serviceAccount(env) {
  if (!env.FCM_SERVICE_ACCOUNT) return null;
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
    return sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch { return null; }
}
export const fcmConfigured = (env) => Boolean(serviceAccount(env));

let memo = null; // { token, exp } per Worker instance

async function signRS256(pem, data) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(data)));
}

/** OAuth access token for FCM, kept ~55 minutes in memory and in D1 (one request per hour at most). */
async function accessToken(env, sa) {
  const now = Date.now();
  if (memo && memo.exp - now > 60_000) return memo.token;
  try {
    const row = await env.DB.prepare("SELECT value FROM kv WHERE key = 'fcm_access'").first();
    const saved = row ? JSON.parse(row.value) : null;
    if (saved && saved.exp - now > 60_000) { memo = saved; return saved.token; }
  } catch {}
  const iat = Math.floor(now / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
  })));
  const jwt = `${head}.${claims}.${await signRS256(sa.private_key, `${head}.${claims}`)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM OAuth HTTP ${res.status}`);
  const data = await res.json();
  memo = { token: data.access_token, exp: now + Math.min(Number(data.expires_in || 3600), 3600) * 1000 - 5 * 60_000 };
  await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES ('fcm_access', ?, ?)").bind(JSON.stringify(memo), now).run();
  return memo.token;
}

/**
 * Turns the APNs payload (the same one the iPhone gets) into an FCM data message. Data-only, so the
 * app builds the notification itself: its own channels per discipline, the map and the right screen on tap.
 */
export function fcmMessage(payload, { urgent = false, collapseId } = {}) {
  const aps = payload.aps || {};
  const data = {
    title: String(aps.alert?.title || "A-Alerts"),
    body: String(aps.alert?.body || ""),
    thread: String(aps["thread-id"] || ""),
    category: String(aps.category || ""),
    urgent: urgent ? "1" : "0",
  };
  for (const [k, v] of Object.entries(payload)) {
    if (k === "aps" || v == null) continue;
    data[k] = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  }
  return {
    android: {
      priority: "HIGH",
      ttl: `${urgent ? 3600 : 6 * 3600}s`,
      ...(collapseId ? { collapse_key: String(collapseId).slice(0, 64) } : {}),
    },
    data,
  };
}

/** Same result shape as sendPush for APNs: { ok, status, reason }. */
export async function sendFcm(env, token, payload, opts = {}) {
  const sa = serviceAccount(env);
  if (!sa) return { ok: false, status: 0, reason: "FCM not configured" };
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken(env, sa)}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token: String(token).slice(FCM_PREFIX.length), ...fcmMessage(payload, opts) } }),
      signal: AbortSignal.timeout(10_000),
    });
    let reason = null;
    if (!res.ok) {
      try {
        const err = (await res.json()).error || {};
        reason = (err.details || []).map((d) => d.errorCode).find(Boolean) || err.status || null;
      } catch {}
      if (res.status === 401) memo = null;
    }
    return { ok: res.ok, status: res.status, reason, fcm: true };
  } catch (e) {
    return { ok: false, status: 0, reason: String(e.message || e), fcm: true };
  }
}

/** Token no longer valid: the app was removed or the token was replaced. */
export const isDeadFcm = (r) => r.status === 404 || ["UNREGISTERED", "SENDER_ID_MISMATCH"].includes(r.reason);
