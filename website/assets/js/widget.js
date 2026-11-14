// A-Alerts widgets: "Live kaart" (square map of Apeldoorn e.o.), "Verkeer nu" (traffic list) and "Weer" (the KNMI warning
// for Apeldoorn e.o. with the picture of the news article). Every link leads to the information on a-alerts.nl.
// Used in the side column of a-alerts.nl/nieuws and on other websites through /widget/ (iframe, or embed.js).
// The map: municipal border in the colour of the active KNMI code, traffic (NDW), P2000 alerts of the last 3 hours,
// helicopters inside the area, hospitals, rain radar and (optional) fixed speed cameras. Light/dark follows the device.
import { weerKaartHTML, tekenWeerKaart, codeKleur, opKleur, CODE_KLEUR } from "./weerkaart.js?v=1";
import { API, asset, esc, loadMapKit, mapsAllowed, markerAnnotation, fmtTime, prefs } from "./core.js?v=61";
import {
  fetchWaarschuwingen, fetchHelikopters, heliLaag, fetchLocaties, locatieAnnotation, radarLaag, CODES, mShareUrl,
  fetchVerkeer, verkeerOverlay, verkeerAnnotation, flitserAnnotation, verkeerIcon, verkeerFile, VERKEER_SOORT, verkeerRegels, verkeerTijdvak, verkeerKleur,
} from "./aalerts.js?v=72";

// The area: Apeldoorn, the villages and hamlets, Teuge, with the A1 and A50 around it.
const GEBIED = { noord: 52.36, zuid: 52.03, oost: 6.20, west: 5.70 };
const inGebied = (lat, lon) => lat >= GEBIED.zuid && lat <= GEBIED.noord && lon >= GEBIED.west && lon <= GEBIED.oost;
const LAGEN = [
  ["p2000", "P2000", () => asset("assets/img/marker_ambulance.png")],
  ["verkeer", "Verkeer", () => verkeerIcon("ongeval")],
  ["heli", "Heli", () => asset("assets/img/heli_lifeliner.png")],
  ["ziekenhuis", "Ziekenhuis", () => asset("assets/img/locatie_ziekenhuis.png")],
  ["buien", "Buien", null],
  ["flitsers", "Flitsers", () => verkeerIcon("flitser")],
];
const STANDAARD = ["p2000", "verkeer", "heli", "ziekenhuis", "buien"];
const VOLGORDE = ["ongeval", "file", "afsluiting", "werk", "pech"];
const dag = (t) => new Date(t).toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

/**
 * Renders the widgets in el. opts: { widgets: ["kaart","verkeer"], extern: bool (other website: "A-Alerts" in every
 * title, links open a-alerts.nl in a new tab), thema: "auto" | "licht" | "donker", onResize: fn }.
 */
export function maakWidgets(el, opts = {}) {
  const widgets = (opts.widgets?.length ? opts.widgets : ["kaart", "verkeer"]).filter((w) => ["kaart", "verkeer", "weer"].includes(w));
  const ext = Boolean(opts.extern);
  const doel = ext ? ' target="_blank" rel="noopener"' : "";
  // Links to the information on a-alerts.nl (absolute on other websites).
  const SITE = ext ? "https://a-alerts.nl" : "";
  const kaartLink = (id) => `${SITE}/pager/?verkeer=${encodeURIComponent(id)}#kaart`;
  const naam = (t) => (ext ? `A-Alerts · ${t}` : t);
  const kop = (t, id, sub = "Apeldoorn e.o.") => `<div class="aw-kop"><img src="${asset("assets/img/aalerts-icon-32.png")}" alt="A-Alerts">${esc(naam(t))}<small id="${id}">${sub}</small></div>`;
  // Footer: the a-alerts.nl pill (like on the news pictures), a link to the page on a-alerts.nl.
  const voet = (link) => `<div class="aw-voet"><a class="aw-site" href="${link}"${doel}><img src="${asset("assets/img/aalerts-icon-32.png")}" alt="">a-alerts.nl</a></div>`;
  el.classList.add("aw");
  el.innerHTML = [
    widgets.includes("kaart") ? `<section class="aw-w" aria-label="${esc(naam("Live kaart"))}">${kop("Live kaart", "awKaartTijd")}
      <div class="aw-kaart"><div class="aw-map"></div><span class="aw-live">● Live</span><span class="aw-code" hidden></span>
        <div class="aw-laden" hidden><p>De kaart komt van Apple Kaarten. Daarbij ziet Apple je IP-adres.</p><button type="button">Kaart laden</button></div>
        <div class="aw-info" hidden></div></div>
      <div class="aw-chips" role="group" aria-label="Kaartlagen"></div>
      ${voet(`${SITE}/pager/#kaart`)}</section>` : "",
    widgets.includes("verkeer") ? `<section class="aw-w" aria-label="${esc(naam("Verkeer nu"))}">${kop(ext ? "Verkeer" : "Verkeer nu", "awVerkeerTijd")}
      <div class="aw-sum" role="group" aria-label="Samenvatting"></div><div class="aw-seg" role="tablist"></div><div class="aw-lijst"><p class="aw-leeg">Verkeer laden…</p></div>
      ${voet(`${SITE}/pager/#kaart`)}</section>` : "",
    widgets.includes("weer") ? `<section class="aw-w aw-weer" aria-label="${esc(naam(ext ? "Weer" : "Weerwaarschuwing"))}">${kop(ext ? "Weer" : "Weerwaarschuwing", "awWeerTijd", "KNMI")}
      <div class="aw-wfig"></div><div class="aw-wbody"><p class="aw-leeg">Weer laden…</p></div>
      ${voet(`${SITE}/nieuws/`)}</section>` : "",
  ].join("");

  const state = { lagen: new Set(prefs.get("aw.lagen", STANDAARD)), tab: "nu", filter: null, groepen: new Map(), open: null, verkeer: { items: [], gepland: [], flitsers: [] } };
  const meld = () => opts.onResize?.();

  // ---------------------------------------------------------------- Verkeer nu
  // Structured like a traffic site: a summary per type, Nu / Gepland / Flitsers, then groups per road (A and N roads
  // with a road shield) and per place (local roads). Every report shows the direction (Apeldoorn → Amersfoort), the
  // stretch, what is going on in colour, and when it ends; a tap opens the cause, lanes, time slots and source.
  // In the list every icon is a circle (the map uses pins for accidents, breakdowns and speed cameras).
  const rondIcoon = (s) => (s === "ongeval" || s === "pech" || s === "flitser" ? asset(`assets/img/verkeer_${s}_rond.png?v=1`) : verkeerIcon(s));
  const sumEl = el.querySelector(".aw-sum"), segEl = el.querySelector(".aw-seg"), lijstEl = el.querySelector(".aw-lijst");
  const TEGELS = [["file", "files"], ["werk", "werk"], ["afsluiting", "dicht"], ["ongeval", "ongeval"], ["flitser", "flitsers"]];
  const ROUTE = { A1: "Amsterdam – Hengelo", A50: "Arnhem – Zwolle", N344: "Apeldoorn – Teuge", N345: "Apeldoorn – Zutphen", N304: "Apeldoorn – Hoenderloo", N786: "Apeldoorn – Beekbergen" };
  const groepSleutel = (v) => (v.weg && /^[AN]\d/.test(v.weg) ? v.weg : `L:${v.plaats || "Regio Apeldoorn"}`);
  const plekVan = (v) => (v.weg ? v.traject || "" : [v.kop && v.kop !== v.plaats ? v.kop : "", v.traject].filter(Boolean).join(" · "));
  const richtingVan = (v) => (v.weg && v.vanaf && v.richting ? `${esc(v.vanaf)}<i>→</i>${esc(v.richting)}` : esc(v.weg ? v.kop || v.weg : v.titel));
  const watVan = (v, r) => [v.soort === "file" ? "" : v.weg ? v.titel : "", ...r.details].filter(Boolean).join(" · ") || (v.weg ? v.titel : "");
  function rij(v, gepland = false) {
    const r = verkeerRegels(v), open = state.open === v.id, plek = plekVan(v), wat = watVan(v, r);
    const wanneer = gepland ? (r.tijdvakken.slice(0, 2).map(verkeerTijdvak).join(" · ") || (v.start ? verkeerTijdvak([v.start, v.einde || v.start]) : "")) : r.eind;
    const meer = [r.oorzaak, ...r.toelichting].filter(Boolean);
    r.hinder = ["", "weinig hinder", "matige hinder", "veel hinder"][v.hinder] || "";
    return `<button type="button" class="aw-rij${open ? " open" : ""}" data-v="${esc(v.id)}" aria-expanded="${open}"><img src="${rondIcoon(v.soort)}" alt="${esc(VERKEER_SOORT[v.soort] || "")}">
      <div><b class="aw-dir">${richtingVan(v)}</b>${plek ? `<small>${esc(plek)}</small>` : ""}
        ${wat ? `<small class="aw-det" style="color:${verkeerKleur(v)}">${esc(wat)}</small>` : ""}
        ${wanneer || r.hinder ? `<small class="aw-wanneer">${wanneer ? `${gepland ? "🗓 " : ""}${esc(wanneer)}` : ""}${r.hinder ? `<span class="aw-pil">${esc(r.hinder)}</span>` : ""}</small>` : ""}
        ${open ? `<span class="aw-open">${meer.map((t) => `<small>${esc(t)}</small>`).join("")}
          ${r.tijdvakken.length > 2 ? `<small>${esc(r.tijdvakken.map(verkeerTijdvak).join(" · "))}</small>` : ""}
          <small class="aw-bron">${esc(v.bron ? `Bron: ${v.bron} via NDW` : "Bron: NDW")}</small>
          <a href="${kaartLink(v.id)}"${doel}>Bekijk op ${ext ? "a-alerts.nl" : "de kaart"} ›</a></span>` : ""}
      </div></button>`;
  }
  function groepen(lijst, gepland) {
    const m = new Map();
    for (const v of lijst) { const k = groepSleutel(v); (m.get(k) || m.set(k, []).get(k)).push(v); }
    const sleutels = [...m.keys()].sort((a, b) => (a.startsWith("L:") - b.startsWith("L:")) || (a[0] === "N") - (b[0] === "N") || a.localeCompare(b, "nl", { numeric: true }));
    return sleutels.map((k) => {
      const vs = m.get(k).sort((a, b) => VOLGORDE.indexOf(a.soort) - VOLGORDE.indexOf(b.soort));
      const lokaal = k.startsWith("L:");
      // Closed by default: the visitor sees the roads and places with their counts and opens what interests them.
      const open = state.groepen.has(k) ? state.groepen.get(k) : false;
      const schild = lokaal ? `<span class="aw-schild L">📍</span><span>${esc(k.slice(2))}</span>` : `<span class="aw-schild ${k[0]}">${esc(k)}</span><span>${esc(ROUTE[k] || "")}</span>`;
      return `<div class="aw-groep${open ? " open" : ""}"><button type="button" class="aw-gkop" data-g="${esc(k)}" aria-expanded="${open}">${schild}<small>${vs.length} melding${vs.length === 1 ? "" : "en"}</small><i>›</i></button>
        ${open ? vs.map((v) => rij(v, gepland)).join("") : ""}</div>`;
    }).join("");
  }
  function lijst() {
    if (!lijstEl) return;
    const { items = [], gepland = [], flitsers = [] } = state.verkeer;
    const km = items.filter((v) => v.soort === "file").reduce((a, v) => a + (v.lengte_km || 0), 0);
    const tel = { file: items.filter((v) => v.soort === "file").length, werk: items.filter((v) => v.soort === "werk").length, afsluiting: items.filter((v) => v.soort === "afsluiting").length,
      ongeval: items.filter((v) => v.soort === "ongeval" || v.soort === "pech").length, flitser: flitsers.length };
    sumEl.innerHTML = TEGELS.map(([k, t]) => `<button type="button" data-f="${k}" aria-pressed="${state.filter === k || (k === "flitser" && state.tab === "flitsers")}"><img src="${rondIcoon(k)}" alt=""><b>${tel[k]}</b><span>${k === "file" && km ? `${km.toFixed(1).replace(".", ",")} km` : t}</span></button>`).join("");
    segEl.innerHTML = [["nu", `Nu (${items.length})`], ["gepland", `Gepland (${gepland.length})`], ["flitsers", "Flitsers"]].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${t}</button>`).join("");
    let html;
    if (state.tab === "flitsers") {
      html = flitsers.map((f) => `<div class="aw-rij"><img src="${rondIcoon("flitser")}" alt=""><div><b>${f.soort === "trajectcontrole" ? "Trajectcontrole" : "Vaste flitser"}</b><small>${esc(f.plaats || f.weg || "Regio Apeldoorn")}</small>${f.max ? `<small class="aw-det" style="color:#2F80ED">max. ${f.max} km/u</small>` : ""}<a class="aw-link" href="${kaartLink(f.id)}"${doel}>Op de kaart ›</a></div></div>`).join("")
        || '<p class="aw-leeg">Geen vaste flitsers bekend in de regio.</p>';
      html += '<p class="aw-leeg klein">Vaste flitsers en trajectcontroles: © OpenStreetMap-bijdragers. Mobiele controles staan hier niet in.</p>';
    } else if (state.tab === "gepland") {
      html = groepen(gepland, true) || '<p class="aw-leeg">Geen werkzaamheden of afsluitingen gepland in de komende 7 dagen.</p>';
    } else {
      const f = state.filter;
      const lijst = items.filter((v) => !f || v.soort === f || (f === "ongeval" && v.soort === "pech"));
      html = groepen(lijst, false);
      if ((!f || f === "file") && !tel.file) html = `<div class="aw-rij leeg"><img src="${rondIcoon("file")}" alt=""><div><b>Geen files</b><small>Op de A1 en A50 rond Apeldoorn rijdt het verkeer door</small></div></div>` + html;
      if (!html) html = `<p class="aw-leeg">Nu niets bekend.</p>`;
    }
    lijstEl.innerHTML = html;
    meld();
  }
  sumEl?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    const k = b.dataset.f;
    if (k === "flitser") { state.tab = state.tab === "flitsers" ? "nu" : "flitsers"; state.filter = null; }
    else { state.tab = "nu"; state.filter = state.filter === k ? null : k; }
    state.open = null; lijst();
  });
  segEl?.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { state.tab = b.dataset.tab; state.filter = null; state.open = null; lijst(); } });
  lijstEl?.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    const g = e.target.closest("[data-g]");
    if (g) { state.groepen.set(g.dataset.g, g.getAttribute("aria-expanded") !== "true"); lijst(); return; }
    const b = e.target.closest("[data-v]");
    if (!b) return;
    const v = [...state.verkeer.items, ...(state.verkeer.gepland || [])].find((x) => x.id === b.dataset.v);
    state.open = state.open === b.dataset.v ? null : b.dataset.v;
    lijst();
    if (v && kaart.map && state.open) kaart.map.setCenterAnimated(new kaart.mk.Coordinate(v.lat, v.lon));
  });

  // ---------------------------------------------------------------- Weer
  // The KNMI warning(s) for Apeldoorn e.o. that apply now, each with the picture and text of its news article on
  // a-alerts.nl; the most severe one is shown, the others as a line below it. "Meer informatie" opens the issue time,
  // the risks and advice, the details and a link to the article.
  const wFig = el.querySelector(".aw-wfig"), wBody = el.querySelector(".aw-wbody");
  const NIV = { red: 3, orange: 2, yellow: 1 };
  const hoofd = (t) => String(t || "").charAt(0).toUpperCase() + String(t || "").slice(1);
  const weer = { lijst: [], keus: 0, open: false, getekend: null };
  const weerLink = (a) => (a.id ? `${SITE}/nieuws/${a.id}` : `${SITE}/pager/?waarschuwing=${encodeURIComponent(a.waarschuwing)}`);
  async function laadWeer() {
    if (!wBody) return;
    const [ws, nieuws] = await Promise.all([fetchWaarschuwingen(1),
      fetch(`${API}/v1/nieuws?soort=weer&limit=30`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => [])]);
    const nu = Date.now();
    const actief = ws.filter((w) => w.bron === "knmi" && w.status !== "beeindigd" && w.niveau && w.niveau !== "green" && (!w.einde || Date.parse(w.einde) > nu));
    const arts = [], gezien = new Set();
    for (const w of actief) {
      const n = (Array.isArray(nieuws) ? nieuws : []).find((x) => x.waarschuwing === w.id);
      if (n && gezien.has(n.id)) continue;
      if (n) gezien.add(n.id);
      const a = n ? await fetch(`${API}/v1/nieuws/${n.id}`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      if (a?.weer) { if (!a.weer.opgeheven) arts.push({ id: a.id, waarschuwing: w.id, weer: a.weer }); continue; }
      // No article (yet): the warning itself.
      const code = (CODES[w.niveau] || CODES.yellow)[0];
      arts.push({ id: null, waarschuwing: w.id, weer: { kop: w.kop || `${code} voor ${String(w.soort || "het weer").toLowerCase()}`, code, niveau: w.niveau, soort: w.soort || "",
        omschrijving: w.omschrijving || w.tekst || "", adviezen: [], gebieden: w.gebied ? [{ niveau: w.niveau, gebied: w.gebied }] : [] } });
    }
    arts.sort((a, b) => (NIV[b.weer.niveau] || 0) - (NIV[a.weer.niveau] || 0));
    const oud = weer.lijst[weer.keus]?.waarschuwing;
    weer.lijst = arts;
    weer.keus = Math.max(0, arts.findIndex((a) => a.waarschuwing === oud));
    const t = el.querySelector("#awWeerTijd");
    if (t) t.textContent = `KNMI · ${fmtTime(new Date())}`;
    toonWeer();
  }
  function toonWeer() {
    if (!wBody) return;
    if (!weer.lijst.length) {
      wFig.innerHTML = ""; weer.getekend = null;
      wBody.innerHTML = `<div class="aw-groen"><span>✓</span><div><b>Code groen</b><small>Er is nu geen KNMI-weerwaarschuwing.</small></div></div>`;
      meld(); return;
    }
    const a = weer.lijst[weer.keus], w = a.weer, kl = codeKleur(w, w.niveau), op = opKleur(w);
    if (weer.getekend !== a.waarschuwing) {
      wFig.innerHTML = weerKaartHTML(w);
      weer.getekend = a.waarschuwing;
      tekenWeerKaart(wFig.querySelector(".nw-weer-kaart"), w).then(meld);
    }
    const vakken = (w.tijdvakken || []).length > 1 ? `<ul class="aw-wvakken">${w.tijdvakken.map((v) => `<li><span style="background:${CODE_KLEUR[v.niveau] || CODE_KLEUR.yellow}"></span>${esc(v.code)}: ${esc(v.tekst)}</li>`).join("")}</ul>` : "";
    wBody.innerHTML = `<div class="aw-wtekst"><h4>${esc(w.kop)}</h4><span class="aw-wcode" style="background:${kl};color:${op}">${esc(w.code)}</span>
        ${w.omschrijving ? `<p>${esc(w.omschrijving)}</p>` : ""}
        <button type="button" class="aw-wmeer" aria-expanded="${weer.open}"><i>›</i>${weer.open ? "Minder informatie" : "Meer informatie"}</button>
        ${weer.open ? `<div class="aw-wopen">${vakken}${w.uitgifte ? `<small class="aw-wuit">Uitgifte: ${esc(w.uitgifte)}</small>` : ""}
          ${(w.adviezen || []).length ? `<div class="aw-wadv"><b>Risico's en advies</b><ul>${w.adviezen.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
          ${w.details ? `<div class="aw-wdet"><b>Details</b><p>${esc(w.details)}</p></div>` : ""}
          <a class="aw-wknop" href="${weerLink(a)}"${doel} style="background:${kl};color:${op}">Bekijk de weerwaarschuwing ›</a></div>` : ""}</div>
      ${weer.lijst.map((x, i) => (i === weer.keus ? "" : `<button type="button" class="aw-wrij" data-wi="${i}"><span style="background:${codeKleur(x.weer, x.weer.niveau)}"></span><b>${esc(x.weer.code)} · ${esc(hoofd(x.weer.soort || x.weer.kop))}</b><small>${esc(x.weer.tijdvak || "")} ›</small></button>`)).join("")}`;
    meld();
  }
  wBody?.addEventListener("click", (e) => {
    if (e.target.closest(".aw-wmeer")) { weer.open = !weer.open; toonWeer(); return; }
    const r = e.target.closest("[data-wi]");
    if (r) { weer.keus = Number(r.dataset.wi); weer.open = false; toonWeer(); }
  });

  // ---------------------------------------------------------------- Live kaart
  const kaart = { mk: null, map: null, helis: null, radar: null, anns: [], ovs: [] };
  const kaartEl = el.querySelector(".aw-map");
  const info = el.querySelector(".aw-info");
  function toonInfo(html) { if (!info) return; info.innerHTML = `${html}<button type="button" class="aw-x" aria-label="Sluit">✕</button>`; info.hidden = false; }
  info?.addEventListener("click", (e) => { if (e.target.closest(".aw-x")) info.hidden = true; });
  const verkeerTekst = (v) => {
    const r = verkeerRegels(v);
    return `<b>${esc(r.kop)}</b>${r.wat ? `<span>${esc(r.wat)}</span>` : ""}${r.details.length ? `<span style="color:${verkeerKleur(v)};font-weight:600">${esc(r.details.join(" · "))}</span>` : ""}
      ${[r.oorzaak, ...r.toelichting].filter(Boolean).slice(0, 2).map((t) => `<span>${esc(t)}</span>`).join("")}${r.eind ? `<span>${esc(r.eind)}</span>` : ""}
      <a href="${kaartLink(v.id)}"${doel}>Meer op a-alerts.nl ›</a>`;
  };

  function chips() {
    const box = el.querySelector(".aw-chips");
    if (!box) return;
    box.innerHTML = LAGEN.map(([k, t, img]) => `<button type="button" data-laag="${k}" aria-pressed="${state.lagen.has(k)}">${img ? `<img src="${img()}" alt="">` : '<i class="aw-buien"></i>'}${t}</button>`).join("");
  }
  el.querySelector(".aw-chips")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-laag]");
    if (!b) return;
    const k = b.dataset.laag;
    state.lagen.has(k) ? state.lagen.delete(k) : state.lagen.add(k);
    prefs.set("aw.lagen", [...state.lagen]);
    chips();
    teken();
  });

  async function startKaart() {
    if (!kaartEl) return;
    const mk = await loadMapKit();
    if (!mk) {
      const laden = el.querySelector(".aw-laden");
      laden.hidden = false;
      if (mapsAllowed()) laden.querySelector("p").textContent = "De kaart is nu niet bereikbaar. Probeer het later opnieuw.";
      return;
    }
    kaart.mk = mk;
    const donker = () => (opts.thema === "donker" ? true : opts.thema === "licht" ? false : matchMedia("(prefers-color-scheme: dark)").matches);
    kaart.map = new mk.Map(kaartEl, {
      region: new mk.CoordinateRegion(new mk.Coordinate(52.19, 5.955), new mk.CoordinateSpan(0.23, 0.37)),
      colorScheme: donker() ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light,
      showsMapTypeControl: false, showsCompass: mk.FeatureVisibility.Hidden, showsScale: mk.FeatureVisibility.Hidden,
      isRotationEnabled: false, showsZoomControl: true, showsPointsOfInterest: false,
    });
    if (!opts.thema || opts.thema === "auto") matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { kaart.map.colorScheme = donker() ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light; });
    kaart.helis = heliLaag(mk, kaart.map, { onSelect: (id) => { const h = kaart.helis.current(id); if (h) toonInfo(`<b>${esc(h.naam || id)}</b><span>${h.op_grond ? "Op de grond" : "In de lucht"}${h.voorspelling?.naam ? ` · waarschijnlijk naar ${esc(h.voorspelling.naam)}` : ""}</span><a href="${SITE}/pager/#kaart"${doel}>Volg op a-alerts.nl ›</a>`); } });
    await teken();
  }
  el.querySelector(".aw-laden button")?.addEventListener("click", () => {
    // The visitor chooses to load the map: remember it like "Accepteren" in the cookie notice of a-alerts.nl.
    try { localStorage.setItem("p2000_consent", JSON.stringify({ choice: "all", at: Date.now() })); } catch {}
    location.reload();
  });

  let data = { meldingen: [], warnings: [], helis: [], locaties: [] };
  async function teken() {
    const { mk, map } = kaart;
    if (!mk || !map) return;
    map.removeAnnotations(kaart.anns); map.removeOverlays(kaart.ovs);
    kaart.anns = []; kaart.ovs = [];
    // Municipal border in the colour of the KNMI code that applies now (green when there is none).
    const knmi = data.warnings.filter((w) => w.bron === "knmi" && w.status !== "beeindigd");
    const rang = { yellow: 1, orange: 2, red: 3 };
    const code = knmi.map((w) => w.niveau).sort((a, b) => (rang[b] || 0) - (rang[a] || 0))[0] || "green";
    const [codeNaam, kleur, opKleur] = CODES[code] || CODES.green;
    const codeEl = el.querySelector(".aw-code");
    if (codeEl) {
      codeEl.hidden = code === "green";
      codeEl.style.cssText = `background:${kleur};color:${opKleur}`;
      codeEl.innerHTML = `<img src="${asset("assets/img/icon_knmi.png")}" alt="">${esc(codeNaam)}${knmi[0]?.soort ? ` · ${esc(String(knmi[0].soort).toLowerCase())}` : ""}`;
    }
    for (const ring of await grens()) {
      kaart.ovs.push(new mk.PolygonOverlay(ring.map(([lon, lat]) => new mk.Coordinate(lat, lon)), {
        style: new mk.Style({ strokeColor: kleur, strokeOpacity: 0.95, lineWidth: 3, fillColor: kleur, fillOpacity: code === "green" ? 0.04 : 0.12 }),
      }));
    }
    if (state.lagen.has("verkeer")) {
      for (const v of state.verkeer.items) {
        const ov = verkeerOverlay(mk, v);
        if (ov) kaart.ovs.push(ov);
        kaart.anns.push(verkeerAnnotation(mk, v, (x) => toonInfo(verkeerTekst(x))));
      }
    }
    if (state.lagen.has("flitsers")) for (const f of state.verkeer.flitsers) kaart.anns.push(flitserAnnotation(mk, f, (x) => toonInfo(`<b>${x.soort === "trajectcontrole" ? "Trajectcontrole" : "Flitser"}</b><span>${x.max ? `Max. ${x.max} km/u · ` : ""}vaste flitser (OpenStreetMap)</span><a href="${kaartLink(x.id)}"${doel}>Meer op a-alerts.nl ›</a>`)));
    if (state.lagen.has("ziekenhuis")) for (const l of data.locaties) if (inGebied(l.lat, l.lon)) kaart.anns.push(locatieAnnotation(mk, l, (x) => toonInfo(`<b>${esc(x.naam)}</b>`)));
    if (state.lagen.has("p2000")) {
      const grens3u = Date.now() - 3 * 3600_000, gezien = new Set();
      for (const m of data.meldingen) {
        if (m.lat == null || new Date(m.datum_tijd).getTime() < grens3u) continue;
        const k = `${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
        if (gezien.has(k)) continue;
        gezien.add(k);
        kaart.anns.push(markerAnnotation(mk, m, (x) => toonInfo(`<b>${esc(x.title || "P2000-melding")}</b><span>${fmtTime(new Date(x.datum_tijd))}</span><a href="${mShareUrl(x)}"${doel}>Bekijk de melding ›</a>`)));
      }
    }
    map.addOverlays(kaart.ovs); map.addAnnotations(kaart.anns);
    kaart.helis.update(state.lagen.has("heli") ? data.helis.filter((h) => inGebied(h.lat, h.lon)) : []);
    // Rain radar: a tile layer, renewed every 5 minutes.
    const buien = state.lagen.has("buien");
    if (kaart.radar && (!buien || Date.now() - kaart.radar.at > 300_000)) { map.removeTileOverlay(kaart.radar.ov); kaart.radar = null; }
    if (buien && !kaart.radar) { const ov = await radarLaag(mk); if (ov) { map.addTileOverlay(ov); kaart.radar = { ov, at: Date.now() }; } }
    const t = el.querySelector("#awKaartTijd");
    if (t) t.textContent = `Apeldoorn e.o. · ${fmtTime(new Date())}`;
  }
  let grensCache = null;
  const grens = async () => (grensCache ||= fetch(asset("assets/werkgebied.json")).then((r) => r.json()).then((d) => d.gebied || []).catch(() => []));

  // ---------------------------------------------------------------- data
  async function laadVerkeer() {
    state.verkeer = await fetchVerkeer();
    const t = el.querySelector("#awVerkeerTijd");
    if (t && state.verkeer.bijgewerkt) t.textContent = `bijgewerkt ${fmtTime(new Date(state.verkeer.bijgewerkt))}`;
    lijst();
  }
  async function laadKaartData() {
    const [meldingen, warnings, locaties] = await Promise.all([
      fetch(`${API}/v1/meldingen?limit=80`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => []),
      fetchWaarschuwingen(2), data.locaties.length ? data.locaties : fetchLocaties(),
    ]);
    data = { ...data, meldingen: Array.isArray(meldingen) ? meldingen : [], warnings, locaties };
  }
  chips();
  laadWeer();
  setInterval(() => { if (!document.hidden) laadWeer(); }, 300_000);
  (async () => {
    await laadVerkeer();
    if (kaartEl) { await laadKaartData(); data.helis = await fetchHelikopters(); await startKaart(); }
    meld();
  })();
  setInterval(async () => { if (document.hidden) return; await laadVerkeer(); if (kaart.map) { await laadKaartData(); teken(); } }, 60_000);
  setInterval(async () => { if (document.hidden || !kaart.map || !state.lagen.has("heli")) return; data.helis = await fetchHelikopters(); kaart.helis.update(data.helis.filter((h) => inGebied(h.lat, h.lon))); }, 15_000);
}
