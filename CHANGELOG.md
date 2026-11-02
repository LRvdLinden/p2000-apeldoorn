# Changelog

## Backend – Cloudflare Worker
- Geen eigen server meer: de API, de ingest van p2000.page en de pushmeldingen draaien als Cloudflare Worker met een D1-database (`worker/`).
- Cron elke minuut, feed 3× per minuut uitgelezen; pushes via een wachtrij binnen de limieten van het gratis plan.
- Deploy via de GitHub-workflow *Worker*; de secrets komen uit GitHub.

## 1.0.0 (build 4) – 2 november 2026
- Statistieken vergelijken nu **vandaag met gisteren**: totaal (ook "gisteren om deze tijd"), per discipline, per uur, per prioriteit en de meest voorkomende meldingen.
- De statistieken worden in de app berekend; er worden alleen meldingen van vandaag en gisteren bijgehouden (de server bewaart 3 dagen).
- De maand- en weekdagstatistieken en het endpoint `/v1/stats` zijn weg.
- Apple Watch: tellingen van vandaag met gisteren ernaast.

## 1.0.0 (build 2–3)
- De app werkt volledig los van de website, met een eigen server (p2000.page-feed, APNs-pushmeldingen).
- Echte pushmeldingen via APNs met filters en **Mijn buurt** (radius).
- Widgets voor iPhone, iPad, Mac en Apple Watch.
- Geopende meldingen worden grijs; de tijdlijn toont alleen de laatste 24 uur.
- Facebook is uit de app gehaald.

## 1.0.0 (build 1) – 2 november 2026
- Eerste versie van de officiële P2000 Apeldoorn-app voor iPhone, iPad, Mac en Apple Watch.
- De Pager-tijdlijn, de kaart met de markers van de website, statistieken en detailpagina's.
- Live-feed van p2000.page.
- Pushmeldingen met plaatsen, disciplines, prioriteit, stille modus en kritieke meldingen.
- Inloggen met Apple en iCloud-sync van instellingen en bewaarde meldingen.
- Animated splash, een welkomstscherm, app-vergrendeling met Face ID en een review-prompt op een rustig moment.
- Een meldingdetail zoals op de website: kaart met Look Around, METEO via WeatherKit en alleen Apple Kaarten.
- De kaart "Meer apps van de ontwikkelaar" in Instellingen, in het Nederlands en Engels.
