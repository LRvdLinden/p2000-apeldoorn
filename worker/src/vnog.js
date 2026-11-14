// VNOG (Veiligheidsregio Noord- en Oost-Gelderland): the incident pages of the safety region, from its open API
// (https://www.vnog.nl/api-documentatie). Only the municipality of Apeldoorn, and Teuge from the municipality of Voorst.
// Text only: the photos of VNOG are never taken over. Pure parsing lives here, so the tests run it without I/O.
import { PLAATSEN_ALL } from "./werkgebied.js";
import { amsterdamTime, burgernetStraat } from "./alerts.js";

export const VNOG_GEMEENTEN = { apeldoorn: "47", voorst: "66" };
const LIJST = `https://www.vnog.nl/api/v1/incidents?municipality=${VNOG_GEMEENTEN.apeldoorn},${VNOG_GEMEENTEN.voorst}`;
/** Running incidents (small, read often) and the whole list (read once when a running incident left the first list). */
export const VNOG_API = { actief: `${LIJST}&status=true`, alles: LIJST };
export const VNOG_AFGESLOTEN = "Het incident is afgesloten.";
/** A first sight this long after the start gives no push any more (first run, or the source was away). */
export const VNOG_VERS_MS = 3 * 3_600_000;

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** "zaterdag 14 november 2026 - 08:15" (Dutch local time) → epoch ms, or null. */
export function vnogDatum(s) {
  const m = String(s || "").toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})\D+(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const maand = MAANDEN.indexOf(m[2]) + 1;
  if (!maand) return null;
  const p = (n) => String(n).padStart(2, "0");
  return amsterdamTime(`${p(m[1])}/${p(maand)}/${m[3]}`, `${p(m[4])}:${m[5]}`) ?? null;
}

const ENT = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", euml: "ë", eacute: "é", egrave: "è", iuml: "ï", ouml: "ö", uuml: "ü",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", euro: "€", deg: "°" };
/** HTML of the API → plain text; paragraphs become line breaks. */
export function platTekst(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|li|div|h\d)\s*>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (x, n) => ENT[n.toLowerCase()] ?? x)
    .replace(/[ \t ]+/g, " ").replace(/ *\n\s*/g, "\n").trim();
}

function hash(s) {
  let h = 5381;
  for (const c of String(s)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

const heeft = (tekst, naam) => new RegExp(`(?<![\\p{L}])${naam.replace(/[-\s]/g, "[-\\s]")}(?![\\p{L}])`, "iu").test(tekst);
const namenVan = (p) => [p.naam, ...(p.aliassen || [])];

/**
 * The place of an incident, or null when it is outside our area. Apeldoorn: the village or hamlet named in the title
 * (or after "in" in the text), else Apeldoorn. Voorst: only when Teuge is named.
 */
export function vnogPlaats(inc) {
  const gemeenten = Object.keys(inc?.municipalities || {}).map(String);
  const titel = String(inc?.title || "");
  const tekst = (inc?.updates || []).map((u) => `${u.title || ""} ${platTekst(u.description)}`).join(" ");
  const teuge = PLAATSEN_ALL.find((p) => p.naam === "Teuge");
  if (!gemeenten.includes(VNOG_GEMEENTEN.apeldoorn)) {
    return gemeenten.includes(VNOG_GEMEENTEN.voorst) && teuge && heeft(`${titel} ${tekst}`, "Teuge") ? teuge : null;
  }
  const dorpen = PLAATSEN_ALL.filter((p) => p.naam !== "Apeldoorn" && p.naam !== "Teuge").sort((a, b) => b.naam.length - a.naam.length);
  const inTitel = dorpen.find((p) => namenVan(p).some((n) => heeft(titel, n)));
  if (inTitel) return inTitel;
  const stad = PLAATSEN_ALL.find((p) => p.naam === "Apeldoorn");
  if (heeft(titel, "Apeldoorn")) return stad;
  // In the text a name only counts right after "in" or "te" ("in Loenen"), so "uit Engeland" names no hamlet.
  return dorpen.find((p) => namenVan(p).some((n) => heeft(tekst, `(?:in|te) ${n}`))) || stad;
}

/** GRIP of the API (false, or "1" to "4") → 1…4 or null. */
export const vnogGrip = (g) => { const n = Number(g); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
const afgesloten = (s) => s === false || s === 0 || s === "0" || s === "false";

/** The street of an incident: named in the title, else in the text. */
export function vnogStraat(inc) {
  for (const tekst of [String(inc?.title || ""), (inc?.updates || []).map((u) => platTekst(u.description)).join(" ")]) {
    const s = burgernetStraat(tekst);
    if (!s) continue;
    // "Lage Bergweg" is another street than "Bergweg": a word like Lage or Oude in front belongs to the name.
    const voor = tekst.slice(0, tekst.indexOf(s)).match(/(Lage|Hoge|Oude|Nieuwe|Korte|Lange|Grote|Kleine|Eerste|Tweede|Derde|Sint|St\.)\s$/);
    return voor ? `${voor[1]} ${s}` : s;
  }
  return null;
}

/**
 * One incident of the API merged into the stored warning (prev = { row, extra } or null) → a warning for upsert with
 * its timeline in `berichten`, or null when it is not in our area. The API lists the updates newest first and gives
 * them no time: an update seen while we follow the incident gets the moment we saw it; at first sight the oldest gets
 * the start of the incident and the newest its last change.
 */
export function vnogWarning(inc, prev, now = Date.now()) {
  // An incident we already follow keeps its place when the API no longer tells (page removed).
  const plaats = vnogPlaats(inc) || (prev?.row?.plaats ? PLAATSEN_ALL.find((p) => p.naam === prev.row.plaats) : null);
  if (!plaats || inc?.id == null) return null;
  const extra = prev?.extra || {};
  const lijst = (Array.isArray(extra.berichten) ? extra.berichten : []).filter((b) => b.soort !== "afloop").map((b) => ({ ...b }));
  const created = vnogDatum(inc.created) ?? prev?.row?.start_at ?? now;
  const updated = vnogDatum(inc.updated) ?? created;
  const updates = [...(inc.updates || [])].reverse();
  const telling = new Map(), nieuw = [];
  updates.forEach((u, i) => {
    const kop = String(u.title || "").trim();
    const n = telling.get(kop) || 0;
    telling.set(kop, n + 1);
    const id = `${hash(kop)}${n ? `-${n}` : ""}`;
    const tekst = [kop, platTekst(u.description)].filter(Boolean).join(": ");
    const link = u.link && u.link.uri ? String(u.link.uri) : null;
    const oud = lijst.find((b) => b.id === id);
    if (oud) { oud.tekst = tekst; if (link) oud.link = link; return; }
    const at = prev ? now : i === updates.length - 1 && updates.length > 1 ? Math.max(updated, created) : created;
    lijst.push({ id, soort: lijst.length ? "update" : "start", plaats: plaats.naam, at: new Date(at).toISOString(), tekst, ...(link ? { link } : {}) });
    nieuw.push(id);
  });
  const klaar = afgesloten(inc.status);
  const wasKlaar = prev?.row?.status === "beeindigd";
  const eind = klaar ? (wasKlaar && prev.row.end_at ? prev.row.end_at : prev ? now : Math.max(updated, created)) : null;
  if (klaar) lijst.push({ id: "afloop", soort: "afloop", plaats: plaats.naam, at: new Date(eind).toISOString(), tekst: VNOG_AFGESLOTEN });
  const grip = vnogGrip(inc.grip);
  const laatste = [...lijst].reverse().find((b) => b.soort !== "afloop");
  return {
    id: `vnog:${inc.id}`, bron: "vnog", titel: String(inc.title || "Incident").trim(), tekst: laatste?.tekst || "", tekst_en: null,
    plaats: plaats.naam, niveau: null, soort: grip ? `GRIP ${grip}` : "Incident",
    start_at: created, end_at: eind, status: klaar ? "beeindigd" : "actief", gebied: null,
    lat: prev?.row?.lat ?? null, lon: prev?.row?.lon ?? null, link: String(inc.url || "https://www.vnog.nl/incidenten"),
    berichten: lijst,
    extra: { berichten: lijst, grip, grip_hoogste: Math.max(grip || 0, extra.grip_hoogste || 0) || null,
      straat: extra.straat || vnogStraat(inc) || null, incident: extra.incident || null, plek: extra.plek || null },
    _nieuw: Boolean(prev) && nieuw.length > 0,
    _gripHoger: Boolean(prev) && (grip || 0) > (extra.grip || 0),
    _afgesloten: klaar && Boolean(prev) && !wasKlaar,
    _vers: now - created <= VNOG_VERS_MS,
  };
}

/** The API answers with a list (with a filter) or an object keyed by id (without). */
export const vnogLijst = (d) => (Array.isArray(d) ? d : d && typeof d === "object" ? Object.values(d) : []);
