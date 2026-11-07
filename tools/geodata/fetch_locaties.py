"""Hospitals with a helipad and helicopter bases in the Netherlands, for the A-Alerts map and the
prediction of where a trauma helicopter is heading.

Runs in GitHub Actions (open internet). Source: OpenStreetMap via the Overpass API (ODbL).
Writes worker/src/locaties.json; the Worker serves it at /v1/locaties to every app.
"""
import json, math, urllib.parse, urllib.request

QUERY = """[out:json][timeout:180];
area["ISO3166-1"="NL"][admin_level=2]->.nl;
(nwr["amenity"="hospital"](area.nl););out center tags;
(nwr["aeroway"="helipad"](area.nl););out center tags;"""

# Level-1 trauma centres (they get most Lifeliner patients).
TRAUMA = ["amsterdam umc", "amc", "vumc", "vu medisch", "academisch medisch", "umcg", "universitair medisch centrum groningen",
          "radboud", "umc utrecht", "universitair medisch centrum utrecht", "erasmus", "lumc", "leids universitair",
          "maastricht umc", "azm", "isala", "medisch spectrum twente", "mst", "elisabeth-tweesteden", "etz", "haaglanden"]

# Helicopter bases (fixed; airports are well known).
BASES = [
    {"id": "basis-ll1", "naam": "Lifeliner 1 · Amsterdam UMC (VUmc)", "lat": 52.3343, "lon": 4.8597, "heli": ["lifeliner1"]},
    {"id": "basis-ll2", "naam": "Lifeliner 2 · Rotterdam The Hague Airport", "lat": 51.9569, "lon": 4.4372, "heli": ["lifeliner2"]},
    {"id": "basis-ll3", "naam": "Lifeliner 3 · Vliegbasis Volkel", "lat": 51.6564, "lon": 5.7086, "heli": ["lifeliner3"]},
    {"id": "basis-ll4", "naam": "Lifeliner 4 · Groningen Airport Eelde", "lat": 53.1197, "lon": 6.5794, "heli": ["lifeliner4"]},
    {"id": "basis-politie", "naam": "Politie Luchtvaart · Schiphol-Oost", "lat": 52.3103, "lon": 4.7836, "heli": ["zulu"]},
    {"id": "basis-teuge", "naam": "Vliegveld Teuge", "lat": 52.2447, "lon": 6.0467, "heli": []},
    {"id": "basis-deelen", "naam": "Vliegbasis Deelen", "lat": 52.0606, "lon": 5.8731, "heli": []},
]


def km(a, b):
    r = math.pi / 180
    s = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(s), math.sqrt(1 - s))


def pos(e):
    if "lat" in e:
        return (e["lat"], e["lon"])
    c = e.get("center")
    return (c["lat"], c["lon"]) if c else None


req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": QUERY}).encode(),
                             headers={"user-agent": "A-Alerts geodata (+https://a-alerts.nl)"})
els = json.load(urllib.request.urlopen(req, timeout=240))["elements"]
hospitals = [e for e in els if e.get("tags", {}).get("amenity") == "hospital" and pos(e) and e["tags"].get("name")]
pads = [pos(e) for e in els if e.get("tags", {}).get("aeroway") == "helipad" and pos(e)]

out, seen = [], set()
for h in hospitals:
    p = pos(h)
    name = h["tags"]["name"].strip()
    pad = min(pads, key=lambda q: km(p, q), default=None)
    if not pad or km(p, pad) > 0.6:
        continue
    key = name.lower()
    if key in seen or any(km(p, (o["lat"], o["lon"])) < 0.4 for o in out):
        continue
    seen.add(key)
    low = name.lower()
    out.append({"id": f"zh-{h['type'][0]}{h['id']}", "naam": name, "lat": round(pad[0], 5), "lon": round(pad[1], 5),
                "plaats": h["tags"].get("addr:city"), "trauma": any(t in low for t in TRAUMA)})

out.sort(key=lambda o: o["naam"])
data = {"bron": "OpenStreetMap (ODbL)", "ziekenhuizen": out, "bases": BASES}
json.dump(data, open("worker/src/locaties.json", "w"), ensure_ascii=False, indent=1)
print(len(out), "ziekenhuizen met helipad;", sum(o["trauma"] for o in out), "traumacentra")
