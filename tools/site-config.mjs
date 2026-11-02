// Writes website/config.js for the GitHub Pages build.
// MapKit JS token: signed with the WEB_MAPKIT_JS_* secrets, valid 40 days (the workflow rebuilds weekly).
import { sign } from "node:crypto";
import { writeFileSync } from "node:fs";

const env = process.env;
const b64url = (b) => Buffer.from(b).toString("base64url");

function mapkitToken() {
  const kid = env.WEB_MAPKIT_JS_KEY_ID, iss = env.WEB_MAPKIT_JS_TEAM_ID;
  const key = (env.WEB_MAPKIT_JS_P8 || "").replace(/\\n/g, "\n").trim();
  if (!kid || !iss || !key.includes("PRIVATE KEY")) return "";
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss, iat: now, exp: now + 40 * 86400 };
  if (env.SITE_ORIGIN) claims.origin = env.SITE_ORIGIN;
  const data = `${b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  return `${data}.${b64url(sign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" }))}`;
}

const config = {
  api: env.API_BASE || "https://p2000-apeldoorn-api.lrvdlinden.workers.dev",
  mapkitToken: mapkitToken(),
  appStoreURL: env.APP_STORE_URL || "",
};
writeFileSync("website/config.js", `window.P2000_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log(`config.js: api=${config.api}, mapkit=${config.mapkitToken ? "ja" : "nee"}, appStore=${config.appStoreURL ? "ja" : "nee"}`);
