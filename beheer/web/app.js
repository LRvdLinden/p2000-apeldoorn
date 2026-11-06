// A-Alerts-beheer (P2000Beheer) web dashboard – talks to the beheer part of the A-Alerts API.
const API = (/^(localhost|127\.)/.test(location.hostname) && new URLSearchParams(location.search).get("api"))
  || "https://p2000-apeldoorn-api.lrvdlinden.workers.dev";
// The 26 A-Alerts places (same list as Shared/Werkgebied.json).
const PLAATSEN = ["Apeldoorn", "Beekbergen", "Beemte-Broekland", "Hoenderloo", "Hoog Soeren", "Klarenbeek", "Loenen", "Uddel", "Ugchelen", "Wenum-Wiesel", "Teuge", "Assel", "Engeland", "Gerritsflesch", "Groenendaal", "De Haere", "Hoog Buurlo", "Hooilanden", "De Jonas", "De Krim", "Lieren", "Meerveld", "Nieuw-Milligen", "Oosterhuizen", "Radio Kootwijk", "Woeste Hoeve"];
// Same pager icons as the A-Alerts app (img/icon_*.png).
const icon = (name, alt = "") => `<img class="dicon" src="img/icon_${name}.png" alt="${alt}" width="22" height="22">`;
const DIENST = {
  brandweer: [icon("brandweer", "Brandweer"), "Brandweer", "#E30613"], ambulance: [icon("ambulance", "Ambulance"), "Ambulance", "#F4C400"],
  politie: [icon("politie", "Politie"), "Politie", "#15428B"], traumaheli: [icon("traumaheli", "Traumaheli"), "Traumaheli", "#9333EA"],
};
const PLATFORM = { ios: ["iPhone", "#DC2626"], ipados: ["iPad", "#f97316"], macos: ["Mac", "#3b82f6"], watchos: ["Apple Watch", "#22c55e"], tvos: ["Apple TV", "#9333EA"], android: ["Android", "#14b8a6"] };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let token = store.get("beheer.token");

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401 && path !== "/v1/beheer/login") { logout(); throw new Error(data?.error || "Niet ingelogd"); }
  if (!res.ok) throw new Error(data?.error || `Fout ${res.status}`);
  return data;
}

const ago = (iso) => {
  if (!iso) return "nooit";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "zojuist";
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  if (s < 86400) return `${Math.floor(s / 3600)} uur geleden`;
  return `${Math.floor(s / 86400)} dagen geleden`;
};
const dt = (iso) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ------------------------------------------------------------------ login

function showLogin() { $("login").hidden = false; $("app").hidden = true; $("password").focus(); }
function showApp() { $("login").hidden = true; $("app").hidden = false; $("whoami").textContent = store.get("beheer.user") || ""; route(); }
function logout() { token = null; store.set("beheer.token", null); showLogin(); }

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginBtn").disabled = true;
  $("loginError").hidden = true;
  try {
    const r = await api("POST", "/v1/beheer/login", { user: $("user").value.trim(), password: $("password").value });
    token = r.token;
    store.set("beheer.token", r.token);
    store.set("beheer.user", r.user);
    $("password").value = "";
    showApp();
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").hidden = false;
  } finally {
    $("loginBtn").disabled = false;
  }
});
$("logout").addEventListener("click", logout);

// ------------------------------------------------------------------ routing

const VIEWS = { dashboard: ["Dashboard", dashboard], meldingen: ["Meldingen", meldingen], waarschuwingen: ["Waarschuwingen", waarschuwingen], push: ["Push", push], teksten: ["Teksten", teksten], instellingen: ["Instellingen", instellingen] };
let current = null, timer = null;

function route() {
  const key = (location.hash || "#dashboard").slice(1).split("/")[0];
  const [title, fn] = VIEWS[key] || VIEWS.dashboard;
  current = fn;
  $("title").textContent = title;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.view === (VIEWS[key] ? key : "dashboard")));
  $("error").hidden = true;
  $("updated").textContent = "";
  clearInterval(timer);
  run();
  if (fn === dashboard) timer = setInterval(run, 60_000);
}
async function run() {
  try { await current($("view")); $("error").hidden = true; }
  catch (err) { $("error").textContent = err.message; $("error").hidden = false; }
}
addEventListener("hashchange", route);
$("refresh").addEventListener("click", run);

// ------------------------------------------------------------------ charts (inline SVG)

function bars(points, key, color, { height = 160 } = {}) {
  const W = 600, H = height, pad = 26, bw = (W - pad) / Math.max(points.length, 1);
  const max = Math.max(1, ...points.map((p) => p[key]));
  let out = "";
  points.forEach((p, i) => {
    const h = (p[key] / max) * (H - 30);
    out += `<rect x="${pad + i * bw + 1.5}" y="${H - 18 - h}" width="${Math.max(bw - 3, 1)}" height="${h}" rx="2.5" fill="${color}"><title>${p.day}: ${p[key]}</title></rect>`;
  });
  const labels = points.map((p, i) => (i % 7 === 0 || i === points.length - 1)
    ? `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${new Date(p.day).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</text>` : "").join("");
  const grid = [0.5, 1].map((k) => `<line class="grid" x1="${pad}" x2="${W}" y1="${H - 18 - k * (H - 30)}" y2="${H - 18 - k * (H - 30)}"/><text x="0" y="${H - 15 - k * (H - 30)}">${Math.round(max * k)}</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${out}${labels}</svg>`;
}

function line(points, key, color, extra) {
  const W = 600, H = 160, pad = 26, step = (W - pad) / Math.max(points.length - 1, 1);
  const max = Math.max(1, ...points.map((p) => p[key]), ...(extra ? extra.points.map((p) => p[extra.key]) : []));
  const y = (v) => H - 18 - (v / max) * (H - 30);
  const path = points.map((p, i) => `${i ? "L" : "M"}${pad + i * step},${y(p[key])}`).join(" ");
  const area = `${path} L${pad + (points.length - 1) * step},${H - 18} L${pad},${H - 18} Z`;
  const extraBars = extra ? extra.points.map((p, i) => {
    const h = (p[extra.key] / max) * (H - 30);
    return h ? `<rect x="${pad + i * step - 3}" y="${H - 18 - h}" width="6" height="${h}" rx="2" fill="${extra.color}"><title>${p.day}: ${p[extra.key]} nieuw</title></rect>` : "";
  }).join("") : "";
  const labels = points.map((p, i) => (i % 7 === 0 || i === points.length - 1)
    ? `<text x="${pad + i * step}" y="${H - 4}" text-anchor="middle">${new Date(p.day).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</text>` : "").join("");
  const grid = [0.5, 1].map((k) => `<line class="grid" x1="${pad}" x2="${W}" y1="${y(max * k)}" y2="${y(max * k)}"/><text x="0" y="${y(max * k) + 3}">${Math.round(max * k)}</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}<path d="${area}" fill="${color}" opacity=".15"/>${extraBars}<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${labels}</svg>`;
}

function donut(parts, center) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  let a0 = -Math.PI / 2, segs = "";
  const R = 52, r = 34;
  for (const p of parts) {
    if (!p.n) continue;
    const a1 = a0 + (p.n / total) * Math.PI * 2 - (parts.filter((x) => x.n).length > 1 ? 0.03 : 0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (ang, rad) => `${60 + rad * Math.cos(ang)},${60 + rad * Math.sin(ang)}`;
    segs += p.n === total
      ? `<circle cx="60" cy="60" r="${(R + r) / 2}" fill="none" stroke="${p.color}" stroke-width="${R - r}"/>`
      : `<path d="M${pt(a0, R)} A${R},${R} 0 ${large} 1 ${pt(a1, R)} L${pt(a1, r)} A${r},${r} 0 ${large} 0 ${pt(a0, r)} Z" fill="${p.color}"/>`;
    a0 = a1 + 0.03;
  }
  return `<svg viewBox="0 0 120 120" width="130" height="130">${segs}<text x="60" y="58" text-anchor="middle" font-size="18" font-weight="800" fill="currentColor">${center[0]}</text><text x="60" y="74" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">${center[1]}</text></svg>`;
}

// ------------------------------------------------------------------ views

async function dashboard(el) {
  const d = await api("GET", "/v1/beheer/overview");
  $("updated").textContent = `bijgewerkt ${ago(d.generated)}`;
  const s = d.status, a = d.app, w = d.website;
  const fresh = (iso) => iso && Date.now() - Date.parse(iso) < 5 * 60_000;
  const status = (ok, title, detail) => `<div class="row"><span class="${ok ? "ok" : "warn"}">${ok ? "●" : "▲"}</span><div class="grow"><b>${esc(title)}</b><br><small>${esc(detail)}</small></div></div>`;
  const pct = a.actief ? Math.round((a.appleLogin.ja / a.actief) * 100) : 0;
  const pages = { "/": "Homepage", "/pager/": "Live pager", "/android/": "Android-download", "/info/": "Privacy / voorwaarden", "/melding/": "Oude meldinglinks" };

  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><i>📱</i><b>${a.actief}</b><span>Actieve app-gebruikers</span><small>laatste 30 dagen · ${a.totaal} totaal</small></div>
    <div class="kpi"><i>👤</i><b>${a.appleLogin.ja}</b><span>Ingelogd met Apple</span><small>${a.appleLogin.nee} zonder login</small></div>
    <div class="kpi"><i>🔔</i><b>${a.push.toestellen}</b><span>Pushmeldingen aan</span><small>toestellen geregistreerd</small></div>
    <div class="kpi"><i>🌐</i><b>${w.vandaag}</b><span>Websitebezoekers vandaag</span><small>gisteren ${w.gisteren} · 30 dagen ${w.bezoeken30}</small></div>
    <div class="kpi"><i>🚨</i><b>${d.meldingen.vandaag}</b><span>Meldingen vandaag</span><small>gisteren ${d.meldingen.gisteren}</small></div>
  </div>
  <div class="grid">
    <div class="card"><h2>Status</h2>
      ${status(fresh(s.feed.lastOk), "P2000-feed", s.feed.lastError || `laatst gelezen ${ago(s.feed.lastOk)}`)}
      ${status(fresh(s.cron), "Cron (elke minuut)", ago(s.cron))}
      ${status(s.apns, "Pushmeldingen (APNs)", s.apns ? "sleutel actief" : "sleutel ontbreekt")}
      ${s.fcm === undefined ? "" : status(s.fcm, "Android-push (Firebase)", s.fcm ? "serviceaccount actief" : "FCM_SERVICE_ACCOUNT ontbreekt")}
      ${status(s.weatherkit, "WeatherKit", s.weatherkit ? "actief" : "niet ingesteld")}
      ${status(s.mapkit && s.mapsServer, "Apple Maps", `MapKit JS ${s.mapkit ? "✓" : "✗"} · Server API ${s.mapsServer ? "✓" : "✗"}`)}
      <p class="muted" style="font-size:.8rem;margin:8px 0 0">${s.meldingenInDatabase} meldingen in de database${s.outbox ? ` · ${s.outbox} pushes in de wachtrij` : ""}</p>
    </div>
    <div class="card"><h2>Inloggen met Apple</h2>
      ${a.actief ? `<div class="donut">${donut([{ n: a.appleLogin.ja, color: "currentColor" }, { n: a.appleLogin.nee, color: "#9ca3af55" }], [`${pct}%`, "met Apple"])}
        <div class="grow">
          <div class="row"><span class="dot" style="background:currentColor"></span><span class="grow">Met Apple</span><b>${a.appleLogin.ja}</b></div>
          <div class="row"><span class="dot" style="background:#9ca3af55"></span><span class="grow">Zonder login</span><b>${a.appleLogin.nee}</b></div>
          <div class="row"><span class="dot" style="background:var(--orange)"></span><span class="grow">Push aan</span><b>${a.push.aan}</b></div>
        </div></div>` : `<p class="muted">Nog geen app-gebruikers. De telling begint vanaf build 6.</p>`}
    </div>
    <div class="card"><h2>Websitebezoekers · 30 dagen</h2>
      ${bars(w.perDag, "bezoekers", "#3b82f6")}
      <p class="muted" style="font-size:.75rem;margin:6px 0 0">Zonder cookies geteld: een bezoeker is één apparaat per dag.</p>
    </div>
    <div class="card"><h2>App-gebruikers per dag</h2>
      ${line(a.actiefPerDag, "n", "#DC2626", { points: a.nieuwPerDag, key: "n", color: "#22c55e" })}
      <div class="legend"><span style="--c:#DC2626">Actief</span><span style="--c:#22c55e">Nieuw geïnstalleerd</span></div>
    </div>
    <div class="card"><h2>Apparaten</h2>
      ${a.platforms.length ? a.platforms.map((p) => {
        const [label, color] = PLATFORM[p.platform] || [p.platform, "#888"];
        return `<div class="row"><span class="dot" style="background:${color}"></span><span class="grow">${esc(label)}</span><b>${p.n}</b></div><div class="bar"><div style="width:${(p.n / Math.max(a.actief, 1)) * 100}%;background:${color}"></div></div>`;
      }).join("") : `<p class="muted">Nog geen gegevens</p>`}
    </div>
    <div class="card"><h2>Versies in gebruik</h2>
      ${a.versies.length ? a.versies.map((v) => `<div class="row"><span class="grow">${esc(v.version || "?")} (${esc(v.build || "?")})</span><b>${v.n}</b></div><div class="bar"><div style="width:${(v.n / Math.max(a.actief, 1)) * 100}%"></div></div>`).join("") : `<p class="muted">Nog geen gegevens</p>`}
    </div>
    <div class="card"><h2>Meldingen vandaag / gisteren</h2>
      ${Object.entries(DIENST).map(([k, [icon, label]]) => `<div class="row"><span>${icon}</span><span class="grow">${label}</span><b>${d.meldingen.perDienst[k] || 0}</b><small>/ ${d.meldingen.perDienstGisteren[k] || 0}</small></div>`).join("")}
    </div>
    <div class="card"><h2>Website</h2>
      <div class="row"><span class="grow">Pagina's vandaag</span><b>${w.paginasVandaag}</b></div>
      ${w.topPaginas.map((p) => `<div class="row"><span class="grow">${esc(pages[p.path] || p.path)}</span><small>${p.n}</small></div>`).join("")}
      ${w.apparaten.length ? `<p class="muted" style="font-size:.85rem">${w.apparaten.map((x) => `${x.device === "mobiel" ? "📱" : x.device === "tablet" ? "📲" : "💻"} ${x.n}`).join(" · ")}</p>` : ""}
    </div>
    <div class="card"><h2>Meest bekeken meldingen</h2>
      ${d.topBekeken.length ? d.topBekeken.map((t) => `<div class="row"><span>${(DIENST[t.dienst] || ["🔔"])[0]}</span><div class="grow"><b style="font-weight:600">${esc(t.title)}</b><br><small>${ago(t.datum_tijd)}</small></div><small>👁 ${t.views}</small></div>`).join("") : `<p class="muted">Nog geen views</p>`}
    </div>
    ${d.android ? androidCard(d.android) : ""}
    ${d.aAlerts ? aAlertsCards(d.aAlerts, status) : ""}
  </div>`;
}

// ------------------------------------------------------------------ Android-app (APK-downloads van a-alerts.nl)

function androidCard(a) {
  return `<div class="card"><h2>Android-app · downloads</h2>
    <div class="row" style="gap:18px">
      <div><b style="font-size:1.6rem">${a.totaal}</b><br><small>Totaal</small></div>
      <div><b style="font-size:1.6rem">${a.dagen30}</b><br><small>30 dagen</small></div>
      <div><b style="font-size:1.6rem">${a.vandaag}</b><br><small>Vandaag</small></div>
    </div>
    ${a.perDag.some((x) => x.n) ? bars(a.perDag, "n", "#14b8a6") : `<p class="muted">Nog geen downloads in de laatste 30 dagen</p>`}
    ${a.perVersie.map((v) => `<div class="row"><span class="grow">${esc(v.version)}</span><b>${v.n}×</b></div>`).join("")}
    <div class="row"><span class="dot" style="background:#14b8a6"></span><span class="grow">Android-installaties (actief 30 dagen)</span><b>${a.actief}</b></div>
    <div class="row"><span class="dot" style="background:#22c55e"></span><span class="grow">Android-toestellen met push</span><b>${a.pushToestellen}</b></div>
    <p class="muted" style="font-size:.75rem;margin:6px 0 0">Een download telt één keer per apparaat per dag, zonder cookies.</p>
  </div>`;
}

// ------------------------------------------------------------------ A-Alerts

const BRON = {
  nlalert: [icon("nlalert", "NL-Alert"), "NL-Alert", "#FFC800"], burgernet: [icon("burgernet", "Burgernet"), "Burgernet", "#0067B1"], knmi: [icon("knmi", "KNMI"), "KNMI", "#3E9FDB"],
  helikopters: ["🚁", "Helikopters (adsb.lol)", "#9333EA"],
};
const CODE = { yellow: "Code geel", orange: "Code oranje", red: "Code rood" };
const STATUS = { actief: "Actief", verwacht: "Verwacht", beeindigd: "Beëindigd" };

function aAlertsCards(a, status) {
  const p = a.profielen, wb = a.waarschuwingen.perBron;
  const maxV = Math.max(1, ...Object.values(p.verdeling));
  return `
    <div class="card"><h2>A-Alerts-bronnen</h2>
      ${Object.keys(BRON).map((k) => a.bronnen[k] ? status(!a.bronnen[k].storing, BRON[k][1],
        a.bronnen[k].storing ? (a.bronnen[k].laatsteFout || "geen gegevens") : `${ago(a.bronnen[k].laatstOk)} · ${a.bronnen[k].laatsteStatus || ""}`) : "").join("")}
      <p class="muted" style="font-size:.75rem;margin:6px 0 0">Storing = langer dan 30 minuten geen gegevens (pushmelding in de beheer-app).</p>
    </div>
    <div class="card"><h2>Helikopters in de lucht</h2>
      ${a.inDeLucht.length ? a.inDeLucht.map((h) => `<div class="row"><span>🚁</span><span class="grow"><b>${esc(h.naam)}</b></span><small>${h.hoogte_m === 0 ? "op de grond" : h.hoogte_m != null ? `${h.hoogte_m} m` : ""}${h.snelheid_kmh != null ? ` · ${h.snelheid_kmh} km/u` : ""}</small></div>`).join("") : `<p class="muted">Er is nu geen Lifeliner of Zulu in de lucht.</p>`}
    </div>
    <div class="card"><h2>Waarschuwingen · 7 dagen</h2>
      ${["nlalert", "burgernet", "knmi"].map((k) => `<div class="row"><span>${BRON[k][0]}</span><span class="grow">${BRON[k][1]}</span><b>${wb[k]?.week || 0}</b><small>${wb[k]?.actief || 0} actief</small></div>`).join("")}
      ${a.waarschuwingen.verborgen ? `<p class="muted" style="font-size:.8rem">${a.waarschuwingen.verborgen} verborgen</p>` : ""}
    </div>
    <div class="card"><h2>Notificatieprofielen</h2>
      ${p.metProfielen ? `
        ${[1, 2, 3, 4, 5].map((n) => `<div class="row"><span class="grow">${n} profiel${n > 1 ? "en" : ""}</span><b>${p.verdeling[n] || 0}</b></div><div class="bar"><div style="width:${((p.verdeling[n] || 0) / maxV) * 100}%"></div></div>`).join("")}
        <div class="row"><span class="grow">Toestellen met profielen</span><b>${p.metProfielen}</b></div>
        <div class="row"><span class="grow">Nog zonder profielen (oudere versie)</span><b>${p.zonderProfielen}</b></div>
        <div class="row"><span class="grow">Met eigen tijden</span><b>${p.metTijden}</b></div>
        <div class="row"><span class="grow">Wil NL-Alert / Burgernet</span><b>${p.waarschuwingen.nlalert} / ${p.waarschuwingen.burgernet}</b></div>
        <div class="row"><span class="grow">Wil KNMI geel / oranje / rood</span><b>${p.waarschuwingen.knmi.yellow} / ${p.waarschuwingen.knmi.orange} / ${p.waarschuwingen.knmi.red}</b></div>
        ${p.topPlaatsen.length ? `<p class="muted" style="font-size:.8rem;margin:8px 0 2px">Populairste plaatsen</p>${p.topPlaatsen.slice(0, 6).map((x) => `<div class="row"><span class="grow">${esc(x.plaats)}</span><small>${x.n}</small></div>`).join("")}` : ""}
        <p class="muted" style="font-size:.75rem;margin:6px 0 0">Gemiddeld ${p.gemiddeld} profiel per toestel · ${p.pushToestellen} toestellen met push</p>
      ` : `<p class="muted">Nog geen toestellen met profielen. Dat begint bij A-Alerts 1.0.0 (17).</p>`}
    </div>`;
}

let wBron = "", wStatus = "", wQuery = "";
async function waarschuwingen(el) {
  const qs = new URLSearchParams({ days: "30", ...(wBron ? { bron: wBron } : {}), ...(wStatus ? { status: wStatus } : {}), ...(wQuery ? { q: wQuery } : {}) });
  const list = await api("GET", `/v1/beheer/waarschuwingen?${qs}`);
  const kop = (w) => w.bron === "knmi" ? `${CODE[w.niveau] || "KNMI"} · ${w.soort || ""}` : w.bron === "burgernet" ? `Burgernet · ${w.plaats || "Apeldoorn"}` : "NL-Alert";
  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="wq" placeholder="Zoek in titel, tekst of plaats" value="${esc(wQuery)}">
      <select id="wb"><option value="">Alle bronnen</option>${["nlalert", "burgernet", "knmi"].map((b) => `<option value="${b}" ${wBron === b ? "selected" : ""}>${BRON[b][1]}</option>`).join("")}</select>
      <select id="ws"><option value="">Alle statussen</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${wStatus === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    </div>
    <div class="list">${list.length ? list.map((w) => `
      <div class="item${w.verborgen ? " hidden" : ""}" data-id="${esc(w.id)}">
        <span class="ico">${BRON[w.bron]?.[0] || "⚠️"}</span>
        <div class="grow" style="flex:1;min-width:0">
          <small>${dt(w.start)} · ${esc(kop(w))}</small>
          <div class="t">${esc(w.titel || "–")}</div>
          <div><span class="tag">${STATUS[w.status] || esc(w.status)}</span>${w.verborgen ? `<span class="tag orange">Verborgen</span>` : ""}${w.handmatig_beeindigd ? `<span class="tag blue">Handmatig beëindigd</span>` : ""}</div>
        </div>
      </div>`).join("") : `<p class="muted" style="padding:16px">Geen waarschuwingen in de laatste 30 dagen.</p>`}</div>
    <p class="muted" style="font-size:.8rem">Verbergen haalt een waarschuwing weg uit de apps en de website. Beëindigen zet hem op beëindigd als de bron dat niet zelf doet. De brongegevens blijven ongewijzigd.</p>`;
  let t;
  $("wq").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { wQuery = e.target.value.trim(); run(); }, 350); });
  $("wb").addEventListener("change", (e) => { wBron = e.target.value; run(); });
  $("ws").addEventListener("change", (e) => { wStatus = e.target.value; run(); });
  el.querySelectorAll(".item").forEach((row) => row.addEventListener("click", () => editWaarschuwing(list.find((w) => w.id === row.dataset.id))));
}

function editWaarschuwing(w) {
  openModal(`
    <h2>${esc(BRON[w.bron]?.[1] || w.bron)}</h2>
    <p class="muted">${STATUS[w.status] || esc(w.status)} · ${dt(w.start)}${w.einde ? ` – ${dt(w.einde)}` : ""}${w.plaats ? ` · ${esc(w.plaats)}` : ""}</p>
    <p><b>${esc(w.titel || "–")}</b></p>
    ${w.tekst && w.tekst !== w.titel ? `<p style="white-space:pre-wrap">${esc(w.tekst)}</p>` : ""}
    ${w.link ? `<p><a href="${esc(w.link)}" target="_blank" rel="noopener">Bekijk bij de bron ↗</a></p>` : ""}
    <label class="chips"><label><input type="checkbox" id="wHide" ${w.verborgen ? "checked" : ""}> Verbergen in apps en website</label></label>
    <label class="chips"><label><input type="checkbox" id="wEnd" ${w.handmatig_beeindigd ? "checked" : ""}> Handmatig beëindigd</label></label>
    <p class="muted" style="font-size:.8rem">Werkt binnen een minuut in de apps. Zet je het terug, dan geldt weer wat de bron zegt.</p>
    <p class="muted" style="font-size:.75rem">${esc(w.id)}</p>
    <div class="actions"><button class="btn" id="wClose">Annuleren</button><button class="btn primary" id="wSave">Opslaan</button></div>`);
  $("wClose").addEventListener("click", closeModal);
  $("wSave").addEventListener("click", async () => {
    try {
      await api("PATCH", `/v1/beheer/waarschuwingen/${encodeURIComponent(w.id)}`, { verborgen: $("wHide").checked, beeindigd: $("wEnd").checked });
      closeModal();
      toast("Opgeslagen");
      run();
    } catch (err) { toast(err.message); }
  });
}

let meldingQuery = "", onlyHidden = false;
async function meldingen(el) {
  const qs = new URLSearchParams({ limit: "300", ...(meldingQuery ? { q: meldingQuery } : {}), ...(onlyHidden ? { hidden: "1" } : {}) });
  const list = await api("GET", `/v1/beheer/meldingen?${qs}`);
  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="mq" placeholder="Zoek op titel, plaats, straat of capcode" value="${esc(meldingQuery)}">
      <label class="chips"><label><input type="checkbox" id="mh" ${onlyHidden ? "checked" : ""}> Alleen verborgen</label></label>
    </div>
    <div class="list">${list.length ? list.map((m) => `
      <div class="item${m.hidden ? " hidden" : ""}" data-guid="${esc(m.guid)}">
        <span class="ico">${(DIENST[m.dienst] || ["🔔"])[0]}</span>
        <div class="grow" style="flex:1;min-width:0">
          <small>${dt(m.datum_tijd)} · ${esc(m.stad || "")}</small>
          <div class="t">${esc(m.title)}</div>
          <div>${m.prioriteit ? `<span class="tag">${esc(m.prioriteit)}</span>` : ""}${m.hidden ? `<span class="tag orange">Verborgen</span>` : ""}${m.edited && !m.hidden ? `<span class="tag blue">Aangepast</span>` : ""}<small>${esc(m.categorie || "")}</small></div>
        </div>
        <small>${m.views ? `👁 ${m.views}` : ""}</small>
      </div>`).join("") : `<p class="muted" style="padding:16px">Geen meldingen gevonden</p>`}</div>`;
  let t;
  $("mq").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { meldingQuery = e.target.value.trim(); run(); }, 350); });
  $("mh").addEventListener("change", (e) => { onlyHidden = e.target.checked; run(); });
  el.querySelectorAll(".item").forEach((row) => row.addEventListener("click", () => editMelding(list.find((m) => m.guid === row.dataset.guid))));
}

function openModal(html) { $("modalCard").innerHTML = html; $("modal").hidden = false; }
function closeModal() { $("modal").hidden = true; }
$("modal").addEventListener("click", (e) => { if (e.target === $("modal")) closeModal(); });

function editMelding(m) {
  openModal(`
    <h2>${esc(m.title)}</h2>
    <p class="muted" style="font-size:.85rem">${dt(m.datum_tijd)} · ${esc((DIENST[m.dienst] || [0, "Overig"])[1])} · ${esc(m.stad || "")}${m.capcode ? ` · capcode ${esc(m.capcode)}` : ""}</p>
    <p style="font-family:ui-monospace,monospace;font-size:.8rem" class="muted">${esc(m.full_melding || "")}</p>
    <form class="form" id="mf">
      <label class="check"><input type="checkbox" name="hidden" ${m.hidden ? "checked" : ""}> Verbergen in de app en op de website</label>
      <label>Titel<input name="title" value="${esc(m.title)}"></label>
      <label>Categorie<input name="categorie" value="${esc(m.categorie || "")}"></label>
      <label>Straat / locatie<input name="locatie" value="${esc(m.locatie || "")}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label>Breedtegraad<input name="lat" value="${m.lat ?? ""}"></label>
        <label>Lengtegraad<input name="lon" value="${m.lon ?? ""}"></label>
      </div>
      <div class="actions">
        ${m.edited ? `<button type="button" class="btn danger" id="mreset">Aanpassingen terugdraaien</button>` : ""}
        <button type="button" class="btn" id="mcancel">Annuleer</button>
        <button type="submit" class="btn primary">Bewaar</button>
      </div>
    </form>`);
  $("mcancel").onclick = closeModal;
  if ($("mreset")) $("mreset").onclick = async () => { await api("PATCH", `/v1/beheer/meldingen/${m.guid}`, { reset: true }); closeModal(); toast("Teruggedraaid"); run(); };
  $("mf").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), change = {};
    const num = (v) => (v === "" ? null : Number(String(v).replace(",", ".")));
    if (f.get("hidden") === "on" !== Boolean(m.hidden)) change.hidden = f.get("hidden") === "on";
    for (const k of ["title", "categorie", "locatie"]) if ((f.get(k) || "").trim() !== (m[k] || "")) change[k] = f.get(k).trim();
    for (const k of ["lat", "lon"]) { const v = num(f.get(k)); if (v !== null && Math.abs(v - (m[k] ?? 0)) > 1e-6) change[k] = v; }
    if (Object.keys(change).length) { await api("PATCH", `/v1/beheer/meldingen/${m.guid}`, change); toast("Bewaard"); }
    closeModal();
    run();
  };
}

async function push(el) {
  const history = await api("GET", "/v1/beheer/push");
  el.innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">
      <div class="card"><h2>Pushmelding versturen</h2>
        <form class="form" id="pf">
          <label>Titel<input name="title" value="A-Alerts" maxlength="120" required></label>
          <label>Bericht<textarea name="body" maxlength="1000" required></textarea></label>
          <div><b style="font-size:.85rem">Ontvangers</b> <small class="muted">(niets aangevinkt = iedereen)</small>
            <div class="chips" style="margin-top:8px">${PLAATSEN.map((p) => `<label><input type="checkbox" name="plaats" value="${p}"> ${p}</label>`).join("")}</div></div>
          <p class="muted" style="font-size:.8rem;margin:0">Gebruikers zonder plaatsfilter krijgen het bericht altijd. Het bericht gaat binnen een minuut de deur uit.</p>
          <div class="actions"><button class="btn primary" type="submit">Verstuur</button></div>
        </form>
      </div>
      <div class="card"><h2>Eerder verstuurd</h2>
        ${history.length ? history.map((b) => `<div class="row" style="align-items:flex-start"><div class="grow"><b>${esc(b.title)}</b><br>${esc(b.body)}<br><small>${dt(b.at)} · ${(b.plaatsen || []).length ? esc(b.plaatsen.join(", ")) : "Iedereen"} · ${b.ontvangers ?? 0} toestellen</small></div></div>`).join("") : `<p class="muted">Nog niets verstuurd</p>`}
      </div>
    </div>`;
  $("pf").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const plaatsen = f.getAll("plaats");
    if (!confirm(`Pushmelding versturen naar ${plaatsen.length ? plaatsen.join(", ") : "iedereen"}?`)) return;
    const r = await api("POST", "/v1/beheer/push", { title: f.get("title"), body: f.get("body"), plaatsen });
    toast(`In de wachtrij voor ${r.queued} toestellen`);
    run();
  };
}

const DOCS = { privacy: "Privacyverklaring", cookies: "Cookies", terms: "Gebruiksvoorwaarden", disclaimer: "Disclaimer", changelog: "Changelog" };
let doc = "privacy";
async function teksten(el) {
  const data = await api("GET", `/v1/beheer/content/${doc}`);
  const tabs = Object.entries(DOCS).map(([k, v]) => `<button class="btn${k === doc ? " primary" : ""}" data-doc="${k}">${v}</button>`).join("");
  if (doc === "changelog") {
    el.innerHTML = `<div class="toolbar">${tabs}</div>
      <div class="form" style="max-width:900px">
        <p class="muted" style="margin:0">De changelog staat in de app. Bewerk hem als JSON-lijst (nieuwste bovenaan).</p>
        <textarea class="code" id="cl">${esc(JSON.stringify(data, null, 2))}</textarea>
        <div class="actions"><button class="btn danger" id="creset">Standaard terugzetten</button><button class="btn primary" id="csave">Bewaar</button></div>
      </div>`;
    $("csave").onclick = async () => {
      let list;
      try { list = JSON.parse($("cl").value); } catch { return toast("Geen geldige JSON"); }
      await api("PUT", "/v1/beheer/content/changelog", list);
      toast("Bewaard");
    };
  } else {
    el.innerHTML = `<div class="toolbar">${tabs}</div>
      <div class="form" style="max-width:900px">
        <label>Titel<input id="ct" value="${esc(data?.title || "")}"></label>
        <label>Inhoud (HTML)<textarea class="code" id="cc">${esc(data?.content || "")}</textarea></label>
        <p class="muted" style="margin:0;font-size:.8rem">${data?.updated_at ? `Laatst aangepast ${ago(data.updated_at)} · ` : ""}Binnen 5 minuten zichtbaar in de app en op de website.</p>
        <div class="actions"><button class="btn danger" id="creset">Standaard terugzetten</button><button class="btn primary" id="csave">Bewaar</button></div>
      </div>`;
    $("csave").onclick = async () => {
      await api("PUT", `/v1/beheer/content/${doc}`, { title: $("ct").value, content: $("cc").value });
      toast("Bewaard");
      run();
    };
  }
  $("creset").onclick = async () => {
    if (!confirm("De standaardtekst terugzetten? Je aanpassingen gaan verloren.")) return;
    await api("DELETE", `/v1/beheer/content/${doc}`);
    toast("Teruggezet");
    run();
  };
  el.querySelectorAll("[data-doc]").forEach((b) => (b.onclick = () => { doc = b.dataset.doc; run(); }));
}

async function instellingen(el) {
  const me = await api("GET", "/v1/beheer/me");
  el.innerHTML = `
    <div class="grid">
      <div class="card"><h2>Account</h2>
        <div class="row"><span class="grow">Ingelogd als</span><b>${esc(me.user)}</b></div>
        <div class="row"><span class="grow">Sessie geldig tot</span><span>${new Date(me.expires).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</span></div>
        <p class="muted" style="font-size:.85rem">Wachtwoord wijzigen? Pas het GitHub-secret <code>BEHEER_PASSWORD</code> aan en start de workflow Worker. Iedereen wordt dan uitgelogd.</p>
        <div class="actions"><button class="btn danger" id="lo">Uitloggen</button></div>
      </div>
      <div class="card"><h2>Links</h2>
        <div class="row"><a href="https://a-alerts.nl" target="_blank" rel="noopener">a-alerts.nl</a></div>
        <div class="row"><a href="${API}/health" target="_blank" rel="noopener">API-status (health)</a></div>
        <div class="row"><a href="https://github.com/LRvdLinden/p2000-apeldoorn" target="_blank" rel="noopener">GitHub-repo</a></div>
      </div>
    </div>`;
  $("lo").onclick = logout;
}

// ------------------------------------------------------------------ start

if (token) showApp(); else showLogin();
