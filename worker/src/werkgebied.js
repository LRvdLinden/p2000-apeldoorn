// A-Alerts working area: municipality of Apeldoorn + 26 places (same data as Shared/Werkgebied.json in the app).
// Woonplaatsen match on the town name from P2000; buurtschappen match on the alert's street location.
import data from "./werkgebied.json" with { type: "json" };

export const plaatsKey = (s) => String(s || "").toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

export const PLAATSEN_ALL = data.plaatsen;
export const PLAATS_NAMEN = data.plaatsen.map((p) => p.naam);
const keysOf = (p) => [p.naam, ...(p.aliassen || [])].map(plaatsKey);
/** Town names P2000 can send (woonplaatsen incl. aliases). */
export const WOONPLAATS_KEYS = new Set(data.plaatsen.filter((p) => p.woonplaats).flatMap(keysOf));

const R = Math.PI / 180;
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * R, dLon = (lon2 - lon1) * R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Ray casting on a ring of [lon, lat]. */
export function inRing(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToRingKm(ring, lat, lon) {
  const kx = 111.32 * Math.cos(lat * R), ky = 110.57;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky;
    const bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

function placeContains(p, lat, lon) {
  if (p.gebied && p.gebied.some((ring) => inRing(ring, lat, lon))) return true;
  if (p.straalKm) return distanceKm(lat, lon, p.lat, p.lon) <= p.straalKm;
  return false;
}

const hasStreet = (m) => {
  const loc = String(m.locatie || "").trim().toLowerCase();
  return loc !== "" && loc !== "onbekend";
};

/** All places an alert belongs to (its town + hamlets whose area holds its street location). */
export function plaatsenFor(m) {
  const out = new Set();
  const stad = plaatsKey(m.stad);
  const own = data.plaatsen.find((p) => p.woonplaats && keysOf(p).includes(stad));
  if (own) out.add(own.naam);
  if (hasStreet(m) && m.lat != null && m.lon != null) {
    for (const p of data.plaatsen) if ((p.gebied || p.straalKm) && placeContains(p, m.lat, m.lon)) out.add(p.naam);
  }
  return out;
}

/** Same rule as Werkgebied.matches in the app (empty choice = all places). */
export function matchesPlaatsen(selected, m) {
  if (!selected || !selected.length) return true;
  const chosen = new Set(selected.map(plaatsKey));
  for (const p of plaatsenFor(m)) if (chosen.has(plaatsKey(p))) return true;
  return chosen.has(plaatsKey(m.stad));
}

/** Inside the municipality or one of the places around it (used for warnings and helicopters). */
export function inWerkgebied(lat, lon, toleranceKm = 0.5) {
  if (lat == null || lon == null) return false;
  const rings = data.gemeente.gebied;
  if (rings.some((ring) => inRing(ring, lat, lon))) return true;
  if (data.plaatsen.some((p) => placeContains(p, lat, lon))) return true;
  return rings.some((ring) => distanceToRingKm(ring, lat, lon) <= toleranceKm);
}

/** Whether a polygon (rings of [lon, lat]) overlaps the working area: any vertex inside, or the area contains a place. */
export function polygonOverlaps(rings) {
  if (!Array.isArray(rings) || !rings.length) return false;
  for (const ring of rings) {
    if (ring.some(([lon, lat]) => inWerkgebied(lat, lon, 0))) return true;
    if (data.plaatsen.some((p) => inRing(ring, p.lat, p.lon))) return true;
  }
  return false;
}

export const GEMEENTE = data.gemeente;
