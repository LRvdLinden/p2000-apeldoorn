// A-Alerts on the website: NL-Alert, Burgernet, KNMI, live helicopters, alarmed stations and the "verloop".
// Same rules as the app (Shared/Waarschuwing.swift, Verband.swift, Kazernes.swift, Helikopters.swift).
import { API, asset, esc, date, capPlaats, hasStreet, distanceKm, fmtTime } from "./core.js?v=37";

const TZ = "Europe/Amsterdam";

// ------------------------------------------------------------------ warnings

export const BRONNEN = {
  nlalert: { label: "NL-Alert", color: "#FFC800", on: "#000", icon: "icon_nlalert", text: "#B45309" },
  burgernet: { label: "Burgernet", color: "#0067B1", on: "#fff", icon: "icon_burgernet", text: "#0067B1" },
  knmi: { label: "KNMI", color: "#3E9FDB", on: "#fff", icon: "icon_knmi", text: "#2563eb" },
};
const CODES = { yellow: ["Code geel", "#F7C600", "#000"], orange: ["Code oranje", "#F28C28", "#fff"], red: ["Code rood", "#E3001B", "#fff"] };

export async function fetchWaarschuwingen(days = 7) {
  try {
    const r = await fetch(`${API}/v1/waarschuwingen?days=${days}`, { signal: AbortSignal.timeout(10_000) });
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
  return "NL-Alert";
}
export const wStatus = (w) => (w.status === "beeindigd" ? "Beëindigd" : w.status === "verwacht" ? "Verwacht" : "Actief");
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
export async function kazerneRoutes(m) {
  const soort = SOORT[m.dienst];
  if (!soort || !hasStreet(m) || m.lat == null) return [];
  const all = (await kazernes()).filter((k) => k.soort === soort);
  const namen = [...(m.eenheden || []).map((u) => String(u.naam || "").toLowerCase()), String(m.full_melding || "").toLowerCase()];
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let gekozen = all.filter((k) => (k.aliassen || []).some((a) => namen.some((n) => new RegExp(`\\b${reEsc(a.toLowerCase())}\\b`).test(n))));
  const genoemd = gekozen.length > 0;
  if (!gekozen.length && all.length) gekozen = [all.reduce((best, k) => (distanceKm(k, m) < distanceKm(best, m) ? k : best))];
  gekozen = gekozen.filter((k) => distanceKm(k, m) < 40).slice(0, 5);
  const spoed = ["A0", "A1", "P1", "A2", "P2"].includes(String(m.prioriteit || "").toUpperCase());
  return gekozen.map((k) => {
    const km = distanceKm(k, m) * 1.3;
    const rij = (km / 50) * 60 * (spoed ? 0.75 : 1);
    const aankomst = new Date(date(m).getTime() + (UITRUK[soort] + rij) * 60_000);
    return { kazerne: k, genoemd, km, rij, aankomst };
  }).sort((a, b) => a.aankomst - b.aankomst);
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
export function heliInfo(h) {
  const hoogte = h.op_grond ? "op de grond" : h.hoogte_ft != null ? `${Math.round((h.hoogte_ft * 0.3048) / 10) * 10} m` : "–";
  const snelheid = h.snelheid_kt != null ? `${Math.round(h.snelheid_kt * 1.852)} km/u` : "–";
  return `${h.soort === "trauma" ? "Traumahelikopter" : "Politiehelikopter"} · ${hoogte} · ${snelheid}`;
}

/** MapKit JS annotation for a helicopter (side view, mirrored when flying west). */
export function heliAnnotation(mk, h) {
  const factory = () => {
    const el = document.createElement("div");
    el.className = "heli-marker";
    // Sizes inline so the drawing never shows at its full size (also with an old stylesheet in the cache).
    el.style.cssText = "display:grid;justify-items:center;gap:2px;width:96px;transform:translateY(-50%)";
    el.innerHTML = `<img src="${heliImg(h)}" alt="" width="84" style="width:84px;height:auto;display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35));${vliegtWest(h) ? "transform:scaleX(-1)" : ""}">`
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

export const heliKleur = (h) => (h.soort === "trauma" ? "#9333EA" : "#15428B");

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
export const voorspellingTekst = (v) => v ? `Waarschijnlijk naar ${v.naam}${v.eta_min ? ` · ± ${v.eta_min} min` : ""}` : "";
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
