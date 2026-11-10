// Prototype: NDW actueel_beeld + srti -> small list for the region Apeldoorn.
import { readFileSync } from "node:fs";
const BOX = { s: 51.95, n: 52.45, w: 5.55, e: 6.40 };
const tag = (s, t) => { const m = s.match(new RegExp(`<[a-z]+:${t}[^>]*>([^<]*)<`)); return m ? m[1] : null; };
export function parse(xml) {
  const out = [];
  const parts = xml.split("<sit:situationRecord ");
  for (let i = 1; i < parts.length; i++) {
    const r = parts[i];
    const pos = r.match(/<loc:posList>([^<]+)</) || r.match(/<loc:latitude>([\d.]+)<\/loc:latitude>\s*<loc:longitude>([\d.]+)</);
    let pts;
    if (pos && pos[2]) pts = [[+pos[1], +pos[2]]];
    else if (pos) { const n = pos[1].trim().split(/\s+/).map(Number); pts = []; for (let j = 0; j + 1 < n.length; j += 2) pts.push([n[j], n[j + 1]]); }
    else continue;
    if (!pts.some(([la, lo]) => la > BOX.s && la < BOX.n && lo > BOX.w && lo < BOX.e)) continue;
    const type = (r.match(/xsi:type="sit:([A-Za-z]+)"/) || [])[1];
    out.push({ id: (r.match(/id="([^"]+)"/) || [])[1], type, pts, delay: tag(r, "delayTimeValue"), cause: tag(r, "value lang=\"nl\"") || tag(r, "causeType"),
      mgmt: tag(r, "roadOrCarriagewayOrLaneManagementType"), obstr: tag(r, "vehicleObstructionType"), start: tag(r, "overallStartTime"), road: tag(r, "roadNumber") });
  }
  return out;
}
const f = process.argv[2]; const xml = readFileSync(f, "utf8");
const t = process.hrtime.bigint(); const r = parse(xml); const ms = Number(process.hrtime.bigint() - t) / 1e6;
console.log(f, "records", r.length, "ms", ms.toFixed(1)); console.log(JSON.stringify(r.slice(0, 6)).slice(0, 1500));
