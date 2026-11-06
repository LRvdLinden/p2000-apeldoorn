# Geodata voor A-Alerts

`Shared/Werkgebied.json` en `worker/src/werkgebied.json` zijn hetzelfde bestand. De app en de Worker bepalen er allebei mee welke plaats bij een melding hoort, en of een waarschuwing of helikopter in het werkgebied valt.

| Onderdeel | Bron |
|---|---|
| Gemeentegrens Apeldoorn (GM0200) | CBS/PDOK gebiedsindelingen 2025, vereenvoudigd (cartomap/nl, `wgs84/gemeente_2025.geojson`). Punten tot 0,5 km buiten de grens tellen mee. |
| Woonplaatsen (Apeldoorn, Beekbergen, … en Teuge) | PDOK Locatieserver, BAG-woonplaats centroïde (`fetch_places.py` → `places.json`) |
| Assel, Engeland, Gerritsflesch, Groenendaal, De Haere, Hoog Buurlo | Wikipedia-coördinaten, straal 0,8–1,2 km |
| Hooilanden, Meerveld, Nieuw-Milligen, Oosterhuizen | CBS-buurtgebieden (BU02001603/1604, BU02001003, BU02001004, BU02001502/1503) |
| De Jonas | Wikipedia (en) "Jonas, Netherlands", straal 1 km (ligt op de grens met Epe) |
| De Krim | De Krim, Hoenderloo (postcode.site), straal 1 km |
| Woeste Hoeve | aroundus.com, straal 1 km |
| Teuge (gemeente Voorst) | BAG-woonplaats, straal 2 km |

Buurtschappen worden door P2000 nooit als plaatsnaam doorgegeven. Een melding hoort er alleen bij als er een straat bij staat en die locatie binnen het gebied of de straal valt.
