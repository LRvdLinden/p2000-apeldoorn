// Defence and government aircraft above the Netherlands (map layer "Defensie en overheid"), from the same adsb.lol answer
// as the helicopters. An aircraft is recognised by its airframe (ICAO hex, never changes) and its type; the callsign is
// only a label, so a new callsign on the next flight changes the text and nothing else.

const NL = { zuid: 50.7, noord: 53.7, west: 3.1, oost: 7.3 };
/** Dutch airframes only: the ICAO addresses given out by the Netherlands are 480000–487FFF. */
export const isNederlands = (hex) => { const n = parseInt(String(hex || ""), 16); return n >= 0x480000 && n <= 0x487fff; };

/**
 * Where an aircraft is. With weak reception (far out at sea) the source sometimes leaves the position out and gives only
 * the last one it had: that one counts for five minutes, with its real age, so the aircraft stays on the map (greyed
 * when old) instead of disappearing and coming back. Returns { lat, lon, oud (seconds) } or null.
 */
export function positie(ac) {
  if (typeof ac?.lat === "number" && typeof ac?.lon === "number") return { lat: ac.lat, lon: ac.lon, oud: Number(ac.seen_pos ?? ac.seen ?? 0) };
  const l = ac?.lastPosition;
  if (l && typeof l.lat === "number" && typeof l.lon === "number" && Number(l.seen_pos) <= 300) return { lat: l.lat, lon: l.lon, oud: Number(l.seen_pos) };
  return null;
}

/**
 * Fills what one answer of the source left out (heading, speed, altitude, callsign) from the answer before it, when that
 * one is at most three minutes old. `vorige` maps id → the earlier item; the list is changed in place and returned.
 */
export function vulAan(lijst, vorige, now = Date.now()) {
  for (const h of lijst) {
    const v = vorige?.get(h.id);
    if (!v || now - Date.parse(v.gezien) > 180_000) continue;
    for (const k of ["koers", "snelheid_kt", "hoogte_ft", "callsign"]) if (h[k] == null && v[k] != null && !(k === "hoogte_ft" && h.op_grond)) h[k] = v[k];
  }
  return lijst;
}

/** ICAO type code → [icon, name]. */
const TYPES = {
  H47: ["chinook", "Chinook"], H64: ["apache", "Apache"], AS32: ["cougar", "Cougar"], AS3B: ["cougar", "Cougar"],
  NH90: ["nh90", "NH90"], F35: ["f35", "F-35"], F16: ["f35", "F-16"], C130: ["hercules", "Hercules"], C30J: ["hercules", "Hercules"],
  A400: ["hercules", "A400M"], PC7: ["les", "Pilatus PC-7"], PC21: ["les", "Pilatus PC-21"],
};
/**
 * Netherlands Coastguard by registration (public registers: Scramble order of battle, helis.com). The source does not give
 * the owner of an aircraft, and the coastguard flies under changing callsigns, so the registration is what counts; after the
 * first sighting the airframe (hex) is remembered as well.
 */
const KUSTWACHT = {
  "PH-CGD": "kustwacht_dash8", "PH-CGE": "kustwacht_dash8",
  "PH-NCG": "kustwacht_aw189", "PH-SAR": "kustwacht_aw189", "PH-RSQ": "kustwacht_aw189", "PH-BSR": "kustwacht_aw189",
};
/**
 * The source still lists a coastguard Dash 8 under its earlier Canadian registration (airframe c005e9: C-FCGE), so the
 * Dutch registration never matched. Earlier registration → the Dutch one.
 */
const EERDER = { "C-FCGE": "PH-CGE" };
/** The callsign of the Netherlands Coastguard: NCG01, NCG02 … (kept as a second way in, next to the registration). */
const NCG = /^NCG\d{1,3}$/;
/** Koninklijke Marechaussee: two Diamond DA62 MPP patrol aircraft (German registrations, flown via QinetiQ). */
const KMAR = new Set(["D-IAMT", "D-IBMT"]);

/** Readable names for types without a drawing of their own (they get the general helicopter or aircraft drawing). */
const NAMEN = {
  GL5T: "Global 5000", GLF6: "Gulfstream G650", GLF5: "Gulfstream G550", A332: "A330 tanker", A333: "A330", A310: "A310", A343: "A340",
  K35R: "KC-135 tanker", K35E: "KC-135 tanker", C17: "C-17", E3TF: "AWACS", E3CF: "AWACS", P8: "P-8 Poseidon", C295: "C-295", CN35: "CN-235",
  EUFI: "Eurofighter", TOR: "Tornado", F18: "F-18", F15: "F-15", RFAL: "Rafale", HAWK: "Hawk", B350: "King Air", BE20: "King Air", D228: "Dornier 228",
  H60: "Black Hawk", H53: "CH-53", TIGR: "Tiger", EC45: "H145M", H145: "H145M", LYNX: "Lynx", EH10: "Merlin", A149: "AW149", EC25: "Caracal", H225: "Caracal", UH1: "Huey",
};
const JAGERS = new Set(["F35", "F16", "EUFI", "TOR", "F18", "F15", "RFAL"]);
const HELI = new Set(["H47", "H64", "AS32", "AS3B", "NH90", "H60", "EC25", "H225", "EC45", "EC35", "A139", "A189", "LYNX", "MRF1", "TIGR", "H53", "S61", "S92", "A149", "AW10", "EH10", "UH1", "B412", "B06"]);

/**
 * One adsb.lol aircraft → { soort, icoon, naam } or null. `learned` maps hex → an earlier answer, so an aircraft that
 * was recognised by its operator stays recognised when the database misses a field on a later flight.
 */
export function luchtSoort(ac, learned = new Map()) {
  const bron = String(ac.r || "").trim().toUpperCase();
  const reg = EERDER[bron] || bron;
  const type = String(ac.t || "").trim().toUpperCase();
  const hex = String(ac.hex || "").trim().toLowerCase();
  const owner = `${ac.ownOp || ""} ${ac.desc || ""}`;
  const isHeli = HELI.has(type) || ac.category === "A7";
  const anders = reg !== bron ? { registratie: reg } : {};

  if (KUSTWACHT[reg]) return { soort: "kustwacht", icoon: KUSTWACHT[reg], naam: `Kustwacht ${reg}`, ...anders };
  if (NCG.test(String(ac.flight || "").trim().toUpperCase())) {
    return { soort: "kustwacht", icoon: isHeli ? "kustwacht_aw189" : "kustwacht_dash8", naam: `Kustwacht ${reg || String(ac.flight).trim()}`, ...anders };
  }
  if (reg === "PH-GOV") return { soort: "regering", icoon: "phgov", naam: "Regeringsvliegtuig PH-GOV" };
  if (KUSTWACHT[reg]) return { soort: "kustwacht", icoon: KUSTWACHT[reg], naam: `Kustwacht ${reg}` };
  if (reg.startsWith("PH-") && /KUSTWACHT|COAST\s?GUARD/i.test(owner)) {
    return { soort: "kustwacht", icoon: isHeli ? "kustwacht_aw189" : "kustwacht_dash8", naam: `Kustwacht ${reg}` };
  }
  if (KMAR.has(reg) || /MARECHAUSSEE/i.test(owner)) return { soort: "kmar", icoon: "kmar", naam: `Marechaussee ${reg}`.trim() };
  // Defence: only Dutch military aircraft; foreign ones flying over are left out.
  if (Number(ac.dbFlags) & 1 && isNederlands(hex)) {
    // A drawing per known type; a fighter gets the fighter drawing; anything else the general helicopter or aircraft.
    const [icoon, typeNaam] = TYPES[type] || [JAGERS.has(type) ? "f35" : isHeli ? "heli" : "vliegtuig", NAMEN[type] || type];
    // Without a type or registration the callsign is all there is: show that instead of guessing what it is.
    const naam = `${typeNaam} ${reg}`.trim() || String(ac.flight || "").trim() || "Militair toestel";
    return { soort: "defensie", icoon, naam };
  }
  return hex && learned.has(hex) ? learned.get(hex) : null;
}

/** The layer: every defence or government aircraft above the Netherlands, id fixed per airframe. */
export function luchtLijst(list, now = Date.now(), overslaan = new Set(), learned = new Map()) {
  const out = new Map();
  for (const ac of Array.isArray(list) ? list : []) {
    const hex = String(ac.hex || "").trim().toLowerCase();
    const p = positie(ac);
    if (!hex || overslaan.has(hex) || !p) continue;
    if (p.lat < NL.zuid || p.lat > NL.noord || p.lon < NL.west || p.lon > NL.oost) continue;
    const s = luchtSoort(ac, learned);
    if (!s) continue;
    const seen = p.oud;
    out.set(hex, {
      id: `lucht-${hex}`, ...s, callsign: String(ac.flight || "").trim() || null, registratie: s.registratie || ac.r || null, type: ac.t || null, hex,
      lat: p.lat, lon: p.lon,
      koers: typeof ac.track === "number" ? Math.round(ac.track) : (typeof ac.true_heading === "number" ? Math.round(ac.true_heading) : null),
      hoogte_ft: typeof ac.alt_baro === "number" ? Math.round(ac.alt_baro) : null,
      op_grond: ac.alt_baro === "ground",
      snelheid_kt: typeof ac.gs === "number" ? Math.round(ac.gs) : null,
      gezien: new Date(now - seen * 1000).toISOString(),
    });
  }
  return [...out.values()].sort((a, b) => a.naam.localeCompare(b.naam));
}

/** Airframes recognised by operator or registration, remembered for flights where the database says less. */
export async function luchtGeleerd(env) {
  const map = new Map();
  if (!env?.DB) return map;
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM kv WHERE key >= 'lucht_hex:' AND key < 'lucht_hex;'").all();
    for (const r of results) { try { map.set(r.key.slice(10), JSON.parse(r.value)); } catch {} }
  } catch (e) { console.warn("[lucht] geleerd", e.message || e); }
  return map;
}
export async function luchtLeer(env, lijst, learned) {
  if (!env?.DB) return;
  for (const t of lijst) {
    if (t.soort === "defensie" || learned.has(t.hex)) continue; // defence is flagged in the database on every flight
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO kv (key, value, at) VALUES (?, ?, ?)")
        .bind(`lucht_hex:${t.hex}`, JSON.stringify({ soort: t.soort, icoon: t.icoon, naam: t.naam }), Date.now()).run();
    } catch (e) { console.warn("[lucht] leer", e.message || e); }
  }
}
