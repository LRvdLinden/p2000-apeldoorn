import { test } from "node:test";
import assert from "node:assert/strict";
import { fcmMessage, sendFcm, isDeadFcm, validFcmToken, isFcmToken } from "../src/fcm.js";
import { sendPush, isDeadToken } from "../src/apple.js";
import { deviceFrom, payloadFor } from "../src/rules.js";
import { payloadForWarning } from "../src/alerts.js";

const RAW = "dQw4w9WgXcQ:APA91bH" + "x".repeat(140);

test("fcm: Android device registration keeps the token's case, with the fcm: prefix", () => {
  const d = deviceFrom({ token: RAW, platform: "android", language: "nl", settings: { diensten: ["brandweer"] } });
  assert.equal(d.token, `fcm:${RAW}`);
  assert.equal(d.platform, "android");
  assert.equal(d.environment, "fcm");
  assert.deepEqual(d.diensten, ["brandweer"]);
  assert.throws(() => deviceFrom({ token: "short", platform: "android" }));
  assert.throws(() => deviceFrom({ token: RAW, platform: "ios" }));
  assert.equal(deviceFrom({ token: "AB".repeat(32) }).token, "ab".repeat(32));
  assert.ok(validFcmToken(RAW) && isFcmToken(`fcm:${RAW}`) && !isFcmToken("ab".repeat(32)));
});

test("fcm: the APNs payload becomes a data message with strings only", () => {
  const p = payloadFor({ guid: "g1", dienst: "brandweer", title: "BR woning", stad: "beekbergen", locatie: "Dorpsstraat", lat: 52.16, lon: 5.96, prioriteit: "P1" });
  const m = fcmMessage(p, { urgent: true, collapseId: "g1" });
  assert.equal(m.android.priority, "HIGH");
  assert.equal(m.android.collapse_key, "g1");
  assert.equal(m.android.ttl, "3600s");
  assert.match(m.data.title, /Brandweer/);
  assert.equal(m.data.guid, "g1");
  assert.equal(m.data.lat, "52.16");
  assert.equal(m.data.urgent, "1");
  assert.equal(m.data.category, "MELDING");
  for (const v of Object.values(m.data)) assert.equal(typeof v, "string");
  const w = fcmMessage(payloadForWarning({ id: "nlalert:1", bron: "nlalert", titel: "NL-Alert", tekst: "Sluit ramen en deuren" }, "nl"));
  assert.equal(w.data.waarschuwing, "nlalert:1");
  assert.equal(w.data.bron, "nlalert");
});

test("fcm: sendPush routes Android tokens to FCM and recognises dead tokens", async () => {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
  const kv = new Map();
  const env = {
    FCM_SERVICE_ACCOUNT: JSON.stringify({ project_id: "a-alerts", client_email: "push@a-alerts.iam.gserviceaccount.com", private_key: pem }),
    DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { if (/INSERT/.test(sql)) kv.set("fcm_access", a[0]); }, first: async () => null }), first: async () => (kv.has("fcm_access") ? { value: kv.get("fcm_access") } : null) }) },
  };
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
    const body = JSON.parse(init.body);
    if (body.message.token.endsWith("dead")) return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
    return new Response(JSON.stringify({ name: "projects/a-alerts/messages/1" }));
  };
  try {
    const ok = await sendPush(env, { token: `fcm:${RAW}` }, { aps: { alert: { title: "A-Alerts", body: "Test" } } });
    assert.equal(ok.ok, true);
    const send = calls.find((c) => c.url.includes("fcm.googleapis.com"));
    assert.ok(send.url.endsWith("/v1/projects/a-alerts/messages:send"));
    assert.equal(send.init.headers.authorization, "Bearer ya29.test");
    assert.equal(JSON.parse(send.init.body).message.token, RAW);
    const oauth = calls.find((c) => c.url.includes("oauth2"));
    assert.equal(oauth.init.body.split("assertion=")[1].split(".").length, 3);
    const dead = await sendFcm(env, `fcm:${RAW.slice(0, -4)}dead`, { aps: {} });
    assert.equal(dead.ok, false);
    assert.ok(isDeadFcm(dead) && isDeadToken(dead));
    // The access token is reused: one OAuth call for both pushes.
    assert.equal(calls.filter((c) => c.url.includes("oauth2")).length, 1);
  } finally {
    globalThis.fetch = orig;
  }
  assert.ok(!isDeadToken({ fcm: true, status: 500, reason: "INTERNAL" }));
  assert.ok(isDeadToken({ status: 410 }));
});
