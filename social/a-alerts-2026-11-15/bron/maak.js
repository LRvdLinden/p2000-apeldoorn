// Social banners A-Alerts, campaign 15-11-2026 (NL): P2000, verkeer, nieuws, helikopters, waarschuwingen.
// Instagram/Facebook post 1080x1080 and 1080x1350, story/reels 1080x1920. Run: node social/a-alerts-2026-11-15/bron/maak.js
// The phones show real screens of the app (cut from AppStore/screenshots/nl-NL/iphone-6.3 into toestel-*.png).
const { chromium } = require('playwright');
const path = require('path');
const HIER = 'file://' + __dirname + '/';
const IMG = 'file://' + path.resolve(__dirname, '../../../website/assets/img') + '/';
const FONT = 'file://' + path.resolve(__dirname, '../../../website/assets/fonts') + '/';
const UIT = path.resolve(__dirname, '../nl');
const ic = (n) => `<img src="${IMG}${n}.png">`;

const ONDERWERPEN = {
  p2000: { pill: 'Live · elke melding', kop: 'Alle P2000-<br>meldingen live', sub: 'Brandweer, ambulance, politie en traumaheli in de gemeente Apeldoorn. Met kaart, pushmelding en het verloop van elk incident.',
    iconen: ['icon_brandweer', 'icon_ambulance', 'icon_politie', 'icon_traumaheli'] },
  verkeer: { pill: 'Elke minuut bijgewerkt', kop: 'Verkeer live<br>op de kaart', sub: 'Files, ongevallen, afsluitingen, werkzaamheden en vaste flitsers rond Apeldoorn: op de A1, de A50 en in de dorpen.',
    iconen: ['verkeer_file', 'verkeer_ongeval', 'verkeer_afsluiting', 'verkeer_werk', 'verkeer_flitser'], kaal: true },
  nieuws: { pill: 'Tabblad Nieuws', kop: 'Al het nieuws<br>uit je buurt', sub: 'Politieberichten, 112 Nieuws, weerartikelen en liveblogs die meelopen met een incident. Voor Apeldoorn, de dorpen en de buurtschappen.',
    iconen: ['icon_politie', 'icon_knmi', 'icon_burgernet', 'icon_amber'] },
  helikopters: { pill: 'Live op de kaart', kop: 'Volg helikopters<br>live', sub: 'Lifeliners en politiehelikopters boven Apeldoorn: live positie, de gevlogen route en vluchten terugspelen.',
    toestel: 'heli', heli: true },
  waarschuwingen: { pill: 'Direct een melding', kop: 'Waarschuwingen<br>op één plek', sub: 'NL-Alert, Burgernet, AMBER Alert, Vermist Kind Alert, weercodes van het KNMI en incidenten van de VNOG. Met kaart en elke update.',
    toestel: 'waarschuwing', iconen: ['icon_nlalert', 'icon_burgernet', 'icon_amber', 'icon_vermistkind', 'icon_knmi'] },
};

// Per format: sizes and where the phone stands.
const FORMATEN = {
  // kopB: width of pill and heading; lijfB: width of text, icons and link below it; toestel*: the phone.
  '1080x1080': { w: 1080, h: 1080, pad: 64, top: 205, kop: 80, sub: 31, kopB: 510, lijfB: 500, toestelB: 450, toestelX: 592, toestelY: 96 },
  '1080x1350': { w: 1080, h: 1350, pad: 70, top: 185, kop: 100, sub: 36, kopB: 940, lijfB: 480, toestelB: 450, toestelX: 580, toestelY: 520 },
  '1080x1920': { w: 1080, h: 1920, pad: 80, top: 285, kop: 112, sub: 38, kopB: 920, lijfB: 920, toestelB: 560, toestelX: 260, toestelY: 1150, story: true },
};

function page(o, f) {
  const t = o.toestel || Object.keys(ONDERWERPEN).find((k) => ONDERWERPEN[k] === o);
  const rij = o.heli
    ? `<div class="helis"><img src="${IMG}heli_lifeliner.png"><img src="${IMG}heli_politie_aw139.png"></div>`
    : `<div class="rij ${o.kaal ? 'kaal' : ''}">${o.iconen.map((n) => `<span>${ic(n)}</span>`).join('')}</div>`;
  return `<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:P;font-weight:400;src:url(${FONT}Poppins-Regular.woff2)}
  @font-face{font-family:P;font-weight:500;src:url(${FONT}Poppins-Medium.woff2)}
  @font-face{font-family:P;font-weight:600;src:url(${FONT}Poppins-SemiBold.woff2)}
  @font-face{font-family:O;font-weight:900;src:url(${FONT}overpass-latin-900-normal.woff2)}
  *{margin:0;box-sizing:border-box} body{width:${f.w}px;height:${f.h}px;overflow:hidden;font-family:P;color:#fff;position:relative;
    background:radial-gradient(120% 90% at 20% 10%,#D2122E 0%,#B40D26 45%,#8A0A1E 100%)}
  .tex{position:absolute;inset:0;background:url(${IMG}maptex.webp) center/cover;opacity:.16;mix-blend-mode:screen}
  .strepen{position:absolute;left:0;top:0;width:${f.story ? 330 : 300}px;height:${f.story ? 330 : 300}px;clip-path:polygon(0 0,100% 0,0 100%);
    background:repeating-linear-gradient(135deg,#fff 0 26px,transparent 26px 56px)}
  .tekst{position:absolute;left:${f.pad}px;top:${f.top}px;width:${f.kopB}px}
  .lijf{width:${f.lijfB}px}
  h1{white-space:nowrap}
  .pill{display:inline-flex;align-items:center;gap:12px;background:rgba(0,0,0,.42);border-radius:999px;padding:10px 22px 10px 18px;font-weight:600;font-size:${Math.round(f.sub * .82)}px}
  .pill i{width:16px;height:16px;border-radius:50%;background:#3DDC84;box-shadow:0 0 0 5px rgba(61,220,132,.25)}
  h1{font-family:O;font-weight:900;font-size:${f.kop}px;line-height:1.02;margin:${Math.round(f.kop * .28)}px 0 ${Math.round(f.kop * .26)}px;letter-spacing:-.5px;text-shadow:0 4px 18px rgba(0,0,0,.25)}
  p{font-size:${f.sub}px;line-height:1.35;font-weight:500}
  .rij{display:flex;gap:14px;margin-top:${Math.round(f.sub * 1.1)}px}
  .rij span{width:${Math.round(f.sub * 2.3)}px;height:${Math.round(f.sub * 2.3)}px;border-radius:${Math.round(f.sub * .55)}px;background:#fff;display:grid;place-items:center;box-shadow:0 6px 16px rgba(0,0,0,.25)}
  .rij span img{width:72%;height:72%;object-fit:contain}
  .rij.kaal span{background:none;box-shadow:none} .rij.kaal span img{width:100%;height:100%;filter:drop-shadow(0 5px 8px rgba(0,0,0,.35))}
  .helis{display:flex;gap:26px;align-items:center;margin-top:${Math.round(f.sub * 1.1)}px}
  .helis img{height:${Math.round(f.sub * 2.5)}px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
  .toestel{position:absolute;left:${f.toestelX}px;top:${f.toestelY}px;width:${f.toestelB}px;filter:drop-shadow(0 30px 50px rgba(0,0,0,.45))}
  .cta{display:inline-flex;align-items:center;gap:16px;background:rgba(0,0,0,.5);border-radius:999px;padding:12px 30px 12px 14px;font-family:O;font-weight:900;font-size:${Math.round(f.sub * 1.35)}px;margin-top:${Math.round(f.sub * 1.2)}px}
  .cta img{width:${Math.round(f.sub * 1.7)}px;height:${Math.round(f.sub * 1.7)}px;border-radius:26%}
  .gratis{font-size:${Math.round(f.sub * .7)}px;margin-top:14px;opacity:.95}
  </style><div class="tex"></div><div class="strepen"></div>
  <img class="toestel" src="${HIER}toestel-${t}.png">
  <div class="tekst"><span class="pill"><i></i>${o.pill}</span><h1>${o.kop}</h1>
  <div class="lijf"><p>${o.sub}</p>${rij}<span class="cta"><img src="${IMG}aalerts-icon-180.png">a-alerts.nl</span>
  <div class="gratis">Gratis app voor iPhone, iPad, Mac, Apple Watch, Apple TV en Android</div></div></div>
  <script>document.fonts.ready.then(() => { const h = document.querySelector('h1'); let n = parseFloat(getComputedStyle(h).fontSize); while (h.scrollWidth > h.clientWidth && n > 30) h.style.fontSize = --n + 'px'; document.body.dataset.klaar = '1'; });</script>`;
}

(async () => {
  const br = await chromium.launch();
  for (const [naam, o] of Object.entries(ONDERWERPEN)) for (const [maat, f] of Object.entries(FORMATEN)) {
    const p = await br.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
    // Through a file, so the local fonts and images load.
    const tmp = path.join(__dirname, '_tmp.html');
    require('fs').writeFileSync(tmp, page(o, f));
    await p.goto('file://' + tmp, { waitUntil: 'load' });
    await p.waitForSelector('body[data-klaar]');
    await p.waitForTimeout(150);
    const soort = f.story ? 'story-reels' : 'instagram-facebook-post';
    await p.screenshot({ path: `${UIT}/${soort}-${naam}-${maat}.png` });
    await p.close();
  }
  await br.close();
  require('fs').rmSync(path.join(__dirname, '_tmp.html'), { force: true });
})();
