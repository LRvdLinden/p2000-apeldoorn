import { fetchWaarschuwingen, fetchHelikopters, wKop, wTijd, wIcon, wStatus, BRONNEN } from "./aalerts.js?v=69";
import { trackVisit, fetchMeldingen, today, dienstOf, asset, date, fmtTime, esc, ago, reveal, countUp, demoMode, config, plaatsText } from "./core.js?v=61";

reveal();
trackVisit();

// Nav turns solid after scrolling.
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("is-solid", scrollY > 30);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

if (config.appStoreURL) {
  document.querySelectorAll(".appstore").forEach((a) => {
    a.href = config.appStoreURL;
    a.querySelector("span:last-child").textContent = "Download in de App Store";
  });
}

// Hero phone follows the pointer a little.
const phone = document.getElementById("heroPhone");
if (phone && matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  addEventListener("pointermove", (e) => {
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    phone.style.transform = `rotateY(${-8 + x * 8}deg) rotateX(${3 - y * 6}deg) rotateZ(1deg)`;
  });
}

// Feature scrolly: swap the phone screen with the active step.
const glows = { pager: "rgba(220,38,38,.45)", map: "rgba(37,99,235,.45)", nieuws: "rgba(0,103,177,.45)", detail: "rgba(244,196,0,.4)", meteo: "rgba(14,165,233,.45)", notif: "rgba(227,6,19,.45)", home: "rgba(147,51,234,.45)" };
const steps = document.querySelectorAll(".step");
const screens = document.querySelectorAll("#featureGlass img");
const device = document.querySelector(".scrolly-device");
const stepIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const key = e.target.dataset.step;
    steps.forEach((s) => s.classList.toggle("is-active", s === e.target));
    screens.forEach((img) => img.classList.toggle("is-on", img.dataset.screen === key));
    device.style.setProperty("--glow", glows[key]);
  }
}, { rootMargin: "-45% 0px -45% 0px" });
steps.forEach((s) => stepIO.observe(s));

// Watch cycles through its screens.
const watchImgs = document.querySelectorAll("#watchGlass img");
let wi = 0;
setInterval(() => {
  watchImgs[wi].classList.remove("is-on");
  wi = (wi + 1) % watchImgs.length;
  watchImgs[wi].classList.add("is-on");
}, 2600);

// Radius section plays its animation once it is visible.
const buurt = document.getElementById("buurt");
// Helicopters (SVG animation): start when visible, never with "reduce motion".
const heliAnim = buurt.querySelector(".heli-anim");
const stilVoorkeur = matchMedia("(prefers-reduced-motion: reduce)").matches;
try { heliAnim?.pauseAnimations(); } catch {}
new IntersectionObserver((entries, io) => {
  if (entries[0].isIntersecting) {
    buurt.classList.add("is-play");
    try {
      if (stilVoorkeur) heliAnim?.setCurrentTime(8); // still image: Lifeliner above the scene
      else { heliAnim?.setCurrentTime(0); heliAnim?.unpauseAnimations(); }
    } catch {}
    io.disconnect();
  }
}, { threshold: 0.35 }).observe(buurt);

// ------------------------------------------------------------------ live data

const icon = (m) => asset(`assets/img/${dienstOf(m).icon}.png`);

function renderToday(list) {
  const t = today(list);
  countUp(document.getElementById("tTotal"), t.totaal);
  for (const [id, key] of [["Brandweer", "brandweer"], ["Ambulance", "ambulance"], ["Politie", "politie"], ["Traumaheli", "traumaheli"]]) {
    countUp(document.getElementById(`t${id}`), t.perDienst[key] || 0);
    countUp(document.getElementById(`d${id}`), t.perDienst[key] || 0);
  }
}

function renderTicker(list) {
  const items = list.slice(0, 18).map((m) => `
    <a class="tick" href="pager/?melding=${encodeURIComponent(m.guid)}">
      <img src="${icon(m)}" alt=""><time>${fmtTime(date(m))}</time><span>${esc(m.title)}</span>
    </a>`).join("");
  const el = document.getElementById("tickerMove");
  el.innerHTML = items + items; // twice for a seamless loop
  el.style.setProperty("--dur", `${Math.max(30, list.slice(0, 18).length * 6)}s`);
}

// Lock-screen style notifications next to the hero phone.
// NL-Alert, Burgernet and KNMI of the last week join the rotation (every third card), so the hero shows them live too.
let noteIndex = 0, heroWarnings = [];
function cycleNotes(list) {
  const box = document.getElementById("notes");
  const recent = list.slice(0, 8);
  if (!recent.length && !heroWarnings.length) return;
  const show = () => {
    const i = noteIndex++;
    const useWarning = heroWarnings.length && (i % 3 === 1 || !recent.length);
    const el = document.createElement("div");
    el.className = "note";
    if (useWarning) {
      const w = heroWarnings[Math.floor(i / 3) % heroWarnings.length];
      el.classList.add("note-warn");
      el.style.setProperty("--wc", BRONNEN[w.bron].text);
      el.innerHTML = `<img src="${wIcon(w)}" alt=""><div><b>${esc(wKop(w))} · ${esc(wStatus(w))}</b>${esc(w.titel)}<br><small>${esc(w.plaats || "Gemeente Apeldoorn")} · ${esc(wTijd(w))}</small></div>`;
    } else {
      const m = recent[i % recent.length];
      el.innerHTML = `<img src="${icon(m)}" alt=""><div><b>${esc(m.prioriteit ? m.prioriteit + " · " : "")}${esc(dienstOf(m).label)}</b>${esc(m.title)}<br><small>${esc(plaatsText(m))} · ${esc(ago(date(m)))}</small></div>`;
    }
    box.prepend(el);
    const all = box.querySelectorAll(".note:not(.out)");
    if (all.length > 3) { const last = all[all.length - 1]; last.classList.add("out"); setTimeout(() => last.remove(), 500); }
  };
  show();
  setTimeout(show, 900);
  setInterval(show, 4200);
}

let first = true;
async function load() {
  const { list } = await fetchMeldingen(300);
  renderToday(list);
  renderTicker(list);
  renderTV(list);
  tvAlarm(list);
  if (first) { cycleNotes(list); first = false; }
  document.getElementById("heroStatus").textContent = demoMode
    ? "Voorbeeld · de live-server is nog niet bereikbaar"
    : list[0] ? `Laatste melding ${ago(date(list[0]))}` : "Live uit gemeente Apeldoorn";
}
load();
setInterval(load, 30_000);

// ------------------------------------------------------------------ Apple TV preview (live data)

function renderTV(list) {
  const box = document.getElementById("tvList");
  if (!box) return;
  box.innerHTML = list.slice(0, 4).map((m) => `
    <div class="tv-item"><img src="${icon(m)}" alt=""><div><small>${esc(ago(date(m)))}</small><b>${esc(m.title)}</b><small>${esc(plaatsText(m))}</small></div></div>`).join("");
}
setInterval(() => {
  const c = document.getElementById("tvClock");
  if (c) c.textContent = new Date().toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam" });
}, 1000);
let tvLatest = null;
function tvAlarm(list) { tvLatest = list[0] || tvLatest; }
// When the TV comes into view, a new alert pops up like the alarm screen on the Apple TV.
const tvSection = document.getElementById("tv");
if (tvSection) new IntersectionObserver((entries, io) => {
  if (!entries[0].isIntersecting || !tvLatest) return;
  io.disconnect();
  const m = tvLatest, el = document.getElementById("tvAlarm");
  setTimeout(() => {
    el.innerHTML = `<b>${/^(A0|A1|P1)$/i.test(m.prioriteit || "") ? "SPOED" : "NIEUWE MELDING"}</b><span>${esc(m.title)}</span><span style="font-weight:600">${esc(plaatsText(m))}</span>`;
    el.hidden = false;
    setTimeout(() => (el.hidden = true), 5000);
  }, 1200);
}, { threshold: 0.5 }).observe(tvSection);

// A-Alerts: warnings today and helicopters in the air.
async function renderAAlerts() {
  const [w, h] = await Promise.all([fetchWaarschuwingen(7), fetchHelikopters()]);
  heroWarnings = w.slice(0, 6);
  const key = (d) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
  const vandaag = key(new Date());
  const n = (bron) => w.filter((x) => x.bron === bron && key(new Date(x.start)) === vandaag).length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) countUp(el, v); };
  set("wNlalert", n("nlalert"));
  set("tNlalert", n("nlalert"));
  set("tBurgernet", n("burgernet"));
  set("tAmber", n("amber"));
  set("tVermistkind", n("vermistkind"));
  set("wBurgernet", n("burgernet"));
  set("wKnmi", w.filter((x) => x.bron === "knmi" && x.status === "actief").length);
  set("wAmber", w.filter((x) => x.bron === "amber" && x.status === "actief").length);
  set("wVermistkind", w.filter((x) => x.bron === "vermistkind" && x.status === "actief").length);
  set("hTrauma", h.filter((x) => x.soort === "trauma" && !x.op_grond).length);
  set("hPolitie", h.filter((x) => x.soort === "politie" && !x.op_grond).length);
}
renderAAlerts();
setInterval(() => { if (!document.hidden) renderAAlerts(); }, 60_000);
