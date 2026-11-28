// Reel covers A-Alerts 28-11-2026, 1080x1920. Everything that matters stays inside the middle 1080x1440 (profile grid crop 3:4)
// and inside the middle 1080x1080 for the square crop. Run: node social/a-alerts-2026-11-28/bron/covers.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const HIER = 'file://' + __dirname + '/';
const IMG = 'file://' + path.resolve(__dirname, '../../../website/assets/img') + '/';
const FONT = 'file://' + path.resolve(__dirname, '../../../website/assets/fonts') + '/';
const UIT = path.resolve(__dirname, '../nl');

const css = `
@font-face{font-family:P;font-weight:600;src:url(${FONT}Poppins-SemiBold.woff2)}
@font-face{font-family:P;font-weight:700;src:url(${FONT}Poppins-Bold.woff2)}
@font-face{font-family:O;font-weight:900;src:url(${FONT}overpass-latin-900-normal.woff2)}
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1920px;overflow:hidden;font-family:P;color:#fff;position:relative;
  background:radial-gradient(120% 90% at 20% 10%,#D2122E 0%,#B40D26 45%,#8A0A1E 100%)}
.tex{position:absolute;inset:0;background:url(${IMG}maptex.webp) center/cover;opacity:.16;mix-blend-mode:screen}
.strepen{position:absolute;left:0;top:240px;width:260px;height:260px;clip-path:polygon(0 0,100% 0,0 100%);
  background:repeating-linear-gradient(135deg,#fff 0 22px,transparent 22px 48px)}
.kop{position:absolute;left:0;right:0;top:500px;text-align:center}
.pill{display:inline-flex;align-items:center;gap:12px;background:rgba(0,0,0,.42);border-radius:999px;padding:12px 28px 12px 22px;font-weight:600;font-size:36px}
.pill i{width:18px;height:18px;border-radius:50%;background:#3DDC84;box-shadow:0 0 0 6px rgba(61,220,132,.25)}
h1{font-family:O;font-weight:900;font-size:128px;line-height:1;letter-spacing:-1px;margin-top:30px;text-shadow:0 6px 24px rgba(0,0,0,.3)}
.toestel{position:absolute;left:290px;top:1010px;width:500px;filter:drop-shadow(0 34px 60px rgba(0,0,0,.5))}
.melding{position:absolute;left:120px;right:120px;top:1130px;display:flex;gap:20px;align-items:center;padding:22px 26px;border-radius:34px;
  background:rgba(250,250,252,.95);color:#111;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.melding .ic{width:84px;height:84px;border-radius:20px;background:#fff;display:grid;place-items:center;flex:none;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.melding .ic img{width:76%;height:76%}
.melding small{display:block;font-size:22px;color:#777;font-weight:600;text-transform:uppercase}
.melding b{display:block;font-size:32px;line-height:1.15}
.merk{position:absolute;left:0;right:0;top:1560px;text-align:center}
.merk span{display:inline-flex;align-items:center;gap:16px;background:rgba(0,0,0,.55);border-radius:999px;padding:12px 34px 12px 14px;font-family:O;font-weight:900;font-size:50px}
.merk img{width:76px;height:76px;border-radius:22%}
.heli{position:absolute;left:300px;top:930px;width:520px;transform:scaleX(-1) rotate(-6deg);filter:drop-shadow(0 18px 24px rgba(0,0,0,.4))}
.spoor{position:absolute;left:0;top:0}
`;
const merk = `<div class="merk"><span><img src="${IMG}aalerts-icon-180.png">a-alerts.nl</span></div>`;
const COVERS = {
  meldingen: `<div class="kop"><span class="pill"><i></i>Live · elke melding</span><h1>Sirenes in<br>je straat?</h1></div>
    <img class="toestel" src="${HIER}toestel-p2000.png">
    <div class="melding"><div class="ic"><img src="${IMG}icon_ambulance.png"></div><div><small>A-Alerts · nu</small><b>Ambulance · A1 spoed</b></div></div>`,
  helikopters: `<svg class="spoor" width="1080" height="1920"><g fill="#FFD400">${Array.from({ length: 22 }, (_, i) => {
      const x = 860 + i * 34, y = 1080 + Math.sin(i / 3) * 30; return `<circle cx="${x}" cy="${y}" r="7"/>`; }).join('')}</g></svg>
    <div class="kop"><span class="pill"><i></i>Live op de kaart</span><h1>Lifeliner<br>boven je huis?</h1></div>
    <img class="heli" src="${IMG}heli_lifeliner.png">${merk}`,
};
(async () => {
  const br = await chromium.launch();
  for (const [naam, html] of Object.entries(COVERS)) {
    const tmp = path.join(__dirname, `_cover.html`);
    fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="tex"></div><div class="strepen"></div>${html}`);
    const p = await br.newPage({ viewport: { width: 1080, height: 1920 } });
    await p.goto('file://' + tmp, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(UIT, `reel-cover-${naam}-1080x1920.png`) });
    await p.close(); fs.rmSync(tmp, { force: true });
  }
  await br.close();
})();
