// Square map image (Apple Maps Web Snapshots) for the image tags of the Homey app and other clients.
// GET /v1/kaart.png?c=<lat>,<lon>&z=<zoom>[&m=<marker>]  → 1200×1200 PNG (600×600 points at scale 2).
// Optional marker: the image of a service or source, with its tip exactly on the spot.
// Only places in and around the Netherlands and a fixed set of markers, so the endpoint cannot be used for anything else.
import { signRaw, hasKey } from "./apple.js";

export const MARKERS = {
  brandweer: ["marker_brandweer.png", 48, 48, 1.5], ambulance: ["marker_ambulance.png", 48, 48, 1.5],
  politie: ["marker_politie.png", 48, 48, 1.5], traumaheli: ["marker_traumaheli.png", 48, 48, 1.5],
  burgernet: ["marker_burgernet.png", 39, 48, 0], nlalert: ["marker_nlalert.png", 39, 48, 0],
  amber: ["marker_amber.png", 39, 48, 0], vermistkind: ["marker_vermistkind.png", 39, 48, 0],
  vnog: ["marker_vnog.png", 39, 48, 0],
};
const ASSETS = "https://a-alerts.nl/assets/img/";
export const KAART = { size: 600, scale: 2 };

const kaartKey = (env) => ({ kid: env.WEB_MAPKIT_JS_KEY_ID, tid: env.WEB_MAPKIT_JS_TEAM_ID || env.APN_TEAM_ID, p8: env.WEB_MAPKIT_JS_P8 });
export const kaartConfigured = (env) => { const k = kaartKey(env); return hasKey(k.kid, k.tid, k.p8); };

/** Web Mercator in points at zoom z, and back. */
export function world(lat, lon, z) {
  const s = 256 * 2 ** z, r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}
export function unworld(x, y, z) {
  const s = 256 * 2 ** z;
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI, (x / s) * 360 - 180];
}

/** Checks the query; null when not allowed. */
export function kaartParams(q) {
  const c = String(q.get("c") || "").split(",").map(Number);
  const z = Math.round(Number(q.get("z")) * 10) / 10;
  const m = q.get("m") || "";
  if (c.length !== 2 || !c.every(Number.isFinite)) return null;
  const [lat, lon] = c;
  if (lat < 50.5 || lat > 53.8 || lon < 3 || lon > 7.5 || !(z >= 7 && z <= 17)) return null;
  if (m && !MARKERS[m]) return null;
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, z, m };
}

/** The signed snapshot path. Apple centres an image annotation on its point, so the point moves up by the part below the tip. */
export async function snapshotPath(env, { lat, lon, z, m }) {
  const k = kaartKey(env);
  const q = [["center", `${lat},${lon}`], ["z", String(z)], ["size", `${KAART.size}x${KAART.size}`], ["scale", String(KAART.scale)],
    ["colorScheme", "light"], ["lang", "nl-NL"]];
  if (m) {
    const [file, w, h, onder] = MARKERS[m];
    const [x, y] = world(lat, lon, z);
    const [plat, plon] = unworld(x, y - (h / 2 - onder), z);
    q.push(["annotations", JSON.stringify([{ point: `${plat.toFixed(6)},${plon.toFixed(6)}`, markerStyle: "img", imgIdx: 0 }])]);
    q.push(["imgs", JSON.stringify([{ url: ASSETS + file, width: w, height: h }])]);
  }
  q.push(["teamId", k.tid], ["keyId", k.kid]);
  const path = "/api/v1/snapshot?" + q.map(([a, b]) => `${a}=${encodeURIComponent(b)}`).join("&");
  return `${path}&signature=${await signRaw(k.p8, path)}`;
}

export async function kaartImage(env, ctx, url) {
  if (!kaartConfigured(env)) return new Response("Kaart niet beschikbaar", { status: 503 });
  const p = kaartParams(url.searchParams);
  if (!p) return new Response("Ongeldige kaart", { status: 400 });
  const cache = caches.default;
  const key = new Request(`https://kaart.cache/${p.lat},${p.lon},${p.z},${p.m}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch("https://snapshot.apple-mapkit.com" + (await snapshotPath(env, p)), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return new Response(`Kaart mislukt (${res.status})`, { status: 502 });
  const out = new Response(res.body, { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800", "access-control-allow-origin": "*" } });
  ctx?.waitUntil?.(cache.put(key, out.clone()));
  return out;
}
