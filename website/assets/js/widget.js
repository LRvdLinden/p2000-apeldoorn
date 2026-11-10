// A-Alerts widgets: "Live kaart" (square map of Apeldoorn e.o.) and "Verkeer nu" (traffic list).
// Used in the side column of a-alerts.nl/nieuws and on other websites through /widget/ (iframe, or embed.js).
// The map: municipal border in the colour of the active KNMI code, traffic (NDW), P2000 alerts of the last 3 hours,
// helicopters inside the area, hospitals, rain radar and (optional) fixed speed cameras. Light/dark follows the device.
import { API, asset, esc, loadMapKit, mapsAllowed, markerAnnotation, fmtTime, prefs } from "./core.js?v=58";
import {
  fetchWaarschuwingen, fetchHelikopters, heliLaag, fetchLocaties, locatieAnnotation, radarLaag, CODES, mShareUrl,
  fetchVerkeer, verkeerOverlay, verkeerAnnotation, flitserAnnotation, verkeerIcon, verkeerFile, VERKEER_SOORT,
} from "./aalerts.js?v=59";

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
const TABS = [["alles", "Alles"], ["ongeval", "Ongevallen"], ["file", "Files"], ["afsluiting", "Afsluitingen"], ["werk", "Werkzaamheden"], ["pech", "Pech"], ["flitsers", "Flitsers"]];
const PIN = new Set(["ongeval", "pech"]);
const dag = (t) => new Date(t).toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" });

/**
 * Renders the widgets in el. opts: { widgets: ["kaart","verkeer"], extern: bool (other website: "A-Alerts" in every
 * title, links open a-alerts.nl in a new tab), thema: "auto" | "licht" | "donker", onResize: fn }.
 */
export function maakWidgets(el, opts = {}) {
  const widgets = (opts.widgets?.length ? opts.widgets : ["kaart", "verkeer"]).filter((w) => w === "kaart" || w === "verkeer");
  const ext = Boolean(opts.extern);
  const doel = ext ? ' target="_blank" rel="noopener"' : "";
  const naam = (t) => (ext ? `A-Alerts · ${t}` : t);
  const kop = (t, id) => `<div class="aw-kop"><img src="${asset("assets/img/aalerts-icon-32.png")}" alt="A-Alerts">${esc(naam(t))}<small id="${id}">Apeldoorn e.o.</small></div>`;
  const voet = (tekst, link, label) => `<div class="aw-voet"><span>${tekst}</span><a href="${link}"${doel}>${label} ›</a></div>`;
  el.classList.add("aw");
  el.innerHTML = [
    widgets.includes("kaart") ? `<section class="aw-w" aria-label="${esc(naam("Live kaart"))}">${kop("Live kaart", "awKaartTijd")}
      <div class="aw-kaart"><div class="aw-map"></div><span class="aw-live">● Live</span><span class="aw-code" hidden></span>
        <div class="aw-laden" hidden><p>De kaart komt van Apple Kaarten. Daarbij ziet Apple je IP-adres.</p><button type="button">Kaart laden</button></div>
        <div class="aw-info" hidden></div></div>
      <div class="aw-chips" role="group" aria-label="Kaartlagen"></div>
      ${ext ? voet("Bron: A-Alerts · NDW · KNMI · Apple Kaarten", "https://a-alerts.nl/pager/", "a-alerts.nl") : ""}</section>` : "",
    widgets.includes("verkeer") ? `<section class="aw-w" aria-label="${esc(naam("Verkeer nu"))}">${kop(ext ? "Verkeer" : "Verkeer nu", "awVerkeerTijd")}
      <div class="aw-tabs" role="tablist"></div><div class="aw-lijst"><p class="aw-leeg">Verkeer laden…</p></div>
      ${voet(ext ? "Bron: A-Alerts · NDW · © OpenStreetMap" : "Bron: NDW (Rijkswaterstaat, provincie, gemeenten); flitsers © OpenStreetMap", ext ? "https://a-alerts.nl/nieuws/" : "/pager/", ext ? "a-alerts.nl" : "Open de kaart")}</section>` : "",
  ].join("");

  const state = { lagen: new Set(prefs.get("aw.lagen", STANDAARD)), tab: "alles", verkeer: { items: [], flitsers: [] } };
  const meld = () => opts.onResize?.();

  // ---------------------------------------------------------------- Verkeer nu
  const tabsEl = el.querySelector(".aw-tabs"), lijstEl = el.querySelector(".aw-lijst");
  function lijst() {
    if (!lijstEl) return;
    const { items = [], flitsers = [] } = state.verkeer;
    const tel = (s) => (s === "alles" ? items.length : s === "flitsers" ? flitsers.length : items.filter((v) => v.soort === s).length);
    tabsEl.innerHTML = TABS.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${t} <b>${tel(k)}</b></button>`).join("");
    let rijen;
    if (state.tab === "flitsers") {
      rijen = flitsers.map((f) => `<div class="aw-rij"><img class="pin" src="${verkeerIcon("flitser")}" alt=""><div><b>${f.soort === "trajectcontrole" ? "Trajectcontrole" : "Flitser"}${f.max ? ` · max. ${f.max} km/u` : ""}</b><small>Vaste flitser (OpenStreetMap)</small></div></div>`);
      if (!rijen.length) rijen = ['<p class="aw-leeg">Geen vaste flitsers bekend in de regio.</p>'];
    } else {
      const lijst = items.filter((v) => state.tab === "alles" || v.soort === state.tab).sort((a, b) => VOLGORDE.indexOf(a.soort) - VOLGORDE.indexOf(b.soort));
      rijen = lijst.map((v) => {
        const waar = [v.weg, v.plaats].filter(Boolean).join(", ") || "Regio Apeldoorn";
        const extra = [verkeerFile(v), v.einde ? `tot ${dag(v.einde)}` : ""].filter(Boolean).join(" · ");
        return `<button type="button" class="aw-rij" data-v="${esc(v.id)}"><img class="${PIN.has(v.soort) ? "pin" : ""}" src="${verkeerIcon(v.soort)}" alt="${esc(VERKEER_SOORT[v.soort] || "")}">
          <div><b>${esc(v.titel)}</b><small>${esc(waar)}${extra ? ` · ${esc(extra)}` : ""}</small></div></button>`;
      });
      if ((state.tab === "alles" || state.tab === "file") && !items.some((v) => v.soort === "file")) {
        rijen.unshift(`<div class="aw-rij leeg"><img src="${verkeerIcon("file")}" alt=""><div><b>Geen files</b><small>Op de A1 en A50 rond Apeldoorn rijdt het verkeer door</small></div></div>`);
      }
      if (!rijen.length) rijen = [`<p class="aw-leeg">Nu niets bekend: ${esc((TABS.find(([k]) => k === state.tab) || [, ""])[1].toLowerCase())}.</p>`];
    }
    lijstEl.innerHTML = rijen.join("");
    meld();
  }
  tabsEl?.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { state.tab = b.dataset.tab; lijst(); } });
  lijstEl?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    const v = b && state.verkeer.items.find((x) => x.id === b.dataset.v);
    if (v && kaart.map) { kaart.map.setCenterAnimated(new kaart.mk.Coordinate(v.lat, v.lon)); toonInfo(verkeerTekst(v)); el.querySelector(".aw-kaart")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  });

  // ---------------------------------------------------------------- Live kaart
  const kaart = { mk: null, map: null, helis: null, radar: null, anns: [], ovs: [] };
  const kaartEl = el.querySelector(".aw-map");
  const info = el.querySelector(".aw-info");
  function toonInfo(html) { if (!info) return; info.innerHTML = `${html}<button type="button" class="aw-x" aria-label="Sluit">✕</button>`; info.hidden = false; }
  info?.addEventListener("click", (e) => { if (e.target.closest(".aw-x")) info.hidden = true; });
  const verkeerTekst = (v) => `<b>${esc(v.titel)}</b><span>${esc([[v.weg, v.plaats].filter(Boolean).join(", "), verkeerFile(v), v.einde ? `tot ${dag(v.einde)}` : ""].filter(Boolean).join(" · "))}</span>${v.opmerking ? `<span>${esc(v.opmerking)}</span>` : ""}`;

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
      region: new mk.CoordinateRegion(new mk.Coordinate(52.19, 5.955), new mk.CoordinateSpan(0.27, 0.44)),
      colorScheme: donker() ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light,
      showsMapTypeControl: false, showsCompass: mk.FeatureVisibility.Hidden, showsScale: mk.FeatureVisibility.Hidden,
      isRotationEnabled: false, showsZoomControl: true, showsPointsOfInterest: false,
    });
    if (!opts.thema || opts.thema === "auto") matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { kaart.map.colorScheme = donker() ? mk.Map.ColorSchemes.Dark : mk.Map.ColorSchemes.Light; });
    kaart.helis = heliLaag(mk, kaart.map, { onSelect: (id) => { const h = kaart.helis.current(id); if (h) toonInfo(`<b>${esc(h.naam || id)}</b><span>${h.op_grond ? "Op de grond" : "In de lucht"}${h.voorspelling?.naam ? ` · waarschijnlijk naar ${esc(h.voorspelling.naam)}` : ""}</span>`); } });
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
    if (state.lagen.has("flitsers")) for (const f of state.verkeer.flitsers) kaart.anns.push(flitserAnnotation(mk, f, (x) => toonInfo(`<b>${x.soort === "trajectcontrole" ? "Trajectcontrole" : "Flitser"}</b><span>${x.max ? `Max. ${x.max} km/u · ` : ""}vaste flitser (OpenStreetMap)</span>`)));
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
  (async () => {
    await laadVerkeer();
    if (kaartEl) { await laadKaartData(); data.helis = await fetchHelikopters(); await startKaart(); }
    meld();
  })();
  setInterval(async () => { if (document.hidden) return; await laadVerkeer(); if (kaart.map) { await laadKaartData(); teken(); } }, 60_000);
  setInterval(async () => { if (document.hidden || !kaart.map || !state.lagen.has("heli")) return; data.helis = await fetchHelikopters(); kaart.helis.update(data.helis.filter((h) => inGebied(h.lat, h.lon))); }, 15_000);
}
