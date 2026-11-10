// A-Alerts on the website: NL-Alert, Burgernet, KNMI, live helicopters, alarmed stations and the "verloop".
// Same rules as the app (Shared/Waarschuwing.swift, Verband.swift, Kazernes.swift, Helikopters.swift).
import { API, asset, esc, date, capPlaats, hasStreet, distanceKm, fmtTime } from "./core.js?v=57";

const TZ = "Europe/Amsterdam";

// ------------------------------------------------------------------ warnings

export const BRONNEN = {
  nlalert: { label: "NL-Alert", color: "#FFC800", on: "#000", icon: "icon_nlalert", text: "#B45309" },
  burgernet: { label: "Burgernet", color: "#0067B1", on: "#fff", icon: "icon_burgernet", text: "#0067B1" },
  knmi: { label: "KNMI", color: "#3E9FDB", on: "#fff", icon: "icon_knmi", text: "#2563eb" },
  // Missing children, from the police (through Burgernet): national AMBER Alert and regional Vermist Kind Alert.
  amber: { label: "AMBER Alert", color: "#EC6E24", on: "#fff", icon: "icon_amber", text: "#C2410C" },
  vermistkind: { label: "Vermist Kind Alert", color: "#1B265E", on: "#F4E005", icon: "icon_vermistkind", text: "#1B265E" },
};
/** Warnings about a missing child (AMBER Alert, Vermist Kind Alert). */
export const isKind = (w) => w?.bron === "amber" || w?.bron === "vermistkind";
export const CODES = { yellow: ["Code geel", "#F7C600", "#000"], orange: ["Code oranje", "#F28C28", "#fff"], red: ["Code rood", "#E3001B", "#fff"], green: ["Code groen", "#2E9E44", "#fff"] };
/** KNMI: the code that applies now; a lifted (ended) warning is code green. */
export const codeNu = (w) => (w.bron === "knmi" && w.status === "beeindigd" ? "green" : w.niveau);
export const isOpgeheven = (w) => w.bron === "knmi" && w.status === "beeindigd";
/** Link to this warning on a-alerts.nl (for sharing). */
export const wShareUrl = (w) => `https://a-alerts.nl/waarschuwing/${encodeURIComponent(w.id).replace(/%3A/gi, ":")}`;
/** Link to this alert (for sharing): a-alerts.nl/melding/<dienst>/<guid>. Previews show the banner of the service,
 *  and with the app installed the link opens in the app. */
export const mShareUrl = (m) => {
  const d = String(m.dienst || "").toLowerCase();
  const dienst = ["lifeliner", "mmt"].includes(d) ? "traumaheli" : ["brandweer", "ambulance", "politie", "traumaheli", "kustwacht"].includes(d) ? d : "onbekend";
  return `https://a-alerts.nl/melding/${dienst}/${encodeURIComponent(m.guid)}`;
};
/** Route links to the alert: Google Maps, Apple Kaarten and the address to copy. */
export const routeLinks = (m, adres) => {
  const dest = m.lat != null && m.lon != null ? `${m.lat},${m.lon}` : adres;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d&q=${encodeURIComponent(adres)}`,
  };
};

export async function fetchWaarschuwingen(days = 7) {
  try {
    const r = await fetch(`${API}/v1/waarschuwingen?days=${days}&kind=1`, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function fetchHelikopters() {
  try {
    const r = await fetch(`${API}/v1/helikopters`, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? (await r.json()).helikopters || [] : [];
  } catch { return []; }
}

export const wStart = (w) => new Date(w.start);
export const wEinde = (w) => (w.einde ? new Date(w.einde) : null);
export const isActief = (w) => w.status === "actief";
export const isBeeindigd = (w) => w.status === "beeindigd";

export function wKleur(w) {
  return w.bron === "knmi" ? (CODES[w.niveau] || CODES.yellow)[1] : BRONNEN[w.bron].color;
}
export function wOpKleur(w) {
  return w.bron === "knmi" ? (CODES[w.niveau] || CODES.yellow)[2] : BRONNEN[w.bron].on;
}
/** "Code geel · Mist", "Burgernet · Vermissing", "NL-Alert". */
export function wKop(w) {
  if (w.bron === "knmi") return [(CODES[w.niveau] || CODES.yellow)[0], w.soort].filter(Boolean).join(" · ");
  if (w.bron === "burgernet") return ["Burgernet", w.soort].filter(Boolean).join(" · ");
  if (w.bron === "amber" || w.bron === "vermistkind") return BRONNEN[w.bron].label;
  return "NL-Alert";
}
export const wStatus = (w) => (isOpgeheven(w) ? "Opgeheven · code groen" : w.status === "beeindigd" ? "Beëindigd" : w.status === "verwacht" ? "Verwacht" : "Actief");
export const wIcon = (w) => asset(`assets/img/${BRONNEN[w.bron].icon}.png`);

/** The time of the warning ("13:15", or "5 nov 13:15"), with the end time once ended – never "x min ago". */
export function wTijd(w) {
  const s = wStart(w);
  const key = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });
  const begin = key(s) === key(new Date()) ? fmtTime(s) : `${s.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: TZ })} ${fmtTime(s)}`;
  const e = wEinde(w);
  return isBeeindigd(w) && e && e > s ? `${begin}–${fmtTime(e)}` : begin;
}

/** Rings of [lat, lon] for MapKit (the API sends [lon, lat]). */
export const wRings = (w) => (Array.isArray(w.gebied) ? w.gebied : []).map((r) => r.map(([lon, lat]) => [lat, lon]));

// ------------------------------------------------------------------ stations and arrival estimate

let kazernesCache = null;
export async function kazernes() {
  if (!kazernesCache) kazernesCache = fetch(asset("assets/kazernes.json")).then((r) => r.json()).catch(() => []);
  return kazernesCache;
}
const SOORT = { brandweer: "brandweer", ambulance: "ambulance", politie: "politie" };
const UITRUK = { brandweer: 4, ambulance: 1, politie: 0 };

/**
 * The stations named in the alert (or the nearest one), with an estimate: straight line × 1.3 at 50 km/h,
 * ×0.75 with urgency, plus turnout time. Always shown as an estimate, never as vehicle positions.
 */
const routesCache = new Map();
export async function kazerneRoutes(m) {
  const soort = SOORT[m.dienst];
  if (!soort || !hasStreet(m) || m.lat == null) return [];
  // 1. The A-Alerts API: road route by Apple Maps, computed once per alert, the same in every app.
  if (!routesCache.has(m.guid)) routesCache.set(m.guid, fetch(`${API}/v1/meldingen/${encodeURIComponent(m.guid)}/routes`, { signal: AbortSignal.timeout(12_000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const api = await routesCache.get(m.guid);
  if (api?.kazernes?.length) {
    return api.kazernes.map((r) => ({
      kazerne: { id: r.id, naam: r.naam, soort: r.soort, lat: r.lat, lon: r.lon }, genoemd: r.genoemd, km: r.km, rij: r.rij_min,
      vertrek: new Date(r.vertrek), aankomst: new Date(r.aankomst), route: r.route || [], via: r.via,
    }));
  }
  // 2. Fallback: straight line × 1.3 at 50 km/h.
  const all = (await kazernes()).filter((k) => k.soort === soort);
  const namen = [...(m.eenheden || []).map((u) => String(u.naam || "").toLowerCase()), String(m.full_melding || "").toLowerCase()];
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let gekozen = all.filter((k) => (k.aliassen || []).some((a) => namen.some((n) => new RegExp(`\\b${reEsc(a.toLowerCase())}\\b`).test(n))));
  const genoemd = gekozen.length > 0;
  if (!gekozen.length && all.length) gekozen = [all.reduce((best, k) => (distanceKm(k, m) < distanceKm(best, m) ? k : best))];
  gekozen = gekozen.filter((k) => distanceKm(k, m) < 40).slice(0, 5);
  const spoed = ["A0", "A1", "P1"].includes(String(m.prioriteit || "").toUpperCase());
  return gekozen.map((k) => {
    const km = distanceKm(k, m) * 1.3;
    const rij = (km / 50) * 60 * (spoed ? 0.75 : 1);
    const vertrek = new Date(date(m).getTime() + UITRUK[soort] * 60_000);
    const aankomst = new Date(vertrek.getTime() + rij * 60_000);
    return { kazerne: k, genoemd, km, rij, vertrek, aankomst, route: [[k.lat, k.lon], [m.lat, m.lon]] };
  }).sort((a, b) => a.aankomst - b.aankomst);
}

/** Estimated phase (as in the apps): ["uitrukken"|"onderweg"|"terplaatse"|"geweest", seconds left or null]. */
export function routeFase(r, now = Date.now()) {
  if (now < r.vertrek) return ["uitrukken", (r.vertrek - now) / 1000];
  if (now < r.aankomst) return ["onderweg", (r.aankomst - now) / 1000];
  return now - r.aankomst < 45 * 60_000 ? ["terplaatse", null] : ["geweest", null];
}

/** Where the unit would roughly be by this estimate (never a real position): along the route. */
export function geschattePositie(r, now = Date.now()) {
  if (routeFase(r, now)[0] !== "onderweg") return null;
  const lijn = r.route.length > 1 ? r.route : [[r.kazerne.lat, r.kazerne.lon]];
  const deel = Math.min(1, Math.max(0, (now - r.vertrek) / Math.max(1, r.aankomst - r.vertrek)));
  const d = (a, b) => distanceKm({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
  const stukken = lijn.slice(1).map((p, i) => d(lijn[i], p));
  let rest = stukken.reduce((s, x) => s + x, 0) * deel;
  for (let i = 0; i < stukken.length; i++) {
    if (rest <= stukken[i] && stukken[i] > 0) { const f = rest / stukken[i], a = lijn[i], b = lijn[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
    rest -= stukken[i];
  }
  return lijn[lijn.length - 1];
}

// ------------------------------------------------------------------ possible links between alerts ("verloop")

const besteld = (m) => ["B1", "B2", "B3"].includes(String(m.prioriteit || "").toUpperCase());
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const plaats = (m) => capPlaats(m.stad) || "Apeldoorn";

export function verband(m, list, max = 6) {
  const groot = m.grip || m.opschaling;
  const venster = (groot ? 120 : 45) * 60_000;
  const codes = new Set((m.eenheden || []).map((u) => u.code).filter(Boolean));
  const out = [];
  for (const o of list) {
    if (o.guid === m.guid) continue;
    const dt = date(o) - date(m);
    if (Math.abs(dt) > venster || besteld(o) || besteld(m)) continue;
    const redenen = [];
    let score = 0;
    const zelfdePlaats = plaats(o) === plaats(m);
    if (hasStreet(m) && hasStreet(o) && zelfdePlaats && norm(m.locatie) === norm(o.locatie)) { redenen.push("Zelfde adres"); score += 3; }
    else if (hasStreet(m) && hasStreet(o) && m.lat != null && o.lat != null) {
      const km = distanceKm(m, o);
      if (km <= 0.35) { redenen.push(`Op ${Math.round(km * 100) * 10} m afstand`); score += 2; }
    }
    if ((o.eenheden || []).some((u) => codes.has(u.code))) { redenen.push("Zelfde eenheid opgeroepen"); score += 2; }
    if (!score && zelfdePlaats && (!hasStreet(m) || !hasStreet(o)) && o.dienst !== m.dienst && Math.abs(dt) <= 15 * 60_000 && plaats(m) !== "Apeldoorn") {
      redenen.push(`Zelfde plaats (${plaats(m)})`); score += 1;
    }
    if (!score) continue;
    if (o.dienst !== m.dienst) score += 1;
    const min = Math.round(Math.abs(dt) / 60_000);
    redenen.push(min === 0 ? "Zelfde minuut" : dt < 0 ? `${min} min eerder` : `${min} min later`);
    out.push({ melding: o, redenen, score });
  }
  return out.sort((a, b) => b.score - a.score || Math.abs(date(a.melding) - date(m)) - Math.abs(date(b.melding) - date(m))).slice(0, max);
}

// ------------------------------------------------------------------ helicopters

export function heliImg(h) {
  if (h.soort === "trauma") return asset("assets/img/heli_lifeliner.png");
  return h.type === "A139" || ["zulu24", "zulu25", "zulu26"].includes(h.id) ? asset("assets/img/heli_politie_aw139.png") : asset("assets/img/heli_politie.png");
}
export const vliegtWest = (h) => h.koers != null && !h.op_grond && ((h.koers % 360) + 360) % 360 > 180;
// "Kaart en helikopters" (same choices as the apps), kept in this browser.
const WEERGAVE_KEY = "aalerts.weergave";
export function weergave() {
  const basis = { kleurPerToestel: false, luchtvaart: false, icoon: "normaal", kaart: "licht", prestatie: false };
  try {
    const v = { ...basis, ...JSON.parse(localStorage.getItem(WEERGAVE_KEY) || "{}") };
    if (!["licht", "donker", "auto"].includes(v.kaart)) v.kaart = "licht";
    return v;
  } catch { return basis; }
}
/** Map colours: light (default), dark, or automatic (follows the device). Same choice as in the apps. */
export function kaartKleur(mk) {
  const k = weergave().kaart;
  const donker = k === "donker" || (k === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  return donker ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light;
}
/** Keeps maps in automatic mode in step when the device switches between light and dark. */
export function volgKaartKleur(mk, map) {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (weergave().kaart === "auto") map.colorScheme = kaartKleur(mk); });
}
export function zetWeergave(patch) {
  const v = { ...weergave(), ...patch };
  try { localStorage.setItem(WEERGAVE_KEY, JSON.stringify(v)); } catch {}
  return v;
}
const heliBreedte = () => ({ klein: 60, groot: 108 })[weergave().icoon] || 84;
export const hoogteTekst = (h) => h.op_grond ? "op de grond" : h.hoogte_ft == null ? "–"
  : weergave().luchtvaart ? `${Math.round(h.hoogte_ft / 50) * 50} ft` : `${Math.round((h.hoogte_ft * 0.3048) / 10) * 10} m`;
export const snelheidTekst = (h) => h.snelheid_kt == null ? "–" : weergave().luchtvaart ? `${Math.round(h.snelheid_kt)} kn` : `${Math.round(h.snelheid_kt * 1.852)} km/u`;

/** A large incident (same rule as the apps and the server). */
const GROOT = /\bGRIP\s*[1-5]\b|zeer\s+grote\s+brand|\bgrote\s+brand\b|middel\s*brand|\bopschaling\b|\bramp\b|\bCoPI\b|grootschalig|\bMMA\b|multi\s*trauma/i;
export function isGrootIncident(m) {
  if (Number(m.grip) > 0 || /middel|groot|grip/i.test(m.opschaling || "")) return true; // "klein" is a small fire
  if (GROOT.test([m.title, m.full_melding, m.categorie].filter(Boolean).join(" "))) return true;
  return Array.isArray(m.eenheden) && m.eenheden.length >= 10;
}

/** Rain radar (KNMI) as a MapKit tile overlay; null when the server has no radar. */
export async function radarLaag(mk) {
  try {
    const r = await fetch(`${API}/v1/radar`).then((x) => x.json());
    if (!r?.beschikbaar || !r.tiles) return null;
    const t = r.tiles;
    return new mk.TileOverlay((x, y, z) => t.replace("{z}", z).replace("{x}", x).replace("{y}", y), { minimumZ: 5, maximumZ: 12, opacity: 0.6 });
  } catch { return null; }
}

/** "Klopt deze melding niet?" – null when sent, otherwise the error text. */
export async function meldingFeedback(guid, body) {
  try {
    const r = await fetch(`${API}/v1/meldingen/${encodeURIComponent(guid)}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, platform: "web" }) });
    if (r.ok) return null;
    const j = await r.json().catch(() => ({}));
    return j.error || `Fout ${r.status}`;
  } catch (e) { return "Geen verbinding"; }
}

export function heliInfo(h) {
  const hoogte = hoogteTekst(h);
  const snelheid = snelheidTekst(h);
  return `${h.soort === "trauma" ? "Traumahelikopter" : "Politiehelikopter"} · ${hoogte} · ${snelheid}`;
}

/** MapKit JS annotation for a helicopter (side view, mirrored when flying west). */
export function heliAnnotation(mk, h) {
  const factory = () => {
    const el = document.createElement("div");
    el.className = "heli-marker";
    // Sizes inline so the drawing never shows at its full size (also with an old stylesheet in the cache).
    const b = heliBreedte();
    el.style.cssText = `display:grid;justify-items:center;gap:2px;width:${b + 12}px;transform:translateY(-50%)`;
    el.innerHTML = `<img src="${heliImg(h)}" alt="" width="${b}" style="width:${b}px;height:auto;display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));${vliegtWest(h) ? "transform:scaleX(-1)" : ""}">`
      + `<span style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.9);color:#111;white-space:nowrap">${esc(h.naam)}</span>`;
    el.title = `${h.naam} · ${heliInfo(h)}`;
    return el;
  };
  return new mk.Annotation(new mk.Coordinate(h.lat, h.lon), factory, { calloutEnabled: false, title: h.naam, anchorOffset: new DOMPoint(0, 0) });
}

/** MapKit JS annotation for an NL-Alert or Burgernet warning. */
export function warnAnnotation(mk, w, onSelect) {
  const factory = () => {
    const el = document.createElement("div");
    el.className = "mk-marker warn-marker";
    if (isBeeindigd(w)) el.style.cssText = "opacity:.6;filter:grayscale(1)";
    el.innerHTML = `<img src="${asset(`assets/img/marker_${w.bron}.png`)}" alt="" style="width:34px;height:auto">`;
    return el;
  };
  const a = new mk.Annotation(new mk.Coordinate(w.lat, w.lon), factory, { calloutEnabled: false, title: w.titel, anchorOffset: new DOMPoint(0, -18) });
  if (onSelect) a.addEventListener("select", () => onSelect(w));
  return a;
}

export function warnOverlays(mk, w) {
  return wRings(w).map((ring) => new mk.PolygonOverlay(ring.map(([lat, lon]) => new mk.Coordinate(lat, lon)), {
    style: new mk.Style({ fillColor: wKleur(w), fillOpacity: 0.2, strokeColor: wKleur(w), lineWidth: 2 }),
  }));
}

export function kazerneAnnotation(mk, k, color) {
  const factory = () => {
    const el = document.createElement("div");
    el.className = "kazerne-marker";
    el.style.setProperty("--c", color);
    el.style.cssText = "width:28px;height:28px;border-radius:8px;background:#fff;display:grid;place-items:center;box-shadow:0 0 0 2px " + color + ",0 3px 8px rgba(0,0,0,.3)";
    el.innerHTML = `<img src="${asset(`assets/img/icon_${k.soort}.png`)}" alt="" style="width:20px;height:20px;object-fit:contain">`;
    el.title = k.naam;
    return el;
  };
  return new mk.Annotation(new mk.Coordinate(k.lat, k.lon), factory, { calloutEnabled: false, title: k.naam });
}

// ------------------------------------------------------------------ helicopter of an alert (same rules as the apps)

/** Helicopter id named in the call-out: "Traumaheli LifeLiner 3" → "lifeliner3", "Zulu 5" → "zulu05". */
export function heliGenoemd(m) {
  const tekst = [...(m.eenheden || []).map((u) => u.naam || ""), m.full_melding || "", m.title || ""].join(" ");
  const ll = /life\s*liner\s*0?([1-4])/i.exec(tekst);
  if (ll) return `lifeliner${ll[1]}`;
  const z = /zulu\s*0?(\d{1,2})/i.exec(tekst);
  return z ? `zulu${z[1].padStart(2, "0")}` : null;
}
export const heliNaam = (id) => id.replace(/^lifeliner/, "Lifeliner ").replace(/^zulu/, "Zulu ");
export const heliRelevant = (m) => m.dienst === "traumaheli" || m.dienst === "lifeliner" || heliGenoemd(m) != null;
/** The named helicopter, or for a trauma alert without a number the closest trauma helicopter in the air. */
export function heliVoor(m, helis) {
  const id = heliGenoemd(m);
  if (id) return helis.find((h) => h.id === id) || null;
  if (!heliRelevant(m) || m.lat == null) return null;
  const best = helis.filter((h) => h.soort === "trauma").sort((a, b) => distanceKm(a, m) - distanceKm(b, m))[0];
  return best && distanceKm(best, m) < 120 ? best : null;
}

// ------------------------------------------------------------------ route trail, flights and smooth movement

/** Trail of one helicopter: scope "vlucht" (this flight), "kort" (30 min) or "lang" (2 hours). Points old → new. */
export async function fetchSpoor(id, scope = "vlucht") {
  try {
    const r = await fetch(`${API}/v1/helikopters/${encodeURIComponent(id)}/spoor?scope=${scope}`, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? (await r.json()).punten || [] : [];
  } catch { return []; }
}
export async function fetchVluchten(id) {
  try {
    const r = await fetch(`${API}/v1/helikopters/${encodeURIComponent(id)}/vluchten`, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? (await r.json()).vluchten || [] : [];
  } catch { return []; }
}

/** Dead reckoning: position now from the last fix, speed and heading (at most 90 s ahead, never on the ground). */
export function geschat(h, now = Date.now()) {
  if (h.op_grond || !(h.snelheid_kt > 20) || h.koers == null) return { lat: h.lat, lon: h.lon };
  const dt = Math.min(Math.max((now - new Date(h.gezien).getTime()) / 1000, 0), 90);
  const km = (h.snelheid_kt * 1.852 * dt) / 3600;
  const rad = (h.koers * Math.PI) / 180;
  return { lat: h.lat + (km * Math.cos(rad)) / 110.574, lon: h.lon + (km * Math.sin(rad)) / (111.32 * Math.cos((h.lat * Math.PI) / 180)) };
}

const PALET = { lifeliner1: "#E11D48", lifeliner2: "#F59E0B", lifeliner3: "#16A34A", lifeliner4: "#7C3AED", lifeliner5: "#0891B2" };
const BLAUW = ["#1D4ED8", "#0EA5E9", "#4F46E5", "#0284C7", "#2563EB", "#6366F1"];
/** Route colour: purple (Lifeliner) and police blue, or a colour per helicopter ("Eigen kleur per helikopter"). */
export const heliKleur = (h) => weergave().kleurPerToestel
  ? PALET[h.id] || BLAUW[(Number(String(h.id).replace(/\D/g, "")) || 0) % BLAUW.length]
  : (h.soort === "trauma" ? "#9333EA" : "#15428B");

/** MapKit JS line for a trail (thinned out to ~400 points), ending at the live position. */
export function spoorOverlay(mk, punten, h, now = Date.now(), { kleur, live = true, breedte = 4, opacity = 0.9 } = {}) {
  const step = Math.max(1, Math.floor(punten.length / 400));
  const pts = punten.filter((_, i) => i % step === 0 || i === punten.length - 1).map((p) => [p.lat, p.lon]);
  if (h && live) { const g = geschat(h, now); pts.push([g.lat, g.lon]); }
  if (pts.length < 2) return null;
  return new mk.PolylineOverlay(pts.map(([la, lo]) => new mk.Coordinate(la, lo)), {
    style: new mk.Style({ strokeColor: kleur || (h ? heliKleur(h) : "#9333EA"), lineWidth: breedte, lineCap: "round", lineJoin: "round", strokeOpacity: opacity }),
  });
}

/** "14:02 – 14:31 · 29 min · 48 km", or "14:02 – nog in de lucht". */
export function vluchtTekst(v) {
  const s = fmtTime(new Date(v.start));
  const tijd = v.onderweg ? `${s} – nog in de lucht` : `${s} – ${fmtTime(new Date(v.einde))}`;
  return `${tijd} · ${v.duur_min} min · ${Math.round(v.afstand_km)} km`;
}

/**
 * Keeps one MapKit annotation per helicopter and moves it smoothly (dead reckoning every second) instead of
 * redrawing all markers. update(list) after every fetch; stop() when the map goes away.
 */
export function heliLaag(mk, map, { onSelect } = {}) {
  const anns = new Map();
  let list = [];
  const timer = setInterval(() => {
    if (weergave().prestatie) return;
    const now = Date.now();
    for (const h of list) { const a = anns.get(h.id); if (a && !h.op_grond) { const g = geschat(h, now); a.coordinate = new mk.Coordinate(g.lat, g.lon); } }
  }, 1000);
  return {
    update(next) {
      list = next || [];
      const ids = new Set(list.map((h) => h.id));
      for (const [id, a] of anns) if (!ids.has(id)) { map.removeAnnotation(a); anns.delete(id); }
      for (const h of list) {
        const old = anns.get(h.id);
        // Flip direction / name changes: replace the marker; otherwise only move it.
        if (old && old._west === vliegtWest(h)) { const g = geschat(h); old.coordinate = new mk.Coordinate(g.lat, g.lon); continue; }
        if (old) map.removeAnnotation(old);
        const a = heliAnnotation(mk, { ...h, ...geschat(h) });
        a._west = vliegtWest(h);
        a._heli = true;
        if (onSelect) a.addEventListener("select", () => onSelect(h.id));
        anns.set(h.id, a);
        map.addAnnotation(a);
      }
    },
    current: (id) => list.find((h) => h.id === id),
    clear() { for (const a of anns.values()) map.removeAnnotation(a); anns.clear(); list = []; },
    stop() { clearInterval(timer); this.clear(); },
  };
}

let werkgebiedCache = null;
/** Dashed border of the municipality (working area). */
export async function werkgebiedLijnen(mk, kleur = "#DC2626") {
  if (!werkgebiedCache) werkgebiedCache = fetch(asset("assets/werkgebied.json")).then((r) => r.json()).catch(() => ({ gebied: [] }));
  const { gebied = [] } = await werkgebiedCache;
  return gebied.map((ring) => new mk.PolylineOverlay([...ring, ring[0]].map(([lon, lat]) => new mk.Coordinate(lat, lon)),
    { style: new mk.Style({ strokeColor: kleur, strokeOpacity: 0.8, lineWidth: 2.5, lineDash: [10, 6] }) }));
}

// ------------------------------------------------------------------ traffic (NDW) and fixed speed cameras (OSM)

const VERKEER_KLEUR = { ongeval: "#E3001B", afsluiting: "#C4001A", file: "#B0002E", pech: "#F08C00", werk: "#F5B400" };
export const VERKEER_SOORT = { ongeval: "Ongeval", afsluiting: "Afsluiting", file: "File", pech: "Pech of obstakel", werk: "Werkzaamheden" };
let verkeerCache = null;
/** GET /v1/verkeer, at most once a minute. */
export async function fetchVerkeer() {
  if (verkeerCache && Date.now() - verkeerCache.at < 60_000) return verkeerCache.data;
  const data = await fetch(`${API}/v1/verkeer`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null);
  if (data) verkeerCache = { at: Date.now(), data };
  return data || verkeerCache?.data || { items: [], gepland: [], flitsers: [] };
}
export const verkeerKleur = (v) => VERKEER_KLEUR[v.soort] || VERKEER_KLEUR.werk;
// ?v=2: the site caches images 30 days; raise when the icons change.
export const verkeerIcon = (soort) => asset(`assets/img/verkeer_${soort}.png?v=2`);
/** "2,4 km · +4 min" */
export const verkeerFile = (v) => [v.lengte_km ? `${String(v.lengte_km).replace(".", ",")} km` : "", v.vertraging_min ? `+${v.vertraging_min} min` : ""].filter(Boolean).join(" · ");
export function verkeerOverlay(mk, v) {
  if (!Array.isArray(v.lijn) || v.lijn.length < 2) return null;
  return new mk.PolylineOverlay(v.lijn.map(([lon, lat]) => new mk.Coordinate(lat, lon)), {
    style: new mk.Style({ strokeColor: verkeerKleur(v), strokeOpacity: 0.9, lineWidth: v.soort === "file" ? 6 : 4, lineCap: "round", lineJoin: "round",
      ...(v.soort === "afsluiting" ? { lineDash: [6, 5] } : {}) }),
  });
}
// A pin (accident, breakdown, speed camera) stands with its point on the spot (MapKit JS anchors the bottom centre);
// a round icon (closure, jam, roadworks) is centred on the spot.
function iconAnnotation(mk, lat, lon, src, title, size, onSelect, item, pin = false) {
  const h = pin ? Math.round(size * 1.25) : size;
  const a = new mk.Annotation(new mk.Coordinate(lat, lon), () => {
    const el = document.createElement("div");
    el.innerHTML = `<img src="${src}" alt="" style="width:${size}px;height:${h}px;display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">`;
    el.title = title;
    return el;
  }, { calloutEnabled: false, title, ...(pin ? {} : { anchorOffset: new DOMPoint(0, size / 2) }) });
  if (onSelect) a.addEventListener("select", () => onSelect(item));
  return a;
}
export const verkeerAnnotation = (mk, v, onSelect) =>
  iconAnnotation(mk, v.lat, v.lon, verkeerIcon(v.soort), [v.kop, v.titel, v.traject].filter(Boolean).join(" · "), 26, onSelect, v, v.soort === "ongeval" || v.soort === "pech");
export const flitserAnnotation = (mk, f, onSelect) =>
  iconAnnotation(mk, f.lat, f.lon, verkeerIcon("flitser"), f.soort === "trajectcontrole" ? "Trajectcontrole" : "Flitser", 24, onSelect, f, true);
const vTijd = (t, opts) => new Date(t).toLocaleString("nl-NL", { timeZone: TZ, ...opts });
const vUur = (t) => vTijd(t, { hour: "2-digit", minute: "2-digit" });
const vDag = (t) => vTijd(t, { weekday: "short", day: "numeric", month: "short" });
/** "do 12 nov 19:00–04:00" (a time slot). */
export const verkeerTijdvak = ([a, e]) => `${vDag(a)} ${vUur(a)}–${vUur(e)}`;
const HINDER = { 1: "weinig hinder", 2: "hinder", 3: "veel hinder" };
/**
 * The lines of a traffic item, like the traffic sites:
 *  kop: "A1 richting Amersfoort" (or the street), wat: "Rijstrook dicht voor werkzaamheden · tussen … en …",
 *  details: ["1 van 2 rijstroken open", "max. 70 km/u", "3,3 km · +7 min"], extra: cause, comments, time slots, end.
 */
export function verkeerRegels(v) {
  const kop = v.kop || v.weg || v.titel;
  const wat = [v.kop || v.weg ? v.titel : null, v.traject, !v.kop && v.plaats ? v.plaats : v.kop && v.plaats && !/^[AN]\d/.test(v.kop) ? v.plaats : null].filter(Boolean).join(" · ");
  const details = [
    verkeerFile(v),
    v.rijstroken?.totaal && v.rijstroken.open < v.rijstroken.totaal ? `${v.rijstroken.open} van ${v.rijstroken.totaal} rijstroken open` : "",
    v.max_snelheid ? `max. ${v.max_snelheid} km/u` : "",
    v.omleiding && v.soort === "afsluiting" ? "omleiding ingesteld" : "",
  ].filter(Boolean);
  const eind = v.einde ? `tot ${vDag(v.einde)} ${vUur(v.einde)}` : "";
  return { kop, wat, details, eind, oorzaak: v.oorzaak || "", toelichting: v.toelichting || [], tijdvakken: v.tijdvakken || [], hinder: HINDER[v.hinder] || "" };
}
/** Panel text of a traffic item (HTML). */
export function verkeerHTML(v) {
  const r = verkeerRegels(v);
  return `<p><img src="${verkeerIcon(v.soort)}" alt="" style="width:20px;height:auto;vertical-align:-4px"> <b style="color:${verkeerKleur(v)}">${esc(VERKEER_SOORT[v.soort] || "")}</b></p>
    ${r.wat ? `<p>${esc(r.wat)}</p>` : ""}
    ${r.details.length ? `<p><b style="color:${verkeerKleur(v)}">${esc(r.details.join(" · "))}</b></p>` : ""}
    ${r.oorzaak ? `<p>${esc(r.oorzaak)}</p>` : ""}${r.toelichting.map((t) => `<p>${esc(t)}</p>`).join("")}
    ${r.tijdvakken.length ? `<p>${esc(r.tijdvakken.map(verkeerTijdvak).join(" · "))}</p>` : ""}
    <p class="hint" style="margin:8px 0 0">${[v.start ? `Sinds ${vDag(v.start)} ${vUur(v.start)}` : "", r.eind, r.hinder, v.bron ? `bron: ${esc(v.bron)} via NDW` : "bron: NDW"].filter(Boolean).join(" · ")}
    ${v.info_url ? ` · <a href="${esc(v.info_url)}" target="_blank" rel="noopener">meer info</a>` : ""}</p>`;
}

// ------------------------------------------------------------------ hospitals, bases, prediction, playback

let locatiesCache = null;
/** Hospitals (emergency department, helipad or trauma centre) and helicopter bases. */
export async function fetchLocaties() {
  locatiesCache ||= fetch(`${API}/v1/locaties`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json())
    .then((d) => [...(d.bases || []).map((b) => ({ ...b, basis: true })), ...(d.ziekenhuizen || [])]).catch(() => { locatiesCache = null; return []; });
  return locatiesCache;
}
export const locatieIcon = (l) => asset(`assets/img/locatie_${l.basis ? "basis" : l.trauma ? "trauma" : "ziekenhuis"}.png`);
export const locatieSoort = (l) => l.basis ? "Helikopterbasis / vliegveld" : l.trauma ? "Traumacentrum" : l.helipad ? "Ziekenhuis met helipad" : "Ziekenhuis met SEH";
export function locatieAnnotation(mk, l, onSelect) {
  const factory = () => {
    const el = document.createElement("div");
    el.innerHTML = `<img src="${locatieIcon(l)}" alt="" style="width:24px;height:24px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">`;
    el.title = `${l.naam} – ${locatieSoort(l)}`;
    return el;
  };
  const a = new mk.Annotation(new mk.Coordinate(l.lat, l.lon), factory, { calloutEnabled: false, title: l.naam });
  if (onSelect) a.addEventListener("select", () => onSelect(l));
  return a;
}
/** "Waarschijnlijk naar Isala · ± 12 min" */
export const voorspellingTekst = (v) => {
  if (!v) return "";
  const eta = v.eta_min ? ` · ± ${v.eta_min} min` : "";
  if (v.soort === "melding") {
    return `Onderweg naar de melding${v.plaats ? ` in ${capPlaats(v.plaats)}` : ""}${eta}${v.daarna ? ` · daarna waarschijnlijk naar ${v.daarna.naam}` : ""}`;
  }
  return `Waarschijnlijk naar ${v.naam}${eta}`;
};
/** Thin dashed line from the helicopter to where it is probably heading. */
export function voorspellingOverlay(mk, h, now = Date.now()) {
  const v = h?.voorspelling;
  if (!v) return null;
  const g = geschat(h, now);
  return new mk.PolylineOverlay([new mk.Coordinate(g.lat, g.lon), new mk.Coordinate(v.lat, v.lon)],
    { style: new mk.Style({ strokeColor: heliKleur(h), strokeOpacity: 0.7, lineWidth: 2, lineDash: [3, 7], lineCap: "round" }) });
}
/** Playback: interpolated point at fraction f (0..1) of a trail, with the time and the trail up to it. */
export function afspeelPunt(punten, f) {
  if (!punten || punten.length < 2) return null;
  const t0 = Date.parse(punten[0].t), t1 = Date.parse(punten[punten.length - 1].t);
  const t = t0 + (t1 - t0) * f;
  let i = punten.findIndex((p) => Date.parse(p.t) >= t);
  if (i < 0) i = punten.length - 1;
  const b = punten[i], a = punten[Math.max(0, i - 1)];
  const ta = Date.parse(a.t), tb = Date.parse(b.t);
  const k = tb > ta ? (t - ta) / (tb - ta) : 1;
  const p = { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, hoogte_ft: a.hoogte_ft ?? b.hoogte_ft };
  return { ...p, t: new Date(t), gespeeld: [...punten.slice(0, i), p] };
}
