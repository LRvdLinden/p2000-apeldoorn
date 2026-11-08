import {
  trackVisit, fetchMeldingen, fetchMelding, fetchWeather, addView, DIENSTEN, SELECTABLE, PLAATSEN, dienstOf, asset, date,
  fmtTime, fmtTimeSec, fmtDay, fmtDateTime, ago, esc, dayKey, isRecent, isUrgent, prioText, plaatsText, hasStreet,
  capPlaats, story, today as todayStats, yesterday as yesterdayStats, isRead, markRead, prefs, distanceKm, appleMapsURL,
  API, loadMapKit, mapsAllowed, markerAnnotation, spread, layout, clusterAnnotation, clusterEl, CONDITIONS, compass, demoMode, countUp,
} from "./core.js?v=52";
import {
  BRONNEN, fetchWaarschuwingen, fetchHelikopters, wKop, wTijd, wKleur, wOpKleur, wStatus, wIcon, wStart, isActief, isBeeindigd,
  wRings, kazerneRoutes, routeFase, geschattePositie, verband, heliAnnotation, heliInfo, warnAnnotation, warnOverlays, kazerneAnnotation, kazernes,
  heliGenoemd, heliNaam, heliRelevant, heliVoor, heliImg, vliegtWest, fetchSpoor, fetchVluchten, spoorOverlay, vluchtTekst, heliLaag, geschat, fetchLocaties, locatieAnnotation, locatieSoort, locatieIcon, voorspellingTekst, voorspellingOverlay, afspeelPunt,
  CODES, isOpgeheven, wShareUrl, weergave, zetWeergave, isGrootIncident, radarLaag, meldingFeedback } from "./aalerts.js?v=52";

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
  mapBronnen: new Set(["nlalert", "burgernet"]),
  // A-Alerts
  warnings: [],
  bron: BRONNEN[params.get("bron")] ? params.get("bron") : "",
  helis: [],
  lagen: new Set(prefs.get("p2000.lagen", ["waarschuwingen", "knmi", "helikopters"])),
  view: "meldingen",
  history: null,
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

// Followed capcodes (star), as in the apps: always in the list, also outside the filters.
const capKey = (c) => String(c || "").replace(/\D/g, "");
const volgCaps = () => prefs.get("p2000.volgCapcodes", {});
const volgtCapcode = (m) => { const v = volgCaps(); return [m.capcode, ...(m.eenheden || []).map((u) => u.code)].some((c) => v[capKey(c)]); };

function matches(m, { ignoreSearch = false } = {}) {
  if (!inWindow(m)) return false;
  if (volgtCapcode(m) && !ignoreSearch && !state.search && !(state.hideRead && isRead(m) && m.guid !== state.selected)) return true;
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
  if (state.bron) chips.push(["bron", `Alleen ${BRONNEN[state.bron].label}`]);
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
  if (k === "bron") { state.bron = ""; history.replaceState(history.state, "", location.pathname + location.hash); }
  syncFilterInputs(); saveFilters(); render();
});

function syncFilterInputs() {
  $("fPlaats").value = state.plaats;
  $("fPrio").value = state.prio;
  $("fRadius").value = String(state.radiusKm);
  $("fHideRead").checked = state.hideRead;
  $("fBron").value = state.bron || "";
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
$("fBron").addEventListener("change", (e) => { state.bron = e.target.value; saveFilters(); render(); });
$("fHideRead").addEventListener("change", (e) => { state.hideRead = e.target.checked; saveFilters(); render(); });
$("list").addEventListener("click", (e) => {
  if (!e.target.closest("[data-toonbekeken]")) return;
  e.preventDefault(); state.hideRead = false; $("fHideRead").checked = false; saveFilters(); render();
});
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
    <div class="meta">${isGrootIncident(m) ? `<span class="live groot" title="Groot incident">🔥</span>` : ""}${m.views ? `<span>👁 ${m.views}x</span>` : ""}${isRecent(m) ? `<span class="live">LIVE</span>` : ""}</div>
  </a>`;
}

let firstRender = true;
/** NL-Alert and Burgernet rows: the time of the warning, never "x minutes ago". */
function warnRowHTML(w) {
  const b = BRONNEN[w.bron];
  return `
  <a class="row warn${isBeeindigd(w) ? " ended" : ""}${state.selected === `w:${w.id}` ? " sel" : ""}" href="?waarschuwing=${encodeURIComponent(w.id)}" data-wid="${esc(w.id)}" style="--tc:${b.text}">
    <img src="${wIcon(w)}" alt="${esc(b.label)}">
    <div class="body">
      <div class="when"><b style="color:${b.text}">${esc(wKop(w))}</b> <span class="wstatus">${esc(wStatus(w))}</span> · ${esc(wTijd(w))}</div>
      <h3>${esc(w.titel)}</h3>
      <div class="where">${PIN}${esc(w.plaats || "Gemeente Apeldoorn")}</div>
    </div>
  </a>`;
}

/** Warnings shown in the timeline: NL-Alert and Burgernet of the last 24 hours (or still active). */
function timelineWarnings() {
  if (state.diensten.size || state.prio || state.radiusKm) return [];
  if (state.bron && state.bron !== "nlalert" && state.bron !== "burgernet") return [];
  const q = state.search.toLowerCase();
  return state.warnings.filter((w) => w.bron !== "knmi" && (!state.bron || w.bron === state.bron)
    && (isActief(w) || Date.now() - wStart(w).getTime() < WINDOW_MS)
    && (!state.plaats || (w.plaats || "Apeldoorn") === state.plaats)
    && (!q || `${w.titel} ${w.tekst || ""} ${w.plaats || ""}`.toLowerCase().includes(q)));
}

const regels = (t) => String(t || "").split(/\n+/).map((r) => r.trim()).filter(Boolean);

/** Lifted KNMI warning: code green now, or the warning that applies now. */
function opgehevenHTML(w) {
  const ander = state.warnings.find((x) => x.bron === "knmi" && isActief(x) && x.id !== w.id);
  const eerder = w.niveau && w.niveau !== "green"
    ? `<p class="hint">Eerder gold ${esc([(CODES[w.niveau] || CODES.yellow)[0], w.soort].filter(Boolean).join(" · "))}${w.einde ? ` tot ${esc(fmtDateTime(new Date(w.einde)))}` : ""}.</p>` : "";
  return `<section class="card story opgeheven">
    <div class="groen"><span>✓</span><div><b>Code groen</b><small>Deze weerwaarschuwing is opgeheven.</small></div></div>${eerder}
    ${ander ? `<button class="amaps" data-wgoto="${esc(ander.id)}">Nu geldt: ${esc(wKop(ander))}</button>`
      : `<p>Er geldt nu geen weerwaarschuwing van het KNMI voor de gemeente Apeldoorn.</p>`}</section>`;
}

/** KNMI as on knmi.nl: headline and description, then risks and advice, details and the area. */
function knmiHTML(w) {
  const advies = [...regels(w.verwachting), ...regels(w.advies)];
  const vakken = Array.isArray(w.tijdvakken) && w.tijdvakken.length > 1 ? w.tijdvakken : [];
  const verloop = vakken.length ? `<section class="card verloop"><h2>Verloop</h2>${vakken.map((t) => {
    const s = new Date(t.start), e = new Date(t.einde);
    return `<div class="vak${e < new Date() ? " voorbij" : ""}"><i style="background:${(CODES[t.niveau] || CODES.yellow)[1]}"></i><b>${(CODES[t.niveau] || CODES.yellow)[0]}</b><span>${esc(fmtDateTime(s))} – ${esc(fmtTime(e))}</span></div>`;
  }).join("")}</section>` : "";
  return `${verloop}${w.kop || w.omschrijving ? `<section class="card story"><h2>${esc(w.kop || "Bericht")}</h2>${regels(w.omschrijving).map((p) => `<p>${esc(p)}</p>`).join("")}
      ${w.uitgifte ? `<p class="hint">Uitgifte: ${esc(w.uitgifte)}</p>` : ""}</section>` : ""}
    ${advies.length || w.details ? `<section class="card story knmi-advies"><h2>Risico's en advies</h2>
      ${advies.length ? `<div class="code"><img src="${wIcon(w)}" alt="" style="background:${wKleur(w)}"><span><b>${esc(wKop(w))}</b><small>Advies</small></span></div>
      <div class="box"><ul>${advies.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : ""}
      ${w.details ? `<h3>Meer informatie</h3><p>${regels(w.details).map(esc).join("<br>")}</p>` : ""}
      ${w.plaats ? `<p class="hint">Geldt voor: ${esc(w.plaats)}</p>` : ""}</section>` : ""}`;
}

function renderKnmi() {
  const items = state.warnings.filter((w) => w.bron === "knmi" && isActief(w));
  $("knmiBar").innerHTML = items.map((w) => `
    <a class="knmi" href="?waarschuwing=${encodeURIComponent(w.id)}" data-wid="${esc(w.id)}" style="--c:${wKleur(w)};--on:${wOpKleur(w)}">
      <img src="${wIcon(w)}" alt=""><span><b>${esc(wKop(w))}</b><small>${esc(w.titel)}${w.einde ? ` · tot ${esc(fmtTime(new Date(w.einde)))}` : ""}</small>${w.kop || w.verwachting ? `<small>${esc(regels(w.kop || w.verwachting)[0])}</small>` : ""}</span><i>›</i>
    </a>`).join("");
}

$("viewSeg").addEventListener("click", async (e) => {
  const v = e.target.closest("[data-view]")?.dataset.view;
  if (!v || v === state.view) return;
  state.view = v;
  $("viewSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  if (v === "waarschuwingen" && !state.history) { state.history = []; renderList(); state.history = await fetchWaarschuwingen(14); }
  renderList();
});

/** "Alle waarschuwingen": NL-Alert, Burgernet and KNMI of the last two weeks, per day (like the app). */
function renderHistory() {
  const box = $("list");
  const items = (state.history || []).filter((w) => !state.bron || w.bron === state.bron).sort((a, b) => wStart(b) - wStart(a));
  if (!state.history?.length && state.history !== null) { box.innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton"></div>`).join(""); }
  if (!items.length) { if (state.history?.length) box.innerHTML = `<div class="empty"><b>Geen waarschuwingen</b>In de laatste twee weken waren er geen waarschuwingen voor de gemeente Apeldoorn en Teuge.</div>`; return; }
  let html = `<p class="hint" style="margin:0 2px 8px">NL-Alert, Burgernet en KNMI van de laatste 14 dagen voor de gemeente Apeldoorn en Teuge.</p>`, lastDay = "";
  for (const w of items) {
    const k = dayKey(wStart(w));
    if (k !== lastDay) { html += `<div class="day">${fmtDay(wStart(w))}</div>`; lastDay = k; }
    html += warnRowHTML(w);
  }
  box.innerHTML = html;
}

function renderList(newGuids = new Set()) {
  renderKnmi();
  document.querySelector(".toolbar").hidden = state.view !== "meldingen";
  $("tiles").hidden = state.view !== "meldingen";
  if (state.view === "waarschuwingen") { renderHistory(); return; }
  const onlyWarnings = Boolean(state.bron);
  const items = [...(onlyWarnings ? [] : state.list.filter((m) => matches(m)).map((m) => ({ m, t: date(m) }))),
    ...timelineWarnings().map((w) => ({ w, t: wStart(w) }))].sort((a, b) => b.t - a.t);
  const box = $("list");
  if (!state.list.length && firstRender) {
    box.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton"></div>`).join("");
    return;
  }
  // Viewed alerts hidden: "you are all caught up".
  const verborgen = state.hideRead ? state.list.filter((m) => isRead(m) && m.guid !== state.selected).length : 0;
  const bij = verborgen ? `<div class="bij"><span>✓</span><div><b>Je bent helemaal bij</b><small>${verborgen} bekeken ${verborgen === 1 ? "melding" : "meldingen"} verborgen</small></div><button data-toonbekeken>Toon</button></div>` : "";
  if (!items.length && verborgen && !state.search) {
    box.innerHTML = `<div class="empty"><b>Je bent helemaal bij</b>Je hebt alle ${verborgen} meldingen al bekeken. Nieuwe meldingen verschijnen hier vanzelf.<br><button class="linkbtn" data-toonbekeken>Toon bekeken meldingen</button></div>`;
    return;
  }
  if (!items.length) {
    box.innerHTML = `<div class="empty"><b>${onlyWarnings ? `Geen ${esc(BRONNEN[state.bron].label)}` : "Geen meldingen"}</b>${state.search || state.diensten.size || state.plaats || state.prio || state.radiusKm || onlyWarnings ? "Er is niets dat past bij je filters in de laatste 24 uur." : "In de laatste 24 uur zijn er geen meldingen."}</div>`;
    return;
  }
  let html = "", lastDay = "";
  for (const it of items) {
    const k = dayKey(it.t);
    if (k !== lastDay) { html += `<div class="day">${fmtDay(it.t)}</div>`; lastDay = k; }
    html += it.m ? rowHTML(it.m, newGuids.has(it.m.guid)) : warnRowHTML(it.w);
  }
  box.innerHTML = html + bij;
  firstRender = false;
}

$("list").addEventListener("click", (e) => {
  const row = e.target.closest(".row");
  if (!row || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  if (row.dataset.wid) selectWarning(row.dataset.wid); else select(row.dataset.guid);
});
$("knmiBar").addEventListener("click", (e) => {
  const a = e.target.closest("[data-wid]");
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  selectWarning(a.dataset.wid);
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

/** Keeps the description and canonical URL in step with the open alert (for search engines that render JS). */
function setMeta(description, query) {
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", `https://a-alerts.nl/pager/${query}`);
}

async function select(guid, { push = true } = {}) {
  if (!guid) { closeDetail(push); return; }
  let m = state.list.find((x) => x.guid === guid) || await fetchMelding(guid);
  if (!m) { toast("Deze melding is niet meer beschikbaar"); closeDetail(push); return; }
  state.selected = guid;
  markRead(m);
  addView(guid);
  shell.classList.add("has-detail");
  if (push) history.pushState({ guid }, "", `?melding=${encodeURIComponent(guid)}${location.hash}`);
  document.title = `${m.title} – A-Alerts`;
  setMeta(`${m.title} · ${plaatsText(m)} · ${prioText(m)}`, `?melding=${encodeURIComponent(guid)}`);
  renderDetail(m);
  renderList();
}

function closeDetail(push = true) {
  state.selected = null;
  shell.classList.remove("has-detail");
  $("detail").innerHTML = "";
  if (detailMap) { try { detailMap.destroy(); } catch {} detailMap = null; }
  document.title = "Live P2000-meldingen Apeldoorn en kaart | A-Alerts";
  setMeta("Alle P2000-meldingen van de laatste 24 uur in gemeente Apeldoorn, live en op de kaart.", "");
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
    ${isGrootIncident(m) ? `<div class="groot-badge">🔥 <b>Groot incident</b>${Number(m.grip) > 0 ? `<span>GRIP ${esc(m.grip)}</span>` : ""}</div>` : ""}
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
    <section class="card" id="heliCard" hidden></section>
    <section class="card" id="kazernesCard" hidden></section>
    ${verloopHTML(m)}
    <section class="card story"><h2>Beschrijving</h2>${story(m, t, y).map((p) => `<p>${esc(p)}</p>`).join("")}</section>
    <section class="card"><h2>METEO-gegevens</h2><div class="meteo" id="meteo"><div class="skeleton" style="height:180px"></div></div></section>
    ${units.length ? `<section class="card"><h2>Capcodes (${units.length})</h2><div class="units">${units.map((u) => `
      <div class="unit"><div><b>${esc(u.naam || u.code)}</b><small>${esc([u.type, u.regio].filter(Boolean).join(" / "))}</small><code>${esc(u.code || "")}</code></div>${u.code ? `<button class="ster${volgCaps()[capKey(u.code)] ? " on" : ""}" data-volg="${esc(capKey(u.code))}" data-naam="${esc(u.naam || u.code)}" aria-label="${volgCaps()[capKey(u.code)] ? "Niet meer volgen" : "Volg deze capcode"}">★</button>` : ""}</div>`).join("")}</div>
      <p class="hint">Tik op de ster om een eenheid te volgen: je ziet die meldingen dan ook buiten je filters.</p></section>` : ""}
    ${cars.length ? `<section class="card"><h2>Voertuigen (${cars.length})</h2><div class="units">${cars.map((v) => `
      <div class="unit"><b>${esc(v.label || "Voertuig")}</b><code>${esc([v.nra, v.nrb].filter(Boolean).join(" · "))}</code></div>`).join("")}</div></section>` : ""}
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
    <section class="card feedback">
      <button class="link-btn" id="fbOpen">Klopt deze melding niet?</button>
      <form id="fbForm" hidden>
        <label>Wat klopt er niet?
          <select name="reden">
            <option value="locatie">De plek klopt niet</option><option value="dienst">Verkeerde hulpdienst</option>
            <option value="prioriteit">Verkeerde prioriteit</option><option value="dubbel">Dubbele melding</option>
            <option value="test">Test- of proefalarm</option><option value="anders">Iets anders</option>
          </select></label>
        <label>Toelichting (niet verplicht)<textarea name="toelichting" maxlength="500" rows="3"></textarea></label>
        <button type="submit" class="btn">Verstuur</button>
        <p class="hint" id="fbStatus">Je melding gaat anoniem naar de beheerder van A-Alerts. Een foute plek of tekst komt meestal uit de meldkamer zelf.</p>
      </form>
    </section>
  </article>`;
  $("detailPane").scrollTop = 0;
  if (innerWidth <= 900) document.querySelector(".detail-pane").scrollTop = 0;

  $("detail").querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeDetail()));
  $("fbOpen").addEventListener("click", () => { $("fbForm").hidden = !$("fbForm").hidden; });
  $("fbForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const knop = e.target.querySelector("button"); knop.disabled = true;
    const fout = await meldingFeedback(m.guid, { reden: f.get("reden"), toelichting: f.get("toelichting") || "" });
    $("fbStatus").textContent = fout ? `Versturen mislukt: ${fout}` : "Bedankt! We kijken ernaar.";
    if (fout) knop.disabled = false; else e.target.querySelectorAll("select,textarea,button").forEach((x) => { x.disabled = true; });
  });
  $("detail").querySelectorAll("[data-volg]").forEach((b) => b.addEventListener("click", () => {
    const v = volgCaps(), k = b.dataset.volg;
    if (v[k]) delete v[k]; else v[k] = b.dataset.naam;
    prefs.set("p2000.volgCapcodes", v);
    b.classList.toggle("on", Boolean(v[k]));
    b.setAttribute("aria-label", v[k] ? "Niet meer volgen" : "Volg deze capcode");
    toast(v[k] ? `Je volgt ${b.dataset.naam}` : "Niet meer gevolgd");
    renderList();
  }));
  $("shareBtn").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: m.title, text: `${m.title} – ${plaatsText(m)}`, url });
      else { await navigator.clipboard.writeText(url); toast("Link gekopieerd"); }
    } catch {}
  });

  const mapReady = drawDetailMap(m);
  loadMeteo(m);
  loadKazernes(m, mapReady);
  if (heliRelevant(m)) loadHeli(m, mapReady);
  $("detail").querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); select(b.dataset.goto); }));
}

/** Alerts that may belong to the same incident, as a timeline. Always a possible link, never a fact. */
function verloopHTML(m) {
  const links = verband(m, state.list, 8);
  if (!links.length) return "";
  const lijst = [m, ...links.map((l) => l.melding)].sort((a, b) => date(a) - date(b));
  const t0 = date(lijst[0]);
  return `<section class="card"><h2>Verloop</h2><p class="hint">Meldingen die mogelijk bij dezelfde inzet horen. Een mogelijk verband, geen zekerheid.</p>
    <ol class="verloop">${lijst.map((x) => {
      const plus = Math.round((date(x) - t0) / 60_000);
      const reden = links.find((l) => l.melding.guid === x.guid)?.redenen.join(" · ") || "";
      const zelf = x.guid === m.guid;
      return `<li class="${zelf ? "zelf" : ""}" style="--c:${dienstOf(x).color}"><time>${fmtTime(date(x))}${plus ? `<small>+${plus} min</small>` : ""}</time>
        <a href="?melding=${encodeURIComponent(x.guid)}" ${zelf ? "" : `data-goto="${esc(x.guid)}"`}><img src="${icon(x)}" alt=""><span><b>${esc(x.title)}</b>${zelf ? `<em>Deze melding</em>` : reden ? `<small>${esc(reden)}</small>` : ""}</span></a></li>`;
    }).join("")}</ol></section>`;
}

/** The Lifeliner (or Zulu) named in the alert: live on the detail map, every 10 seconds, with "Volg op de kaart". */
async function loadHeli(m, mapReady) {
  await mapReady;
  let items = [];
  const draw = async () => {
    if (state.selected !== m.guid) return false;
    const helis = await fetchHelikopters();
    if (state.selected !== m.guid) return false;
    const h = heliVoor(m, helis);
    const box = $("heliCard");
    if (!box) return false;
    box.hidden = false;
    const naam = h?.naam || (heliGenoemd(m) ? heliNaam(heliGenoemd(m)) : "Traumahelikopter");
    if (!h) {
      box.innerHTML = `<h2>${esc(naam)}</h2><p class="hint">${esc(naam)} is nu niet live te zien. Laag vliegend of aan de grond ontbreekt de positie soms.</p>`;
    } else {
      const km = m.lat != null ? distanceKm(h, m) : null;
      const v = h.snelheid_kt != null ? h.snelheid_kt * 1.852 : null;
      const eta = km != null && v > 40 && !h.op_grond ? Math.round((km / v) * 60) : null;
      box.innerHTML = `<h2>${esc(h.naam)} <span class="live-tag">LIVE</span></h2>
        <div class="kz heli-live"><img src="${heliImg(h)}" alt="" style="width:84px;height:auto;${vliegtWest(h) ? "transform:scaleX(-1)" : ""}">
        <div><b>${esc(heliInfo(h))}</b>${km != null ? `<small>${km.toFixed(1).replace(".", ",")} km van de melding${eta ? ` · ± ${eta} min` : ""}</small>` : ""}${h.voorspelling ? `<small>${esc(voorspellingTekst(h.voorspelling))}</small>` : ""}</div></div>
        <button class="btn btn-red" id="volgHeli" style="width:100%;margin-top:10px">Volg ${esc(h.naam)} op de kaart</button>
        <p class="hint">Positie via adsb.lol (ODbL), kan enkele seconden achterlopen.</p>`;
      $("volgHeli").onclick = () => { state.volgHeli = h.id; if (innerWidth <= 900) closeDetail(); setTab("kaart"); };
    }
    const mk = detailMap && window.mapkit;
    if (mk) {
      if (items.length) { try { detailMap.removeItems(items); } catch {} }
      items = [];
      if (h && m.lat != null) {
        const vlucht = spoorOverlay(mk, await fetchSpoor(h.id, "vlucht"), h);
        if (state.selected !== m.guid) return false;
        if (vlucht) { detailMap.addOverlay(vlucht); items.push(vlucht); }
        const a = heliAnnotation(mk, { ...h, ...geschat(h) });
        const line = new mk.PolylineOverlay([new mk.Coordinate(h.lat, h.lon), new mk.Coordinate(m.lat, m.lon)],
          { style: new mk.Style({ strokeColor: "#9333EA", lineWidth: 3, lineDash: [4, 7], lineCap: "round" }) });
        detailMap.addAnnotation(a); detailMap.addOverlay(line);
        items.push(a, line);
        if (!draw.done) { draw.done = true; try { detailMap.showItems([...detailMap.annotations, ...detailMap.overlays], { animate: true, padding: new mk.Padding(60, 40, 40, 40) }); } catch {} }
      }
    }
    return true;
  };
  while (await draw()) await new Promise((r) => setTimeout(r, 10_000));
}

/** Alarmed stations with an estimated arrival time (no vehicle positions). */
let voertuigTimer = null;

async function loadKazernes(m, mapReady) {
  const routes = await kazerneRoutes(m);
  await mapReady;
  const box = $("kazernesCard");
  if (!box || state.selected !== m.guid || !routes.length) return;
  box.hidden = false;
  const fase = (r) => {
    const [f, s] = routeFase(r);
    const min = s == null ? 0 : Math.max(1, Math.ceil(s / 60));
    return f === "uitrukken" ? ["uitrukken", `Uitrukken · vertrek over ${min} min`] : f === "onderweg" ? ["onderweg", `Onderweg · nog ${min} min · ± ${fmtTime(r.aankomst)}`]
      : f === "terplaatse" ? ["ter", "Ter plaatse"] : ["geweest", "Ter plaatse geweest"];
  };
  const regels = () => routes.map((r) => {
    const [cls, tekst] = fase(r);
    return `<div class="kz"><img src="${asset(`assets/img/icon_${r.kazerne.soort}.png`)}" alt=""><div><b>${esc(r.kazerne.naam)}</b><small>${r.km < 1 ? `${Math.round(r.km * 100) * 10} m` : `${r.km.toFixed(1).replace(".", ",")} km`} · ± ${Math.max(1, Math.round(r.rij))} min rijden</small></div>
      <span class="${cls}">${esc(tekst)}</span></div>`;
  }).join("");
  box.innerHTML = `<h2>${routes[0].genoemd ? "Gealarmeerde kazernes" : "Dichtstbijzijnde kazerne"}</h2><div id="kzRegels">${regels()}</div>
    <p class="hint">Schatting op basis van het alarmeringstijdstip, de gebruikelijke uitruktijd en de rijtijd volgens Apple Kaarten, bij spoed (A1, P1) een kwart korter. A-Alerts ontvangt geen positie van de voertuigen: het voertuigje op de kaart staat waar een eenheid volgens die schatting ongeveer zou rijden.</p>`;
  const mk = detailMap && window.mapkit;
  clearInterval(voertuigTimer);
  if (mk && state.selected === m.guid) {
    const kleur = dienstOf(m).color;
    const style = new mk.Style({ strokeColor: kleur, lineWidth: 2.5, lineDash: [7, 6], lineCap: "round" });
    for (const r of routes) {
      detailMap.addAnnotation(kazerneAnnotation(mk, r.kazerne, kleur));
      const lijn = r.route.length > 1 ? r.route : [[r.kazerne.lat, r.kazerne.lon], [m.lat, m.lon]];
      detailMap.addOverlay(new mk.PolylineOverlay(lijn.map(([la, lo]) => new mk.Coordinate(la, lo)), { style }));
    }
    try { detailMap.showItems([...detailMap.annotations, ...detailMap.overlays], { animate: true, padding: new mk.Padding(60, 40, 40, 40) }); } catch {}
    // Estimated vehicles on their way, moved every 5 seconds (an estimate from the times, not a real position).
    const voertuigen = new Map();
    const tik = () => {
      if (state.selected !== m.guid || !detailMap) { clearInterval(voertuigTimer); return; }
      for (const r of routes) {
        const p = geschattePositie(r);
        let a = voertuigen.get(r.kazerne.id);
        if (!p) { if (a) { try { detailMap.removeAnnotation(a); } catch {} voertuigen.delete(r.kazerne.id); } continue; }
        if (!a) {
          a = new mk.Annotation(new mk.Coordinate(p[0], p[1]), () => {
            const el = document.createElement("div");
            el.className = "voertuig"; el.style.setProperty("--c", kleur); el.title = `${r.kazerne.naam} (schatting)`;
            el.innerHTML = `<img src="${asset(`assets/img/icon_${r.kazerne.soort}.png`)}" alt="">`;
            return el;
          }, { calloutEnabled: false, title: `${r.kazerne.naam} (schatting)` });
          detailMap.addAnnotation(a); voertuigen.set(r.kazerne.id, a);
        } else a.coordinate = new mk.Coordinate(p[0], p[1]);
      }
      const box2 = $("kzRegels"); if (box2) box2.innerHTML = regels();
    };
    tik();
    if (routes.some((r) => r.aankomst > Date.now())) voertuigTimer = setInterval(tik, 5_000);
  }
}

// ------------------------------------------------------------------ warning detail

async function selectWarning(id, { push = true } = {}) {
  let w = state.warnings.find((x) => x.id === id);
  let near = [];
  try {
    const r = await fetch(`${API}/v1/waarschuwingen/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10_000) });
    if (r.ok) { const full = await r.json(); w = full; near = full.bron === "knmi" ? [] : full.meldingen || []; }
  } catch {}
  if (!w) { toast("Deze waarschuwing is niet meer beschikbaar"); closeDetail(push); return; }
  state.selected = `w:${w.id}`;
  shell.classList.add("has-detail");
  if (push) history.pushState({ wid: w.id }, "", `?waarschuwing=${encodeURIComponent(w.id)}${location.hash}`);
  document.title = `${wKop(w)}: ${w.titel} – A-Alerts`;
  setMeta(`${wKop(w)} · ${w.titel} · ${w.plaats || "Gemeente Apeldoorn"}`, `?waarschuwing=${encodeURIComponent(w.id)}`);
  const b = BRONNEN[w.bron];
  $("detail").innerHTML = `
  <article class="detail">
    <button class="d-back" data-close>‹ Pager</button>
    <button class="d-close" data-close aria-label="Sluiten">✕</button>
    <div class="d-map" id="dMap" role="img" aria-label="${esc(w.bron === "knmi"
      ? `Kaart: ${(CODES[isOpgeheven(w) ? "green" : w.niveau] || CODES.yellow)[0]} voor ${String(w.soort || w.titel).toLowerCase()} in ${w.plaats || "de gemeente Apeldoorn"}.`
      : `Kaart: ${wKop(w)} in ${w.plaats || "de gemeente Apeldoorn"}.`)}">${w.bron === "burgernet" ? `<div class="lookaround" id="lookAround" title="Look Around"></div>` : ""}</div>
    <section class="card">
      <div class="head"><img src="${wIcon(w)}" alt="${esc(b.label)}"><h1><small style="color:${w.bron === "knmi" ? wKleur(w) : b.text}">${esc(wKop(w))}</small>${esc(w.titel)}</h1>
        <button class="share" id="wShareBtn" aria-label="Delen">${ICO.share}</button></div>
      <div class="info"><span class="ico" style="background:${isActief(w) ? "#DC2626" : "#6b7280"}">${ICO.warn}</span><div><b>${esc(wStatus(w))}</b><small>${esc(wTijd(w))}</small></div></div>
      <div class="info"><span class="ico" style="background:#3b82f6">${ICO.pin}</span><div><b>${esc(w.plaats || "Gemeente Apeldoorn")}</b><small>${w.bron === "nlalert" ? "Het gebied staat op de kaart" : w.bron === "knmi" ? "Gebied van de waarschuwing" : "Plaats van de oproep"}</small></div></div>
      ${w.link ? `<a class="amaps" href="${esc(w.link)}" target="_blank" rel="noopener">${ICO.maps} Bekijk bij ${esc(b.label)}</a>` : ""}
    </section>
    ${isOpgeheven(w) ? opgehevenHTML(w) : ""}
    ${w.bron === "knmi" && (w.kop || w.omschrijving || w.verwachting || w.advies) ? knmiHTML(w)
    : w.tekst ? `<section class="card story"><h2>Bericht</h2>${String(w.tekst).split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}</section>` : ""}
    <section class="card"><h2>METEO-gegevens${w.bron === "knmi" ? ` <span class="live-tag">● Live</span>` : ""}</h2><div class="meteo" id="meteo"><div class="skeleton" style="height:180px"></div></div></section>
    ${w.tekst_en ? `<section class="card story"><h2>English</h2>${String(w.tekst_en).split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("")}</section>` : ""}
    ${near.length ? `<section class="card"><h2>Meldingen in de buurt</h2><p class="hint">P2000-meldingen in hetzelfde gebied rond dezelfde tijd. Mogelijk verband, geen zekerheid.</p>
      <div class="cp-list">${near.slice(0, 10).map((m) => `<button data-goto="${esc(m.guid)}"><img src="${icon(m)}" alt=""><span><small>${esc(fmtTime(date(m)))}</small><b>${esc(m.title)}</b></span></button>`).join("")}</div></section>` : ""}
  </article>`;
  $("detail").querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", () => closeDetail()));
  $("detail").querySelectorAll("[data-goto]").forEach((x) => x.addEventListener("click", () => select(x.dataset.goto)));
  $("detail").querySelectorAll("[data-wgoto]").forEach((x) => x.addEventListener("click", () => selectWarning(x.dataset.wgoto)));
  // Share the warning on a-alerts.nl (not the source), so a later visit shows the current state (code green once lifted).
  $("wShareBtn").addEventListener("click", async () => {
    const url = wShareUrl(w);
    try {
      if (navigator.share) await navigator.share({ title: wKop(w), text: `${wKop(w)}: ${w.titel}`, url });
      else { await navigator.clipboard.writeText(url); toast("Link gekopieerd"); }
    } catch {}
  });
  $("detailPane").scrollTop = 0;
  renderList();
  const weerLader = async () => {
    try {
      const r = await fetch(`${API}/v1/waarschuwingen/${encodeURIComponent(w.id)}/weather`, { signal: AbortSignal.timeout(12_000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  loadMeteo(w, `w:${w.id}`, weerLader);
  // Weather code: the weather is live (now, in Apeldoorn), refreshed every 5 minutes while the warning is open.
  clearInterval(weerTimer);
  if (w.bron === "knmi") weerTimer = setInterval(() => state.selected === `w:${w.id}` ? loadMeteo(w, `w:${w.id}`, weerLader) : clearInterval(weerTimer), 300_000);
  const mk = await loadMapKit();
  if (!mk || state.selected !== `w:${w.id}`) return;
  if (detailMap) { try { detailMap.destroy(); } catch {} }
  const div = document.createElement("div"); div.className = "mk"; $("dMap").prepend(div);
  detailMap = new mk.Map(div, { center: new mk.Coordinate(w.lat ?? 52.2112, w.lon ?? 5.9699), cameraDistance: 9000, showsMapTypeControl: false,
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light });
  const overlays = warnOverlays(mk, w);
  if (overlays.length) { detailMap.addOverlays(overlays); try { detailMap.showItems(overlays, { padding: new mk.Padding(30, 30, 30, 30) }); } catch {} }
  if (w.lat != null && w.bron !== "knmi") detailMap.addAnnotation(warnAnnotation(mk, w));
  const la = $("lookAround");
  try { if (la && mk.LookAroundPreview && w.lat != null) new mk.LookAroundPreview(la, new mk.Coordinate(w.lat, w.lon), { openDialogOnClick: true }); } catch { if (la) la.innerHTML = ""; }
}

async function drawDetailMap(m) {
  if (m.lat == null || m.lon == null) return;
  const mk = await loadMapKit();
  if (!mk || state.selected !== m.guid) return;
  const host = $("dMap");
  host.querySelector(".static-pin")?.remove();
  if (detailMap) { try { detailMap.destroy(); } catch {} detailMap = null; }
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

let weerTimer = null;

async function loadMeteo(m, key = m.guid, loader = () => fetchWeather(m.guid)) {
  const box = $("meteo");
  const w = await loader();
  if (state.selected !== key || !box) return;
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
    <div class="attribution">${w.live ? `Het weer van nu in Apeldoorn (${esc(fmtTime(new Date(w.time)))}), elke 5 minuten bijgewerkt` : "Gegevens zijn op basis van incident tijdstip en locatie"} · <span> Weather</span> · <a href="${esc(w.attribution)}" target="_blank" rel="noopener">Bronnen</a></div>`;
}

addEventListener("popstate", () => {
  const sp = new URLSearchParams(location.search);
  const g = sp.get("melding"), wid = sp.get("waarschuwing");
  wid ? selectWarning(wid, { push: false }) : g ? select(g, { push: false }) : closeDetail(false);
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
  if (tab === "kaart") {
    if (state.volgHeli && !state.lagen.has("helikopters")) state.lagen.add("helikopters");
    renderMap();
    pollHelis();
    clearInterval(heliTimer);
    heliTimer = setInterval(pollHelis, 15_000);
  } else clearInterval(heliTimer);
  if (tab === "stats") renderStats();
  scrollTo({ top: 0 });
}
document.querySelectorAll("button[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ------------------------------------------------------------------ map

let bigMap = null, bigMapReady = null;
const LAGEN = [
  ["waarschuwingen", "Alerts", "icon_nlalert", "#FFC800"],
  ["knmi", "KNMI", "icon_knmi", "#3E9FDB"],
  ["helikopters", "Heli's", "icon_traumaheli", "#9333EA"],
  ["kazernes", "Kazernes", "icon_brandweer", "#E30613"],
  ["ziekenhuizen", "Ziekenhuizen", "locatie_trauma", "#DC2626"],
  ["werkgebied", "Grens", "aalerts-icon-32", "#DC2626"],
  ["buienradar", "Buien", "icon_knmi", "#2563EB"],
];
function renderMapChips() {
  const cutoff = Date.now() - state.mapHours * 3600_000;
  const recent = state.list.filter((m) => date(m).getTime() >= cutoff);
  // Disciplines, Burgernet (always), NL-Alert (when there is one), and Lifeliner / Zulu (tap: to the helicopter, or all of that type).
  const alle = state.warnings.filter((w) => w.bron !== "knmi" && (isActief(w) || new Date(w.einde || w.start).getTime() >= cutoff));
  const bronChip = (b, label, c) => {
    const n = alle.filter((w) => w.bron === b).length;
    const on = state.lagen.has("waarschuwingen") && state.mapBronnen.has(b);
    return `<button class="chip${on ? "" : " off"}" data-bron="${b}" style="--c:${c}" aria-pressed="${on}" title="${label}"><img src="${asset(`assets/img/icon_${b}.png`)}" alt="${label}">${n}</button>`;
  };
  const heliChip = (soort, label) => {
    const list = state.helis.filter((h) => h.soort === soort);
    if (!list.length) return "";
    return `<button class="chip heli-chip${state.lagen.has("helikopters") ? "" : " off"}" data-heli="${soort}" style="--c:${soort === "trauma" ? "#9333EA" : "#15428B"}" title="${label}"><img src="${heliImg(list[0])}" alt="${label}">${list.length}</button>`;
  };
  $("mapChips").innerHTML = SELECTABLE.map((d) => {
    const n = recent.filter((m) => m.dienst === d).length;
    return `<button class="chip${state.mapDiensten.has(d) ? "" : " off"}" data-d="${d}" style="--c:${DIENSTEN[d].color}"><img src="${icon({ dienst: d })}" alt="">${n}</button>`;
  }).join("") + bronChip("burgernet", "Burgernet", "#0067B1") + bronChip("nlalert", "NL-Alert", "#E3001B")
    + heliChip("trauma", "Lifeliner") + heliChip("politie", "Zulu");
  $("mapLagen").innerHTML = LAGEN.map(([k, label, img, c]) => {
    const n = k === "helikopters" ? state.helis.length : k === "waarschuwingen" ? mapWarnings().length
      : k === "knmi" ? state.warnings.filter((w) => w.bron === "knmi" && isActief(w)).length : "";
    return `<button class="chip${state.lagen.has(k) ? "" : " off"}" data-laag="${k}" title="${({ waarschuwingen: "NL-Alert en Burgernet", knmi: "KNMI-weerwaarschuwingen", helikopters: "Lifeliners en politiehelikopters", kazernes: "Kazernes", ziekenhuizen: "Ziekenhuizen en helikopterbases", werkgebied: "Grens van het werkgebied (gemeente Apeldoorn en Teuge)", buienradar: "Buienradar (KNMI), elke 5 minuten nieuw" })[k]}" aria-pressed="${state.lagen.has(k)}" style="--c:${c}"><img src="${asset(`assets/img/${img}.png`)}" alt="">${label}${n !== "" ? ` <small>${n}</small>` : ""}</button>`;
  }).join("") + `<button class="chip" data-weergave title="Kaart en helikopters" style="--c:#64748B">⚙︎ Weergave</button>`;
}
$("mapLagen").addEventListener("click", (e) => {
  if (e.target.closest("[data-weergave]")) { openWeergave(); return; }
  const k = e.target.closest("[data-laag]")?.dataset.laag;
  if (!k) return;
  state.lagen.has(k) ? state.lagen.delete(k) : state.lagen.add(k);
  prefs.set("p2000.lagen", [...state.lagen]);
  renderMap();
});

function mapWarnings() {
  const cutoff = Date.now() - state.mapHours * 3600_000;
  return state.warnings.filter((w) => w.bron !== "knmi" && state.mapBronnen.has(w.bron) && (isActief(w) || new Date(w.einde || w.start).getTime() >= cutoff));
}

let heliTimer = null;
async function pollHelis() {
  if (state.tab !== "kaart" || document.hidden) return;
  state.helis = await fetchHelikopters();
  renderMap();
}
$("mapChips").addEventListener("click", async (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  if (chip.dataset.bron) {
    const b = chip.dataset.bron;
    if (!state.lagen.has("waarschuwingen")) { state.lagen.add("waarschuwingen"); state.mapBronnen.add(b); prefs.set("p2000.lagen", [...state.lagen]); }
    else state.mapBronnen.has(b) ? state.mapBronnen.delete(b) : state.mapBronnen.add(b);
    renderMap();
    return;
  }
  if (chip.dataset.heli) {
    const list = state.helis.filter((h) => h.soort === chip.dataset.heli);
    if (!state.lagen.has("helikopters")) { state.lagen.add("helikopters"); prefs.set("p2000.lagen", [...state.lagen]); }
    await renderMap();
    const mk = await bigMapReady;
    if (!mk || !bigMap || !list.length) return;
    if (list.length === 1) {
      const g = geschat(list[0]);
      bigMap.setCenterAnimated(new mk.Coordinate(g.lat, g.lon));
      if (bigMap.cameraDistance > 40000) bigMap.cameraDistance = 25000;
      openHeli(list[0]);
    } else {
      const lats = list.map((h) => geschat(h).lat), lons = list.map((h) => geschat(h).lon);
      const c = new mk.Coordinate((Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2);
      bigMap.setRegionAnimated(new mk.CoordinateRegion(c, new mk.CoordinateSpan(Math.max(0.2, (Math.max(...lats) - Math.min(...lats)) * 1.5), Math.max(0.2, (Math.max(...lons) - Math.min(...lons)) * 1.5))), true);
    }
    return;
  }
  const d = chip.dataset.d;
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
  const { pins, clusters } = layout(state.list.filter((m) => date(m).getTime() >= cutoff && state.mapDiensten.has(m.dienst)));
  if (!bigMapReady) {
    bigMapReady = loadMapKit().then((mk) => {
      if (!mk) {
        $("mapFallbackText").innerHTML = mapsAllowed()
          ? "De kaart van Apple Kaarten is nu niet bereikbaar. Je ziet de meldingen op een vereenvoudigde kaart."
          : 'De kaart komt van Apple Kaarten en laadt pas als je dat toestaat. Je ziet nu een vereenvoudigde kaart. <button class="link-btn" data-consent-open>Kaart toestaan</button>';
        $("mapFallback").hidden = false;
        return null;
      }
      bigMap = new mk.Map($("bigMap"), {
        center: new mk.Coordinate(52.2112, 5.9699),
        cameraDistance: 26000,
        showsMapTypeControl: true,
        colorScheme: weergave().donker || matchMedia("(prefers-color-scheme: dark)").matches ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light,
        padding: new mk.Padding(70, 20, 20, 20),
      });
      return mk;
    });
  }
  const mk = await bigMapReady;
  if (!mk) { renderStaticMarkers(pins, clusters); return; }
  bigMap.removeAnnotations(bigMap.annotations.filter((a) => !a._heli));
  bigMap.removeOverlays(bigMap.overlays);
  heliMarkers ||= heliLaag(mk, bigMap, { onSelect: (id) => { const h = state.helis.find((x) => x.id === id); if (h) openHeli(h); } });
  const actief = state.warnings.filter((w) => isActief(w));
  const extra = [];
  if (state.lagen.has("knmi")) actief.filter((w) => w.bron === "knmi").forEach((w) => bigMap.addOverlays(warnOverlays(mk, w)));
  if (state.lagen.has("waarschuwingen")) {
    // Like the app: NL-Alert and Burgernet within the chosen period, or still active (ended ones greyed out).
    mapWarnings().forEach((w) => {
      bigMap.addOverlays(warnOverlays(mk, w));
      if (w.lat != null) extra.push(warnAnnotation(mk, w, (x) => selectWarning(x.id)));
    });
  }
  if (state.lagen.has("kazernes")) (await kazernes()).forEach((k) => extra.push(kazerneAnnotation(mk, k, DIENSTEN[k.soort]?.color || "#E30613")));
  if (state.lagen.has("ziekenhuizen")) (await fetchLocaties()).forEach((l) => extra.push(locatieAnnotation(mk, l, openLocatie)));
  heliMarkers.update(state.lagen.has("helikopters") ? state.helis : []);
  if (state.lagen.has("helikopters")) {
    // Probable destination of every helicopter (or only the selected one).
    state.helis.filter((h) => !heliSpoor.id || h.id === heliSpoor.id).forEach((h) => { const v = voorspellingOverlay(mk, h); if (v) bigMap.addOverlay(v); });
  }
  if (state.lagen.has("helikopters") && heliSpoor.id) {
    const h = state.helis.find((x) => x.id === heliSpoor.id);
    const ov = spoorOverlay(mk, heliSpoor.punten, h, Date.now(), afspelen.f == null ? {} : { live: false, opacity: 0.35 });
    if (ov) bigMap.addOverlay(ov);
    afspelen.ov = null; // removed with the other overlays above
    renderAfspeel(mk, h);
  }
  if (state.lagen.has("werkgebied")) bigMap.addOverlays(await werkgebiedOverlays(mk));
  await zetRadar(mk);
  bigMap.addAnnotations([
    ...clusters.map((c) => clusterAnnotation(mk, c, openCluster)),
    ...pins.map((m) => markerAnnotation(mk, m, (x) => select(x.guid))),
    ...extra,
  ]);
  // "Volg … op de kaart": centre on the helicopter at every new position.
  if (state.volgHeli) {
    const h = state.helis.find((x) => x.id === state.volgHeli);
    if (h) {
      const g = geschat(h);
      bigMap.setCenterAnimated(new mk.Coordinate(g.lat, g.lon));
      if (bigMap.cameraDistance > 30000) bigMap.cameraDistance = 15000;
      openHeli(h);
    }
  }
}

/** Without MapKit: show the markers roughly placed over the brand map texture. */
function renderStaticMarkers(pins, clusters) {
  let box = $("bigMap").querySelector(".static-markers");
  if (!box) { box = document.createElement("div"); box.className = "static-markers"; $("bigMap").appendChild(box); }
  const lat0 = 52.2112, lon0 = 5.9699, span = 0.22;
  const pos = (m) => ({ x: 50 + ((m.lon - lon0) / (span * 1.6)) * 100, y: 50 - ((m.lat - lat0) / span) * 100 });
  const inside = ({ x, y }) => x >= 2 && x <= 98 && y >= 8 && y <= 98;
  box.innerHTML = pins.map((m) => {
    const p = pos(m);
    if (!inside(p)) return "";
    return `<img class="mk-marker" style="position:absolute;left:${p.x}%;top:${p.y}%;margin:-38px 0 0 -19px" src="${asset(`assets/img/${dienstOf(m).marker}.png`)}" alt="${esc(m.title)}" title="${esc(m.title)}" data-guid="${esc(m.guid)}">`;
  }).join("");
  for (const c of clusters) {
    const p = pos(c);
    if (!inside(p)) continue;
    const el = clusterEl(c, openCluster);
    el.style.cssText = `position:absolute;left:${p.x}%;top:${p.y}%;margin:-38px 0 0 -19px`;
    box.appendChild(el);
  }
  box.onclick = (e) => { const g = e.target.dataset.guid; if (g) select(g); };
}

// Rain radar (KNMI tiles via the A-Alerts API), refreshed every 5 minutes while the layer is on.
const radar = { ov: null, at: 0 };
async function zetRadar(mk) {
  const aan = state.lagen.has("buienradar");
  if (radar.ov && (!aan || Date.now() - radar.at > 300_000)) { bigMap.removeTileOverlay(radar.ov); radar.ov = null; }
  if (!aan || radar.ov) return;
  radar.ov = await radarLaag(mk);
  radar.at = Date.now();
  if (radar.ov) bigMap.addTileOverlay(radar.ov);
  else if (!radar.gemeld) { radar.gemeld = true; toast("De buienradar is nog niet beschikbaar."); }
}

/** "Kaart en helikopters": the same display choices as in the apps (kept in this browser). */
function openWeergave() {
  const v = weergave();
  const box = $("clusterPanel");
  const opt = (name, val, label, cur) => `<label class="radio"><input type="radio" name="${name}" value="${val}"${cur === val ? " checked" : ""}> ${label}</label>`;
  box.innerHTML = `<header><b>Kaart en helikopters</b><button class="icon-btn" data-close aria-label="Sluit">✕</button></header>
    <form id="weergaveForm" class="weergave">
      <label class="check"><input type="checkbox" name="donker"${v.donker ? " checked" : ""}> Donkere kaart</label>
      <label class="check"><input type="checkbox" name="kleurPerToestel"${v.kleurPerToestel ? " checked" : ""}> Eigen kleur per helikopter</label>
      <fieldset><legend>Grootte op de kaart</legend>${opt("icoon", "klein", "Klein", v.icoon)}${opt("icoon", "normaal", "Normaal", v.icoon)}${opt("icoon", "groot", "Groot", v.icoon)}</fieldset>
      <fieldset><legend>Eenheden</legend>${opt("eenheden", "metrisch", "Meter en km/u", v.luchtvaart ? "luchtvaart" : "metrisch")}${opt("eenheden", "luchtvaart", "Voet en knopen", v.luchtvaart ? "luchtvaart" : "metrisch")}</fieldset>
      <label class="check"><input type="checkbox" name="prestatie"${v.prestatie ? " checked" : ""}> Prestatiemodus (helikopters bewegen niet vloeiend)</label>
      <p class="hint">Deze keuzes gelden voor deze browser.</p>
    </form>`;
  box.hidden = false;
  $("weergaveForm").addEventListener("change", async (e) => {
    const f = e.currentTarget;
    const nieuw = zetWeergave({
      donker: f.donker.checked, kleurPerToestel: f.kleurPerToestel.checked, prestatie: f.prestatie.checked,
      icoon: f.icoon.value, luchtvaart: f.eenheden.value === "luchtvaart",
    });
    const mk = await bigMapReady;
    if (mk && bigMap) bigMap.colorScheme = nieuw.donker || matchMedia("(prefers-color-scheme: dark)").matches ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light;
    // Redraw the helicopter markers with the new size and colours.
    heliMarkers?.clear();
    renderMap();
  });
}

/** Hospital or base tapped: what it is and which helicopter is probably heading there. */
function openLocatie(l) {
  const box = $("clusterPanel");
  const op = state.helis.filter((h) => h.voorspelling?.id === l.id);
  box.innerHTML = `<header><b>${esc(l.naam)}</b><button class="icon-btn" data-close aria-label="Sluit">✕</button></header>
    <p><img src="${locatieIcon(l)}" alt="" style="width:18px;height:18px;vertical-align:-3px"> ${esc([locatieSoort(l), l.plaats].filter(Boolean).join(" · "))}</p>
    ${op.map((h) => `<p><b>${esc(h.naam)}</b> is waarschijnlijk onderweg hierheen${h.voorspelling.eta_min ? ` · ± ${h.voorspelling.eta_min} min` : ""}</p>`).join("")}
    <p class="hint" style="margin:8px 0 0">Bron: OpenStreetMap (ODbL)</p>`;
  box.hidden = false;
}

// Playback of the selected trail ("Vlucht terugspelen"): f = 0..1, null = live.
const afspelen = { f: null, speelt: false, snelheid: 60, timer: null, ann: null, ov: null };
function renderAfspeel(mk, h) {
  // Only the played part and the marker are redrawn (cheap enough four times a second).
  if (afspelen.ann) { bigMap.removeAnnotation(afspelen.ann); afspelen.ann = null; }
  if (afspelen.ov) { bigMap.removeOverlay(afspelen.ov); afspelen.ov = null; }
  const p = afspelen.f == null ? null : afspeelPunt(heliSpoor.punten, afspelen.f);
  const label = $("afspeelTijd");
  if (label) label.textContent = p ? `Terugspelen: ${fmtTime(p.t)}${p.hoogte_ft != null ? ` · ${Math.round((p.hoogte_ft * 0.3048) / 10) * 10} m` : ""}` : "";
  if (!p || !h) return;
  afspelen.ov = spoorOverlay(mk, p.gespeeld, h, Date.now(), { live: false, breedte: 6, opacity: 1 });
  if (afspelen.ov) bigMap.addOverlay(afspelen.ov);
  afspelen.ann = new mk.Annotation(new mk.Coordinate(p.lat, p.lon), () => {
    const el = document.createElement("div");
    el.innerHTML = `<img src="${heliImg(h)}" alt="" style="width:56px;height:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">`;
    return el;
  }, { calloutEnabled: false });
  afspelen.ann._heli = true;
  bigMap.addAnnotation(afspelen.ann);
}
const afspeelTick = async () => {
  const mk = await bigMapReady;
  if (mk && bigMap) renderAfspeel(mk, state.helis.find((x) => x.id === heliSpoor.id));
};
function speelAf(aan) {
  clearInterval(afspelen.timer);
  const was = afspelen.f;
  afspelen.speelt = aan && heliSpoor.punten.length >= 2;
  const btn = $("afspeelKnop");
  if (btn) btn.textContent = afspelen.speelt ? "❚❚" : "▶";
  if (!afspelen.speelt) return;
  if (afspelen.f == null || afspelen.f >= 1) afspelen.f = 0;
  if (was == null) renderMap(); // dim the full trail once
  const duur = Math.max(1, (Date.parse(heliSpoor.punten.at(-1).t) - Date.parse(heliSpoor.punten[0].t)) / 1000);
  afspelen.timer = setInterval(() => {
    afspelen.f = Math.min(1, afspelen.f + (0.25 * afspelen.snelheid) / duur);
    const sl = $("afspeelSlider"); if (sl) sl.value = String(afspelen.f);
    if (afspelen.f >= 1) speelAf(false);
    afspeelTick();
  }, 250);
}
function stopAfspelen() {
  speelAf(false); afspelen.f = null;
  if (afspelen.ann && bigMap) { bigMap.removeAnnotation(afspelen.ann); afspelen.ann = null; }
  const label = $("afspeelTijd"); if (label) label.textContent = "";
}

// Route trail and flights of the selected helicopter (refreshed every 20 seconds while its panel is open).
let heliMarkers = null;
const heliSpoor = { id: null, scope: (({ vandaag: "lang" })[prefs.get("p2000.spoorScope", "vlucht")] || prefs.get("p2000.spoorScope", "vlucht")), punten: [], vluchten: [], timer: null };
async function loadSpoor() {
  const id = heliSpoor.id;
  if (!id) return;
  const [punten, vluchten] = await Promise.all([fetchSpoor(id, heliSpoor.scope), fetchVluchten(id)]);
  if (heliSpoor.id !== id) return;
  Object.assign(heliSpoor, afspelen.f == null ? { punten, vluchten } : { vluchten });
  const box = $("heliVluchten");
  if (box) box.innerHTML = vluchten.length ? vluchten.slice(0, 4).map((v) => `<li class="${v.onderweg ? "on" : ""}">${esc(vluchtTekst(v))}</li>`).join("") : `<li class="hint">Nog geen vluchten opgeslagen.</li>`;
  renderMap();
}
function selectSpoor(id) {
  clearInterval(heliSpoor.timer);
  stopAfspelen();
  Object.assign(heliSpoor, { id, punten: [], vluchten: [] });
  if (!id) { renderMap(); return; }
  loadSpoor();
  heliSpoor.timer = setInterval(loadSpoor, 20_000);
}

/** Helicopter tapped: heading, altitude and speed (like the app's info card). */
function openHeli(h) {
  const box = $("clusterPanel");
  const koers = h.koers != null && !h.op_grond ? `${h.koers}° ${["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"][Math.round(h.koers / 45) % 8]}` : "–";
  const hoogte = h.op_grond ? "Op de grond" : h.hoogte_ft != null ? `${Math.round((h.hoogte_ft * 0.3048) / 10) * 10} m` : "–";
  const snelheid = h.snelheid_kt != null ? `${Math.round(h.snelheid_kt * 1.852)} km/u` : "–";
  const herkenning = h.herkenning === "toestel" ? `Herkend aan het toestel; vliegt nu als ${esc(h.callsign || "–")}` : h.herkenning === "operator" ? "Herkend aan de eigenaar van het toestel" : "";
  const afstand = state.here ? ` · ${distanceKm(state.here, h).toFixed(1).replace(".", ",")} km van je af` : "";
  box.innerHTML = `<header><b>${esc(h.naam)}</b><button class="icon-btn" data-close aria-label="Sluit">✕</button></header>
    <p>${esc([h.soort === "trauma" ? "Traumahelikopter" : "Politiehelikopter", h.registratie, h.basis ? `basis ${h.basis}` : null].filter(Boolean).join(" · "))}</p>
    <div class="heli-vals"><div><small>Koers</small><b>${koers}</b></div><div><small>Hoogte</small><b>${hoogte}</b></div><div><small>Snelheid</small><b>${snelheid}</b></div></div>
    ${herkenning ? `<p class="hint" style="margin:8px 0 0">${herkenning}</p>` : ""}
    ${h.voorspelling ? `<p class="voorspelling">${esc(voorspellingTekst(h.voorspelling))}</p>` : ""}
    <div class="seg" id="spoorScope">${[["vlucht", "Deze vlucht"], ["kort", "30 min"], ["lang", "2 uur"]].map(([k, l]) => `<button data-scope="${k}" class="${heliSpoor.scope === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="afspeel"><button id="afspeelKnop" class="icon-btn" aria-label="Vlucht terugspelen">▶</button>
      <input type="range" id="afspeelSlider" min="0" max="1" step="0.001" value="${afspelen.f ?? 1}" aria-label="Afspeelpositie">
      <button id="afspeelSnelheid" class="icon-btn" aria-label="Afspeelsnelheid">${afspelen.snelheid}×</button>
      <button id="afspeelStop" class="icon-btn" aria-label="Terug naar live">⟲</button></div>
    <small class="hint" id="afspeelTijd"></small>
    <h4 class="vl-head">Vluchten</h4><ul class="vluchten" id="heliVluchten"><li class="hint">Laden…</li></ul>
    <p class="hint" style="margin:8px 0 0">Positie van ${esc(fmtTime(new Date(h.gezien)))}${afstand} · data: adsb.lol (ODbL)</p>`;
  box.hidden = false;
  box.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    heliSpoor.scope = b.dataset.scope; prefs.set("p2000.spoorScope", heliSpoor.scope);
    box.querySelectorAll("[data-scope]").forEach((x) => x.classList.toggle("on", x === b));
    stopAfspelen();
    loadSpoor();
  }));
  $("afspeelKnop").addEventListener("click", (e) => { e.stopPropagation(); speelAf(!afspelen.speelt); });
  $("afspeelSlider").addEventListener("input", (e) => { const was = afspelen.f; speelAf(false); afspelen.f = Number(e.target.value); if (was == null) renderMap(); else afspeelTick(); });
  $("afspeelSnelheid").addEventListener("click", (e) => {
    e.stopPropagation();
    afspelen.snelheid = { 30: 60, 60: 120, 120: 300 }[afspelen.snelheid] || 30;
    e.target.textContent = `${afspelen.snelheid}×`;
    if (afspelen.speelt) speelAf(true);
  });
  $("afspeelStop").addEventListener("click", (e) => { e.stopPropagation(); stopAfspelen(); renderMap(); });
  if (heliSpoor.id !== h.id) selectSpoor(h.id); else loadSpoor();
}

let werkgebiedCache = null;
async function werkgebiedOverlays(mk) {
  if (!werkgebiedCache) werkgebiedCache = fetch(asset("assets/werkgebied.json")).then((r) => r.json()).catch(() => ({ gebied: [] }));
  const { gebied } = await werkgebiedCache;
  return gebied.map((ring) => new mk.PolylineOverlay([...ring, ring[0]].map(([lon, lat]) => new mk.Coordinate(lat, lon)),
    { style: new mk.Style({ strokeColor: "#DC2626", strokeOpacity: 0.8, lineWidth: 2.5, lineDash: [10, 6] }) }));
}

/** Town marker tapped: list the alerts without a street name in that town. */
function openCluster(c) {
  const box = $("clusterPanel");
  box.innerHTML = `<header><b>${c.meldingen.length} in ${esc(c.plaats)}</b><button class="icon-btn" data-close aria-label="Sluit">✕</button></header>
    <p>De meldkamer heeft bij deze meldingen geen straatnaam doorgegeven. Daarom staan ze samen op één punt in de plaats.</p>
    <div class="cp-list">${c.meldingen.map((m) => `<button data-guid="${esc(m.guid)}"><img src="${icon(m)}" alt=""><span><small>${esc(ago(date(m)))} · ${fmtTime(date(m))}</small><b>${esc(m.title)}</b></span></button>`).join("")}</div>`;
  box.hidden = false;
}
$("clusterPanel").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) { $("clusterPanel").hidden = true; state.volgHeli = null; selectSpoor(null); return; }
  const g = e.target.closest("[data-guid]")?.dataset.guid;
  if (g) { $("clusterPanel").hidden = true; select(g); }
});

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

function warnStatsHTML() {
  const key = (d) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
  const vandaag = key(new Date()), gisteren = key(new Date(Date.now() - 86_400_000));
  return Object.entries(BRONNEN).map(([bron, b]) => {
    const eigen = state.warnings.filter((w) => w.bron === bron);
    const a = eigen.filter((w) => key(wStart(w)) === vandaag).length, y = eigen.filter((w) => key(wStart(w)) === gisteren).length;
    const nu = eigen.filter(isActief).length;
    return `<a class="drow" href="?bron=${bron}"><img src="${asset(`assets/img/${b.icon}.png`)}" alt=""><span>${b.label}${nu ? ` <em class="nu">${nu} actief</em>` : ""}</span><b>${a}</b><i>/ ${y}</i>${delta(a - y)}</a>`;
  }).join("");
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
      <section class="card"><h2>Waarschuwingen</h2>${warnStatsHTML()}<p class="source" style="text-align:left;margin:.6rem 0 0">Vandaag / gisteren · gemeente Apeldoorn en Teuge</p></section>
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
  const [{ list, online }, warnings] = await Promise.all([fetchMeldingen(500), fetchWaarschuwingen(7)]);
  state.warnings = warnings;
  state.online = online;
  if (online) state.lastOk = new Date();
  $("demoBanner").hidden = !demoMode;
  const fresh = state.known.size ? list.filter((m) => !state.known.has(m.guid)) : [];
  list.forEach((m) => state.known.add(m.guid));
  state.list = list;
  render(new Set(fresh.map((m) => m.guid)));
  if (fresh.length && document.hidden) document.title = `(${fresh.length}) Live pager – A-Alerts`;
  tick();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.selected) document.title = "Live P2000-meldingen Apeldoorn en kaart | A-Alerts";
  if (!document.hidden) refresh();
});

renderList();
setTab((location.hash || "#pager").slice(1), false);
await refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 15_000);
setInterval(() => { if (!document.hidden) renderList(); }, 60_000); // "x min geleden"
const initial = params.get("melding"), initialW = params.get("waarschuwing");
if (initialW) selectWarning(initialW, { push: false });
else if (initial) select(initial, { push: false });
