// News banners (1200x675) for the tab Nieuws: KNMI per code and weather type, Burgernet, AMBER Alert, NL-Alert and Vermist Kind.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const IMG = 'file://' + path.resolve(__dirname, '../website/assets/img') + '/';
const FONT = 'file://' + path.resolve(__dirname, '../website/assets/fonts') + '/';
// Usage: node tools/maak_nieuws_banners.js <out-dir>  (PNG 1200x675; convert to WebP + og JPG afterwards)
const OUT = path.resolve(process.argv[2] || '.');

const GLYPH = {
  heat: '<g fill="currentColor"><circle cx="120" cy="120" r="46"/></g><g stroke="currentColor" stroke-width="14" stroke-linecap="round"><path d="M120 22v26M120 192v26M22 120h26M192 120h26M51 51l18 18M171 171l18 18M51 189l18-18M171 69l18-18"/></g>',
  cold: '<g fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"><path d="M105 150V45a15 15 0 0 1 30 0v105"/><circle cx="120" cy="172" r="30" fill="currentColor"/><path d="M160 60h30M160 90h22M160 120h30"/></g>',
  waterspout: '<g fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"><path d="M30 110q22-24 45 0t45 0 45 0 45 0"/><path d="M30 160q22-24 45 0t45 0 45 0 45 0"/><path d="M30 60q22-24 45 0t45 0 45 0 45 0"/></g>',
  warning: '<path fill="none" stroke="currentColor" stroke-width="16" stroke-linejoin="round" d="M120 32l98 172H22z"/><g fill="currentColor"><rect x="110" y="88" width="20" height="62" rx="8"/><circle cx="120" cy="174" r="12"/></g>',
  fog: '<g stroke="currentColor" stroke-width="16" stroke-linecap="round"><path d="M40 70h160"/><path d="M60 110h150"/><path d="M30 150h150"/><path d="M70 190h130"/></g>',
  wind: '<g fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round"><path d="M30 90h120a30 30 0 1 0-30-30"/><path d="M30 130h160a30 30 0 1 1-30 30"/><path d="M30 170h70"/></g>',
  thunderstorm: '<path fill="currentColor" d="M70 120a50 50 0 0 1 10-98 62 62 0 0 1 116 18 42 42 0 0 1 4 80z" opacity=".95"/><path fill="currentColor" d="M118 128l-30 58h28l-14 48 50-70h-30l18-36z"/>',
  snow: '<g stroke="currentColor" stroke-width="14" stroke-linecap="round"><path d="M120 30v180M42 75l156 90M42 165l156-90"/><path d="M100 45l20 20 20-20M100 195l20-20 20 20"/></g>',
  rain: '<path fill="currentColor" d="M70 120a50 50 0 0 1 10-98 62 62 0 0 1 116 18 42 42 0 0 1 4 80z"/><g stroke="currentColor" stroke-width="14" stroke-linecap="round"><path d="M80 150l-12 30M125 150l-12 30M170 150l-12 30M100 195l-8 20M145 195l-8 20"/></g>',
  ice: '<g stroke="currentColor" stroke-width="14" stroke-linecap="round" fill="none"><path d="M120 40v160M51 80l138 80M51 160l138-80"/><circle cx="120" cy="120" r="30"/></g>',
};
const CODE = { green: ['#3CC266', '#1E8A45', 'Code groen', '#fff'], yellow: ['#FFD21F', '#F2B705', 'Code geel', '#1D1D1F'], orange: ['#FF9A3C', '#E86A10', 'Code oranje', '#fff'], red: ['#F0303F', '#B0001A', 'Code rood', '#fff'] };

function stripes(c1, c2, w = 34) {
  return `repeating-linear-gradient(135deg, ${c1} 0 ${w}px, ${c2} ${w}px ${w * 2}px)`;
}
function rings(color, x, y) {
  return [260, 360, 460, 560].map((r, i) => `<div style="position:absolute;left:${x - r / 2}px;top:${y - r / 2}px;width:${r}px;height:${r}px;border-radius:50%;border:3px solid ${color};opacity:${0.35 - i * 0.07}"></div>`).join('');
}
function page(b) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:P;font-weight:500;src:url(${FONT}Poppins-Medium.woff2)}
  @font-face{font-family:P;font-weight:700;src:url(${FONT}Poppins-Bold.woff2)}
  @font-face{font-family:O;font-weight:900;src:url(${FONT}overpass-latin-900-normal.woff2)}
  *{margin:0;box-sizing:border-box} body{width:1200px;height:${b.h || 675}px;overflow:hidden;font-family:P}
  .b{position:relative;width:1200px;height:${b.h || 675}px;overflow:hidden;background:${b.bg}}
  .band{position:absolute;right:${b.vierkant ? -360 : -120}px;top:-60px;width:520px;height:${b.vierkant ? 1500 : 900}px;transform:rotate(14deg);background:${b.stripes};opacity:${b.stripeOpacity ?? 1}}
  .tile{position:absolute;left:${b.tx ?? 820}px;top:${b.ty ?? 150}px;width:280px;height:280px;border-radius:64px;background:${b.tileBg};display:grid;place-items:center;box-shadow:0 30px 60px rgba(0,0,0,.35)}
  .pill{position:absolute;left:56px;top:52px;display:flex;align-items:center;gap:14px;padding:12px 24px 12px 14px;border-radius:999px;background:rgba(255,255,255,.95);color:#121726;font-weight:700;font-size:30px;letter-spacing:.5px}
  .pill img{height:46px} .pill .dot{width:46px;height:46px;border-radius:12px;display:grid;place-items:center}
  .live{position:absolute;left:56px;top:128px;padding:8px 18px;border-radius:999px;background:#E3001B;color:#fff;font-weight:700;font-size:24px;letter-spacing:2px;display:flex;align-items:center;gap:10px}
  .live i{width:12px;height:12px;border-radius:50%;background:#fff;display:block}
  .big{position:absolute;left:${b.vierkant ? 40 : 56}px;${b.vierkant ? 'right:330px;text-align:center;' : ''}top:${b.bigTop ?? 200}px;font-family:O;font-weight:900;font-size:${b.bigSize ?? 120}px;line-height:.95;color:${b.bigColor};letter-spacing:-1px;white-space:nowrap}
  .sub{position:absolute;left:${b.vierkant ? 40 : 60}px;${b.vierkant ? 'right:330px;text-align:center;white-space:normal;' : ''}top:${(b.bigTop ?? 200) + (b.subOffset ?? 128)}px;font-weight:500;font-size:34px;color:${b.subColor}}
  .shade{position:absolute;left:0;right:0;bottom:0;height:300px;background:linear-gradient(transparent, rgba(0,0,0,.45))}
  .site{position:absolute;right:44px;bottom:36px;display:flex;align-items:center;gap:10px;padding:8px 18px 8px 8px;border-radius:999px;background:rgba(18,23,38,.85);color:#fff;font-weight:700;font-size:24px}
  .site img{height:36px;border-radius:9px}
  </style></head><body><div class="b">
  ${b.extra || ''}
  <div class="band"></div>
  ${rings(b.ringColor || '#fff', (b.tx ?? 820) + 140, (b.ty ?? 150) + 140)}
  ${b.afgerond ? '<div style="position:absolute;inset:0;background:rgba(10,14,24,.38)"></div>' : ''}
  <div class="tile">${b.tile}${b.afgerond ? '<div style="position:absolute;right:-18px;bottom:-18px;width:96px;height:96px;border-radius:50%;background:#1E8A45;border:8px solid #fff;display:grid;place-items:center;color:#fff;font-size:52px;font-weight:700">✓</div>' : ''}</div>
  ${b.shade === false ? '' : '<div class="shade"></div>'}
  <div class="pill">${b.pillIcon}${b.pill}</div>
  ${b.live ? '<div class="live"><i></i>LIVEBLOG</div>' : ''}
  ${b.afgerond ? `<div class="live" style="background:#1E8A45">✓ ${b.afgerondLabel || 'AFGEROND'}</div>` : ''}
  ${b.big ? `<div class="big">${b.big}</div>` : ''}${b.sub ? `<div class="sub">${b.sub}</div>` : ''}
  <div class="site"><img src="${IMG}aalerts-icon-180.png">a-alerts.nl</div>
  </div></body></html>`;
}

const knmi = (niveau, glyph, naam) => {
  const [c1, c2, label, fg] = CODE[niveau];
  return {
    name: `knmi-${niveau}-${glyph}`, ringColor: niveau === 'yellow' ? '#1D1D1F' : '#fff',
    bg: `radial-gradient(circle at 75% 30%, ${c1}, ${c2})`,
    stripes: stripes('rgba(0,0,0,.10)', 'transparent', 30),
    tile: `<div style="width:200px;height:200px;border-radius:44px;background:${c1};display:grid;place-items:center;color:${fg};border:10px solid #1D1D1F"><svg viewBox="0 0 240 240" width="150" height="150">${GLYPH[glyph]}</svg></div>`,
    tileBg: '#1D1D1F', ringColor: niveau === 'yellow' ? '#1D1D1F' : '#fff',
    pillIcon: `<img src="${IMG}icon_knmi.png" style="border-radius:12px">`, pill: 'KNMI-weerwaarschuwing',
    big: label, bigColor: fg, sub: naam, subColor: fg, bigTop: 210,
  };
};
const NAMEN = { fog: 'Mist', wind: 'Wind', thunderstorm: 'Onweer', rain: 'Regen', snow: 'Sneeuw', ice: 'Gladheid', heat: 'Hitte', cold: 'Kou', waterspout: 'Kust en water', warning: 'Het weer' };
const BANNERS = [];
for (const niveau of ['yellow', 'orange', 'red', 'green']) for (const g of Object.keys(NAMEN)) {
  const b = knmi(niveau, g, niveau === 'green' ? `${NAMEN[g]} · opgeheven` : NAMEN[g]);
  BANNERS.push(b);
}
BANNERS.push(
  { name: 'burgernet', bg: 'linear-gradient(135deg,#0B3C6E,#1265A8)', stripes: stripes('#F28C00', 'transparent', 30), stripeOpacity: .9,
    tile: `<img src="${IMG}icon_burgernet.png" style="width:200px">`, tileBg: '#fff', 
    pillIcon: `<img src="${IMG}icon_burgernet.png">`, pill: 'Burgernet', big: 'Kijk mee', bigColor: '#fff', sub: 'Oproep van de politie · Apeldoorn e.o.', subColor: 'rgba(255,255,255,.9)', bigTop: 220, subOffset: 120 },
  { name: 'amber', bg: 'linear-gradient(135deg,#E8590C,#FF8A1F)', stripes: stripes('rgba(255,255,255,.9)', 'transparent', 30), stripeOpacity: .55,
    tile: `<img src="${IMG}logo_amber.png" style="width:220px">`, tileBg: '#fff', 
    pillIcon: `<img src="${IMG}icon_amber.png" style="border-radius:12px">`, pill: 'AMBER Alert', big: 'Kind vermist', bigColor: '#fff', bigSize: 104, sub: 'Mogelijk in levensgevaar · heel Nederland', subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'nlalert', bg: 'linear-gradient(135deg,#111522,#262c3f)', stripes: stripes('#fff', 'transparent', 26), stripeOpacity: .9,
    tile: `<img src="${IMG}logo_nlalert.png" style="width:230px">`, tileBg: '#fff', ringColor: '#FFD200',
    pillIcon: `<img src="${IMG}icon_nlalert.png" style="border-radius:12px">`, pill: 'NL-Alert', big: 'Let op', bigColor: '#FFD200', sub: 'Lees het bericht en volg de instructies', subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'vermistkind', bg: 'linear-gradient(135deg,#13204B,#22336F)', stripes: stripes('#F4D400', 'transparent', 30), stripeOpacity: .95,
    tile: `<img src="${IMG}icon_vermistkind.png" style="width:280px;border-radius:64px">`, tileBg: '#1B2457', ringColor: '#F4D400', 
    pillIcon: `<img src="${IMG}icon_vermistkind.png" style="border-radius:12px">`, pill: 'Vermist Kind Alert', big: 'Help zoeken', bigColor: '#F4D400', sub: 'Regionale oproep van de politie', subColor: '#fff', bigTop: 220, subOffset: 120 },
);

async function render(BANNERS, OUT, hoogte = 675, varianten = true) {
  const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1200, height: hoogte } });
  // Every banner twice: plain, and with "LIVEBLOG" (name-live) for items the beheer marked as liveblog.
  for (const b of varianten ? BANNERS.flatMap((x) => [{ ...x, live: false }, { ...x, live: true, name: `${x.name}-live` }]) : BANNERS) {
    fs.writeFileSync(`${OUT}/${b.name}.html`, page(b));
    await p.goto(`file://${OUT}/${b.name}.html`, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${OUT}/${b.name}.png` }); fs.unlinkSync(`${OUT}/${b.name}.html`);
  }
  await br.close();
}
module.exports = { render, page, stripes, knmi, IMG };
// Ended (wide, for news articles): <bron>-afgerond for Burgernet, AMBER Alert, Vermist Kind and NL-Alert.
const AFGEROND = {
  burgernet: { big: 'Afgerond', sub: 'De Burgernet-actie is beëindigd', label: 'AFGEROND' },
  amber: { big: 'Afgerond', sub: 'De AMBER Alert is beëindigd', label: 'AFGEROND' },
  vermistkind: { big: 'Afgerond', sub: 'De Vermist Kind Alert is beëindigd', label: 'AFGEROND' },
  nlalert: { big: 'Ingetrokken', sub: 'Het NL-Alert geldt niet meer', label: 'INGETROKKEN' },
};
module.exports.AFGEROND = AFGEROND;
if (require.main === module) {
  if (process.argv.includes('--afgerond')) {
    render(BANNERS.filter((b) => AFGEROND[b.name]).map((b) => ({ ...b, name: `${b.name}-afgerond`, afgerond: true, afgerondLabel: AFGEROND[b.name].label,
      big: AFGEROND[b.name].big, sub: AFGEROND[b.name].sub, bigSize: 110 })), OUT, 675, false);
  } else render(BANNERS, OUT);
}
