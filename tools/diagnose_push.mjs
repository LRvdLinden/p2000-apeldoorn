// Prints, without tokens or locations, why each device would or would not get a push for recent alerts,
// and asks the worker to send each device a test push (status + APNs reason only).
import { readFileSync } from "node:fs";
import { meldingWanted } from "../worker/src/profielen.js";
const J = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return []; } };
const devices = J("/tmp/devices.json"), prefsRows = J("/tmp/prefs.json"), meldingen = J("/tmp/meldingen.json");
const prefs = new Map(prefsRows.map((r) => [r.token, JSON.parse(r.data || "{}")]));
const arr = (v) => (Array.isArray(v) ? v : JSON.parse(v || "[]"));
console.log(`== ${devices.length} toestellen, ${meldingen.length} recente meldingen`);
for (const d of devices) {
  const dev = { ...d, plaatsen: arr(d.plaatsen), diensten: arr(d.diensten), prioriteiten: arr(d.prioriteiten) };
  const p = prefs.get(d.token);
  const prof = (p?.profielen || []).map((x) => ({ naam: x.naam, aan: x.aan ?? x.enabled, plaatsen: (x.plaatsen || []).length, diensten: x.diensten, prio: x.prioriteiten, tijd: x.tijd ?? x.van ?? null, dagen: x.dagen ?? null }));
  const hits = meldingen.map((m) => ({ ...m, eenheden: [], datum: Number(m.datum) })).filter((m) => meldingWanted(dev, p, m, new Date(m.datum)));
  const test = "niet opnieuw";
  console.log(JSON.stringify({ toestel: d.token.slice(0, 6) + "…", platform: d.platform, env: d.environment, versie: d.app_version, aan: d.enabled,
    plaatsen: dev.plaatsen.length, diensten: dev.diensten, prio: dev.prioriteiten, stil: d.quiet, radius: d.radius_km, bijgewerkt: new Date(d.updated_at).toISOString(),
    profielen: prof, zouKrijgen: `${hits.length}/${meldingen.length}`, testpush: test }));
}
