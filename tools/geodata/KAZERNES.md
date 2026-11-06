# Kazernes en posten (A-Alerts, fase 8)

`Shared/Kazernes.json` is gemaakt uit `kazernes-osm.json` (OpenStreetMap via Overpass, © OpenStreetMap contributors, ODbL),
opgehaald met `fetch_kazernes.sh` in GitHub Actions.

Selectie: brandweerkazernes, ambulanceposten en politiebureaus/-posten binnen 22 km van Apeldoorn,
zonder bedrijfsbrandweer, Defensie, Marechaussee en Rode Kruis. Aliassen (alleen brandweer) zijn de
plaatsnaam van de kazerne; als die in de oproep staat, gebruikt de app die kazerne voor de schatting.

De aanrijtijd in de app is altijd een schatting (rijtijd over de weg via Apple Kaarten, of 1,3 × hemelsbreed bij 50 km/u).
