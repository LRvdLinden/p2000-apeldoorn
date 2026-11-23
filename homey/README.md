# A-Alerts voor Homey (app.lrvdlinden.aalerts)

Ontwikkelaarsnotities. De app is alleen Nederlandstalig (`en` bevat dezelfde Nederlandse tekst, omdat Homey een Engelse waarde verplicht).

## Starten
1. `cp env.json.example env.json` en vul `WEBHOOK_ID` en `WEBHOOK_SECRET` in (zie hieronder). `env.json` gaat nooit in git of in een zip.
2. `npm install -g homey` en `homey app run` op je Homey Pro.

## Webhook (directe meldingen)
1. Ga naar https://tools.developer.homey.app/webhooks en maak een webhook.
2. Kies als routing een key path: `body.channel` (de A-Alerts-server stuurt `"channel": "aalerts"`).
3. Zet het ID en de secret in `env.json` van deze app.
4. Zet het webhook-ID als GitHub-secret `HOMEY_WEBHOOK_ID` in `LRvdLinden/p2000-apeldoorn` en deploy de worker.

Zonder webhook werkt de app ook: hij controleert dan elke 30 seconden zelf de A-Alerts-API.

## Contact meldkamer en testoproepen (0.1.18)
In de app-instellingen staan twee schakelaars onder "Meldingen naar je Flows": "Graag contact meldkamer/OC" doorsturen en
testoproepen doorsturen. Aan (standaard) = zo'n melding start de Flows met alle tokens, net als elke melding. Uit = de
melding start geen enkele Flow; de reden staat bij "Gefilterd" in de instellingen. Herkenning: dezelfde regels als de
apps, de website en api.a-alerts.nl (`lib/format.js`: `isContactMeldkamer`, `isTestOproep`).

## Flow-kaarten aanpassen
`python3 scripts/gen_flow.py` maakt alle kaarten in `.homeycompose/flow/`. Controle: `node scripts/check_i18n.js`.
