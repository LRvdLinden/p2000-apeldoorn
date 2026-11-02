import {
  trackVisit, fetchMeldingen, fetchMelding, fetchWeather, addView, DIENSTEN, SELECTABLE, PLAATSEN, dienstOf, asset, date,
  fmtTime, fmtTimeSec, fmtDay, fmtDateTime, ago, esc, dayKey, isRecent, isUrgent, prioText, plaatsText, hasStreet,
  capPlaats, story, today as todayStats, yesterday as yesterdayStats, isRead, markRead, prefs, distanceKm, appleMapsURL,
  loadMapKit, markerAnnotation, spread, CONDITIONS, compass, demoMode, countUp,
} from "./core.js";

const $ = (id) => document.getElementById(id);
trackVisit();
const shell = $("shell");
const WINDOW_MS = 24 * 3600_000; // the timeline shows the last 24 hours, like the app

const params = new URLSearchParams(location.search);
const state = {
  list: [],
  known: new Set(),
  online: false,
  lastOk: null,
  tab: "pager",
  selected: null,
  search: "",
  diensten: new Set(params.get("dienst") && DIENSTEN[params.get("dienst")] ? [params.get("dienst")] : prefs.get("p2000.diensten", [])),
  plaats: prefs.get("p2000.plaats", ""),
  prio: prefs.get("p2000.prio", ""),
  radiusKm: Number(prefs.get("p2000.radius", 0)),
  here: null,
  hideRead: prefs.get("p2000.hideRead", false),
  mapHours: 24,
  mapDiensten: new Set(SELECTABLE),
};

const icon = (m) => asset(`assets/img/${dienstOf(m).icon}.png`);
const PIN = `<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="var(--surface)"/></svg>`;

function toast(text) {
  const el = $("tplToast").content.firstElementChild.cloneNode(true);
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// ------------------------------------------------------------------ clock & status

function tick() {
  const now = new Date();
  $("clock").textContent = fmtTimeSec(now);
  $("dateLabel").textContent = now.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });
  const s = $("status");
  const dot = s.querySelector(".live-dot");
  dot.classList.toggle("is-off", !state.online);
  s.lastElementChild.textContent = demoMode ? "Voorbeeldgegevens" : state.online ? `Online · ${state.lastOk ? "bijgewerkt " + ago(state.lastOk).replace("zojuist", "nu") : ""}` : "Offline";
}
setInterval(tick, 1000);

// ------------------------------------------------------------------ filtering

function inWindow(m) { return Date.now() - date(m).getTime() < WINDOW_MS; }

function matches(m, { ignoreSearch = false } = {}) {
  if (!inWindow(m)) return false;
  if (state.diensten.size && !state.diensten.has(m.dienst)) return false;
  if (state.plaats && capPlaats(m.stad) !== state.plaats) return false;
  if (state.prio) {
    const p = String(m.prioriteit || "").toUpperCase();
    if (state.prio === "urgent" ? !isUrgent(m) : state.prio === "B" ? !/^B/.test(p) : p !== state.prio) return false;
  }
  if (state.radiusKm && state.here) {
    if (m.lat == null || distanceKm(state.here, m) > state.radiusKm) return false;
  }
  if (state.hideRead && isRead(m) && m.guid !== state.selected) return false;
  if (!ignoreSearch && state.search) {
    const q = state.search.toLowerCase();
    const hay = [m.title, m.stad, m.locatie, m.categorie, m.capcode, m.full_melding, ...(m.eenheden || []).map((u) => `${u.code} ${u.naam}`)].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function saveFilters() {
  prefs.set("p2000.diensten", [...state.diensten]);
  prefs.set("p2000.plaats", state.plaats);
  prefs.set("p2000.prio", state.prio);
  prefs.set("p2000.radius", state.radiusKm);
  prefs.set("p2000.hideRead", state.hideRead);
}

function renderActiveFilters() {
  const chips = [];
  for (const d of state.diensten) chips.push([`dienst:${d}`, DIENSTEN[d].label]);
  if (state.plaats) chips.push(["plaats", state.plaats]);
  if (state.prio) chips.push(["prio", state.prio === "urgent" ? "Alleen spoed" : state.prio === "B" ? "B1 / B2" : state.prio]);
  if (state.radiusKm) chips.push(["radius", `Binnen ${state.radiusKm} km`]);
  if (state.hideRead) chips.push(["read", "Bekeken verborgen"]);
  $("activeFilters").innerHTML = chips.map(([k, t]) => `<button class="afilter" data-k="${k}">${esc(t)} ✕</button>`).join("");
  const n = chips.length;
  $("filterCount").hidden = !n;
  $("filterCount").textContent = n;
}

$("activeFilters").addEventListener("click", (e) => {
  const k = e.target.closest(".afilter")?.dataset.k;
  if (!k) return;
  if (k.startsWith("dienst:")) state.diensten.delete(k.slice(7));
  if (k === "plaats") state.plaats = "";
  if (k === "prio") state.prio = "";
  if (k === "radius") state.radiusKm = 0;
  if (k === "read") state.hideRead = false;
  syncFilterInputs(); saveFilters(); render();
});

function syncFilterInputs() {
  $("fPlaats").value = state.plaats;
  $("fPrio").value = state.prio;
  $("fRadius").value = String(state.radiusKm);
  $("fHideRead").checked = state.hideRead;
}

$("fPlaats").innerHTML += PLAATSEN.map((p) => `<option>${p}</option>`).join("");
syncFilterInputs();
$("filterBtn").addEventListener("click", () => {
  const open = $("filters").hidden;
  $("filters").hidden = !open;
  $("filterBtn").setAttribute("aria-expanded", String(open));
});
$("fPlaats").addEventListener("change", (e) => { state.plaats = e.target.value; saveFilters(); render(); });
$("fPrio").addEventListener("change", (e) => { state.prio = e.target.value; saveFilters(); render(); });
$("fHideRead").addEventListener("change", (e) => { state.hideRead = e.target.checked; saveFilters(); render(); });
$("fRadius").addEventListener("change", (e) => {
  const km = Number(e.target.value);
  if (!km) { state.radiusKm = 0; saveFilters(); render(); return; }
  locate().then((ok) => {
    state.radiusKm = ok ? km : 0;
    if (!ok) { $("fRadius").value = "0"; toast("Je locatie is niet beschikbaar"); }
    saveFilters(); render();
  });
});
$("resetFilters").addEventListener("click", () => {
  state.diensten.clear(); state.plaats = ""; state.prio = ""; state.radiusKm = 0; state.hideRead = false;
  syncFilterInputs(); saveFilters(); render();
});
let searchTimer;
$("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = e.target.value.trim(); renderList(); }, 150);
});

function locate() {
  if (state.here) return Promise.resolve(true);
  if (!navigator.geolocation) return Promise.resolve(false);
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (p) => { state.here = { lat: p.coords.latitude, lon: p.coords.longitude }; resolve(true); },
    () => resolve(false), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }));
}
if (state.radiusKm) locate().then((ok) => { if (!ok) state.radiusKm = 0; render(); });

// ------------------------------------------------------------------ today tiles

function renderTiles() {
  const t = todayStats(state.list);
  const tiles = [["all", "Vandaag", t.totaal, "#DC2626", null], ...SELECTABLE.map((d) => [d, d === "traumaheli" ? "Traumaheli" : DIENSTEN[d].label, t.perDienst[d] || 0, DIENSTEN[d].color, icon({ dienst: d })])];
  const box = $("tiles");
  if (!box.children.length) {
    box.innerHTML = tiles.map(([k, label, , c, img]) => `
      <button class="tile" data-k="${k}" style="--c:${c}" aria-pressed="false">
        ${img ? `<img src="${img}" alt="">` : `<svg class="cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="#DC2626" stroke-width="2"/><path d="M3 10h18M8 3v4m8-4v4" stroke="#DC2626" stroke-width="2" stroke-linecap="round"/></svg>`}
        <b data-n>0</b><small>${label}</small></button>`).join("");
    box.addEventListener("click", (e) => {
      const k = e.target.closest(".tile")?.dataset.k;
      if (!k) return;
      if (k === "all") state.diensten.clear();
      else state.diensten.has(k) ? state.diensten.delete(k) : state.diensten.add(k);
      saveFilters(); render();
    });
  }
  tiles.forEach(([k, , n], i) => {
    const el = box.children[i];
    countUp(el.querySelector("[data-n]"), n, 700);
    const on = k === "all" ? state.diensten.size === 0 : state.diensten.has(k);
    el.classList.toggle("on", on);
    el.setAttribute("aria-pressed", String(on));
  });
}

// ------------------------------------------------------------------ list

function rowHTML(m, isNew) {
  const d = date(m);
  const dist = state.here && m.lat != null ? ` · ${distanceKm(state.here, m).toFixed(1).replace(".", ",")} km` : "";
  return `
  <a class="row${isRead(m) ? " read" : ""}${m.guid === state.selected ? " sel" : ""}${isNew ? " is-new" : ""}" href="?melding=${encodeURIComponent(m.guid)}" data-guid="${esc(m.guid)}" style="--tc:${dienstOf(m).text}">
    <img src="${icon(m)}" alt="${esc(dienstOf(m).label)}">
    <div class="body">
      <div class="when">${esc(ago(d))} - ${fmtTime(d)}</div>
      <h3>${esc(m.title)}</h3>
      <div class="where">${PIN}${esc(plaatsText(m))}${dist}</div>
      <div class="pt">${esc(prioText(m))}</div>
    </div>
    <div class="meta">${m.views ? `<span>👁 ${m.views}x</span>` : ""}${isRecent(m) ? `<span class="live">LIVE</span>` : ""}</div>
  </a>`;
}

let firstRender = true;
function renderList(newGuids = new Set()) {
  const items = state.list.filter((m) => matches(m));
  const box = $("list");
  if (!state.list.length && firstRender) {
    box.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton"></div>`).join("");
    return;
  }
  if (!items.length) {
    box.innerHTML = `<div class="empty"><b>Geen meldingen</b>${state.search || state.diensten.size || state.plaats || state.prio || state.radiusKm ? "Er zijn geen meldingen die passen bij je filters." : "In de laatste 24 uur zijn er geen meldingen."}</div>`;
    return;
  }
  let html = "", lastDay = "";
  for (const m of items) {
    const k = dayKey(date(m));
    if (k !== lastDay) { html += `<div class="day">${fmtDay(date(m))}</div>`; lastDay = k; }
    html += rowHTML(m, newGuids.has(m.guid));
  }
  box.innerHTML = html;
  firstRender = false;
}

$("list").addEventListener("click", (e) => {
  const row = e.target.closest(".row");
  if (!row || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  select(row.dataset.guid);
});

// ------------------------------------------------------------------ detail

let detailMap = null;
const ICO = {
  pin: `<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="#fff"/></svg>`,
  warn: `<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3z" fill="#fff"/><path d="M12 10v5" stroke="#DC2626" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="18" r="1" fill="#DC2626"/></svg>`,
  clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M12 7v5l3 2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24"><path d="M12 3l6 16-6-4-6 4 6-16z" fill="#fff"/></svg>`,
  maps: `<svg viewBox="0 0 24 24"><path d="M3 11 21 3l-8 18-2-8-8-2z" fill="#fff"/></svg>`,
};

async function select(guid, { push = true } = {}) {
  if (!guid) { closeDetail(push); return; }
  let m = state.list.find((x) => x.guid === guid) || await fetchMelding(guid);
  if (!m) { toast("Deze melding is niet meer beschikbaar"); closeDetail(push); return; }
  state.selected = guid;
  markRead(m);
  addView(guid);
  shell.classList.add("has-detail");
  if (push) history.pushState({ guid }, "", `?melding=${encodeURIComponent(guid)}${location.hash}`);
  document.title = `${m.title} – P2000 Apeldoorn`;
  renderDetail(m);
  renderList();
}

function closeDetail(push = true) {
  state.selected = null;
  shell.classList.remove("has-detail");
  $("detail").innerHTML = "";
  if (detailMap) { try { detailMap.destroy(); } catch {} detailMap = null; }
  document.title = "Live pager – P2000 Apeldoorn";
  if (push) history.pushState({}, "", location.pathname + location.hash);
  renderList();
}

function renderDetail(m) {
  const d = date(m), dienst = dienstOf(m), units = m.eenheden || [], cars = m.voertuigen || [];
  const t = todayStats(state.list), y = yesterdayStats(state.list);
  const stad = capPlaats(m.stad) || "Apeldoorn";
  $("detail").innerHTML = `
  <article class="detail">
    <button class="d-back" data-close>‹ Pager</button>
    <button class="d-close" data-close aria-label="Sluiten">✕</button>
    <div class="d-map" id="dMap">
      ${m.lat != null ? `<img class="static-pin" src="${asset(`assets/img/${dienst.marker}.png`)}" alt="">` : ""}
      <div class="lookaround" id="lookAround" title="Look Around"></div>
    </div>
    ${hasStreet(m) ? "" : `<div class="notice"><b>Let op:</b> De meldkamer heeft geen straatnaam doorgegeven, hierdoor kunnen we geen exacte locatie tonen.</div>`}
    <div class="incident"><span>Incident ${esc((m.guid || "").slice(-7).replace(/-/g, ""))}</span><span>${m.views ? `👁 ${m.views}x` : ""}</span></div>
    <section class="card">
      <div class="head">
        <img src="${icon(m)}" alt="${esc(dienst.label)}">
        <h1>${esc(m.title)}</h1>
        <button class="share" id="shareBtn" aria-label="Delen">${ICO.share}</button>
      </div>
      <div class="info"><span class="ico" style="background:#3b82f6">${ICO.pin}</span><div><b>${esc(hasStreet(m) ? m.locatie : stad)}</b><small>${hasStreet(m) ? esc(stad) : "Specifieke locatie niet bekend"}</small></div></div>
      <div class="info"><span class="ico" style="background:${isUrgent(m) ? "#DC2626" : "#f59e0b"}">${ICO.warn}</span><div><b>${esc(m.categorie || dienst.label)}</b><small>${m.prioriteit ? `Prioriteit ${esc(m.prioriteit)}` : "Prioriteit onbekend"}</small></div></div>
      <div class="info"><span class="ico" style="background:#ec4899">${ICO.clock}</span><div><b>${esc(fmtDateTime(d))}</b><small>${esc(ago(d))}</small></div></div>
      <a class="amaps" href="${appleMapsURL(m)}" target="_blank" rel="noopener">${ICO.maps} Apple Kaarten</a>
    </section>
    <section class="card story"><h2>Beschrijving</h2>${story(m, t, y).map((p) => `<p>${esc(p)}</p>`).join("")}</section>
    ${units.length ? `<section class="card"><h2>Capcodes (${units.length})</h2><div class="units">${units.map((u) => `
      <div class="unit"><b>${esc(u.naam || u.code)}</b><small>${esc([u.type, u.regio].filter(Boolean).join(" / "))}</small><code>${esc(u.code || "")}</code></div>`).join("")}</div></section>` : ""}
    ${cars.length ? `<section class="card"><h2>Voertuigen (${cars.length})</h2><div class="units">${cars.map((v) => `
      <div class="unit"><b>${esc(v.label || "Voertuig")}</b><code>${esc([v.nra, v.nrb].filter(Boolean).join(" · "))}</code></div>`).join("")}</div></section>` : ""}
    <section class="card"><h2>METEO-gegevens</h2><div class="meteo" id="meteo"><div class="skeleton" style="height:180px"></div></div></section>
    <section class="card"><h2>Meldinggegevens</h2><dl class="kv">
      <dt>Prioriteit</dt><dd>${esc(m.prioriteit || "Onbekend")}</dd>
      <dt>Discipline</dt><dd>${esc(dienst.label)}</dd>
      ${m.categorie ? `<dt>Categorie</dt><dd>${esc(m.categorie)}</dd>` : ""}
      <dt>Plaats</dt><dd>${esc(stad)}</dd>
      <dt>Regio</dt><dd>${esc(m.regio || "Noord- en Oost-Gelderland")}</dd>
      ${m.capcode ? `<dt>Capcode</dt><dd>${esc(m.capcode)}</dd>` : ""}
      ${m.grip ? `<dt>GRIP</dt><dd>${esc(m.grip)}</dd>` : ""}
      <dt>Volledige melding</dt><dd>${esc(m.full_melding || m.title)}</dd>
    </dl></section>
  </article>`;
  $("detailPane").scrollTop = 0;
  if (innerWidth <= 900) document.querySelector(".detail-pane").scrollTop = 0;

  $("detail").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeDetail()));
  $("shareBtn").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: m.title, text: `${m.title} – ${plaatsText(m)}`, url });
      else { await navigator.clipboard.writeText(url); toast("Link gekopieerd"); }
    } catch {}
  });

  drawDetailMap(m);
  loadMeteo(m);
}

async function drawDetailMap(m) {
  if (m.lat == null || m.lon == null) return;
  const mk = await loadMapKit();
  if (!mk || state.selected !== m.guid) return;
  const host = $("dMap");
  host.querySelector(".static-pin")?.remove();
  const div = document.createElement("div");
  div.className = "mk";
  host.prepend(div);
  const coord = new mk.Coordinate(m.lat, m.lon);
  detailMap = new mk.Map(div, {
    center: coord,
    cameraDistance: hasStreet(m) ? 900 : 4500,
    showsCompass: mk.FeatureVisibility.Hidden,
    showsMapTypeControl: false,
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light,
  });
  detailMap.addAnnotation(markerAnnotation(mk, m));
  // Look Around preview (MapKit JS 5.78+), only when imagery exists at this spot.
  const la = $("lookAround");
  try {
    if (mk.LookAroundPreview && la) {
      const preview = new mk.LookAroundPreview(la, coord, { openDialogOnClick: true });
      preview.addEventListener?.("error", () => { la.innerHTML = ""; });
    }
  } catch { la.innerHTML = ""; }
}

async function loadMeteo(m) {
  const box = $("meteo");
  const w = await fetchWeather(m.guid);
  if (state.selected !== m.guid || !box) return;
  if (!w) {
    box.innerHTML = `<p style="color:var(--muted);margin:0">${demoMode ? "Weergegevens zijn beschikbaar zodra de live-server draait." : "Weergegevens zijn op dit moment niet beschikbaar."}</p>`;
    return;
  }
  const [label, emoji] = CONDITIONS[w.condition] || [w.condition || "Onbekend", "🌡️"];
  const kmh = (v) => Math.round(v ?? 0);
  box.innerHTML = `
    <div class="mrow"><span class="ico" style="background:#f97316">🌡️</span><div><b>Temperatuur</b><small>Gevoelstemperatuur ${Math.round(w.apparent ?? w.temperature)}°C</small></div><em>${Math.round(w.temperature)}°C</em></div>
    <div class="mrow"><span class="ico" style="background:#64748b">${emoji}</span><div><b>${esc(label)}</b><small>Bewolking ${Math.round((w.cloudCover ?? 0) * 100)}% · luchtvochtigheid ${Math.round((w.humidity ?? 0) * 100)}%</small></div><em>${Math.round((w.cloudCover ?? 0) * 100)}%</em></div>
    <div class="mrow"><span class="ico">${ICO.arrow.replace("<svg", `<svg style="transform:rotate(${(w.windDirection ?? 0) + 180}deg)"`)}</span><div><b>Windrichting</b><small>De wind waait vanuit het ${compass(w.windDirection ?? 0)}</small></div><em>${compass(w.windDirection ?? 0)}</em></div>
    <div class="mrow"><span class="ico" style="background:#0ea5e9">💨</span><div><b>Windsnelheid</b><small>Windvlagen tot ${kmh(w.windGust)} km/h</small></div><em>${kmh(w.windSpeed)} km/h</em></div>
    ${w.precipitation ? `<div class="mrow"><span class="ico" style="background:#2563eb">🌧️</span><div><b>Neerslag</b><small>Intensiteit</small></div><em>${w.precipitation.toFixed(1)} mm/u</em></div>` : ""}
    <div class="attribution">Gegevens zijn op basis van incident tijdstip en locatie · <span> Weather</span> · <a href="${esc(w.attribution)}" target="_blank" rel="noopener">Bronnen</a></div>`;
}

addEventListener("popstate", () => {
  const g = new URLSearchParams(location.search).get("melding");
  g ? select(g, { push: false }) : closeDetail(false);
  setTab((location.hash || "#pager").slice(1), false);
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && state.selected) closeDetail(); });

// ------------------------------------------------------------------ tabs

function setTab(tab, push = true) {
  if (!["pager", "kaart", "stats"].includes(tab)) tab = "pager";
  state.tab = tab;
  shell.dataset.tab = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    if (b === shell) return;
    const on = b.dataset.tab === tab;
    b.classList.toggle("on", on);
    if (b.getAttribute("role") === "tab") b.setAttribute("aria-selected", String(on));
  });
  if (push) history.replaceState(history.state, "", location.pathname + location.search + (tab === "pager" ? "" : `#${tab}`));
  if (tab === "kaart") renderMap();
  if (tab === "stats") renderStats();
  scrollTo({ top: 0 });
}
document.querySelectorAll("button[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ------------------------------------------------------------------ map

let bigMap = null, bigMapReady = null;
function renderMapChips() {
  const cutoff = Date.now() - state.mapHours * 3600_000;
  const recent = state.list.filter((m) => date(m).getTime() >= cutoff);
  $("mapChips").innerHTML = SELECTABLE.map((d) => {
    const n = recent.filter((m) => m.dienst === d).length;
    return `<button class="chip${state.mapDiensten.has(d) ? "" : " off"}" data-d="${d}" style="--c:${DIENSTEN[d].color}"><img src="${icon({ dienst: d })}" alt="">${n}</button>`;
  }).join("");
}
$("mapChips").addEventListener("click", (e) => {
  const d = e.target.closest(".chip")?.dataset.d;
  if (!d) return;
  state.mapDiensten.has(d) ? state.mapDiensten.delete(d) : state.mapDiensten.add(d);
  renderMap();
});
$("period").addEventListener("click", (e) => {
  const h = Number(e.target.closest("button")?.dataset.h);
  if (!h) return;
  state.mapHours = h;
  $("period").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.h) === h));
  renderMap();
});

async function renderMap() {
  renderMapChips();
  const cutoff = Date.now() - state.mapHours * 3600_000;
  const items = spread(state.list.filter((m) => date(m).getTime() >= cutoff && state.mapDiensten.has(m.dienst)));
  if (!bigMapReady) {
    bigMapReady = loadMapKit().then((mk) => {
      if (!mk) { $("mapFallback").hidden = false; return null; }
      bigMap = new mk.Map($("bigMap"), {
        center: new mk.Coordinate(52.2112, 5.9699),
        cameraDistance: 26000,
        showsMapTypeControl: true,
        colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light,
        padding: new mk.Padding(70, 20, 20, 20),
      });
      return mk;
    });
  }
  const mk = await bigMapReady;
  if (!mk) { renderStaticMarkers(items); return; }
  bigMap.removeAnnotations(bigMap.annotations);
  const anns = items.map((m) => markerAnnotation(mk, m, (x) => select(x.guid)));
  bigMap.addAnnotations(anns);
}

/** Without MapKit: show the markers roughly placed over the brand map texture. */
function renderStaticMarkers(items) {
  let box = $("bigMap").querySelector(".static-markers");
  if (!box) { box = document.createElement("div"); box.className = "static-markers"; $("bigMap").appendChild(box); }
  const lat0 = 52.2112, lon0 = 5.9699, span = 0.22;
  box.innerHTML = items.filter((m) => m.lat != null).map((m) => {
    const x = 50 + ((m.lon - lon0) / (span * 1.6)) * 100, y = 50 - ((m.lat - lat0) / span) * 100;
    if (x < 2 || x > 98 || y < 8 || y > 98) return "";
    return `<img class="mk-marker" style="position:absolute;left:${x}%;top:${y}%;margin:-38px 0 0 -19px" src="${asset(`assets/img/${dienstOf(m).marker}.png`)}" alt="${esc(m.title)}" title="${esc(m.title)}" data-guid="${esc(m.guid)}">`;
  }).join("");
  box.onclick = (e) => { const g = e.target.dataset.guid; if (g) select(g); };
}

// ------------------------------------------------------------------ statistics (today vs yesterday)

function delta(diff) {
  const c = diff > 0 ? "#DC2626" : diff < 0 ? "#16a34a" : "var(--muted)";
  return `<span class="delta" style="--dc:${c}">${diff === 0 ? "=" : diff > 0 ? `↗ +${diff}` : `↘ −${-diff}`}</span>`;
}

function hourChart(t, y) {
  const W = 600, H = 190, pad = 22, bw = (W - pad) / 24;
  const max = Math.max(1, ...t.perUur, ...y.perUur);
  const curHour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Amsterdam" })) % 24;
  let bars = "";
  for (let h = 0; h < 24; h++) {
    const x = pad + h * bw;
    const hy = (y.perUur[h] / max) * (H - 30), ht = (t.perUur[h] / max) * (H - 30);
    bars += `<rect x="${x + 1}" y="${H - 18 - hy}" width="${bw / 2 - 1.5}" height="${hy}" rx="2" fill="#9ca3af" opacity=".6"><title>Gisteren ${h}:00 – ${y.perUur[h]}</title></rect>`;
    if (h <= curHour) bars += `<rect x="${x + bw / 2}" y="${H - 18 - ht}" width="${bw / 2 - 1.5}" height="${ht}" rx="2" fill="#DC2626"><title>Vandaag ${h}:00 – ${t.perUur[h]}</title></rect>`;
  }
  const labels = [0, 6, 12, 18, 23].map((h) => `<text x="${pad + h * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${String(h).padStart(2, "0")}:00</text>`).join("");
  const grid = [0.5, 1].map((k) => `<line class="grid" x1="${pad}" x2="${W}" y1="${H - 18 - k * (H - 30)}" y2="${H - 18 - k * (H - 30)}"/><text x="0" y="${H - 15 - k * (H - 30)}">${Math.round(max * k)}</text>`).join("");
  return `<svg class="chart bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Meldingen per uur, vandaag en gisteren">${grid}${bars}${labels}</svg>`;
}

function renderStats() {
  const t = todayStats(state.list), y = yesterdayStats(state.list);
  const dayFmt = (d) => d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });
  const dienstRows = SELECTABLE.map((d) => {
    const a = t.perDienst[d] || 0, b = y.perDienst[d] || 0;
    return `<div class="drow"><img src="${icon({ dienst: d })}" alt=""><span>${d === "traumaheli" ? "Lifeliner" : DIENSTEN[d].label}</span><b>${a}</b><i>/ ${b}</i>${delta(a - b)}</div>`;
  }).join("");
  const prios = [...new Set([...Object.keys(t.perPrioriteit), ...Object.keys(y.perPrioriteit)])].sort();
  const pmax = Math.max(1, ...prios.flatMap((p) => [t.perPrioriteit[p] || 0, y.perPrioriteit[p] || 0]));
  const prioHTML = prios.length ? prios.map((p) => `
    <div class="cat"><div class="cat-head"><span><b>${esc(p)}</b></span><b>${t.perPrioriteit[p] || 0}</b><i>/ ${y.perPrioriteit[p] || 0}</i></div>
      <div class="bar" style="--c:#DC2626"><div data-w="${((t.perPrioriteit[p] || 0) / pmax) * 100}"></div></div>
      <div class="bar" style="--c:#9ca3af"><div data-w="${((y.perPrioriteit[p] || 0) / pmax) * 100}"></div></div></div>`).join("") : `<p class="source">Nog geen meldingen</p>`;
  const cats = [...new Set([...Object.keys(t.perCategorie), ...Object.keys(y.perCategorie)])]
    .map((k) => ({ k, a: t.perCategorie[k] || 0, b: y.perCategorie[k] || 0 }))
    .sort((p, q) => q.a + q.b - (p.a + p.b) || q.a - p.a).slice(0, 8);
  const cmax = Math.max(1, ...cats.flatMap((c) => [c.a, c.b]));
  const catHTML = cats.length ? cats.map((c) => `
    <div class="cat"><div class="cat-head"><span>${esc(c.k)}</span><b>${c.a}</b><i>/ ${c.b}</i></div>
      <div class="bar" style="--c:#DC2626"><div data-w="${(c.a / cmax) * 100}"></div></div>
      <div class="bar" style="--c:#9ca3af"><div data-w="${(c.b / cmax) * 100}"></div></div></div>`).join("") : `<p class="source">Nog geen meldingen</p>`;
  const peak = t.perUur.reduce((best, n, h) => (n > best.n ? { h, n } : best), { h: 0, n: 0 });

  $("stats").innerHTML = `
  <div class="stats">
    <section class="card"><h2>Vandaag vs. gisteren</h2>
      <div class="vs">
        <div style="--c:#DC2626"><small>Vandaag</small><b>${t.totaal}</b><span>${dayFmt(t.day)}</span></div>
        <div style="--c:#6b7280"><small>Gisteren</small><b>${y.totaal}</b><span>${dayFmt(y.day)}</span></div>
      </div>
      <div class="cmp-line">${delta(t.totaal - y.totaalTotNu)}<span>Gisteren om deze tijd: ${y.totaalTotNu} meldingen</span></div>
    </section>
    <div class="stats-grid">
      <section class="card"><h2>Per discipline</h2>${dienstRows}<p class="source" style="text-align:left;margin:.6rem 0 0">Vandaag / gisteren (hele dag)</p></section>
      <section class="card"><h2>Per uur van de dag</h2>
        <div class="legend"><span style="--c:#DC2626">Vandaag</span><span style="--c:#9ca3af">Gisteren</span></div>
        ${hourChart(t, y)}
        ${peak.n ? `<p class="source" style="text-align:left;margin:.4rem 0 0">Drukste uur vandaag: ${String(peak.h).padStart(2, "0")}:00 (${peak.n} meldingen)</p>` : ""}
      </section>
      <section class="card"><h2>Per prioriteit</h2><div class="legend"><span style="--c:#DC2626">Vandaag</span><span style="--c:#9ca3af">Gisteren</span></div>${prioHTML}</section>
      <section class="card"><h2>Meest voorkomend</h2>${catHTML}</section>
    </div>
    <p class="source">Statistieken van vandaag en gisteren · Bron: <a href="https://p2000.page" rel="noopener">p2000.page</a></p>
  </div>`;
  requestAnimationFrame(() => $("stats").querySelectorAll("[data-w]").forEach((el) => { el.style.width = `${Math.max(Number(el.dataset.w), Number(el.dataset.w) > 0 ? 2 : 0)}%`; }));
}

// ------------------------------------------------------------------ loading

function render(newGuids) {
  renderActiveFilters();
  renderTiles();
  renderList(newGuids);
  if (state.tab === "kaart") renderMap();
  if (state.tab === "stats") renderStats();
}

async function refresh() {
  const { list, online } = await fetchMeldingen(500);
  state.online = online;
  if (online) state.lastOk = new Date();
  $("demoBanner").hidden = !demoMode;
  const fresh = state.known.size ? list.filter((m) => !state.known.has(m.guid)) : [];
  list.forEach((m) => state.known.add(m.guid));
  state.list = list;
  render(new Set(fresh.map((m) => m.guid)));
  if (fresh.length && document.hidden) document.title = `(${fresh.length}) Live pager – P2000 Apeldoorn`;
  tick();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.selected) document.title = "Live pager – P2000 Apeldoorn";
  if (!document.hidden) refresh();
});

renderList();
setTab((location.hash || "#pager").slice(1), false);
await refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 15_000);
setInterval(() => { if (!document.hidden) renderList(); }, 60_000); // "x min geleden"
const initial = params.get("melding");
if (initial) select(initial, { push: false });
