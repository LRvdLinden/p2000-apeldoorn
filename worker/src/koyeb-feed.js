// Normalize the second, parallel P2000 stream. The public source remains p2000.page.
// Koyeb and p2000.page may assign different UUIDs to the same dispatch.
import { PLAATS_KEYS, plaatsKey, prioriteit, categorie } from "./rules.js";

export const PUBLIC_SOURCE = "https://p2000.page/api";

const clean = (value) => String(value ?? "").trim();
const knownService = new Set(["brandweer", "ambulance", "politie", "traumaheli", "kustwacht"]);

/** Strict, deliberately conservative fallback equivalence; UUID equality wins first. */
export function normalizedText(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s*:\s*/g, ":").replace(/\s+/g, " ");
}

export function dedupKey(m) {
  // Koyeb's date.timestamp is minute-rounded; p2000.page sends seconds.
  // Same message, location and minute are an atomic unique key in D1.
  return [Math.floor(Number(m.datum) / 60_000), plaatsKey(m.stad),
    clean(m.dienst).toLowerCase(), normalizedText(m.full_melding || m.title)].join("|");
}

export function sameDispatch(a, b) {
  if (a.guid && b.guid && a.guid === b.guid) return true;
  if (!Number.isFinite(Number(a.datum)) || !Number.isFinite(Number(b.datum))) return false;
  if (Math.abs(Number(a.datum) - Number(b.datum)) > 120_000) return false;
  if (plaatsKey(a.stad) !== plaatsKey(b.stad)) return false;
  if (clean(a.dienst).toLowerCase() !== clean(b.dienst).toLowerCase()) return false;
  if (normalizedText(a.full_melding || a.title) !== normalizedText(b.full_melding || b.title)) return false;
  // If both sources identify the first responding unit, avoid merging independent dispatches.
  if (a.capcode && b.capcode && clean(a.capcode) !== clean(b.capcode)) return false;
  return true;
}

export function fromKoyeb(r) {
  if (!r || typeof r !== "object") return null;
  const guid = clean(r.id);
  const stad = clean(r.stad);
  const raw = clean(r.p2000);
  const stamp = Number(r.date?.timestamp ?? r.timestamp);
  if (!/^[0-9a-f-]{16,64}$/i.test(guid) || !PLAATS_KEYS.has(plaatsKey(stad)) ||
      !raw || !Number.isFinite(stamp) || stamp <= 0 || stamp * 1000 > Date.now() + 300_000) return null;

  let dienst = clean(r.dienst).toLowerCase();
  const capcodes = Array.isArray(r.capcodes) ? r.capcodes : [];
  const eenheden = capcodes.map((c) => {
    const parts = clean(c.label).split(" / ");
    return { code: clean(c.capcode), naam: parts[0] || null, type: parts[1] || null, regio: parts[2] || null };
  }).filter((c) => c.code && !/^(monitorcode|lichtkrant)/i.test(c.naam || ""));
  if (eenheden.some((c) => /lifeliner|traumaheli|\bmmt\b/i.test(c.naam || "")) ||
      /lifeliner|\bmmt\b/i.test(raw)) dienst = "traumaheli";
  if (!knownService.has(dienst)) dienst = "onbekend";

  const prio = prioriteit(raw);
  const straat = clean(r.straat);
  const locatie = straat && straat.toLowerCase() !== "onbekend" ? straat : null;
  const title = prio ? raw.replace(/^\s*(?:Prio\s*\d|P\s?\d|[AB]\d)\s*/i, "") : raw;
  const lat = Number(r.lat), lon = Number(r.lng);
  const m = {
    guid, title: title.trim(), full_melding: raw, dienst, prioriteit: prio,
    datum: stamp * 1000, locatie,
    lat: r.lat != null && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
    lon: r.lng != null && Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null,
    stad, regio: clean(r.regio) || null, capcode: eenheden[0]?.code || null,
    categorie: clean(r.categorie) || categorie(dienst, prio, raw, locatie),
    grip: clean(r.grip) && clean(r.grip) !== "0" ? clean(r.grip) : null,
    opschaling: clean(r.soortopschaling) || null, eenheden,
    voertuigen: Array.isArray(r.voertuigen) ? r.voertuigen : [],
    // Publicly attribute all records to the original P2000 source.
    link: PUBLIC_SOURCE, vlaggen: null,
  };
  m.dedup_key = dedupKey(m);
  return m;
}

export const KOYEB_STANDAARD_URL = "wss://p2000-martijnpoppen.koyeb.app";
const HOMEY_IDENTITEIT = "homey-a11ea1eaa11ea1eaa11ea1ea-nl.lrvdlinden.p2000";
/** The code of the website login: letters and digits only, so it can never break the subprotocol header. */
const geldigeCode = (c) => typeof c === "string" && /^[A-Za-z0-9]{8,128}$/.test(c.trim());

/**
 * How to connect to the Koyeb P2000 stream. With P2000_CODE (given by the operator of the stream) the website login
 * `website-<unix seconds>-<code>`, made fresh for every connection; without it the dedicated Homey identity as before,
 * so there is never a gap. Returns { url, protocol, soort } or null when neither is configured.
 * The protocol holds the code: never log it.
 */
export function koyebVerbinding(env, now = Date.now()) {
  const url = String(env?.P2000_URL || env?.KOYEB_WEBSOCKET_URL || KOYEB_STANDAARD_URL).trim();
  if (!url.startsWith("wss://")) return null;
  if (geldigeCode(env?.P2000_CODE)) return { url, protocol: `website-${Math.floor(now / 1000)}-${env.P2000_CODE.trim()}`, soort: "website" };
  if (env?.KOYEB_SUBPROTOCOL === HOMEY_IDENTITEIT) return { url: String(env?.KOYEB_WEBSOCKET_URL || KOYEB_STANDAARD_URL), protocol: HOMEY_IDENTITEIT, soort: "homey" };
  return null;
}
