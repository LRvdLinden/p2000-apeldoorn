// Meldkamer (control-room) view: the Apple TV app on the website. Live map with an automatic tour,
// an alarm screen for new alerts, today's counts and today vs. yesterday. Made for a big screen.
import {
  trackVisit, fetchMeldingen, DIENSTEN, SELECTABLE, dienstOf, asset, date, fmtTime, fmtTimeSec, fmtDay, ago, esc,
  isRecent, isUrgent, prioText, plaatsText, today as todayStats, yesterday as yesterdayStats, prefs, loadMapKit, layout, clusterEl, hasStreet, capPlaats,
  demoMode, countUp,
} from "./core.js?v=49";
import {
  BRONNEN, fetchWaarschuwingen, fetchHelikopters, wKop, wTijd, wKleur, wOpKleur, wIcon, wStart, isActief, isBeeindigd, warnAnnotation, warnOverlays,
  heliLaag, fetchSpoor, spoorOverlay, geschat, fetchLocaties, locatieAnnotation, voorspellingOverlay, voorspellingTekst, heliImg, heliInfo, vliegtWest, heliVoor, heliRelevant, kazernes, kazerneAnnotation, kazerneRoutes, werkgebiedLijnen,
} from "./aalerts.js?v=49";

const $ = (id) => document.getElementById(id);
trackVisit();

const WINDOW_MS = 24 * 3600_000;
const TOUR_MS = 12_000;
const OVERVIEW = { lat: 52.205, lon: 5.95, dLat: 0.24, dLon: 0.42 };
const state = {
  list: [], known: new Set(), first: true, online: false,
  tour: prefs.get("mk.tour", true), sound: false, urgentOnly: prefs.get("mk.urgentOnly", false),
  focus: null, tourIndex: 0, lastFly: 0,
  warnings: [], helis: [], sporen: new Map(), knownWarn: new Map(),
  lagen: new Set(prefs.get("mk.lagen", ["waarschuwingen", "knmi", "helikopters", "werkgebied", "ziekenhuizen"])),
};
// Map layers, like the Apple TV control room and the live pager.
const LAGEN = [["waarschuwingen", "NL-Alert & Burgernet"], ["knmi", "KNMI"], ["helikopters", "Heli's"], ["kazernes", "Kazernes"], ["ziekenhuizen", "Ziekenhuizen"], ["werkgebied", "Grens"]];
const icon = (m) => asset(`assets/img/${dienstOf(m).icon}.png`);
const marker = (m) => asset(`assets/img/${dienstOf(m).marker}.png`);
const inWindow = () => state.list.filter((m) => Date.now() - date(m).getTime() < WINDOW_MS);
const mapped = () => inWindow().filter((m) => m.lat != null && m.lon != null);
const pagerLink = (m) => `../pager/?melding=${encodeURIComponent(m.guid)}`;

// ------------------------------------------------------------------ clock

function tick() {
  const now = new Date();
  $("clock").textContent = fmtTimeSec(now);
  $("date").textContent = fmtDay(now);
}
tick();
setInterval(tick, 1000);

// ------------------------------------------------------------------ map

let mk = null, map = null;
const annByGuid = new Map();
const elByGuid = new Map();

const mapReady = loadMapKit().then((kit) => {
  if (!kit) return null;
  mk = kit;
  map = new mk.Map($("map"), {
    region: region(OVERVIEW),
    colorScheme: mk.Map.ColorSchemes.Dark,
    mapType: mk.Map.MapTypes.MutedStandard,
    showsCompass: mk.FeatureVisibility.Hidden,
    showsZoomControl: false,
    showsMapTypeControl: false,
    showsPointsOfInterest: false,
    isRotationEnabled: false,
    padding: new mk.Padding(70, 30, 150, 30),
  });
  return mk;
});

function region({ lat, lon, dLat, dLon }) {
  return new mk.CoordinateRegion(new mk.Coordinate(lat, lon), new mk.CoordinateSpan(dLat, dLon));
}

function markerEl(m) {
  const el = document.createElement("div");
  el.className = "mk-marker" + (isRecent(m) ? " is-live" : "");
  el.style.setProperty("--c", dienstOf(m).color);
  el.innerHTML = `<img src="${marker(m)}" alt="">`;
  el.addEventListener("click", () => window.open(pagerLink(m), "_self"));
  elByGuid.set(m.guid, el);
  return el;
}

const clusterOf = new Map(); // melding guid -> cluster id (alerts without a street)

async function renderMap() {
  const { pins, clusters } = layout(mapped());
  clusterOf.clear();
  clusters.forEach((c) => c.meldingen.forEach((m) => clusterOf.set(m.guid, c.id)));
  const kit = await mapReady;
  if (!kit) return renderStatic(pins, clusters);
  // Clusters change when their count changes, so they are always rebuilt; pins are kept.
  for (const [id, a] of annByGuid) {
    if (id.startsWith("plaats-") || !pins.some((m) => m.guid === id)) { map.removeAnnotation(a); annByGuid.delete(id); elByGuid.delete(id); }
  }
  const add = [
    ...clusters.map((c) => {
      const a = new mk.Annotation(new mk.Coordinate(c.lat, c.lon), () => { const el = clusterEl(c, openTown); elByGuid.set(c.id, el); return el; },
        { anchorOffset: new DOMPoint(0, -18), calloutEnabled: false, title: c.plaats });
      annByGuid.set(c.id, a);
      return a;
    }),
    ...pins.filter((m) => !annByGuid.has(m.guid)).map((m) => {
      const a = new mk.Annotation(new mk.Coordinate(m.lat, m.lon), () => markerEl(m), { anchorOffset: new DOMPoint(0, -18), calloutEnabled: false, title: m.title });
      annByGuid.set(m.guid, a);
      return a;
    }),
  ];
  if (add.length) map.addAnnotations(add);
  setFocus(state.focus);
}

// A-Alerts layers: NL-Alert / Burgernet / KNMI areas, municipality border, stations, the helicopters with their
// route of the last 30 minutes (moving smoothly between updates), and for the focused alert its stations and Lifeliner.
let extraAnn = [], extraOv = [], heliMarkers = null;
async function renderExtra(kit) {
  if (!kit || !map) return;
  if (extraAnn.length) map.removeAnnotations(extraAnn);
  if (extraOv.length) map.removeOverlays(extraOv);
  const L = state.lagen;
  const actief = state.warnings.filter(isActief);
  const dag = state.warnings.filter((w) => w.bron !== "knmi" && (isActief(w) || Date.now() - new Date(w.einde || w.start).getTime() < WINDOW_MS));
  const ov = [
    ...(L.has("knmi") ? actief.filter((w) => w.bron === "knmi").flatMap((w) => warnOverlays(kit, w)) : []),
    ...(L.has("waarschuwingen") ? dag.flatMap((w) => warnOverlays(kit, w)) : []),
    ...(L.has("werkgebied") ? await werkgebiedLijnen(kit) : []),
    ...(L.has("helikopters") ? state.helis.map((h) => spoorOverlay(kit, state.sporen.get(h.id) || [], h)).filter(Boolean) : []),
    ...(L.has("helikopters") ? state.helis.map((h) => voorspellingOverlay(kit, h)).filter(Boolean) : []),
  ];
  const ann = [
    ...(L.has("waarschuwingen") ? dag.filter((w) => w.lat != null).map((w) => warnAnnotation(kit, w)) : []),
    ...(L.has("kazernes") ? (await kazernes()).map((k) => kazerneAnnotation(kit, k, DIENSTEN[k.soort]?.color || "#E30613")) : []),
    ...(L.has("ziekenhuizen") ? (await fetchLocaties()).map((l) => locatieAnnotation(kit, l)) : []),
  ];
  // Focused alert: alarmed stations (dashed line) and its Lifeliner/Zulu (dashed line to the scene).
  const f = inWindow().find((m) => m.guid === state.focus);
  if (f && f.lat != null) {
    for (const r of await kazerneRoutes(f)) {
      if (!L.has("kazernes")) ann.push(kazerneAnnotation(kit, r.kazerne, dienstOf(f).color));
      ov.push(new kit.PolylineOverlay([new kit.Coordinate(r.kazerne.lat, r.kazerne.lon), new kit.Coordinate(f.lat, f.lon)],
        { style: new kit.Style({ strokeColor: dienstOf(f).color, lineWidth: 3, lineDash: [8, 7], lineCap: "round" }) }));
    }
    const h = heliRelevant(f) ? heliVoor(f, state.helis) : null;
    if (h) {
      const g = geschat(h);
      ov.push(new kit.PolylineOverlay([new kit.Coordinate(g.lat, g.lon), new kit.Coordinate(f.lat, f.lon)],
        { style: new kit.Style({ strokeColor: "#9333EA", lineWidth: 3, lineDash: [4, 7], lineCap: "round" }) }));
    }
  }
  extraOv = ov; extraAnn = ann;
  if (extraOv.length) map.addOverlays(extraOv);
  if (extraAnn.length) map.addAnnotations(extraAnn);
  heliMarkers ||= heliLaag(kit, map);
  heliMarkers.update(L.has("helikopters") ? state.helis : []);
  renderHeliList();
  renderChips();
}

async function refreshHelis() {
  state.helis = await fetchHelikopters();
  // Route of the last 30 minutes for every helicopter in the air (at most 6).
  const lucht = state.helis.filter((h) => !h.op_grond).slice(0, 6);
  const sporen = await Promise.all(lucht.map((h) => fetchSpoor(h.id, "kort")));
  state.sporen = new Map(lucht.map((h, i) => [h.id, sporen[i]]));
  renderExtra(await mapReady);
}

/** Helicopters in the air with altitude and speed, bottom right of the map (like Apple TV). */
function renderHeliList() {
  const box = $("helis");
  if (!box) return;
  const list = state.lagen.has("helikopters") ? state.helis : [];
  box.innerHTML = list.slice(0, 4).map((h) => `<div class="heli-row">
    <img src="${heliImg(h)}" alt="" style="${vliegtWest(h) ? "transform:scaleX(-1)" : ""}">
    <span><b>${esc(h.naam)}</b><small>${esc(heliInfo(h))}</small>${h.voorspelling ? `<small class="dest">${esc(voorspellingTekst(h.voorspelling))}</small>` : ""}</span></div>`).join("");
  box.hidden = !list.length;
}

function renderLagen() {
  $("lagen").innerHTML = LAGEN.map(([k, l]) => `<button class="laag${state.lagen.has(k) ? " on" : ""}" data-laag="${k}">${l}</button>`).join("");
}
$("lagen").addEventListener("click", (e) => {
  const k = e.target.closest("[data-laag]")?.dataset.laag;
  if (!k) return;
  state.lagen.has(k) ? state.lagen.delete(k) : state.lagen.add(k);
  prefs.set("mk.lagen", [...state.lagen]);
  renderLagen();
  mapReady.then(renderExtra);
  renderKnmi();
});
renderLagen();

const openTown = () => window.open("../pager/#kaart", "_self");

/** Without MapKit: markers placed roughly over the brand map texture. */
function renderStatic(pins, clusters) {
  let box = $("map").querySelector(".static-markers");
  if (!box) { box = document.createElement("div"); box.className = "static-markers"; $("map").appendChild(box); }
  box.innerHTML = "";
  elByGuid.clear();
  const pos = (m) => ({ x: 50 + ((m.lon - 5.9699) / (0.22 * 1.6)) * 100, y: 50 - ((m.lat - 52.2112) / 0.22) * 100 });
  const inside = ({ x, y }) => x >= 2 && x <= 98 && y >= 10 && y <= 96;
  for (const c of clusters) {
    const p = pos(c);
    if (!inside(p)) continue;
    const el = clusterEl(c, openTown);
    el.style.cssText = `position:absolute;left:${p.x}%;top:${p.y}%;margin:-38px 0 0 -19px`;
    elByGuid.set(c.id, el);
    box.appendChild(el);
  }
  for (const m of pins) {
    const p = pos(m);
    if (!inside(p)) continue;
    const el = markerEl(m);
    el.style.cssText += `;position:absolute;left:${p.x}%;top:${p.y}%;margin:-38px 0 0 -19px`;
    box.appendChild(el);
  }
  setFocus(state.focus);
}

function setFocus(guid) {
  state.focus = guid;
  const target = clusterOf.get(guid) || guid;
  for (const [g, el] of elByGuid) el.classList.toggle("is-focus", g === target);
  document.querySelectorAll(".row").forEach((r) => r.classList.toggle("is-focus", r.dataset.guid === guid));
  renderLatest();
  if (map && mk) renderExtra(mk);
}

function fly(m) {
  if (!m) return;
  setFocus(m.guid);
  state.lastFly = Date.now();
  // Without a street the coordinate is only the town centre: show the town, not a street corner.
  const span = hasStreet(m) ? { dLat: 0.018, dLon: 0.03 } : { dLat: 0.06, dLon: 0.1 };
  if (map && m.lat != null) map.setRegionAnimated(region({ lat: m.lat, lon: m.lon, ...span }), true);
}

function overview() {
  setFocus(null);
  if (map) map.setRegionAnimated(region(OVERVIEW), true);
}

// Automatic tour: every 12 seconds the next alert of the last 24 hours, then the overview again.
setInterval(() => {
  if (!state.tour || document.hidden || !$("alarm").hidden) return;
  if (Date.now() - state.lastFly < TOUR_MS - 500) return;
  // Each town without street names only once, so the tour doesn't keep flying to the same centre.
  const towns = new Set();
  const list = mapped().filter((m) => hasStreet(m) || (!towns.has(capPlaats(m.stad || "")) && towns.add(capPlaats(m.stad || "")))).slice(0, 8);
  if (!list.length) return;
  if (state.tourIndex >= list.length) { state.tourIndex = 0; state.lastFly = Date.now(); overview(); return; }
  fly(list[state.tourIndex++]);
}, 1000);

// ------------------------------------------------------------------ panels

function renderChips() {
  const items = mapped();
  const dag = Date.now() - WINDOW_MS;
  const n = (b) => state.warnings.filter((w) => w.bron === b && (isActief(w) || new Date(w.einde || w.start).getTime() >= dag)).length;
  const heli = (soort, label) => {
    const list = state.helis.filter((h) => h.soort === soort);
    return list.length ? `<span class="chip heli-chip"><img src="${heliImg(list[0])}" alt="${label}">${list.length}</span>` : "";
  };
  $("chips").innerHTML = SELECTABLE.map((d) =>
    `<span class="chip"><img src="${icon({ dienst: d })}" alt="${DIENSTEN[d].label}">${items.filter((m) => m.dienst === d).length}</span>`).join("")
    + `<span class="chip"><img src="${asset("assets/img/icon_burgernet.png")}" alt="Burgernet">${n("burgernet")}</span>`
    + `<span class="chip"><img src="${asset("assets/img/icon_nlalert.png")}" alt="NL-Alert">${n("nlalert")}</span>`
    + heli("trauma", "Lifeliner") + heli("politie", "Zulu");
}

function renderLatest() {
  const list = inWindow();
  const m = list.find((x) => x.guid === state.focus) || list[0];
  if (!m) { $("latest").innerHTML = ""; return; }
  if ($("latest").dataset.guid === m.guid) return;
  $("latest").dataset.guid = m.guid;
  const pr = prioText(m);
  $("latest").innerHTML = `<a class="latest-card" href="${pagerLink(m)}" style="--c:${dienstOf(m).text}">
    <img src="${icon(m)}" alt="">
    <div><div class="meta">${isRecent(m) ? '<span class="live">LIVE</span>' : ""}<span>${esc(ago(date(m)))} · ${fmtTime(date(m))}</span></div>
      <h2>${esc(m.title)}</h2><div class="where">${esc(plaatsText(m))}</div>${pr ? `<div class="pr">${esc(pr)}</div>` : ""}</div></a>`;
}

const calendarSVG = `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
function renderTiles() {
  const t = todayStats(state.list);
  const tiles = [["tTotal", "Vandaag", t.totaal, "#DC2626", calendarSVG],
    ...SELECTABLE.map((d) => [`t_${d}`, d === "traumaheli" ? "Lifeliner" : DIENSTEN[d].label, t.perDienst[d] || 0, DIENSTEN[d].color, `<img src="${icon({ dienst: d })}" alt="">`])];
  if (!$("tiles").children.length) {
    $("tiles").innerHTML = tiles.map(([id, label, , c, ic]) => `<div class="tile" style="--c:${c}">${ic}<b id="${id}">0</b><small>${label}</small></div>`).join("");
  }
  for (const [id, , n] of tiles) countUp($(id), n);

  const y = yesterdayStats(state.list);
  const diff = t.totaal - y.totaalTotNu;
  const dc = diff > 0 ? "#f87171" : diff < 0 ? "#4ade80" : "#a1a1ae";
  $("vs").innerHTML = `
    <div class="vs-box today"><small>Vandaag</small><b>${t.totaal}</b></div>
    <div class="vs-box"><small>Gisteren</small><b>${y.totaal}</b></div>
    <div class="vs-note"><span class="delta" style="--dc:${dc}">${diff === 0 ? "=" : diff > 0 ? `↗ +${diff}` : `↘ −${-diff}`}</span>Gisteren om deze tijd: ${y.totaalTotNu} meldingen</div>`;
}

function warnRow(w) {
  const b = BRONNEN[w.bron];
  return `<a class="row warn${isBeeindigd(w) ? " ended" : ""}" href="../pager/?waarschuwing=${encodeURIComponent(w.id)}" style="--c:${b.text}">
      <img src="${wIcon(w)}" alt="">
      <div><div class="meta"><span style="color:${b.text};font-weight:700">${esc(wKop(w))}</span><span>${esc(wTijd(w))}</span></div>
        <b>${esc(w.titel)}</b><div class="where">${esc(w.plaats || "Gemeente Apeldoorn")}</div></div></a>`;
}

function renderKnmi() {
  // Weather codes on the map itself as well.
  const kaart = $("mapKnmi");
  if (kaart) kaart.innerHTML = state.lagen.has("knmi") ? state.warnings.filter((w) => w.bron === "knmi" && isActief(w)).map((w) =>
    `<a class="mk-code" href="../pager/?waarschuwing=${encodeURIComponent(w.id)}" style="--c:${wKleur(w)};--on:${wOpKleur(w)}"><img src="${wIcon(w)}" alt=""><b>${esc(wKop(w))}</b>${w.einde ? `<small>tot ${esc(new Date(w.einde).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }))}</small>` : ""}</a>`).join("") : "";
  $("knmi").innerHTML = state.warnings.filter((w) => w.bron === "knmi" && isActief(w)).map((w) =>
    `<a class="knmi" href="../pager/?waarschuwing=${encodeURIComponent(w.id)}" style="--c:${wKleur(w)};--on:${wOpKleur(w)}"><img src="${wIcon(w)}" alt=""><span><b>${esc(wKop(w))}</b><small>${esc(w.titel)}${w.einde ? ` · tot ${esc(new Date(w.einde).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }))}` : ""}</small>${w.kop || w.advies || w.verwachting ? `<small>${esc(String(w.kop || w.advies || w.verwachting).split("\n")[0])}</small>` : ""}</span></a>`).join("");
}

function renderList(fresh = new Set()) {
  renderKnmi();
  const warns = state.warnings.filter((w) => w.bron !== "knmi" && (isActief(w) || Date.now() - wStart(w).getTime() < WINDOW_MS)).map((w) => ({ w, t: wStart(w) }));
  const list = [...inWindow().slice(0, 40).map((m) => ({ m, t: date(m) })), ...warns].sort((a, b) => b.t - a.t);
  $("list").innerHTML = list.length ? list.map(({ m, w }) => {
    if (w) return warnRow(w);
    const pr = prioText(m);
    return `<a class="row${fresh.has(m.guid) ? " is-new" : ""}${m.guid === state.focus ? " is-focus" : ""}" href="${pagerLink(m)}" data-guid="${esc(m.guid)}" style="--c:${dienstOf(m).text}">
      <img src="${icon(m)}" alt="">
      <div><div class="meta">${isRecent(m) ? '<span class="live">LIVE</span>' : ""}<span>${esc(ago(date(m)))} · ${fmtTime(date(m))}</span></div>
        <b>${esc(m.title)}</b><div class="where">${esc(plaatsText(m))}</div>${pr ? `<div class="pr">${esc(pr)}</div>` : ""}</div></a>`;
  }).join("") : `<p style="color:var(--muted);text-align:center;padding:2em 0">Geen meldingen in de laatste 24 uur</p>`;
}

function renderStatus() {
  $("status").innerHTML = state.online
    ? `<span class="live-dot"></span><span>Meldkamer · live</span>`
    : `<span class="live-dot is-off"></span><span>${demoMode ? "Voorbeeld" : "Offline"}</span>`;
  $("demo").hidden = !demoMode;
}

// ------------------------------------------------------------------ alarm

const queue = [];
let alarmTimer = null;
function enqueueAlarm(list) {
  for (const m of list.slice(0, 5).reverse()) if (!state.urgentOnly || isUrgent(m)) queue.push(m);
  if ($("alarm").hidden) nextAlarm();
}
function nextAlarm() {
  const m = queue.shift();
  const box = $("alarm");
  if (!m) { box.hidden = true; return; }
  if (m.bron) return warnAlarm(m, box);
  const ms = isUrgent(m) ? 12_000 : 8_000;
  const pr = prioText(m);
  box.style.setProperty("--c", dienstOf(m).color);
  box.innerHTML = `<div class="alarm-inner">
    <img src="${icon(m)}" alt="">
    <span class="alarm-kicker">${isUrgent(m) ? "SPOED" : "NIEUWE MELDING"} · ${esc(dienstOf(m).label.toUpperCase())}</span>
    <h1 class="alarm-title">${esc(m.title)}</h1>
    <div class="alarm-where">${esc(plaatsText(m))} · ${fmtTime(date(m))}</div>
    ${pr ? `<div class="alarm-prio">${esc(pr)}</div>` : ""}
    <div class="alarm-bar" style="--t:${ms}ms"><i></i></div></div>`;
  box.hidden = false;
  beep(isUrgent(m));
  clearTimeout(alarmTimer);
  alarmTimer = setTimeout(() => { fly(m); nextAlarm(); }, ms);
}
$("alarm").addEventListener("click", () => { clearTimeout(alarmTimer); nextAlarm(); });

/** Alarm screen for a new NL-Alert or Burgernet call, and when one ends (like the app's push). */
function warnAlarm(w, box) {
  const ms = w.bron === "nlalert" && !isBeeindigd(w) ? 14_000 : 9_000;
  box.style.setProperty("--c", wKleur(w));
  box.innerHTML = `<div class="alarm-inner">
    <img src="${wIcon(w)}" alt="">
    <span class="alarm-kicker">${esc(wKop(w).toUpperCase())} · ${isBeeindigd(w) ? "BEËINDIGD" : "NIEUW"}</span>
    <h1 class="alarm-title">${esc(w.titel)}</h1>
    <div class="alarm-where">${esc(w.plaats || "Gemeente Apeldoorn")} · ${esc(wTijd(w))}</div>
    <div class="alarm-bar" style="--t:${ms}ms"><i></i></div></div>`;
  box.hidden = false;
  beep(w.bron === "nlalert" && !isBeeindigd(w));
  clearTimeout(alarmTimer);
  alarmTimer = setTimeout(() => {
    if (map && w.lat != null) map.setRegionAnimated(region({ lat: w.lat, lon: w.lon, dLat: 0.05, dLon: 0.08 }), true);
    nextAlarm();
  }, ms);
}

/** NL-Alert and Burgernet: new or just ended since the last refresh → alarm screen. */
function warnChanges(warnings) {
  const out = [];
  for (const w of warnings) {
    if (w.bron === "knmi") continue;
    const prev = state.knownWarn.get(w.id);
    if (!state.first && ((!prev && !isBeeindigd(w)) || (prev && prev !== "beeindigd" && isBeeindigd(w)))) out.push(w);
    state.knownWarn.set(w.id, w.status);
  }
  return out;
}

let audio = null;
function beep(urgent) {
  if (!state.sound) return;
  try {
    audio ||= new AudioContext();
    const tones = urgent ? [880, 660, 880, 660, 880, 660] : [880, 660];
    tones.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.28;
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.26);
    });
  } catch {}
}

// ------------------------------------------------------------------ controls

function renderControls() {
  $("btnTour").classList.toggle("on", state.tour);
  $("btnSound").classList.toggle("on", state.sound);
  $("btnSound").querySelector("span").textContent = state.sound ? "Geluid aan" : "Geluid uit";
  $("btnUrgent").classList.toggle("on", state.urgentOnly);
  $("btnUrgent").querySelector("span").textContent = state.urgentOnly ? "Alarm: alleen spoed" : "Alarm: alles";
}
$("btnTour").addEventListener("click", () => {
  state.tour = !state.tour; prefs.set("mk.tour", state.tour);
  if (!state.tour) overview();
  renderControls();
});
$("btnSound").addEventListener("click", () => {
  state.sound = !state.sound; // browsers only allow sound after a click, so this is never restored automatically
  if (state.sound) { audio ||= new AudioContext(); audio.resume(); beep(false); }
  renderControls();
});
$("btnUrgent").addEventListener("click", () => { state.urgentOnly = !state.urgentOnly; prefs.set("mk.urgentOnly", state.urgentOnly); renderControls(); });
$("btnFull").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
renderControls();

// Hide the controls and the cursor when nobody touches the mouse.
let idleTimer = null;
const wake = () => { $("room").classList.remove("idle"); clearTimeout(idleTimer); idleTimer = setTimeout(() => $("room").classList.add("idle"), 4000); };
["pointermove", "keydown", "touchstart"].forEach((e) => addEventListener(e, wake, { passive: true }));
wake();

// Keep the screen on, like the Apple TV app.
let lock = null;
async function keepAwake() { try { if (!document.hidden && "wakeLock" in navigator) lock = await navigator.wakeLock.request("screen"); } catch {} }
keepAwake();

// ------------------------------------------------------------------ loading

async function refresh() {
  const [{ list, online }, warnings] = await Promise.all([fetchMeldingen(400), fetchWaarschuwingen(2)]);
  const nieuweWaarschuwingen = warnChanges(warnings);
  state.warnings = warnings;
  state.online = online;
  const fresh = state.first ? [] : list.filter((m) => !state.known.has(m.guid) && Date.now() - date(m).getTime() < 30 * 60_000);
  list.forEach((m) => state.known.add(m.guid));
  state.list = list;
  renderStatus();
  renderTiles();
  renderChips();
  renderList(new Set(fresh.map((m) => m.guid)));
  renderLatest();
  await renderMap();
  if (nieuweWaarschuwingen.length) { queue.push(...nieuweWaarschuwingen); if ($("alarm").hidden) nextAlarm(); }
  else renderExtra(await mapReady);
  if (fresh.length) {
    state.tourIndex = 0;
    enqueueAlarm(fresh);
    if (document.hidden) document.title = `(${fresh.length}) Meldkamer – A-Alerts`;
  }
  state.first = false;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  document.title = "Meldkamer – A-Alerts";
  keepAwake();
  refresh();
});

await refresh();
refreshHelis();
setInterval(() => { if (!document.hidden) refresh(); }, 15_000);
setInterval(() => { if (!document.hidden) refreshHelis(); }, 15_000);
setInterval(() => { if (!document.hidden) { renderList(); $("latest").dataset.guid = ""; renderLatest(); } }, 60_000);
