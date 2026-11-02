// Shared helpers for the P2000 Apeldoorn website (landing page + live pager).
// Data comes from the app's own API (Cloudflare Worker in worker/), never from the website builder.

const CFG = Object.assign({ api: "https://p2000-apeldoorn-api.lrvdlinden.workers.dev", mapkitToken: "" }, window.P2000_CONFIG || {});
export const API = CFG.api.replace(/\/+$/, "");
export const config = CFG;
const base = new URL("../../", import.meta.url); // website root (works on a sub-path such as GitHub Pages)
export const asset = (p) => new URL(p, base).href;

export const DIENSTEN = {
  brandweer: { label: "Brandweer", color: "#E30613", text: "#E30613", icon: "icon_brandweer", marker: "marker_brandweer" },
  ambulance: { label: "Ambulance", color: "#F4C400", text: "#B45309", icon: "icon_ambulance", marker: "marker_ambulance" },
  politie: { label: "Politie", color: "#15428B", text: "#3B6FD0", icon: "icon_politie", marker: "marker_politie" },
  traumaheli: { label: "Traumaheli", color: "#9333EA", text: "#9333EA", icon: "icon_traumaheli", marker: "marker_traumaheli" },
  kustwacht: { label: "Kustwacht", color: "#0891B2", text: "#0891B2", icon: "icon_brandweer", marker: "marker_brandweer" },
  onbekend: { label: "Overig", color: "#6B7280", text: "#6B7280", icon: "icon_brandweer", marker: "marker_brandweer" },
};
export const SELECTABLE = ["brandweer", "ambulance", "politie", "traumaheli"];
export const PLAATSEN = ["Apeldoorn", "Beekbergen", "Beemte-Broekland", "Hoenderloo", "Hoog Soeren", "Klarenbeek",
  "Lieren", "Loenen", "Radio Kootwijk", "Teuge", "Uddel", "Ugchelen", "Wenum-Wiesel"];
export const dienstOf = (m) => DIENSTEN[m?.dienst] || DIENSTEN.onbekend;

// ------------------------------------------------------------------ data

export let demoMode = false;
let demoCache = null;

async function demoData() {
  if (demoCache) return demoCache;
  const list = await (await fetch(asset("assets/demo.json"))).json();
  // Shift the sample so the newest alert is a few minutes old.
  const newest = Math.max(...list.map((m) => Date.parse(m.datum_tijd)));
  const shift = Date.now() - 4 * 60_000 - newest;
  demoCache = list.map((m) => ({ ...m, datum_tijd: new Date(Date.parse(m.datum_tijd) + shift).toISOString() }));
  return demoCache;
}

export async function fetchMeldingen(limit = 500) {
  try {
    const res = await fetch(`${API}/v1/meldingen?limit=${limit}`, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(res.status);
    demoMode = false;
    return { list: await res.json(), online: true };
  } catch {
    demoMode = true;
    return { list: await demoData(), online: false };
  }
}

export async function fetchMelding(guid) {
  try {
    const res = await fetch(`${API}/v1/meldingen/${encodeURIComponent(guid)}`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) return await res.json();
  } catch {}
  return (await demoData()).find((m) => m.guid === guid) || null;
}

export async function fetchWeather(guid) {
  if (demoMode) return null;
  try {
    const res = await fetch(`${API}/v1/meldingen/${encodeURIComponent(guid)}/weather`, { signal: AbortSignal.timeout(12_000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export function addView(guid) {
  if (demoMode) return;
  fetch(`${API}/v1/meldingen/${encodeURIComponent(guid)}/view`, { method: "POST" }).catch(() => {});
}

// ------------------------------------------------------------------ formatting

const TZ = "Europe/Amsterdam";
export const date = (m) => new Date(m.datum_tijd);
export const fmtTime = (d) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const fmtTimeSec = (d) => d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });
export const fmtDay = (d) => cap(d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }));
export const fmtDayShort = (d) => d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
export const fmtDateTime = (d) => d.toLocaleString("nl-NL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function ago(d, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - d.getTime()) / 60_000));
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h} uur, ${m} min geleden` : `${h} uur geleden`;
  const days = Math.floor(h / 24);
  return days === 1 ? "1 dag geleden" : `${days} dagen geleden`;
}

/** Local (Amsterdam) day key, e.g. 2026-11-02. */
export const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });
export const hourOf = (d) => Number(d.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ })) % 24;

export const isRecent = (m) => Date.now() - date(m).getTime() < 10 * 60_000;
export const isUrgent = (m) => ["A0", "A1", "P1"].includes(String(m.prioriteit || "").toUpperCase());

export function capPlaats(s) {
  if (!s) return "";
  return s.toLowerCase().split(/([\s-])/).map((p) => (/[\s-]/.test(p) ? p : cap(p))).join("");
}

export function prioText(m) {
  const c = m.categorie || "";
  const p = m.prioriteit && m.prioriteit.toLowerCase() !== "onbekend" ? m.prioriteit : "";
  return p ? (c ? `Prioriteit ${p} - ${c}` : `Prioriteit ${p}`) : c;
}

export function plaatsText(m) {
  const parts = [m.locatie, capPlaats(m.stad)].filter((v) => v && v.trim() && v.toLowerCase() !== "onbekend");
  return parts.length ? parts.join(", ") : "Apeldoorn";
}

export const hasStreet = (m) => Boolean(m.locatie && m.locatie.trim() && m.locatie.toLowerCase() !== "onbekend");

export function story(m, today, yesterday) {
  const stad = capPlaats(m.stad) || "Apeldoorn";
  const dienst = dienstOf(m).label.toLowerCase();
  const d = date(m);
  const wat = m.categorie || m.title;
  const urgent = ["A0", "A1", "A2", "P1"].includes(String(m.prioriteit || "").toUpperCase());
  let p1 = `De ${dienst} van ${stad} is ${fmtDayShort(d)} gealarmeerd voor een "${wat}"`;
  if (hasStreet(m)) p1 += ` op ${m.locatie}`;
  p1 += ` te ${stad}. De melding werd om ${fmtTime(d)} via het P2000 netwerk verzonden naar de ${dienst} van ${stad}, die het verzoek kreeg om ${urgent ? "met spoed ter plaatse" : "ter plaatse"} te komen.`;
  const parts = [p1,
    `${stad} is een plaats in de provincie Gelderland en valt onder de P2000-regio Noord- en Oost-Gelderland.`,
    `De hulpdiensten in ${stad} reageren onder meer op 112 meldingen die bij deze veiligheidsregio binnenkomen. Via P2000 worden deze 112 meldingen uitgestuurd naar bijvoorbeeld het juiste brandweerkorps, ambulancedienst of de dienstdoende politieagenten.`];
  if (today && yesterday && today.totaal + yesterday.totaal > 0) {
    parts.push(`Vandaag is de brandweer ${today.perDienst.brandweer || 0} keer en de ambulance ${today.perDienst.ambulance || 0} keer gealarmeerd in gem. Apeldoorn; gisteren waren dat ${yesterday.perDienst.brandweer || 0} en ${yesterday.perDienst.ambulance || 0} keer.`);
  }
  return parts;
}

// ------------------------------------------------------------------ statistics (today vs yesterday)

export function dayStats(list, day) {
  const key = dayKey(day);
  const now = new Date();
  const nowMinutes = hourOf(now) * 60 + now.getMinutes();
  const s = { day, totaal: 0, totaalTotNu: 0, perDienst: {}, perPrioriteit: {}, perCategorie: {}, perUur: Array(24).fill(0) };
  for (const m of list) {
    const d = date(m);
    if (dayKey(d) !== key) continue;
    s.totaal++;
    s.perDienst[m.dienst] = (s.perDienst[m.dienst] || 0) + 1;
    const p = String(m.prioriteit || "").toUpperCase();
    if (p && p !== "ONBEKEND") s.perPrioriteit[p] = (s.perPrioriteit[p] || 0) + 1;
    if (m.categorie) s.perCategorie[m.categorie] = (s.perCategorie[m.categorie] || 0) + 1;
    const h = hourOf(d);
    s.perUur[h]++;
    if (h * 60 + d.getMinutes() <= nowMinutes) s.totaalTotNu++;
  }
  return s;
}
export const today = (list) => dayStats(list, new Date());
export const yesterday = (list) => dayStats(list, new Date(Date.now() - 86_400_000));

// ------------------------------------------------------------------ read state (like the app: opened alerts turn grey)

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export const prefs = store;
let readSet = new Set(store.get("p2000.read", []));
export const isRead = (m) => readSet.has(m.guid);
export function markRead(m) {
  if (readSet.has(m.guid)) return;
  readSet.add(m.guid);
  store.set("p2000.read", [...readSet].slice(-600));
}

// ------------------------------------------------------------------ geo

export function distanceKm(a, b) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function appleMapsURL(m) {
  if (m.lat != null && m.lon != null) {
    return `https://maps.apple.com/?ll=${m.lat},${m.lon}&q=${encodeURIComponent(plaatsText(m))}`;
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(plaatsText(m))}`;
}

// ------------------------------------------------------------------ MapKit JS

let mapkitReady = null;

/** Loads MapKit JS once. Resolves to window.mapkit, or null when no token is available. */
export function loadMapKit() {
  if (mapkitReady) return mapkitReady;
  mapkitReady = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";
    s.crossOrigin = "anonymous";
    s.dataset.libraries = "map,annotations,overlays,look-around";
    s.dataset.callback = "__p2000MapKit";
    s.onerror = () => resolve(null);
    window.__p2000MapKit = () => {
      const mk = window.mapkit;
      let settled = false;
      mk.init({
        language: "nl",
        authorizationCallback: async (done) => {
          if (CFG.mapkitToken) return done(CFG.mapkitToken);
          try {
            const r = await fetch(`${API}/v1/mapkit-token`, { signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error(r.status);
            done(await r.text());
          } catch {
            if (!settled) { settled = true; resolve(null); }
          }
        },
      });
      mk.addEventListener("configuration-change", (e) => {
        if (e.status === "Initialized" && !settled) { settled = true; resolve(mk); }
      });
      mk.addEventListener("error", () => { if (!settled) { settled = true; resolve(null); } });
      setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 10_000);
    };
    document.head.appendChild(s);
  });
  return mapkitReady;
}

export function markerAnnotation(mk, m, onSelect) {
  const coord = new mk.Coordinate(m.lat, m.lon);
  const factory = () => {
    const el = document.createElement("div");
    el.className = "mk-marker" + (isRecent(m) ? " is-live" : "");
    el.innerHTML = `<img src="${asset(`assets/img/${dienstOf(m).marker}.png`)}" alt="">`;
    return el;
  };
  const a = new mk.Annotation(coord, factory, {
    anchorOffset: new DOMPoint(0, -18),
    calloutEnabled: false,
    title: m.title,
    data: { guid: m.guid },
  });
  if (onSelect) a.addEventListener("select", () => onSelect(m));
  return a;
}

/** Spread alerts at the same spot in a small circle (like the website and the app). */
export function spread(list) {
  const groups = new Map();
  for (const m of list) {
    if (m.lat == null || m.lon == null) continue;
    const k = `${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    const r = 0.0009 + g.length * 0.00012;
    g.forEach((m, i) => {
      const a = (2 * Math.PI * i) / g.length;
      out.push({ ...m, lat: m.lat + r * Math.cos(a), lon: m.lon + (r * Math.sin(a)) / Math.cos((m.lat * Math.PI) / 180) });
    });
  }
  return out;
}

/** Alerts with a street get their own pin; alerts with only a town name (all geocoded to the town centre)
 *  become one marker per town instead of a big ring of identical pins. */
export function layout(list) {
  const withCoord = list.filter((m) => m.lat != null && m.lon != null);
  const pins = spread(withCoord.filter(hasStreet));
  const towns = new Map();
  for (const m of withCoord.filter((x) => !hasStreet(x))) {
    const k = capPlaats(m.stad || "") || "Apeldoorn";
    if (!towns.has(k)) towns.set(k, []);
    towns.get(k).push(m);
  }
  const clusters = [...towns].map(([plaats, items]) => {
    const per = {};
    items.forEach((m) => (per[m.dienst] = (per[m.dienst] || 0) + 1));
    const main = Object.entries(per).sort((a, b) => b[1] - a[1])[0][0];
    return {
      id: `plaats-${plaats}`, plaats, meldingen: items.sort((a, b) => date(b) - date(a)), main,
      diensten: SELECTABLE.filter((d) => per[d]),
      lat: items.reduce((t, m) => t + m.lat, 0) / items.length, lon: items.reduce((t, m) => t + m.lon, 0) / items.length,
    };
  });
  return { pins, clusters };
}

export function clusterEl(c, onClick) {
  const el = document.createElement("div");
  el.className = "mk-cluster";
  el.style.setProperty("--c", (DIENSTEN[c.main] || DIENSTEN.onbekend).color);
  el.title = `${c.meldingen.length} meldingen zonder adres in ${c.plaats}`;
  el.innerHTML = `<div class="mk-cluster-dot"><span class="mk-cluster-ic">${c.diensten.slice(0, 3).map((d) => `<img src="${asset(`assets/img/${DIENSTEN[d].icon}.png`)}" alt="">`).join("")}</span><b>${c.meldingen.length}</b></div><span class="mk-cluster-name">${esc(c.plaats)}</span>`;
  if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(c); });
  return el;
}

export function clusterAnnotation(mk, c, onClick) {
  return new mk.Annotation(new mk.Coordinate(c.lat, c.lon), () => clusterEl(c, onClick), {
    anchorOffset: new DOMPoint(0, -30), calloutEnabled: false, title: c.plaats, data: { cluster: c.id },
  });
}

// ------------------------------------------------------------------ weather labels

export const CONDITIONS = {
  Clear: ["Helder", "☀️"], MostlyClear: ["Overwegend helder", "🌤️"], PartlyCloudy: ["Half bewolkt", "⛅"],
  MostlyCloudy: ["Overwegend bewolkt", "🌥️"], Cloudy: ["Bewolkt", "☁️"], Foggy: ["Mist", "🌫️"], Haze: ["Nevel", "🌫️"],
  Smoky: ["Rook", "🌫️"], Breezy: ["Matige wind", "🍃"], Windy: ["Harde wind", "💨"], Drizzle: ["Motregen", "🌦️"],
  Rain: ["Regen", "🌧️"], HeavyRain: ["Zware regen", "🌧️"], SunShowers: ["Zon en buien", "🌦️"], ScatteredThunderstorms: ["Plaatselijk onweer", "⛈️"],
  IsolatedThunderstorms: ["Plaatselijk onweer", "⛈️"], Thunderstorms: ["Onweer", "⛈️"], StrongStorms: ["Zware storm", "⛈️"],
  Flurries: ["Lichte sneeuw", "🌨️"], Snow: ["Sneeuw", "❄️"], HeavySnow: ["Zware sneeuw", "❄️"], Sleet: ["Natte sneeuw", "🌨️"],
  FreezingDrizzle: ["IJzel", "🌧️"], FreezingRain: ["IJzel", "🌧️"], MixedRainAndSnow: ["Regen en sneeuw", "🌨️"],
  Hail: ["Hagel", "🌨️"], Frigid: ["Zeer koud", "🥶"], Hot: ["Heet", "🥵"], BlowingSnow: ["Stuifsneeuw", "🌬️"],
};
export function compass(deg) {
  const names = ["Noorden", "Noordoosten", "Oosten", "Zuidoosten", "Zuiden", "Zuidwesten", "Westen", "Noordwesten"];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// ------------------------------------------------------------------ misc UI

/** Reveal-on-scroll for elements with [data-reveal]. */
export function reveal(root = document) {
  const els = root.querySelectorAll("[data-reveal]:not(.is-in)");
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

export function countUp(el, to, ms = 1100) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = to;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ------------------------------------------------------------------ visitor count (no cookies, no storage)

/** Counts a page view for P2000Beheer. The API only keeps a daily-salted hash, never the IP address. */
export function trackVisit() {
  if (location.protocol === "file:" || /^(localhost|127\.)/.test(location.hostname)) return;
  try {
    fetch(`${API}/v1/visit`, { method: "POST", body: JSON.stringify({ path: location.pathname }), keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  } catch {}
}
