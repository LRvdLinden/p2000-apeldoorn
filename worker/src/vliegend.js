// Everything that flies, on top of the positions: where an aircraft stands on the ground (hospital or base), several
// helicopters at one spot that is neither, a changed callsign of a followed aircraft, when each aircraft was last
// seen, and weather that keeps helicopters on the ground. All worked out from our own data.
import locaties from "./locaties.js";
import { km } from "./heliplus.js";
import { plaatsBij } from "./plaats.js";
import { isQuiet } from "./rules.js";

/** The hospital or base within 3 km of a spot: { naam, soort: "ziekenhuis" | "basis" } or null. */
export function plekVan(lat, lon) {
  if (lat == null || lon == null) return null;
  let best = null;
  for (const [soort, lijst] of [["ziekenhuis", locaties.ziekenhuizen || []], ["basis", locaties.bases || []]]) {
    for (const l of lijst) {
      const d = km({ lat, lon }, l);
      if (d < 3 && (!best || d < best.d)) best = { naam: l.naam, soort, d };
    }
  }
  return best ? { naam: best.naam, soort: best.soort } : null;
}

const HELI_ICONEN = new Set(["heli", "kustwacht_aw189", "kustwacht_heli", "apache", "chinook", "cougar", "nh90"]);
const isHeli = (h) => h.soort === "trauma" || h.soort === "politie" || HELI_ICONEN.has(h.icoon);
/** On the ground, or hanging low and slow above a spot. */
const terPlekke = (h) => h.lat != null && (h.op_grond || ((h.snelheid_kt ?? 99) < 35 && h.hoogte_ft != null && h.hoogte_ft < 1500));

/**
 * Two or more helicopters at the same spot (within 1.5 km) that is not a hospital or a base: probably one large
 * incident. Returns [{ sleutel, lat, lon, plaats, toestellen: [{ id, naam }] }].
 */
export function luchtIncidenten(toestellen) {
  const kand = (toestellen || []).filter((h) => isHeli(h) && terPlekke(h) && !plekVan(h.lat, h.lon));
  const uit = [], gehad = new Set();
  for (const a of kand) {
    if (gehad.has(a.id)) continue;
    const groep = kand.filter((b) => b.id === a.id || (!gehad.has(b.id) && km(a, b) <= 1.5));
    if (groep.length < 2) continue;
    groep.forEach((g) => gehad.add(g.id));
    const lat = groep.reduce((s, g) => s + g.lat, 0) / groep.length, lon = groep.reduce((s, g) => s + g.lon, 0) / groep.length;
    uit.push({
      sleutel: groep.map((g) => g.id).sort().join("+"), lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4,
      plaats: plaatsBij(lat, lon)?.tekst || null, toestellen: groep.map((g) => ({ id: g.id, naam: g.naam })),
    });
  }
  return uit;
}

/** Adds to every aircraft: plek (where it stands on the ground) and samen (the others at the same incident). */
export function verrijk(lijst, alle = lijst) {
  const inc = luchtIncidenten(alle);
  return (lijst || []).map((h) => {
    const p = h.op_grond ? plekVan(h.lat, h.lon) : null;
    const i = inc.find((x) => x.toestellen.some((t) => t.id === h.id));
    return { ...h, plek: p?.naam || null, plek_soort: p?.soort || null,
      samen: i ? { plaats: i.plaats, met: i.toestellen.filter((t) => t.id !== h.id).map((t) => t.naam) } : null };
  });
}

/** Who gets the helicopter pushes at all: enabled, not paused, not in quiet hours. */
const magPush = (d, hp, now) => d.enabled && hp && !(hp.pauze_tot && hp.pauze_tot > now) && !isQuiet(d, new Date(now));

/** A push when several helicopters are at one spot: for who follows one of them or has a zone around the spot. */
export function grootLuchtPushes(devices, prefs, incidenten, now = Date.now()) {
  const uit = [];
  for (const i of incidenten) {
    const tokens = [];
    for (const d of devices) {
      const hp = prefs.get(d.token)?.heli;
      if (!magPush(d, hp, now) || hp.meerdere === false) continue;
      const volgt = (hp.volg || []).some((id) => i.toestellen.some((t) => t.id === id));
      const zone = (hp.zones || []).some((z) => km(z, i) <= z.km);
      if (volgt || zone) tokens.push(d.token);
    }
    if (!tokens.length) continue;
    const namen = i.toestellen.map((t) => t.naam).join(", ");
    const n = i.toestellen.length;
    uit.push({
      key: `hg:${i.sleutel}:${Math.floor(now / 7_200_000)}`, heli: i.toestellen[0].id, tokens,
      texts: {
        nl: { title: `${n} helikopters op één plek${i.plaats ? ` in ${i.plaats}` : ""}`, body: `${namen}. Mogelijk een groot incident.` },
        en: { title: `${n} helicopters at one spot${i.plaats ? ` in ${i.plaats}` : ""}`, body: `${namen}. Possibly a large incident.` },
      },
    });
  }
  return uit;
}

/** Followed aircraft whose callsign changed since the last round (both known): often the start of a call-out. */
export function roepnaamPushes(devices, prefs, vliegend, vorige, now = Date.now()) {
  const uit = [];
  for (const h of vliegend || []) {
    const oud = vorige?.[h.id]?.cs, nieuw = h.callsign;
    if (!oud || !nieuw || oud === nieuw) continue;
    const tokens = devices.filter((d) => {
      const hp = prefs.get(d.token)?.heli;
      return magPush(d, hp, now) && hp.volg_roepnaam !== false && (hp.volg || []).includes(h.id);
    }).map((d) => d.token);
    if (!tokens.length) continue;
    uit.push({
      key: `hc:${h.id}:${nieuw.replace(/[^\w]/g, "")}`, heli: h.id, tokens,
      texts: { nl: { title: `${h.naam} vliegt nu als ${nieuw}`, body: `Was ${oud}` }, en: { title: `${h.naam} now flies as ${nieuw}`, body: `Was ${oud}` } },
    });
  }
  return uit;
}

/**
 * When and where every aircraft was last seen: { id: { naam, at, grond, waar, cs } }. Kept for 30 days, at most
 * 150 aircraft (the oldest go first).
 */
export function statusBijwerken(oud, toestellen, now = Date.now()) {
  const uit = { ...(oud || {}) };
  for (const h of toestellen || []) {
    if (h.lat == null) continue;
    const p = h.op_grond ? plekVan(h.lat, h.lon) : null;
    uit[h.id] = { naam: h.naam, at: now, grond: h.op_grond ? 1 : 0, cs: h.callsign || uit[h.id]?.cs || null,
      waar: h.op_grond ? (p?.naam || plaatsBij(h.lat, h.lon)?.tekst || null) : (h.boven || null), basis: p?.soort === "basis" ? 1 : 0 };
  }
  const rijen = Object.entries(uit).filter(([, v]) => now - v.at < 30 * 86_400_000).sort((a, b) => b[1].at - a[1].at).slice(0, 150);
  return Object.fromEntries(rijen);
}

/** The status list for the apps: in de lucht, op de basis, op de grond or uit beeld (not seen for 3 minutes). */
export function statusLijst(status, now = Date.now()) {
  return Object.entries(status || {}).map(([id, v]) => ({
    id, naam: v.naam, gezien: new Date(v.at).toISOString(), waar: v.waar || null,
    status: now - v.at > 180_000 ? "uit_beeld" : v.grond ? (v.basis ? "basis" : "grond") : "lucht",
  }));
}

const WEER = [
  [/mist|zicht/i, "dichte mist", "dense fog"],
  [/onweer/i, "onweer", "thunderstorms"],
  [/wind|storm/i, "harde wind", "strong wind"],
  [/ijzel|sneeuw|glad/i, "sneeuw of ijzel", "snow or ice"],
];
const RANG = { yellow: 1, orange: 2, red: 3 };

/** A KNMI code that is in force now and usually limits flying: { reden, reden_en, niveau } or null. */
export function weerBeperking(waarschuwingen, now = Date.now()) {
  let best = null;
  for (const w of waarschuwingen || []) {
    if (w.bron !== "knmi" || !RANG[w.niveau] || w.status === "beeindigd") continue;
    if (Date.parse(w.start) > now || (w.einde && Date.parse(w.einde) < now)) continue;
    const r = WEER.find(([re]) => re.test(`${w.soort || ""} ${w.titel || ""}`));
    if (r && (!best || RANG[w.niveau] > RANG[best.niveau])) best = { reden: r[1], reden_en: r[2], niveau: w.niveau };
  }
  return best;
}
