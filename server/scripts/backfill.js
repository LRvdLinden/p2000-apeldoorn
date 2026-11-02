// One-off import of the existing history from p2000-apeldoorn.nl (Base44), so statistics
// and the timeline start complete. After this the app/server no longer need the website.
//
//   DATA_DIR=./data node scripts/backfill.js            (default: last 5000 alerts)
//   BACKFILL_LIMIT=20000 node scripts/backfill.js
import { insertMelding } from "../src/db.js";

const BASE = "https://p2000-apeldoorn.nl/api/apps/69b6661a41c2b1b46f95682e/entities/P2000Melding";
const total = Number(process.env.BACKFILL_LIMIT || 5000);
const page = 500;
let imported = 0;

for (let skip = 0; skip < total; skip += page) {
  const url = `${BASE}?sort=-datum_tijd&limit=${page}&skip=${skip}`;
  const res = await fetch(url);
  if (!res.ok) { console.error("HTTP", res.status); break; }
  const rows = await res.json();
  if (!rows.length) break;
  for (const r of rows) {
    if (!r.guid || !r.datum_tijd) continue;
    const ok = insertMelding({
      guid: r.guid, title: r.title || r.description || "", full_melding: r.full_melding, dienst: r.dienst,
      prioriteit: r.prioriteit && r.prioriteit !== "onbekend" ? r.prioriteit : null,
      datum: Date.parse(r.datum_tijd), locatie: r.locatie, lat: r.lat, lon: r.lon, stad: r.stad, regio: r.regio,
      capcode: r.capcode, categorie: r.categorie, grip: r.grip, opschaling: r.opschaling,
      eenheden: r.eenheden, voertuigen: r.voertuigen, link: r.link,
    });
    if (ok) imported++;
  }
  console.log(`… ${skip + rows.length} gelezen, ${imported} nieuw`);
}
console.log(`Klaar: ${imported} meldingen geïmporteerd.`);
