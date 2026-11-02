// One-off import of the existing history from p2000-apeldoorn.nl, so the timeline and the
// statistics start complete. After the import the server and app no longer need the website.
import { db, insertMelding } from "./db.js";

const BASE = "https://p2000-apeldoorn.nl/api/apps/69b6661a41c2b1b46f95682e/entities/P2000Melding";

export const meldingCount = () => db.prepare("SELECT COUNT(*) AS n FROM meldingen").get().n;

export async function backfill(total = 5000) {
  const page = 500;
  let imported = 0;
  for (let skip = 0; skip < total; skip += page) {
    const res = await fetch(`${BASE}?sort=-datum_tijd&limit=${page}&skip=${skip}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    console.log(`[backfill] ${skip + rows.length} gelezen, ${imported} nieuw`);
    if (rows.length < page) break;
  }
  return imported;
}
