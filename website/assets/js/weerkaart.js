// A-Alerts: the weather picture of a KNMI warning (like knmi.nl) and its text, for the news article and the Weer widget.
import { esc, loadMapKit } from "./core.js?v=61";


export const CODE_KLEUR = { yellow: "#F7C600", orange: "#F28C28", red: "#E3001B", green: "#2E9E44" };
export const WEER_ICOON = [[/onweer|hagel|tornado/i, "⚡"], [/wind|storm/i, "💨"], [/sneeuw/i, "❄"], [/glad|ijzel|vorst|kou/i, "❄"], [/mist/i, "≡"], [/regen/i, "☔"], [/hitte/i, "☀"]];
export const codeKleur = (w, n) => CODE_KLEUR[w.opgeheven ? "green" : n] || CODE_KLEUR.yellow;
export const opKleur = (w) => (!w.opgeheven && (!w.niveau || w.niveau === "yellow") ? "#1D1D1F" : "#fff");
export const NL = { n: 53.62, s: 50.7, w: 3.3, e: 7.25 };

export function weerKaartHTML(w) {
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
export function weerSVG(w) {
  const x = (lon) => ((lon - NL.w) / (NL.e - NL.w)) * 1000;
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const y = (lat) => ((merc(NL.n) - merc(lat)) / (merc(NL.n) - merc(NL.s))) * 1000;
  const paden = (w.gebieden || []).flatMap((g) => (g.gebied || []).map((r) =>
    `<path d="M${r.map(([lo, la]) => `${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join("L")}Z" fill="${codeKleur(w, g.niveau)}" fill-opacity=".6" stroke="${codeKleur(w, g.niveau)}" stroke-width="2"/>`)).join("");
  return `<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paden}</svg>`;
}

export async function tekenWeerKaart(fig, w) {
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

export function weerTekstHTML(w, meta) {
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
