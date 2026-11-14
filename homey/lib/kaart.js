'use strict';

/*
 * Image for the "afbeelding" tags: a square map (Apple Maps, through the A-Alerts API) with the spot or area,
 * and the A-Alerts watermark. Pure JavaScript (pngjs), one image at a time, so memory stays low.
 *
 *  - P2000 with a street: map with the marker of the service.
 *  - NL-Alert: map of the area, filled in red, with the NL-Alert marker.
 *  - Burgernet with a street in the message: map with the Burgernet marker (otherwise the square banner).
 *  - KNMI: all of the Netherlands with the warning area in the colour of the code, and a card (code, phenomenon, times).
 *  - Burgernet, AMBER Alert and anything else: null (the app then uses the banner of the service or source).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { PNG } = require('pngjs');

const API = 'https://p2000-apeldoorn-api.lrvdlinden.workers.dev';
const DIR = path.join(__dirname, '..', 'assets', 'kaart');
const META = JSON.parse(fs.readFileSync(path.join(DIR, 'kaart.json'), 'utf8'));
const SIZE = 600; // points; the image is 1200 x 1200 pixels (scale 2)
const SCALE = 2;
// KNMI: all of the Netherlands in view (the warnings cover several provinces); a little room at the bottom for the card.
const KNMI_VIEW = { lat: 52.125, lon: 5.295, z: 7.3 };
const CODE_RGB = { yellow: [249, 225, 30], orange: [225, 112, 0], red: [213, 43, 30], green: [57, 135, 12] };
const KNMI_ICON = [
  [/mist/i, 'fog'], [/wind/i, 'wind'], [/onweer|tornado|hagel/i, 'thunderstorm'], [/regen/i, 'rain'], [/sneeuw/i, 'snow'],
  [/glad|ijzel|vorst/i, 'ice'], [/hitte/i, 'heat'], [/kou/i, 'cold'], [/kust/i, 'waterspout'],
];

const sprites = new Map();
function sprite(name) {
  if (!sprites.has(name)) {
    const file = path.join(DIR, `${name}.png`);
    sprites.set(name, fs.existsSync(file) ? PNG.sync.read(fs.readFileSync(file)) : null);
  }
  return sprites.get(name);
}

function download(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'A-Alerts-Homey (+https://a-alerts.nl)', 'X-App-Client': 'A-Alerts-Homey' }, timeout }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => resolve(Buffer.concat(parts)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// ------------------------------------------------------------------ projection (Web Mercator, in pixels of the image)

function world(lat, lon, z) {
  const s = 256 * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}
function toPixel(view, lat, lon) {
  const [cx, cy] = world(view.lat, view.lon, view.z);
  const [x, y] = world(lat, lon, view.z);
  return [(x - cx) * SCALE + (SIZE * SCALE) / 2, (y - cy) * SCALE + (SIZE * SCALE) / 2];
}

// ------------------------------------------------------------------ drawing

function blend(img, i, rgb, a) {
  const d = img.data;
  d[i] = Math.round(d[i] + (rgb[0] - d[i]) * a);
  d[i + 1] = Math.round(d[i + 1] + (rgb[1] - d[i + 1]) * a);
  d[i + 2] = Math.round(d[i + 2] + (rgb[2] - d[i + 2]) * a);
  d[i + 3] = 255;
}

function drawSprite(img, sp, x0, y0) {
  if (!sp) return 0;
  x0 = Math.round(x0); y0 = Math.round(y0);
  for (let y = 0; y < sp.height; y++) {
    const ty = y0 + y;
    if (ty < 0 || ty >= img.height) continue;
    for (let x = 0; x < sp.width; x++) {
      const tx = x0 + x;
      if (tx < 0 || tx >= img.width) continue;
      const s = (y * sp.width + x) * 4;
      const a = sp.data[s + 3] / 255;
      if (a > 0) blend(img, (ty * img.width + tx) * 4, [sp.data[s], sp.data[s + 1], sp.data[s + 2]], a);
    }
  }
  return sp.width;
}

function roundRect(img, x0, y0, w, h, r, rgb, alpha) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x < r ? r - x - 0.5 : x >= w - r ? x - (w - r) + 0.5 : 0;
      const dy = y < r ? r - y - 0.5 : y >= h - r ? y - (h - r) + 0.5 : 0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const edge = dx && dy ? Math.max(0, Math.min(1, r - dist + 0.5)) : 1;
      const tx = x0 + x, ty = y0 + y;
      if (edge > 0 && tx >= 0 && ty >= 0 && tx < img.width && ty < img.height) blend(img, (ty * img.width + tx) * 4, rgb, alpha * edge);
    }
  }
}

function shadow(img, x0, y0, w, h, r) {
  for (let i = 6; i >= 1; i--) roundRect(img, x0 - i + 2, y0 - i + 6, w + 2 * i - 4, h + 2 * i - 4, r + i, [0, 0, 0], 0.025);
}

/** Fills rings ([[lon, lat], …], even-odd) in a colour and draws a border, with 2x2 supersampling. */
function fillArea(img, view, rings, rgb, alpha, borderRgb) {
  const W = img.width, H = img.height, SS = 2;
  const poly = rings.filter((r) => Array.isArray(r) && r.length > 2).map((ring) => ring.map(([lon, lat]) => toPixel(view, lat, lon).map((v) => v * SS)));
  if (!poly.length) return false;
  const cover = new Uint8Array(W * H);
  const xs = [];
  for (let sy = 0; sy < H * SS; sy++) {
    const yy = sy + 0.5;
    xs.length = 0;
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j], [x2, y2] = ring[i];
        if ((y1 <= yy && y2 > yy) || (y2 <= yy && y1 > yy)) xs.push(x1 + ((yy - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    const py = Math.floor(sy / SS);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(W * SS - 1, Math.floor(xs[k + 1] - 0.5));
      for (let sx = from; sx <= to; sx++) cover[py * W + Math.floor(sx / SS)]++;
    }
  }
  const max = SS * SS;
  for (let i = 0; i < W * H; i++) if (cover[i]) blend(img, i * 4, rgb, (alpha * cover[i]) / max);
  // Border: covered pixels with an uncovered pixel within 3 px.
  const B = 3;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!cover[i]) continue;
      let rand = false;
      for (let dy = -B; dy <= B && !rand; dy += B) {
        for (let dx = -B; dx <= B; dx += B) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !cover[ny * W + nx]) { rand = true; break; }
        }
      }
      if (rand) blend(img, i * 4, borderRgb, 0.9);
    }
  }
  return true;
}

function watermark(img) {
  drawSprite(img, sprite('watermerk'), 28, 28);
}

// ------------------------------------------------------------------ KNMI card (like the KNMI Homey app)

const pad2 = (n) => String(n).padStart(2, '0');
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
function amsterdam(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', weekday: 'short' }).format(d);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  return { dag: `${p.day}/${p.month}`, tijd: `${pad2(p.hour)}:${pad2(p.minute)}`, weekdag: DAGEN[idx] || '' };
}
/** Time window like knmi.nl: "maandag 23:30 tot dinsdag 12:00", the end day only when it differs. */
function tijdvenster(start, eind) {
  if (!start) return '';
  if (!eind) return `${start.weekdag} ${start.tijd}`;
  return `${start.weekdag} ${start.tijd} tot ${eind.dag === start.dag ? '' : `${eind.weekdag} `}${eind.tijd}`;
}
function tekenSprites(s) {
  const out = [];
  for (const [i, woord] of s.split(' ').entries()) {
    if (i > 0) out.push(sprite('teken_space'));
    const dag = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'].indexOf(woord);
    if (dag >= 0) { out.push(sprite(`dag_${dag}`)); continue; }
    if (woord === 'tot') { out.push(sprite('woord_tot')); continue; }
    for (const ch of woord) out.push(sprite(`teken_${/\d/.test(ch) ? ch : ch === ':' ? 'colon' : ch === '/' ? 'slash' : 'space'}`));
  }
  return out.filter(Boolean);
}

function knmiCard(img, w, gebeurtenis) {
  const code = gebeurtenis === 'einde' ? 'green' : (CODE_RGB[w.niveau] ? w.niveau : 'yellow');
  const start = w.start ? amsterdam(new Date(w.start)) : null;
  const eind = w.einde ? amsterdam(new Date(w.einde)) : null;
  const tijdTekst = tijdvenster(start, eind);
  const tijd = tekenSprites(tijdTekst);
  const soortIdx = META.soorten.findIndex((s) => s.toLowerCase() === String(w.soort || '').toLowerCase());
  const soort = sprite(`soort_${soortIdx >= 0 ? soortIdx : META.soorten.length - 1}`);
  const codeSp = sprite(`code_${code}`);
  const iconKey = (KNMI_ICON.find(([re]) => re.test(w.soort || w.titel || '')) || [null, 'warning'])[1];
  const icon = sprite(`icon_${iconKey}_${code === 'yellow' ? 'd' : 'w'}`);
  const label = sprite('knmi_label');
  const vanaf = !eind && start ? sprite('knmi_vanaf') : null;
  const tijdW = tijd.reduce((s, sp) => s + sp.width, 0) + (vanaf ? vanaf.width : 0);
  const regel3 = 44 + 16 + (codeSp ? codeSp.width : 0) + (soort ? soort.width : 0);
  const w0 = Math.max(label ? label.width : 0, tijdW, regel3) + 52;
  const h0 = 150;
  const x0 = 28, y0 = img.height - h0 - 90; // above the Apple Maps logo, which must stay visible
  shadow(img, x0, y0, w0, h0, 22);
  roundRect(img, x0, y0, w0, h0, 22, [255, 255, 255], 0.94);
  drawSprite(img, label, x0 + 26, y0 + 18);
  let x = x0 + 26;
  if (vanaf) x += drawSprite(img, vanaf, x, y0 + 46);
  for (const sp of tijd) x += drawSprite(img, sp, x, y0 + 46);
  roundRect(img, x0 + 26, y0 + 92, 44, 44, 10, CODE_RGB[code], 1);
  drawSprite(img, icon, x0 + 28, y0 + 94);
  x = x0 + 86;
  x += drawSprite(img, codeSp, x, y0 + 94);
  drawSprite(img, soort, x, y0 + 94);
}

// ------------------------------------------------------------------ public

/** What to draw for this alert or warning; null when there is no map (the banner is used then). */
function plan(item, soort, gebeurtenis) {
  if (soort === 'melding') {
    const straat = item.locatie && String(item.locatie).trim() && String(item.locatie).trim().toLowerCase() !== 'onbekend';
    if (!straat || item.lat == null || item.lon == null || !Number(item.lat)) return null;
    const d = String(item.dienst || '').toLowerCase();
    const marker = ['lifeliner', 'mmt'].includes(d) ? 'traumaheli' : ['brandweer', 'ambulance', 'politie', 'traumaheli'].includes(d) ? d : 'brandweer';
    return { view: { lat: Number(item.lat), lon: Number(item.lon), z: 16 }, marker };
  }
  // Burgernet: a map with the Burgernet marker only when the message names a street (the server finds its spot);
  // with only a town the square Burgernet banner is used (a marker in the middle of the town says nothing).
  if (item.bron === 'burgernet') {
    if (!item.straat || item.lat == null || item.lon == null || !Number(item.lat)) return null;
    return { view: { lat: Number(item.lat), lon: Number(item.lon), z: 15.5 }, marker: 'burgernet' };
  }
  // VNOG: a map with the VNOG marker only when the spot is known (the linked P2000 incident or the street VNOG names).
  if (item.bron === 'vnog') {
    if (item.lat == null || item.lon == null || !Number(item.lat)) return null;
    return { view: { lat: Number(item.lat), lon: Number(item.lon), z: 15.5 }, marker: 'vnog' };
  }
  if (item.bron === 'knmi') return { view: KNMI_VIEW, knmi: true, gebeurtenis };
  // AMBER Alert: all of the Netherlands, no spot: the banner is used.
  if (item.bron === 'amber') return null;
  if (item.bron === 'vermistkind') {
    if (item.lat == null || item.lon == null) return null;
    const km = Number(item.straal_km) || 2;
    // The circle (diameter) fills about half of the image.
    const [x1] = world(Number(item.lat), Number(item.lon) - km / (111.32 * Math.cos((item.lat * Math.PI) / 180)), 0);
    const [x2] = world(Number(item.lat), Number(item.lon) + km / (111.32 * Math.cos((item.lat * Math.PI) / 180)), 0);
    const z = Math.max(8, Math.min(15, Math.log2((SIZE * 0.5) / Math.max(x2 - x1, 1e-9))));
    return { view: { lat: Number(item.lat), lon: Number(item.lon), z: Math.floor(z * 10) / 10 }, vermistkind: true };
  }
  if (item.bron === 'nlalert') {
    const pts = (item.gebied || []).flat().filter((p) => Array.isArray(p) && p.length >= 2);
    if (!pts.length) return item.lat != null ? { view: { lat: Number(item.lat), lon: Number(item.lon), z: 13 }, nlalert: true } : null;
    const lats = pts.map((p) => p[1]), lons = pts.map((p) => p[0]);
    const n = Math.max(...lats), s = Math.min(...lats), e = Math.max(...lons), w = Math.min(...lons);
    // Zoom so the area fills about half of the image (with streets and places around it).
    const [x1, y1] = world(n, w, 0), [x2, y2] = world(s, e, 0);
    const z = Math.max(7, Math.min(14, Math.log2((SIZE * 0.5) / Math.max(x2 - x1, y2 - y1, 1e-9))));
    return { view: { lat: (n + s) / 2, lon: (e + w) / 2, z: Math.floor(z * 10) / 10 }, nlalert: true };
  }
  return null;
}

/** The map URL of the A-Alerts API (map with marker, without watermark), for the "afbeelding URL" tag. */
function kaartUrl(p, metMarker = true) {
  const { lat, lon, z } = p.view;
  return `${API}/v1/kaart.png?c=${lat.toFixed(5)},${lon.toFixed(5)}&z=${z}${metMarker && p.marker ? `&m=${p.marker}` : ''}`;
}

/** PNG buffer of the map image, or null. */
async function maak(item, soort, gebeurtenis) {
  const p = plan(item, soort, gebeurtenis);
  if (!p) return null;
  const img = PNG.sync.read(await module.exports.download(kaartUrl(p)));
  if (img.width !== SIZE * SCALE) throw new Error(`kaart ${img.width}px`);
  if (p.nlalert) {
    if (item.gebied) fillArea(img, p.view, item.gebied, [227, 0, 27], 0.22, [227, 0, 27]);
    const m = sprite('marker_nlalert');
    const [x, y] = toPixel(p.view, item.lat != null ? Number(item.lat) : p.view.lat, item.lon != null ? Number(item.lon) : p.view.lon);
    drawSprite(img, m, x - m.width / 2, y - m.height);
  }
  if (p.vermistkind) {
    if (item.gebied) fillArea(img, p.view, item.gebied, [244, 224, 5], 0.35, [27, 38, 94]);
    const m = sprite('marker_vermistkind');
    const [x, y] = toPixel(p.view, Number(item.lat), Number(item.lon));
    drawSprite(img, m, x - m.width / 2, y - m.height);
  }
  if (p.knmi) {
    const code = gebeurtenis === 'einde' ? null : (CODE_RGB[item.niveau] ? item.niveau : 'yellow');
    if (code) {
      // All of the Netherlands like knmi.nl: every area of the warning in its own code (from the detail of the API).
      let landelijk = Array.isArray(item.landelijk) ? item.landelijk : null;
      if (!landelijk && item.id) {
        try { landelijk = (await module.exports.detail(item.id))?.landelijk || null; } catch (e) { landelijk = null; }
      }
      const vlakken = landelijk && landelijk.length ? landelijk : item.gebied ? [{ niveau: code, gebied: item.gebied }] : [];
      for (const v of vlakken) {
        const rgb = CODE_RGB[v.niveau] || CODE_RGB[code];
        if (v.gebied) fillArea(img, p.view, v.gebied, rgb, 0.55, rgb.map((x) => Math.round(x * 0.85)));
      }
    }
    knmiCard(img, item, gebeurtenis);
  }
  watermark(img);
  return { png: PNG.sync.write(img, { deflateLevel: 6 }), url: kaartUrl(p) };
}

module.exports = {
  maak, plan, kaartUrl, download, toPixel, world,
  /** Detail of a warning from the A-Alerts API (KNMI: all areas of the Netherlands). */
  detail: (id) => require('./api').waarschuwing(id),
};
