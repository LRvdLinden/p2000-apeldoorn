import http2 from "node:http2";
import { sign } from "node:crypto";
import { config, apnsConfigured } from "./config.js";

const HOSTS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" };
const sessions = new Map();
let jwtCache = { token: "", at: 0 };

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Provider token (ES256), refreshed every 50 minutes as Apple requires. */
function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache.token && now - jwtCache.at < 50 * 60) return jwtCache.token;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.apns.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.apns.teamId, iat: now }));
  const data = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(data), { key: config.apns.key, dsaEncoding: "ieee-p1363" });
  jwtCache = { token: `${data}.${b64url(signature)}`, at: now };
  return jwtCache.token;
}

function session(env) {
  const existing = sessions.get(env);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const s = http2.connect(HOSTS[env] || HOSTS.production);
  s.on("error", (e) => console.error("[apns] session", env, e.message));
  s.on("close", () => sessions.delete(env));
  s.setTimeout(60 * 60 * 1000, () => s.close());
  sessions.set(env, s);
  return s;
}

/**
 * Sends one notification. Resolves to { ok, status, reason }.
 * status 410 or reason BadDeviceToken/Unregistered means the token should be removed.
 */
export function send(device, payload, { urgent = false, collapseId } = {}) {
  if (!apnsConfigured()) return Promise.resolve({ ok: false, status: 0, reason: "APNs not configured" });
  return new Promise((resolve) => {
    let req;
    try {
      req = session(device.environment).request({
        ":method": "POST",
        ":path": `/3/device/${device.token}`,
        authorization: `bearer ${providerToken()}`,
        "apns-topic": config.apns.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + (urgent ? 3600 : 6 * 3600)),
        ...(collapseId ? { "apns-collapse-id": collapseId.slice(0, 64) } : {}),
      });
    } catch (e) {
      return resolve({ ok: false, status: 0, reason: e.message });
    }
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (h) => { status = h[":status"]; });
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let reason = null;
      try { reason = body ? JSON.parse(body).reason : null; } catch {}
      resolve({ ok: status === 200, status, reason });
    });
    req.on("error", (e) => resolve({ ok: false, status: 0, reason: e.message }));
    req.setTimeout(15_000, () => { req.close(); resolve({ ok: false, status: 0, reason: "timeout" }); });
    req.end(JSON.stringify(payload));
  });
}

export const isDeadToken = (r) => r.status === 410 || ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"].includes(r.reason);
