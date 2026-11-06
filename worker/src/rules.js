// Pure logic shared by the Worker and the tests: parsing the p2000.page feed, categories,
// matching push settings and building notification payloads. No I/O in this file.

export const TIME_ZONE = "Europe/Amsterdam";

import { PLAATS_NAMEN, WOONPLAATS_KEYS, matchesPlaatsen, plaatsKey } from "./werkgebied.js";

// The 26 A-Alerts places (municipality of Apeldoorn + Teuge), see werkgebied.json.
export const PLAATSEN = PLAATS_NAMEN;
export { plaatsKey };
// Town names P2000 can send for the working area (woonplaatsen and their spellings).
export const PLAATS_KEYS = WOONPLAATS_KEYS;

// ------------------------------------------------------------------ parsing

/** "A1 Ambu …" → A1, "P 1 BAD-02 …" → P1, "Prio 3 …" → P3. */
export function prioriteit(text) {
  let m = text.match(/^\s*([AB][0-3])\b/i);
  if (m) return m[1].toUpperCase();
  m = text.match(/^\s*P\s?([1-3])\b/i) || text.match(/^\s*Prio\s*([1-5])\b/i);
  return m ? `P${m[1]}` : null;
}

const RULES = [
  [/BR CONTAINER|CONTAINERBRAND|CONTAINER BRAND/, "Afvalcontainer brand"],
  [/BR (WONING|GEBOUW).*ZOLDER|ZOLDERBRAND/, "Woningbrand (zolder)"],
  [/BR WONING|WONINGBRAND|BR FLAT|BR APPARTEMENT/, "Woningbrand"],
  [/BR (VOERTUIG|AUTO|BUS|VRACHTWAGEN)|VOERTUIGBRAND|AUTOBRAND/, "Voertuigbrand"],
  [/BR (BUITEN|AFVAL|BERM|BOS|NATUUR|HEIDE)|BUITENBRAND|NATUURBRAND/, "Buitenbrand (afval)"],
  [/BR (SCHUUR|BIJGEBOUW|SCHUURTJE|GARAGE)/, "Brand bijgebouw"],
  [/BRANDGERUCHT/, "Brandgerucht"],
  [/\bOMS\b|AUTOM\.? ?BRAND|AUTOMATISCH BRANDALARM|\bPAC\b|BRANDMELDINSTALLATIE/, "Automatisch brandalarm"],
  [/CO[- ]?MELDER|ROOKMELDER|KOOLMONOXIDE/, "Rookmelder"],
  [/GASLUCHT|GASLEK|GASLEKKAGE/, "Gaslucht"],
  [/STANK|HIND\.? ?LUCHT|GEURHINDER/, "Stank (geurhinder)"],
  [/LIFT ?OPSLUITING|OPSLUITING LIFT/, "Liftopsluiting"],
  [/WATEROVERLAST/, "Wateroverlast"],
  [/STORMSCHADE|STORM\b/, "Stormschade"],
  [/VOERTUIG TE WATER|\bVTW\b/, "Voertuig te water"],
  [/PERSOON TE WATER|\bPTW\b/, "Persoon te water"],
  [/DIER |DIER$|DIEREN|PAARD|\bKOE\b|HOND /, "Dier in problemen"],
  [/AFHIJSEN/, "Assistentie afhijsen patient"],
  [/BUITENGESLOTEN/, "Persoon buitengesloten"],
  [/(AANRIJDING|AANR\.?).*LETSEL/, "Aanrijding met letsel"],
  [/ONGEVAL.*LETSEL|OVL\b/, "Ongeval met letsel"],
  [/VERKEERSONGEVAL/, "Verkeersongeval"],
  [/ONGEVAL|AANRIJDING/, "Ongeval melding"],
  [/HERBEZETTING|HERBEZ\b/, "Herbezetting brandweer"],
  [/NACONTROLE/, "Nacontrole"],
  [/OEFENING|PROEFALARM|TESTOPROEP/, "Oefening"],
  [/DIENSTVERLENING/, "Dienstverlening verzoek"],
];

export function categorie(dienst, prio, text) {
  const t = text.toUpperCase();
  if (/REANIM/.test(t)) return dienst === "ambulance" ? "Hartstilstand (reanimatie)" : "Assistentie bij reanimatie";
  if (dienst === "traumaheli") return "Traumaheli persoon in levensgevaar";
  if (dienst === "ambulance") {
    if (/HERPOS|PARAAT/.test(t)) return "Herpositioneren (paraatstelling)";
    if (/\b112\b/.test(t)) return "Ambulance naar 112 melding";
    if (/ASSISTENTIE|ASS\.? ?POL/.test(t)) return "Assistentie bij politie";
    if (prio === "B1") return "Besteld vervoer met medicatie";
    if (prio === "B2" || prio === "B3") return "Besteld vervoer zonder medicatie";
    if (/\bDIA\b/.test(t)) return "Directe inzet ambulance";
    if (prio === "A0" || prio === "A1") return "Ambulance spoedurgentie";
    if (prio === "A2") return "Ambulance met gepaste spoed";
    return "Medische assistentie";
  }
  for (const [re, cat] of RULES) if (re.test(t)) return cat;
  if (dienst === "politie") return /\b112\b/.test(t) ? "Politie naar 112 melding" : "Politie-inzet";
  if (dienst === "brandweer") return /\bBR\b|BRAND/.test(t) ? "Brand melding" : "Brandweer-inzet";
  return null;
}

const parseLatLon = (s) => {
  if (!s) return null;
  const [a, b] = String(s).split(",").map((x) => Number(x.trim()));
  return Number.isFinite(a) && Number.isFinite(b) && a !== 0 ? [a, b] : null;
};

const parseJSON = (s, key) => { try { return JSON.parse(s || "{}")[key] || []; } catch { return []; } };

/** Converts one p2000.page record into the app's alert shape (or null when it is outside the municipality). */
export function fromFeed(r) {
  if (!r?.uid || !r?.melding || !PLAATS_KEYS.has(plaatsKey(r.plaats))) return null;
  const text = String(r.melding).trim();
  const prio = prioriteit(text);

  const units = parseJSON(r.capcodes_json, "capcodes")
    .map((c) => {
      const parts = String(c.label || "").split(" / ");
      return { code: c.capcode, naam: parts[0] || null, type: parts[1] || null, regio: parts[2] || null };
    })
    .filter((u) => u.code && !/^(monitorcode|lichtkrant)/i.test(u.naam || ""));

  let dienst = String(r.dienst || "").toLowerCase();
  if (units.some((u) => /lifeliner|traumaheli|\bmmt\b/i.test(u.naam || "")) || /lifeliner|\bmmt\b/i.test(text)) dienst = "traumaheli";
  if (!["brandweer", "ambulance", "politie", "traumaheli", "kustwacht"].includes(dienst)) dienst = "onbekend";

  const coord = parseLatLon(r.latlong) || parseLatLon(r.plaats_latlon);
  const title = prio ? text.replace(/^\s*(?:Prio\s*\d|P\s?\d|[AB]\d)\s*/i, "") : text;
  const datum = Number(r.timestamp) > 0 ? Number(r.timestamp) * 1000 : Date.now();

  return {
    guid: r.uid,
    title: title.trim(),
    full_melding: text,
    dienst,
    prioriteit: prio,
    datum,
    locatie: r.locatie || null,
    lat: coord?.[0] ?? null,
    lon: coord?.[1] ?? null,
    stad: r.plaats,
    regio: r.vr || r.regio || null,
    capcode: units[0]?.code ?? null,
    categorie: categorie(dienst, prio, text),
    grip: r.grip && r.grip !== "0" ? r.grip : null,
    opschaling: r.soortopschaling || null,
    eenheden: units,
    voertuigen: parseJSON(r.voertuigen_json, "voertuig"),
    link: r.link || null,
  };
}


// ------------------------------------------------------------------ push matching

const LABELS = {
  nl: { brandweer: "Brandweer", ambulance: "Ambulance", politie: "Politie", traumaheli: "Traumaheli", kustwacht: "Kustwacht", onbekend: "Melding", prio: "Prioriteit" },
  en: { brandweer: "Fire brigade", ambulance: "Ambulance", politie: "Police", traumaheli: "Trauma helicopter", kustwacht: "Coastguard", onbekend: "Alert", prio: "Priority" },
};

export const isUrgent = (m) => ["A0", "A1", "P1"].includes(String(m.prioriteit || "").toUpperCase());

/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Minutes after midnight in Amsterdam. */
export function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour").value);
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h * 60 + m;
}

export function isQuiet(device, date = new Date()) {
  if (!device.quiet) return false;
  const now = localMinutes(date);
  const from = device.quiet_from, to = device.quiet_to;
  if (from === to) return true;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Same rules as AppSettings.matchesNotification in the app. */
export function matches(device, m, date = new Date()) {
  if (!device.enabled) return false;
  if (device.diensten.length && !device.diensten.includes(m.dienst)) return false;
  if (!matchesPlaatsen(device.plaatsen, m)) return false;
  if (device.prioriteiten.length && !device.prioriteiten.includes(String(m.prioriteit || "").toUpperCase())) return false;
  if (device.radius_km > 0 && device.lat != null && device.lon != null) {
    if (m.lat == null || m.lon == null) return false;
    if (distanceKm(device.lat, device.lon, m.lat, m.lon) > device.radius_km) return false;
  }
  if (isQuiet(device, date) && !(device.critical && isUrgent(m))) return false;
  return true;
}

const capitalize = (s) => String(s || "").split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export function payloadFor(m, lang = "nl") {
  const L = LABELS[lang] || LABELS.nl;
  const plaats = [m.locatie, capitalize(m.stad)].filter(Boolean).join(", ") || "Apeldoorn";
  const prioLine = m.prioriteit ? `${L.prio} ${m.prioriteit}${m.categorie ? ` - ${m.categorie}` : ""}` : (m.categorie || "");
  const urgent = isUrgent(m);
  return {
    aps: {
      alert: { title: `${L[m.dienst] || L.onbekend} · ${plaats}`, body: [m.title, prioLine].filter(Boolean).join("\n") },
      sound: "default",
      "thread-id": m.dienst,
      "interruption-level": urgent ? "time-sensitive" : "active",
      "relevance-score": urgent ? 1 : 0.5,
      // A-Alerts: the notification service extension adds a map of the spot; buttons "Bewaar" and "Toon op kaart".
      "mutable-content": 1,
      category: "MELDING",
    },
    guid: m.guid,
    dienst: m.dienst,
    // Only a street location is precise enough for a map (town-only alerts sit on the town centre).
    ...(m.locatie && m.lat != null && m.lon != null ? { lat: m.lat, lon: m.lon } : {}),
  };
}


// ------------------------------------------------------------------ device registration

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const strList = (v, max = 40) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.length < 64).slice(0, max) : []);
const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

export function deviceFrom(body) {
  const token = String(body.token || "").toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(token)) throw new HttpError(400, "Invalid token");
  const s = body.settings || {};
  const radius = num(s.radius_km, 0.5, 100);
  const lat = num(s.lat, -90, 90), lon = num(s.lon, -180, 180);
  return {
    token,
    platform: body.platform === "macos" ? "macos" : "ios",
    environment: body.environment === "sandbox" ? "sandbox" : "production",
    language: typeof body.language === "string" ? body.language.slice(0, 8) : "nl",
    app_version: typeof body.app_version === "string" ? body.app_version.slice(0, 32) : null,
    enabled: s.enabled !== false,
    plaatsen: strList(s.plaatsen),
    diensten: strList(s.diensten),
    prioriteiten: strList(s.prioriteiten).map((p) => p.toUpperCase()),
    quiet: Boolean(s.quiet),
    quiet_from: num(s.quiet_from, 0, 1439) ?? 1380,
    quiet_to: num(s.quiet_to, 0, 1439) ?? 420,
    critical: s.critical !== false,
    // Radius only when a centre is given; rounded to ~100 m for privacy.
    radius_km: radius && lat != null && lon != null ? radius : null,
    lat: radius && lat != null ? Math.round(lat * 1000) / 1000 : null,
    lon: radius && lon != null ? Math.round(lon * 1000) / 1000 : null,
  };
}

