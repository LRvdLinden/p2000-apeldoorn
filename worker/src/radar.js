// Rain radar (KNMI Data Platform WMS, real-time 5-minute radar). Needs the secret KNMI_WMS_KEY
// (free key from developer.dataplatform.knmi.nl). Served as one image of the Netherlands (Apple apps)
// and as map tiles (website and Android); both cached for 5 minutes.
const WMS = "https://api.dataplatform.knmi.nl/wms/adaguc-server";
// Without (or with a refused) key: KNMI's anonymous endpoint (shared quota, rate-limited per IP).
const WMS_ANON = "https://anonymous.api.dataplatform.knmi.nl/wms/adaguc-server";
const HALF = 20037508.342789244;

/** Area of the single image: the Netherlands with a margin. */
export const RADAR_BBOX = { west: 2.6, east: 7.8, south: 50.5, north: 53.9 };

export const radarConfigured = (env) => !!env.KNMI_WMS_KEY;

const mx = (lon) => (lon * HALF) / 180;
const my = (lat) => (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * HALF) / Math.PI;

/** EPSG:3857 bbox of a web map tile. */
export function tileBbox(z, x, y) {
  const n = 2 ** z, size = (2 * HALF) / n;
  const minx = -HALF + x * size, maxy = HALF - y * size;
  return [minx, maxy - size, minx + size, maxy];
}

export function wmsUrl(bbox, width, height) {
  const q = new URLSearchParams({
    DATASET: "radar_reflectivity_composites", SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap",
    LAYERS: "precipitation", STYLES: "", CRS: "EPSG:3857", BBOX: bbox.map((v) => v.toFixed(1)).join(","),
    WIDTH: String(width), HEIGHT: String(height), FORMAT: "image/png", TRANSPARENT: "TRUE",
  });
  return `?${q}`;
}

async function cachedPng(env, ctx, key, url) {
  const cache = caches.default;
  const req = new Request(`https://radar.cache/${key}`);
  const hit = await cache.match(req);
  if (hit) return hit;
  let res = await fetch(WMS + url, { headers: { Authorization: env.KNMI_WMS_KEY }, signal: AbortSignal.timeout(12_000) });
  if (res.status === 401 || res.status === 403) res = await fetch(WMS_ANON + url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return new Response(JSON.stringify({ error: `KNMI ${res.status}` }), { status: 502, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  const out = new Response(await res.arrayBuffer(), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
  ctx?.waitUntil?.(cache.put(req, out.clone()));
  return out;
}

const slot = () => Math.floor(Date.now() / 300_000);

/** GET /v1/radar: where the image goes and its URL (changes every 5 minutes). */
export function radarInfo(env, base) {
  if (!radarConfigured(env)) return { beschikbaar: false };
  return { beschikbaar: true, bbox: RADAR_BBOX, url: `${base}/v1/radar.png?t=${slot()}`, tiles: `${base}/v1/radar/{z}/{x}/{y}.png?t=${slot()}`, bron: "KNMI" };
}

export async function radarImage(env, ctx) {
  const b = RADAR_BBOX;
  const bbox = [mx(b.west), my(b.south), mx(b.east), my(b.north)];
  const width = 800, height = Math.round((width * (bbox[3] - bbox[1])) / (bbox[2] - bbox[0]));
  return cachedPng(env, ctx, `nl-${slot()}`, wmsUrl(bbox, width, height));
}

export async function radarTile(env, ctx, z, x, y) {
  if (z < 5 || z > 12) return new Response(null, { status: 204 });
  const [minx, miny, maxx, maxy] = tileBbox(z, x, y), b = RADAR_BBOX;
  if (maxx < mx(b.west) || minx > mx(b.east) || maxy < my(b.south) || miny > my(b.north)) return new Response(null, { status: 204 });
  return cachedPng(env, ctx, `t-${z}-${x}-${y}-${slot()}`, wmsUrl(tileBbox(z, x, y), 256, 256));
}
