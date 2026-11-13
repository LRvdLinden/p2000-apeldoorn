#!/usr/bin/env python3
"""All Dutch places (woonplaatsen) with their centre, from the PDOK Locatieserver (open government data, CC0).
Result: worker/src/woonplaatsen.json as [[place, municipality, lat, lon], ...]. The worker uses it to say above which
place a helicopter or aircraft flies, without asking an outside service for every position."""
import json, re, time, urllib.parse, urllib.request, pathlib

BASE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"
UA = {"User-Agent": "A-Alerts/2.0 (+https://a-alerts.nl)", "Accept": "application/json"}

def haal(q, start, rows=100):
    url = BASE + "?" + urllib.parse.urlencode({"q": q, "fq": "type:woonplaats", "rows": rows, "start": start,
                                               "fl": "woonplaatsnaam,gemeentenaam,centroide_ll", "sort": "woonplaatsnaam asc"})
    for poging in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)["response"]
        except Exception as e:  # noqa: BLE001
            print("opnieuw", start, e); time.sleep(2 + poging * 3)
    raise SystemExit(f"PDOK geeft geen antwoord voor start={start}")

q = None
for kandidaat in ("*:*", "*", "type:woonplaats"):
    try:
        n = haal(kandidaat, 0, 1)["numFound"]
    except SystemExit:
        n = 0
    print("zoekvraag", kandidaat, "→", n)
    if n > 2000:
        q = kandidaat
        break
if not q:
    raise SystemExit("Geen zoekvraag gaf alle woonplaatsen")

out, start = {}, 0
while True:
    r = haal(q, start)
    for d in r["docs"]:
        m = re.match(r"POINT\(([-\d.]+) ([-\d.]+)\)", d.get("centroide_ll", ""))
        if not m or not d.get("woonplaatsnaam"):
            continue
        out[(d["woonplaatsnaam"], d.get("gemeentenaam", ""))] = [d["woonplaatsnaam"], d.get("gemeentenaam", ""), round(float(m.group(2)), 4), round(float(m.group(1)), 4)]
    start += len(r["docs"])
    if not r["docs"] or start >= r["numFound"]:
        break
    time.sleep(0.15)

lijst = sorted(out.values())
assert len(lijst) > 2000, len(lijst)
doel = pathlib.Path(__file__).resolve().parents[2] / "worker" / "src" / "woonplaatsen.json"
doel.write_text(json.dumps(lijst, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(len(lijst), "woonplaatsen →", doel, doel.stat().st_size // 1024, "KB")
