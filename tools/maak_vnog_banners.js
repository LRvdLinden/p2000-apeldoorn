// VNOG: icon (the two planes of the logo), marker and banners. Logo and colours are those of VNOG (logo file supplied by the owner of this app).
// Run: node tools/maak_vnog_banners.js  → tools/vnog/uit/ (copy to the brand repo and website/assets/img/nieuws as webp).
const fs = require('fs'); const { chromium } = require('playwright');
const T = __dirname + '/';
const { render, stripes } = require(T + 'maak_nieuws_banners.js');
const HIER = 'file://' + __dirname + '/vnog/';
(async () => {
  const br = await chromium.launch();
  for (const [f, uit, w, h] of [['icon', 'icon_vnog', 512, 512], ['marker', 'marker_vnog', 306, 374], ['logo-vnog', 'logo_vnog', 1158, 301]]) {
    const p = await br.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<body style="margin:0;background:transparent"><div style="width:${w}px">${fs.readFileSync(`${__dirname}/vnog/${f}.svg`, 'utf8')}</div></body>`);
    await p.screenshot({ path: `${__dirname}/vnog/${uit}.png`, omitBackground: true }); await p.close();
  }
  await br.close();
  // The whole logo is wide: the white tile becomes a wide panel (the template's tile is a square).
  const paneel = (l, t, w = 560, h = 210) => `<style>.tile{left:${l}px!important;top:${t}px!important;width:${w}px!important;height:${h}px!important;border-radius:44px!important}</style>`;
  const basis = { bg: 'linear-gradient(135deg,#2A1552,#48277F)', stripes: stripes('#E96109', 'transparent', 30), stripeOpacity: .95, ringColor: '#E96109',
    tile: `<img src="${HIER}logo_vnog.png" style="width:430px">`, tileBg: '#fff', pillIcon: `<img src="${HIER}icon_vnog.png">`, pill: 'VNOG',
    big: 'Incident', bigColor: '#fff', sub: 'Veiligheidsregio · Apeldoorn e.o.', subColor: 'rgba(255,255,255,.92)', bigTop: 220, subOffset: 120,
    tx: 780, ty: 25, extra: paneel(670, 70, 500, 190), bigTop: 290, subOffset: 120 };
  const af = { big: 'Afgesloten', sub: 'Het incident is afgesloten', label: 'AFGESLOTEN' };
  const vierkant = { ...basis, tile: `<img src="${HIER}logo_vnog.png" style="width:470px">`, h: 1200, vierkant: true, tx: 295, ty: 300, extra: paneel(155, 335), bigTop: 690, subOffset: 128, bigSize: 114 };
  const OUT = __dirname + '/vnog/uit'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  await render([{ ...basis, name: 'banner-vnog-apeldoorn', h: 670 }], OUT, 670, false);
  await render([{ ...vierkant, name: 'banner-vnog-apeldoorn-vierkant' },
    { ...vierkant, name: 'banner-vnog-apeldoorn-vierkant-afgerond', afgerond: true, afgerondLabel: af.label, big: af.big, sub: af.sub, bigSize: 110, subOffset: 124 }], OUT, 1200, false);
  await render([{ ...basis, name: 'vnog' }], OUT, 675, true);
  await render([{ ...basis, name: 'vnog-afgerond', afgerond: true, afgerondLabel: af.label, big: af.big, sub: af.sub }], OUT, 675, false);
})();
