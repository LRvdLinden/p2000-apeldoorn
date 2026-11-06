#!/usr/bin/env bash
# One-off (GitHub Actions): adsb.lol samples for the helicopter types and OSM emergency stations around Apeldoorn.
set -u
cd "$(dirname "$0")/../.."
for t in EC35 EC45 A139 EC30 H160 A169; do
  curl -s -m 30 -A "A-Alerts/1.0 (+https://p2000-apeldoorn.nl)" "https://api.adsb.lol/v2/type/$t" -o "/tmp/type-$t.json" || true
  python3 - "$t" <<'PY'
import json,sys
t=sys.argv[1]
try: d=json.load(open(f"/tmp/type-{t}.json"))
except Exception as e: d={"error":str(e)}
ac=d.get("ac") or []
keep=[a for a in ac if (a.get("r") or "").startswith("PH-") or (a.get("flight") or "").strip().startswith(("LIFE","ZXP","PH"))]
json.dump({"type":t,"total":len(ac),"keys":sorted({k for a in ac for k in a})[:80],"nl":keep}, open(f"tools/samples/adsb-type-{t}.json","w"), indent=1)
PY
done
for cs in LIFELN1 LIFELN2 LIFELN3 LIFELN4 ZXP01 ZXP02 ZXP03 ZXP04 ZXP05 ZXP06 ZXP24 ZXP25 ZXP26; do
  curl -s -m 20 "https://api.adsb.lol/v2/callsign/$cs" | head -c 4000 > "tools/samples/adsb-cs-$cs.json" || true
done
for reg in PH-PXA PH-PXB PH-PXC PH-PXD PH-PXE PH-PXF PH-PXX PH-PXY PH-PXZ PH-MAA PH-HVB PH-ULP PH-DOC PH-EUH PH-TTR PH-MMT PH-LLN PH-LLA PH-LLB PH-LLC PH-LLD PH-LLE PH-LLF PH-LLG PH-LLH; do
  curl -s -m 20 "https://api.adsb.lol/v2/reg/$reg" | head -c 4000 > "/tmp/reg-$reg.json" || true
done
python3 - <<'PY'
import json,glob
out={}
for f in glob.glob("/tmp/reg-*.json"):
    try: out[f[9:-5]]=json.load(open(f))
    except Exception as e: out[f[9:-5]]=str(e)
json.dump(out,open("tools/samples/adsb-regs.json","w"),indent=1)
PY
Q='[out:json][timeout:60];(nwr["amenity"="fire_station"](51.95,5.55,52.45,6.35);nwr["emergency"="ambulance_station"](51.95,5.55,52.45,6.35);nwr["amenity"="police"](51.95,5.55,52.45,6.35););out center tags;'
for host in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter; do
  if curl -s -m 90 --data-urlencode "data=$Q" "$host" -o tools/geodata/kazernes-osm.json && python3 -c "import json;json.load(open('tools/geodata/kazernes-osm.json'))['elements']"; then break; fi
done
