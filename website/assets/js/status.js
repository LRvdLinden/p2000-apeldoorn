// a-alerts.nl/status: reads /v1/status from the A-Alerts API every minute.
const API = (window.P2000_CONFIG && window.P2000_CONFIG.api) || "https://p2000-apeldoorn-api.lrvdlinden.workers.dev";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tijd = (iso) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const datum = (iso) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const datumTijd = (iso) => new Date(iso).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const LABEL = { ok: "Werkt", warn: "Verstoord", down: "Storing", maint: "Onderhoud", geen: "Geen gegevens" };
const FASE = { onderzoek: "Onderzoek", oorzaak: "Oorzaak gevonden", herstel: "Herstel", monitoren: "Monitoren", opgelost: "Opgelost", gepland: "Gepland", bezig: "Bezig", afgerond: "Afgerond" };
const SOORT = { storing: "Storing", vertraagd: "Verstoord", onderhoud: "Onderhoud" };
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} uur`;
};
const pct = (v) => v == null ? "–" : `${String(v).replace(".", ",")}%`;

function heroTekst(d) {
  const slecht = d.groepen.flatMap((g) => g.onderdelen).filter((o) => o.staat !== "ok");
  const actief = d.incidenten.actief[0];
  if (actief) return { titel: actief.titel, sub: actief.updates[0]?.tekst || "" };
  if (d.staat === "ok") return { titel: "Alle systemen werken", sub: "Meldingen, pushmeldingen en live data komen normaal binnen." };
  const namen = slecht.map((o) => o.naam).join(", ");
  if (d.staat === "maint") return { titel: "Onderhoud bezig", sub: `Onderhoud aan: ${namen}. Er gaan geen meldingen verloren.` };
  return { titel: d.staat === "down" ? `Storing bij ${namen}` : `${namen}: verstoord`, sub: "We kijken ernaar. Deze pagina ververst elke minuut." };
}

function incidentHTML(inc, { opgelost = false } = {}) {
  const ond = inc.onderdelen.map((id) => naamVan[id] || id).join(", ");
  return `<article class="card inc">
    <span class="tag ${opgelost ? "opgelost" : esc(inc.soort)}">${opgelost ? "Opgelost" : esc(SOORT[inc.soort] || inc.soort)}</span>
    ${ond ? `<span class="betreft">${esc(ond)}</span>` : ""}
    <h3>${esc(inc.titel)}</h3>
    ${inc.gepland_start ? `<p class="muted" style="margin:-4px 0 12px">${esc(datumTijd(inc.gepland_start))}${inc.gepland_einde ? ` – ${esc(tijd(inc.gepland_einde))}` : ""}</p>` : ""}
    <ol>${inc.updates.map((u) => `<li><div><b>${esc(FASE[u.fase] || u.fase)}</b><br><small>${esc(datum(u.at))} ${esc(tijd(u.at))}</small></div><p>${esc(u.tekst)}</p></li>`).join("")}</ol>
  </article>`;
}

let naamVan = {};

function render(d) {
  naamVan = Object.fromEntries(d.groepen.flatMap((g) => g.onderdelen.map((o) => [o.id, o.naam])));
  const hero = $("hero");
  hero.dataset.staat = d.staat;
  const h = heroTekst(d);
  $("heroTitel").textContent = h.titel;
  $("heroSub").textContent = h.sub;
  $("bijgewerkt").textContent = new Date(d.bijgewerkt).toLocaleTimeString("nl-NL");

  $("actief").innerHTML = d.incidenten.actief.map((i) => incidentHTML(i)).join("");

  $("groepen").innerHTML = d.groepen.map((g) => `<div class="card groep"><h3>${esc(g.naam)}</h3>${g.onderdelen.map((o) => `
    <div class="comp">
      <div class="comp-top"><b>${esc(o.naam)}</b>${o.detail ? `<span class="detail">${esc(o.detail)}</span>` : ""}
        <span class="st ${o.staat}"><i class="dot ${o.staat}" aria-hidden="true"></i>${LABEL[o.staat]}</span></div>
      <div class="bar" role="img" aria-label="${esc(o.naam)}: ${pct(o.uptime)} uptime in 90 dagen, nu ${LABEL[o.staat].toLowerCase()}">${o.dagen.map((x) =>
        `<span class="${x.staat}" title="${esc(datum(x.dag))} · ${LABEL[x.staat]}${x.uptime != null && x.uptime < 1 ? ` · ${pct(Math.round(x.uptime * 1000) / 10)}` : ""}"></span>`).join("")}</div>
      <div class="bar-foot"><span class="van"><span>90 dagen geleden</span></span><b>${pct(o.uptime)} uptime</b><span>Vandaag</span></div>
    </div>`).join("")}</div>`).join("");

  const v = d.vandaag;
  $("vandaag").innerHTML = [
    ["Meldingen", v.meldingen.toLocaleString("nl-NL")],
    ["Pushmeldingen verstuurd", v.pushmeldingen.toLocaleString("nl-NL")],
    ["Gem. pushsnelheid", v.push_gem_s == null ? "–" : v.push_gem_s < 60 ? `${v.push_gem_s} s` : `${Math.floor(v.push_gem_s / 60)} m ${v.push_gem_s % 60} s`],
    ["Laatste P2000-melding", v.laatste_p2000 ? ago(v.laatste_p2000) : "–"],
  ].map(([l, w]) => `<div class="card tegel"><small>${l}</small><div>${esc(w)}</div></div>`).join("");

  $("geplandBlok").hidden = !d.incidenten.gepland.length;
  $("gepland").innerHTML = d.incidenten.gepland.map((i) => incidentHTML(i)).join("");

  $("historie").innerHTML = d.incidenten.recent.length
    ? d.incidenten.recent.map((i) => `<article class="card hist"><div class="muted">${esc(datum(i.start))}</div><div>
        <h3>${esc(i.titel)}</h3><p>${esc(i.updates[0]?.tekst || "")}</p></div></article>`).join("")
    : `<div class="card leeg">Geen storingen in de afgelopen 30 dagen.</div>`;
  $("main").setAttribute("aria-busy", "false");
}

async function load() {
  try {
    const r = await fetch(`${API}/v1/status`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    render(await r.json());
  } catch {
    // The API itself is not reachable: that is the outage.
    const hero = $("hero");
    hero.dataset.staat = "down";
    $("heroTitel").textContent = "Server niet bereikbaar";
    $("heroSub").textContent = "De status kan nu niet worden opgehaald. We proberen het elke minuut opnieuw.";
    $("bijgewerkt").textContent = new Date().toLocaleTimeString("nl-NL");
  }
}

load();
setInterval(load, 60_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
