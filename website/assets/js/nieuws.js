// A-Alerts: Nieuws. The list (/nieuws/) and one article or liveblog (/nieuws/<id>, also ?id=<id>).
import { API, esc, loadMapKit } from "./core.js?v=58";

const TZ = "Europe/Amsterdam";
const $ = (s) => document.querySelector(s);
const KLEUR = { burgernet: "#0067B1", amber: "#EC6E24", vermistkind: "#1B265E", nlalert: "#1D1D1F", politie: "#1E3A8C", "112nieuws": "#DC2626" };
const CODE = { yellow: ["Code geel", "#F7C600"], orange: ["Code oranje", "#F28C28"], red: ["Code rood", "#E3001B"], green: ["Code groen", "#2E9E44"] };
const BRON = { burgernet: "Burgernet", amber: "AMBER Alert", vermistkind: "Vermist Kind", nlalert: "NL-Alert", knmi: "KNMI", politie: "Politie", "112nieuws": "112 Nieuws" };
const ICOON = (b, cat) => b === "112nieuws" ? `/assets/img/icon_${{ brand: "brandweer", traumaheli: "traumaheli", politie: "politie" }[cat] || "ambulance"}.png`
  : `/assets/img/icon_${["burgernet", "amber", "vermistkind", "knmi", "nlalert"].includes(b) ? b : "politie"}.png`;
const kleur = (x) => (x.bron === "knmi" ? (CODE[x.niveau] || CODE.yellow)[1] : KLEUR[x.bron] || KLEUR.politie);
/** Liveblog (set in the beheer; older servers: every Burgernet/AMBER/Vermist Kind item). */
const isLiveblog = (x) => (typeof x.liveblog === "boolean" ? x.liveblog : x.soort === "liveblog");
const label = (x) => (isLiveblog(x) ? "Liveblog · " : "") + basisLabel(x);
const basisLabel = (x) => x.soort === "regionaal" ? `112 Nieuws${x.plaats ? ` · ${x.plaats}` : ""}` : x.soort === "liveblog" ? BRON[x.bron] || "Melding" : x.soort === "weer" ? `Weer · ${(CODE[x.niveau] || CODE.yellow)[0]}` : `Politie${x.plaats ? ` · ${x.plaats}` : ""}`;
const isLive = (x) => x.soort === "liveblog" && x.status !== "afgerond";

function wanneer(iso) {
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (s < 60) return "zojuist";
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  const tijd = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const dag = (x) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  if (dag(d) === dag(new Date())) return `vandaag ${tijd}`;
  if (dag(d) === dag(new Date(Date.now() - 86_400_000))) return `gisteren ${tijd}`;
  return `${d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", timeZone: TZ })} ${tijd}`;
}
const datum = (iso) => new Date(iso).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(",", " ·").replace(/-/g, "/");
const lang = (iso) => new Date(iso).toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });

function meta(x) {
  if (x.soort === "liveblog") return [`${x.aantal ?? 0} berichten`, `laatste ${wanneer(x.bijgewerkt || x.at)}`, x.status === "afgerond" ? "afgerond" : null].filter(Boolean).join(" · ");
  if (x.soort === "weer") return [wanneer(x.at), x.status === "afgerond" ? "opgeheven" : null].filter(Boolean).join(" · ");
  return wanneer(x.at);
}
const labelHTML = (x) => `<span class="nw-label"><img src="${ICOON(x.bron, x.categorie)}" alt="">${esc(label(x))}${isLive(x) ? '<span class="live" aria-label="loopt nog"></span>' : ""}</span>`;
const veiligUrl = (u) => (/^https:\/\//i.test(u || "") ? u : null);

// ------------------------------------------------------------------ list

let items = [], filter = "";
async function laadLijst() {
  try {
    const r = await fetch(`${API}/v1/nieuws?limit=80`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    items = await r.json();
    toonLijst();
  } catch (e) {
    if (!items.length) $("#items").innerHTML = `<p class="nw-leeg">Nieuws laden mislukt (${esc(e.message)}). Probeer het later opnieuw.</p>`;
  }
}
function toonLijst() {
  const lijst = items.filter((x) => !filter || (filter === "liveblog" ? isLiveblog(x) : x.soort === filter));
  $("#items").innerHTML = lijst.length ? lijst.map((x) => `
    <a class="nw-kaart" href="/nieuws/${esc(x.id)}" data-id="${esc(x.id)}" style="background-image:url('${esc(x.afbeelding || "")}')">
      <span class="t">${labelHTML(x)}<h2>${esc(x.titel)}</h2><small>${esc(meta(x))}</small></span>
    </a>`).join("") : `<p class="nw-leeg">Er is nu geen nieuws in deze categorie.</p>`;
}
document.querySelectorAll(".nw-chips button").forEach((b) => b.addEventListener("click", () => {
  filter = b.dataset.f;
  document.querySelectorAll(".nw-chips button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  toonLijst();
}));
$("#items").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-id]");
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  history.pushState({}, "", `/nieuws/${a.dataset.id}`);
  route();
});

// ------------------------------------------------------------------ article / liveblog

let timer = null;
async function toonArtikel(id) {
  const el = $("#artikel");
  el.hidden = false; $("#lijst").hidden = true;
  el.innerHTML = `<p class="nw-leeg">Laden…</p>`;
  clearTimeout(timer);
  let x;
  try {
    const r = await fetch(`${API}/v1/nieuws/${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(r.status === 404 ? "Dit bericht bestaat niet (meer)." : `HTTP ${r.status}`);
    x = await r.json();
  } catch (e) {
    el.innerHTML = `<a class="nw-terug" href="/nieuws/">‹ Alle nieuws</a><p class="nw-leeg">${esc(e.message)}</p>`;
    return;
  }
  document.title = `${x.titel} | A-Alerts`;
  const k = kleur(x);
  const kopMeta = x.soort === "liveblog"
    ? [`Gestart ${wanneer(x.start || x.at)}`, x.status === "afgerond" ? "afgerond" : "loopt nog"].join(" · ")
    : [lang(x.at), x.plaats].filter(Boolean).join(" · ");
  const alineas = (x.alineas || []).map((a) => `${a.titel ? `<h2>${esc(a.titel)}</h2>` : ""}<p>${esc(a.tekst)}</p>`).join("");
  const tl = (x.tijdlijn || []).map((b) => {
    const eigen = b.door === "a-alerts", c = eigen ? "#DC2626" : k;
    const door = eigen ? "A-Alerts" : b.door === "burgernet" ? "Burgernet" : ["amber", "vermistkind"].includes(b.door) ? "Politie" : BRON[x.bron];
    const url = veiligUrl(b.url), foto = veiligUrl(b.foto);
    return `<li><span class="dot" style="background:${c}"></span><div class="kaartje">
      <div class="meta">${esc(datum(b.at))}<span class="tag" style="color:${c};background:${c}1f">${esc(door)}</span></div>
      ${b.titel ? `<h3>${esc(b.titel)}</h3>` : ""}${b.tekst ? `<p>${esc(b.tekst)}</p>` : ""}
      ${foto ? `<img src="${esc(foto)}" alt="" loading="lazy">` : ""}
      ${url ? `<p><a href="${esc(url)}" rel="noopener" target="_blank">${esc(new URL(url).host)} ›</a></p>` : ""}
    </div></li>`;
  }).join("");
  const fotoRegel = x.foto_bron ? `Foto: ${x.foto_bron}.` : null;
  const bron = x.soort === "regionaal" ? `Bron: 112 Nieuws Nederland (112nieuws.net), met toestemming. ${fotoRegel || "De foto is een stockfoto."}` : x.soort === "politie" ? `Bron: politie.nl. ${fotoRegel || "De afbeelding is een stockfoto."}` : x.soort === "weer" ? "Bron: KNMI."
    : x.bron === "burgernet" ? "Bron: Burgernet. Berichten met het label A-Alerts zijn aangevuld door A-Alerts." : "Bron: Politie, via Burgernet. Berichten met het label A-Alerts zijn aangevuld door A-Alerts.";
  const bronUrl = veiligUrl(x.bron_url);
  const w = x.weer;
  el.innerHTML = `
    <div class="nw-acties"><a class="nw-terug" href="/nieuws/">‹ Alle nieuws</a><button class="nw-delen" type="button">Delen</button></div>
    ${w ? weerKaartHTML(w) : `<header class="nw-kop" style="background-image:url('${esc(x.afbeelding || "")}')"><div class="t">${labelHTML(x)}<h1>${esc(x.titel)}</h1><small>${esc(kopMeta)}</small></div></header>`}
    <div class="nw-tekst">
      ${w ? weerTekstHTML(w, kopMeta) : `${x.intro && x.soort !== "liveblog" ? `<p class="intro">${esc(x.intro)}</p>` : ""}
      ${alineas}`}
      ${x.soort === "regionaal" && bronUrl ? `<a class="nw-knop" style="background:#DC2626" href="${esc(bronUrl)}" rel="noopener" target="_blank">Lees verder op 112nieuws.net ›</a>` : ""}
      ${x.waarschuwing && x.soort !== "politie" && x.soort !== "regionaal" ? `<a class="nw-knop" style="background:${k};${x.bron === "vermistkind" ? "color:#F4E005" : ""}" href="/pager/?waarschuwing=${encodeURIComponent(x.waarschuwing)}">${x.soort === "weer" ? "Bekijk de weerwaarschuwing" : "Bekijk de melding"} ›</a>` : ""}
      ${tl ? `<h2>Tijdlijn <small style="font-weight:400;color:var(--muted);font-size:.8rem">nieuwste boven</small></h2><ol class="nw-tl">${tl}</ol>` : ""}
      <p class="nw-voet">${esc(bron)}${bronUrl && x.soort !== "regionaal" ? ` <a href="${esc(bronUrl)}" rel="noopener" target="_blank">${x.soort === "politie" ? "Lees op politie.nl" : "Bekijk de bron"} ›</a>` : ""}</p>
    </div>`;
  el.querySelector(".nw-terug").addEventListener("click", (e) => { e.preventDefault(); history.pushState({}, "", "/nieuws/"); route(); });
  el.querySelector(".nw-delen").addEventListener("click", async () => {
    const data = { title: x.titel, url: x.link || location.href };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); el.querySelector(".nw-delen").textContent = "Link gekopieerd"; } } catch {}
  });
  if (w) tekenWeerKaart(el.querySelector(".nw-weer-kaart"), w);
  // A running liveblog refreshes by itself.
  if (isLive(x)) timer = setTimeout(() => { if (location.pathname.includes(id)) toonArtikel(id); }, 45_000);
}

// ------------------------------------------------------------------ weather article (like knmi.nl)

const CODE_KLEUR = { yellow: "#F7C600", orange: "#F28C28", red: "#E3001B", green: "#2E9E44" };
const WEER_ICOON = [[/onweer|hagel|tornado/i, "⚡"], [/wind|storm/i, "💨"], [/sneeuw/i, "❄"], [/glad|ijzel|vorst|kou/i, "❄"], [/mist/i, "≡"], [/regen/i, "☔"], [/hitte/i, "☀"]];
const codeKleur = (w, n) => CODE_KLEUR[w.opgeheven ? "green" : n] || CODE_KLEUR.yellow;
const opKleur = (w) => (!w.opgeheven && (!w.niveau || w.niveau === "yellow") ? "#1D1D1F" : "#fff");
const NL = { n: 53.62, s: 50.7, w: 3.3, e: 7.25 };

function weerKaartHTML(w) {
  const [dag, rest] = (w.tijdvak || "").split(/ (.+)/);
  const icoon = (WEER_ICOON.find(([re]) => re.test(w.soort || "")) || [null, "!"])[1];
  return `<figure class="nw-weer-kaart" role="img" aria-label="${esc([w.code, w.soort, w.tijdvak].filter(Boolean).join(", "))}">
    <div class="kaart">${weerSVG(w)}</div>
    ${w.datumKop ? `<div class="datum"><strong>${esc(w.datumKop)}</strong>${w.vanafTot ? `<span>${esc(w.vanafTot)}</span>` : ""}</div>` : ""}
    <div class="icoon"><span style="background:${codeKleur(w, w.niveau)};color:${opKleur(w)}">${icoon}</span></div>
    ${w.tijdvak ? `<div class="chip" style="border-left-color:${codeKleur(w, w.niveau)}">${rest ? `<small>${esc(dag)}</small><b>${esc(rest)}</b>` : `<b>${esc(w.tijdvak)}</b>`}</div>` : ""}
  </figure>`;
}

/** Without Apple Maps (no consent): the areas as a simple drawing in the same projection. */
function weerSVG(w) {
  const x = (lon) => ((lon - NL.w) / (NL.e - NL.w)) * 1000;
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const y = (lat) => ((merc(NL.n) - merc(lat)) / (merc(NL.n) - merc(NL.s))) * 1000;
  const paden = (w.gebieden || []).flatMap((g) => (g.gebied || []).map((r) =>
    `<path d="M${r.map(([lo, la]) => `${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join("L")}Z" fill="${codeKleur(w, g.niveau)}" fill-opacity=".6" stroke="${codeKleur(w, g.niveau)}" stroke-width="2"/>`)).join("");
  return `<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paden}</svg>`;
}

async function tekenWeerKaart(fig, w) {
  if (!fig) return;
  const mk = await loadMapKit();
  if (!mk || !fig.isConnected) return;
  const box = fig.querySelector(".kaart");
  box.innerHTML = "";
  const map = new mk.Map(box, { showsCompass: mk.FeatureVisibility.Hidden, showsMapTypeControl: false, colorScheme: mk.Map.ColorSchemes.Light,
    pointOfInterestFilter: mk.PointOfInterestFilter.excludingAllCategories });
  const ov = (w.gebieden || []).flatMap((g) => (g.gebied || []).map((r) => new mk.PolygonOverlay(r.map(([lo, la]) => new mk.Coordinate(la, lo)),
    { style: new mk.Style({ fillColor: codeKleur(w, g.niveau), fillOpacity: 0.55, strokeColor: codeKleur(w, g.niveau), lineWidth: 1 }) })));
  map.addOverlays(ov);
  map.region = new mk.CoordinateRegion(new mk.Coordinate((NL.n + NL.s) / 2, (NL.w + NL.e) / 2), new mk.CoordinateSpan(NL.n - NL.s, NL.e - NL.w));
}

function weerTekstHTML(w, meta) {
  const vakken = (w.tijdvakken || []).length > 1
    ? `<ul class="nw-vakken">${w.tijdvakken.map((v) => `<li><span style="background:${CODE_KLEUR[v.niveau] || CODE_KLEUR.yellow}"></span>${esc(v.code)}: ${esc(v.tekst)}</li>`).join("")}</ul>` : "";
  return `<h1 class="nw-weer-titel">${esc(w.kop)}</h1>
    <p class="nw-code"><span style="background:${codeKleur(w, w.niveau)};color:${opKleur(w)}">${esc(w.opgeheven ? "Code groen" : w.code)}</span>${w.opgeheven ? " <em>Opgeheven</em>" : ""}</p>
    ${vakken}
    ${w.omschrijving ? `<p class="intro">${esc(w.omschrijving)}</p>` : ""}
    ${w.uitgifte ? `<p class="nw-uitgifte">Uitgifte: ${esc(w.uitgifte)}</p>` : ""}
    ${(w.adviezen || []).length ? `<section class="nw-advies"><h2>Risico's en advies</h2><ul>${w.adviezen.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></section>` : ""}
    ${w.details ? `<details class="nw-details"><summary>Details</summary><p>${esc(w.details)}</p></details>` : ""}
    <p class="nw-uitgifte">${esc(meta)}</p>`;
}

function route() {
  const delen = location.pathname.split("/").filter(Boolean);
  const id = (delen[0] === "nieuws" && /^[pwlr]-[0-9a-f]{12}$/.test(delen[1] || "") && delen[1]) || new URLSearchParams(location.search).get("id");
  if (id && /^[pwlr]-[0-9a-f]{12}$/.test(id)) { toonArtikel(id); scrollTo(0, 0); return; }
  clearTimeout(timer);
  document.title = "Nieuws: politie, weer en liveblogs | A-Alerts";
  $("#artikel").hidden = true; $("#lijst").hidden = false;
  if (!items.length) laadLijst();
}
addEventListener("popstate", route);
route();
setInterval(() => { if (!$("#lijst").hidden) laadLijst(); }, 120_000);
