// Building facts for an alert at an address with a house number: year built and use, from the BAG (the Dutch register of
// addresses and buildings; open data via PDOK). Looked up once per alert and kept in kv.
import { kvWrite } from "./kv.js";

const UA = { accept: "application/json", "user-agent": "A-Alerts/2.0 (+https://a-alerts.nl)" };
const GEBRUIK = {
  woonfunctie: "Wonen", winkelfunctie: "Winkel", kantoorfunctie: "Kantoor", industriefunctie: "Industrie", bijeenkomstfunctie: "Bijeenkomst",
  gezondheidszorgfunctie: "Zorg", onderwijsfunctie: "Onderwijs", logiesfunctie: "Logies", sportfunctie: "Sport", celfunctie: "Cel", "overige gebruiksfunctie": "Overig",
};

/** "Hoofdstraat 50", "Laan van Zevenhuizen 12a" → { straat, nummer }; a location without a house number → null. */
export function adresUit(locatie) {
  const m = String(locatie || "").trim().match(/^(.*?[\p{L}.)])\s+(\d{1,4})\s*([a-zA-Z])?(?:\s*[-/]\s*\w+)?$/u);
  if (!m || /^[AN]\d/.test(m[1].trim())) return null; // "A50 211" is a road, not an address
  return { straat: m[1].trim(), nummer: `${m[2]}${m[3] || ""}` };
}

const inRing = (ring, x, y) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const bevat = (geom, lon, lat) => {
  const polys = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
  return polys.some((p) => p[0] && inRing(p[0], lon, lat));
};

/** The building of the features that contains the point (else the first one) → { bouwjaar, gebruik[], adressen }. */
export function kiesPand(features, lat, lon) {
  const f = (features || []).find((x) => bevat(x.geometry, lon, lat)) || null;
  const p = f?.properties;
  if (!p) return null;
  const gebruik = [...new Set(String(p.gebruiksdoel || "").split(",").map((g) => GEBRUIK[g.trim()] || null).filter(Boolean))];
  const bouwjaar = Number(p.bouwjaar);
  return { bouwjaar: bouwjaar > 1000 && bouwjaar < 2100 ? bouwjaar : null, gebruik, adressen: Number(p.aantal_verblijfsobjecten) || null };
}

/** Building facts for an alert, or null. Cached in kv ("-" when there is nothing to show). */
export async function pandVoor(env, m) {
  const adres = adresUit(m.locatie);
  if (!adres || !m.stad) return null;
  const key = `pand:${m.guid}`;
  const oud = (await env.DB.prepare("SELECT value FROM kv WHERE key = ?").bind(key).first())?.value;
  if (oud) return oud === "-" ? null : JSON.parse(oud);
  let uit = null;
  try {
    const q = encodeURIComponent(`${adres.straat} ${adres.nummer} ${m.stad}`);
    const r = await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${q}&fq=type:adres&rows=1&fl=weergavenaam,centroide_ll,straatnaam,huisnummer`, { headers: UA, signal: AbortSignal.timeout(8_000) });
    const doc = r.ok ? (await r.json())?.response?.docs?.[0] : null;
    const pt = String(doc?.centroide_ll || "").match(/POINT\((-?[\d.]+) (-?[\d.]+)\)/);
    // Only when PDOK found this very house number in this street.
    if (pt && String(doc.huisnummer) === adres.nummer.replace(/\D/g, "") && String(doc.straatnaam || "").toLowerCase() === adres.straat.toLowerCase()) {
      const lon = Number(pt[1]), lat = Number(pt[2]), d = 0.00025;
      const b = await fetch(`https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&f=json&limit=20`, { headers: UA, signal: AbortSignal.timeout(8_000) });
      const pand = b.ok ? kiesPand((await b.json())?.features, lat, lon) : null;
      if (pand && (pand.bouwjaar || pand.gebruik.length)) uit = { ...pand, adres: doc.weergavenaam, bron: "BAG (Kadaster, via PDOK)" };
    }
  } catch (e) { console.warn("[pand]", m.guid, e.message || e); return null; } // not cached: try again next time
  await kvWrite(env, key, uit ? JSON.stringify(uit) : "-");
  return uit;
}
