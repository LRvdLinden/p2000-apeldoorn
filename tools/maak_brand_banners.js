// Brand banners (1200x670) in the style of the news banners: banners/banner-<key>-apeldoorn.png in LRvdLinden/P2000-brand
// (used by Homey, the website and shares when there is no map). Usage: node tools/maak_brand_banners.js <out-dir>
const path = require('path');
const { render, stripes, IMG } = require('./maak_nieuws_banners.js');
const OUT = path.resolve(process.argv[2] || '.');
const ALG = 'gemeente Apeldoorn e.o.';
const pill = (icon, r = 12) => `<img src="${IMG}${icon}" style="border-radius:${r}px">`;
const BANNERS = [
  { name: 'banner-ambu-apeldoorn', bg: 'linear-gradient(135deg,#FFD21F,#F2B705)', stripes: stripes('#0A4DA2', 'transparent', 30), ringColor: '#0A4DA2',
    tile: `<img src="${IMG}icon_ambulance.png" style="width:170px">`, tileBg: '#0A4DA2', pillIcon: pill('icon_ambulance.png'), pill: 'P2000-melding',
    big: 'Ambulance', bigColor: '#0B1F3F', sub: ALG, subColor: '#0B1F3F', bigTop: 220, subOffset: 120 },
  { name: 'banner-brand-apeldoorn', bg: 'linear-gradient(135deg,#B0001A,#E3001B)', stripes: stripes('#fff', 'transparent', 30), stripeOpacity: .9,
    tile: `<img src="${IMG}icon_brandweer.png" style="width:170px">`, tileBg: '#fff', pillIcon: pill('icon_brandweer.png'), pill: 'P2000-melding',
    big: 'Brandweer', bigColor: '#fff', sub: ALG, subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'banner-pol-apeldoorn', bg: 'linear-gradient(135deg,#0A2459,#163E8C)', stripes: stripes('#fff', '#E3001B', 30), stripeOpacity: .9,
    tile: `<img src="${IMG}icon_politie.png" style="width:170px">`, tileBg: '#fff', pillIcon: pill('icon_politie.png'), pill: 'P2000-melding',
    big: 'Politie', bigColor: '#fff', sub: ALG, subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'banner-life-apeldoorn', bg: 'linear-gradient(135deg,#5B1A9E,#8B2BE2)', stripes: stripes('#FFD21F', 'transparent', 30), stripeOpacity: .95, ringColor: '#FFD21F',
    tile: `<img src="${IMG}heli_lifeliner.png" style="width:240px">`, tileBg: '#fff', pillIcon: pill('icon_traumaheli.png'), pill: 'Traumaheli',
    big: 'Lifeliner', bigColor: '#fff', sub: ALG, subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'banner-knmi-apeldoorn', bg: 'linear-gradient(135deg,#2F8FD8,#6EC6F5)', stripes: stripes('#fff', 'transparent', 30), stripeOpacity: .8,
    tile: `<img src="${IMG}icon_knmi.png" style="width:280px;border-radius:64px">`, tileBg: '#5AB4EE', pillIcon: pill('icon_knmi.png'), pill: 'KNMI',
    big: 'Weeralarm', bigColor: '#fff', sub: ALG, subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'banner-burgernet-apeldoorn', bg: 'linear-gradient(135deg,#0B3C6E,#1265A8)', stripes: stripes('#F28C00', 'transparent', 30), stripeOpacity: .9,
    tile: `<img src="${IMG}icon_burgernet.png" style="width:200px">`, tileBg: '#fff', pillIcon: `<img src="${IMG}icon_burgernet.png">`, pill: 'Burgernet',
    big: 'Kijk mee', bigColor: '#fff', sub: 'Oproep van de politie · Apeldoorn e.o.', subColor: 'rgba(255,255,255,.9)', bigTop: 220, subOffset: 120 },
  { name: 'banner-amber-apeldoorn', bg: 'linear-gradient(135deg,#E8590C,#FF8A1F)', stripes: stripes('rgba(255,255,255,.9)', 'transparent', 30), stripeOpacity: .55,
    tile: `<img src="${IMG}logo_amber.png" style="width:220px">`, tileBg: '#fff', pillIcon: pill('icon_amber.png'), pill: 'AMBER Alert',
    big: 'Kind vermist', bigColor: '#fff', bigSize: 104, sub: 'Mogelijk in levensgevaar · heel Nederland', subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'banner-nlalert-apeldoorn', bg: 'linear-gradient(135deg,#111522,#262c3f)', stripes: stripes('#fff', 'transparent', 26), stripeOpacity: .9, ringColor: '#FFD200',
    tile: `<img src="${IMG}logo_nlalert.png" style="width:230px">`, tileBg: '#fff', pillIcon: pill('icon_nlalert.png'), pill: 'NL-Alert',
    big: 'Let op', bigColor: '#FFD200', sub: 'Lees het bericht en volg de instructies', subColor: '#fff', bigTop: 220, subOffset: 120 },
  { name: 'banner-vermistkind-apeldoorn', bg: 'linear-gradient(135deg,#13204B,#22336F)', stripes: stripes('#F4D400', 'transparent', 30), stripeOpacity: .95, ringColor: '#F4D400',
    tile: `<img src="${IMG}icon_vermistkind.png" style="width:280px;border-radius:64px">`, tileBg: '#1B2457', pillIcon: pill('icon_vermistkind.png'), pill: 'Vermist Kind Alert',
    big: 'Help zoeken', bigColor: '#F4D400', sub: 'Regionale oproep van de politie', subColor: '#fff', bigTop: 220, subOffset: 120 },
].map((b) => ({ ...b, h: 670 }));

// Square (1200x1200) for Homey: the logo centred at the top, the text centred below it.
const VIERKANT = BANNERS.map((b) => ({ ...b, name: b.name.replace('-apeldoorn', '-apeldoorn-vierkant'), h: 1200, vierkant: true,
  tx: 295, ty: 300, bigTop: 690, subOffset: Math.round((b.bigSize || 120) * 0.95) + 14, bigSize: Math.round((b.bigSize || 120) * 0.95) }));

(async () => {
  await render(BANNERS, OUT, 670, false);
  if (process.argv.includes('--vierkant')) await render(VIERKANT, OUT, 1200, false);
})();

// KNMI code green (lifted) square for Homey: knmi-green-<icon>-vierkant.png, one per kind of weather.
if (process.argv.includes('--knmi')) {
  const { knmi } = require('./maak_nieuws_banners.js');
  const NAMEN = { fog: 'Mist', wind: 'Wind', thunderstorm: 'Onweer', rain: 'Regen', snow: 'Sneeuw', ice: 'Gladheid', heat: 'Hitte', cold: 'Kou', waterspout: 'Kust en water', warning: 'Het weer' };
  const groen = Object.entries(NAMEN).map(([g, n]) => ({ ...knmi('green', g, `${n} · opgeheven`), name: `knmi-green-${g}-vierkant`, h: 1200, vierkant: true,
    tx: 295, ty: 300, bigTop: 690, subOffset: 128, bigSize: 114 }));
  render(groen, OUT, 1200, false);
}

// Ended (square, for Homey and social media): Burgernet, AMBER Alert, Vermist Kind and NL-Alert after the call ended.
if (process.argv.includes('--afgerond')) {
  const TEKST = {
    burgernet: { big: 'Afgerond', sub: 'De Burgernet-actie is beëindigd', label: 'AFGEROND' },
    amber: { big: 'Afgerond', sub: 'De AMBER Alert is beëindigd', label: 'AFGEROND' },
    vermistkind: { big: 'Afgerond', sub: 'De Vermist Kind Alert is beëindigd', label: 'AFGEROND' },
    nlalert: { big: 'Ingetrokken', sub: 'Het NL-Alert geldt niet meer', label: 'INGETROKKEN' },
  };
  const afgerond = VIERKANT.filter((b) => Object.keys(TEKST).some((k) => b.name === `banner-${k}-apeldoorn-vierkant`)).map((b) => {
    const t = TEKST[b.name.replace('banner-', '').replace('-apeldoorn-vierkant', '')];
    return { ...b, name: `${b.name}-afgerond`, afgerond: true, afgerondLabel: t.label, big: t.big, sub: t.sub, bigSize: 110, subOffset: 124 };
  });
  render(afgerond, OUT, 1200, false);
}
