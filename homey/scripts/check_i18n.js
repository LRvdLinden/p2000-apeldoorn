'use strict';
// A-Alerts is Dutch only: every locale key in nl.json must exist in en.json (Homey's required fallback) and back,
// and every Flow card / manifest text must have an nl and an en value.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const nl = new Set(flat(require(path.join(root, 'locales/nl.json'))));
const en = new Set(flat(require(path.join(root, 'locales/en.json'))));
let fail = 0;
for (const k of nl) if (!en.has(k)) { console.error('en mist', k); fail++; }
for (const k of en) if (!nl.has(k)) { console.error('nl mist', k); fail++; }
const check = (obj, where) => {
  if (Array.isArray(obj)) return obj.forEach((x, i) => check(x, `${where}[${i}]`));
  if (obj && typeof obj === 'object') {
    if ('nl' in obj || 'en' in obj) { if (!obj.nl || !obj.en) { console.error('taal mist', where); fail++; } return; }
    for (const [k, v] of Object.entries(obj)) check(v, `${where}.${k}`);
  }
};
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
for (const f of [...walk(path.join(root, '.homeycompose')), path.join(root, 'widgets/meldingen/widget.compose.json')].filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const key of ['name', 'description', 'title', 'titleFormatted', 'hint', 'label', 'placeholder', 'tags']) {
    const walkKey = (o, w) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === key) check(v, `${w}.${k}`); else walkKey(v, `${w}.${k}`); } };
    walkKey(j, path.relative(root, f));
  }
}
if (fail) { console.error(`${fail} problemen`); process.exit(1); }
console.log('Talen compleet (nl, met en als verplichte reserve).');
