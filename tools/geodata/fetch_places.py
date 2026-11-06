"""Looks up the coordinates of the A-Alerts places (gemeente Apeldoorn + Teuge).

Runs in GitHub Actions (open internet). Sources, in order:
1. PDOK Locatieserver (BAG woonplaatsen / CBS), for official woonplaatsen.
2. Dutch Wikipedia coordinates, for buurtschappen that are not a BAG woonplaats.
Writes tools/geodata/places.json; the app and the Worker read the result from Shared/Werkgebied.json.
"""
import json, urllib.parse, urllib.request

PLACES = [
    # name, kind, wikipedia candidates
    ("Apeldoorn", "woonplaats", ["Apeldoorn"]),
    ("Beekbergen", "woonplaats", ["Beekbergen"]),
    ("Beemte-Broekland", "woonplaats", ["Beemte-Broekland", "Beemte Broekland"]),
    ("Hoenderloo", "woonplaats", ["Hoenderloo"]),
    ("Hoog Soeren", "woonplaats", ["Hoog Soeren"]),
    ("Klarenbeek", "woonplaats", ["Klarenbeek"]),
    ("Loenen", "woonplaats", ["Loenen (Gelderland)", "Loenen (Apeldoorn)"]),
    ("Uddel", "woonplaats", ["Uddel"]),
    ("Ugchelen", "woonplaats", ["Ugchelen"]),
    ("Wenum-Wiesel", "woonplaats", ["Wenum-Wiesel", "Wenum Wiesel"]),
    ("Assel", "buurtschap", ["Assel (Apeldoorn)", "Assel"]),
    ("Engeland", "buurtschap", ["Engeland (Apeldoorn)", "Engeland (Gelderland)"]),
    ("Gerritsflesch", "buurtschap", ["Gerritsflesch"]),
    ("Groenendaal", "buurtschap", ["Groenendaal (Apeldoorn)", "Groenendaal (Gelderland)"]),
    ("De Haere", "buurtschap", ["De Haere", "De Haere (Apeldoorn)"]),
    ("Hoog Buurlo", "buurtschap", ["Hoog Buurlo"]),
    ("Hooilanden", "buurtschap", ["Hooilanden", "Hooilanden (Apeldoorn)"]),
    ("De Jonas", "buurtschap", ["De Jonas", "De Jonas (Apeldoorn)"]),
    ("De Krim", "buurtschap", ["De Krim (Apeldoorn)", "De Krim (Gelderland)", "De Krim (buurtschap)"]),
    ("Lieren", "woonplaats", ["Lieren"]),
    ("Meerveld", "buurtschap", ["Meerveld (Apeldoorn)", "Meerveld (Gelderland)", "Meerveld"]),
    ("Nieuw-Milligen", "buurtschap", ["Nieuw-Milligen", "Nieuw Milligen"]),
    ("Oosterhuizen", "buurtschap", ["Oosterhuizen (Apeldoorn)", "Oosterhuizen (Gelderland)", "Oosterhuizen"]),
    ("Radio Kootwijk", "woonplaats", ["Radio Kootwijk"]),
    ("Woeste Hoeve", "buurtschap", ["Woeste Hoeve (Apeldoorn)", "Woeste Hoeve (Gelderland)", "Woeste Hoeve"]),
    ("Teuge", "woonplaats", ["Teuge"]),
]
UA = {"User-Agent": "A-Alerts geodata script (github.com/LRvdLinden/p2000-apeldoorn)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read())


def pdok(name):
    q = urllib.parse.quote(name)
    try:
        d = get(f"https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q={q}&fq=type:woonplaats&rows=5&fl=weergavenaam,woonplaatsnaam,gemeentenaam,centroide_ll")
    except Exception as e:
        return None, f"pdok error {e}"
    for doc in d.get("response", {}).get("docs", []):
        if doc.get("woonplaatsnaam", "").replace(" ", "-").lower() == name.replace(" ", "-").lower() and doc.get("gemeentenaam") in ("Apeldoorn", "Voorst"):
            pt = doc["centroide_ll"].replace("POINT(", "").replace(")", "").split()
            return (float(pt[1]), float(pt[0])), f"PDOK woonplaats ({doc.get('gemeentenaam')})"
    return None, "pdok: not a woonplaats"


def wiki(titles):
    for t in titles:
        q = urllib.parse.quote(t)
        try:
            d = get(f"https://nl.wikipedia.org/w/api.php?action=query&prop=coordinates|extracts&exintro=1&explaintext=1&exsentences=2&format=json&redirects=1&titles={q}")
        except Exception as e:
            continue
        for page in d.get("query", {}).get("pages", {}).values():
            c = (page.get("coordinates") or [None])[0]
            if c:
                return (c["lat"], c["lon"]), f"Wikipedia: {page.get('title')}", page.get("extract", "")[:200]
    # Search: "<name> Apeldoorn", keep the first hit with coordinates whose intro mentions Apeldoorn.
    try:
        q = urllib.parse.quote(f"{titles[0].split(' (')[0]} buurtschap Apeldoorn")
        d = get(f"https://nl.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={q}&gsrlimit=8&prop=coordinates|extracts&exintro=1&explaintext=1&exsentences=2&format=json")
        pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
        for page in pages:
            c = (page.get("coordinates") or [None])[0]
            ex = page.get("extract", "")
            if c and "Apeldoorn" in ex and titles[0].split(" (")[0].split()[-1].lower() in page.get("title", "").lower():
                return (c["lat"], c["lon"]), f"Wikipedia (zoek): {page.get('title')}", ex[:200]
    except Exception:
        pass
    return None, "wikipedia: not found", ""


out = []
for name, kind, titles in PLACES:
    coord, src = pdok(name)
    extract = ""
    if not coord:
        coord, src, extract = wiki(titles)
    out.append({"naam": name, "soort": kind, "lat": coord[0] if coord else None, "lon": coord[1] if coord else None, "bron": src, "wiki": extract})
    print(name, coord, src)

json.dump(out, open("tools/geodata/places.json", "w"), ensure_ascii=False, indent=1)
# run 1793954643

# run 2
