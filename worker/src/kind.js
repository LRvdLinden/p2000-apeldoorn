// AMBER Alert and Vermist Kind Alert, from the open API of Burgernet (the police's alerts for missing children).
// https://services.burgernet.nl/landactiehost/api/v1/alerts  (JSON with Accept: application/json)
//   AlertLevel 10 = AMBER Alert: national, no area, child in danger.
//   AlertLevel 5  = Vermist Kind Alert: regional, with a search area (circle). Only kept when it reaches the working area.
// Every message (start, update, closing) is kept in a timeline. After the closing message the photo and the
// description of the child are removed: only "the child has been found / the alert has ended" stays.
import { distanceKm, inWerkgebied, PLAATSEN_ALL } from "./werkgebied.js";

export const KIND_API = "https://services.burgernet.nl/landactiehost/api/v1/alerts";
export const KIND_BRONNEN = ["amber", "vermistkind"];
const READMORE = "https://www.politie.nl/amberalert";

const txt = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** "52.37,4.89 5000" → { lat, lon, km } */
export function parseCircle(circle, circleKm) {
  const m = String(circle || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), km: Number(m[3]) / 1000 };
  const k = String(circleKm || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
  return k ? { lat: Number(k[1]), lon: Number(k[2]), km: Number(k[3]) } : null;
}

/** Circle as a polygon ring of [lon, lat] (48 points), so the apps can draw it like any other area. */
export function circleRing({ lat, lon, km }, n = 48) {
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    ring.push([+(lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a)).toFixed(5), +(lat + (km / 110.57) * Math.sin(a)).toFixed(5)]);
  }
  return ring;
}

/** Whether a search circle reaches the working area (Apeldoorn + Teuge). */
export function raaktWerkgebied(c) {
  if (!c) return false;
  if (inWerkgebied(c.lat, c.lon, 1)) return true;
  return PLAATSEN_ALL.some((p) => distanceKm(c.lat, c.lon, p.lat, p.lon) <= c.km + 1);
}

/** One item of the API → a message, or null for an unknown kind. */
export function kindBericht(a) {
  const level = String(a?.AlertLevel || "");
  const bron = level === "10" ? "amber" : level === "5" ? "vermistkind" : null;
  if (!bron || !a.AlertId) return null;
  const type = txt(a.Type).toLowerCase();
  const msg = a.Message || {};
  const area = a.Area || {};
  const c = parseCircle(area.Circle, area.CircleKM)
    || (a.Location?.Latitude != null && a.Location?.Longitude != null ? { lat: Number(a.Location.Latitude), lon: Number(a.Location.Longitude), km: 0 } : null);
  const sent = Number(a.Sent) > 1e9 ? Number(a.Sent) * (Number(a.Sent) < 1e12 ? 1000 : 1) : Date.now();
  return {
    id: `${bron}:${txt(a.AlertId)}`, bron, messageId: txt(a.MessageId) || `${sent}`,
    soort: type === "cancel" ? "afloop" : type === "update" ? "update" : "start",
    at: sent, titel: txt(msg.Title), tekst: txt(msg.Description), kop: txt(msg.DescriptionExt),
    foto: msg.Media?.Image || null, foto_klein: msg.Media?.SmallImage || null,
    gebied: txt(area.Description) || txt(a.Location?.Description) || null, cirkel: c && c.km > 0 ? c : null,
    lat: c ? c.lat : null, lon: c ? c.lon : null, link: msg.Readmore_URL || READMORE,
  };
}

const AFLOOP_TEKST = { amber: "De AMBER Alert is beëindigd.", vermistkind: "De Vermist Kind Alert is beëindigd." };
const VERWIJDERD = "Dit bericht is na afloop verwijderd.";

/**
 * Merge the messages of the API into the stored warning (prev = { row, extra } or null) → a warning for upsert,
 * with its timeline in `berichten`. Returns null when a Vermist Kind Alert does not reach the working area.
 */
export function kindWarning(berichten, prev, now = Date.now()) {
  const first = berichten[0];
  const extra = prev?.extra || {};
  const lijst = Array.isArray(extra.berichten) ? [...extra.berichten] : [];
  let cirkel = extra.cirkel || null, foto = extra.foto || null, fotoKlein = extra.foto_klein || null, titel = prev?.row?.titel || "", kop = extra.kop || "";
  for (const b of [...berichten].sort((x, y) => x.at - y.at)) {
    if (!lijst.some((x) => x.id === b.messageId)) {
      lijst.push({ id: b.messageId, soort: lijst.length && b.soort === "start" ? "update" : b.soort, plaats: b.gebied, at: new Date(b.at).toISOString(),
        tekst: b.tekst || (b.soort === "afloop" ? AFLOOP_TEKST[b.bron] : "") });
    }
    if (b.cirkel) cirkel = b.cirkel;
    if (b.foto) { foto = b.foto; fotoKlein = b.foto_klein || b.foto; }
    if (b.titel) titel = b.titel;
    if (b.kop) kop = b.kop;
  }
  if (first.bron === "vermistkind" && !raaktWerkgebied(cirkel)) return null;
  const afloop = lijst.find((x) => x.soort === "afloop");
  const ended = Boolean(afloop) || prev?.row?.status === "beeindigd";
  // After the end: no photo and no description of the child any more.
  const tijdlijn = ended ? lijst.map((x) => (x.soort === "afloop" ? x : { ...x, tekst: VERWIJDERD })) : lijst;
  const laatste = [...tijdlijn].reverse().find((x) => x.soort !== "afloop") || tijdlijn[0];
  const start = Date.parse(tijdlijn[0]?.at) || first.at;
  return {
    id: first.id, bron: first.bron,
    titel: ended ? (first.bron === "amber" ? "AMBER Alert beëindigd" : "Vermist Kind Alert beëindigd") : (titel || (first.bron === "amber" ? "AMBER Alert" : "Vermist Kind Alert")),
    tekst: ended ? (afloop?.tekst || AFLOOP_TEKST[first.bron]) : (laatste?.tekst || ""),
    tekst_en: null,
    plaats: first.bron === "amber" ? "Nederland" : (first.gebied || prev?.row?.plaats || null),
    niveau: null, soort: kop || "Vermist",
    start_at: start, end_at: ended ? (Date.parse(afloop?.at) || prev?.row?.end_at || now) : null,
    status: ended ? "beeindigd" : "actief",
    gebied: cirkel ? [circleRing(cirkel)] : null,
    lat: cirkel ? cirkel.lat : null, lon: cirkel ? cirkel.lon : null,
    link: first.link || READMORE,
    berichten: tijdlijn,
    extra: { berichten: tijdlijn, cirkel, foto: ended ? null : foto, foto_klein: ended ? null : fotoKlein, kop },
    _nieuwBericht: berichten.some((b) => !(extra.berichten || []).some((x) => x.id === b.messageId)),
    _soortNieuw: berichten.filter((b) => !(extra.berichten || []).some((x) => x.id === b.messageId)).map((b) => b.soort),
  };
}

/** Group the API list per alert. */
export function groepeer(list) {
  const per = new Map();
  for (const a of Array.isArray(list) ? list : []) {
    const b = kindBericht(a);
    if (!b) continue;
    if (!per.has(b.id)) per.set(b.id, []);
    per.get(b.id).push(b);
  }
  return per;
}
