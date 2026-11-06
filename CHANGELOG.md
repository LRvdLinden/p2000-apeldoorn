# Changelog

## A-Alerts 2.0.0 (build 20) – fase 9 en 10
- Versie 2.0.0 (hoger dan 1.0.1 in de App Store).
- Pushmeldingen met een kaartje van de plek (nieuwe push-extensie) en knoppen *Bewaar* en *Open in Apple Kaarten*; waarschuwingen met *Open in Apple Kaarten*.
- Migratiecontrole tegen 1.0.1: bundle-ID's, entitlements, App Group, URL-schema, widget-kinds en instellingen-sleutels ongewijzigd (docs/A-ALERTS-TEST.md).
- App Store-teksten en notities voor App Review voor A-Alerts 2.0.0 (appstore/A-Alerts-2.0.0).

## A-Alerts 1.0.0 (build 19)
- Detailpagina: de knoppen op de kaart en de Look Around-preview staan hoger, direct onder de statusbalk of de bovenrand van het venster.

## A-Alerts 1.0.0 (build 18)
- Terug naar het standaard Apple-lettertype (SF Pro) op alle platforms; Social Gothic en Poppins zijn verwijderd. Teksten schalen mee met de systeemtekstgrootte.

## A-Alerts 1.0.0 (build 17) – fase 4 t/m 8
- Mogelijk verband: op een melding zie je andere P2000-meldingen op hetzelfde adres of vlakbij, rond hetzelfde tijdstip of met dezelfde eenheid, met de reden erbij. Altijd als mogelijk verband, nooit als feit.
- Kaartlagen: P2000, NL-Alert, Burgernet, KNMI-gebieden, grens werkgebied, kazernes en posten, en live helikopters, elk aan of uit (gesynchroniseerd via iCloud).
- Helikopters: live posities van Lifeliner 1–4 en Zulu 01–06 en 24–26 (adsb.lol, open data) met koers, hoogte en snelheid. Ook op de Apple TV-kaart.
- Notificatieprofielen: tot 5 profielen met eigen plaatsen, disciplines, prioriteiten, waarschuwingen en tijden. Je bestaande keuzes zijn automatisch profiel 'Standaard'.
- Kazernes en aanrijtijden: brandweerkazernes, ambulanceposten en politieposten rond Apeldoorn (OpenStreetMap) op de kaart, en per melding een geschatte aanrijtijd vanaf de genoemde of dichtstbijzijnde kazerne. Altijd een schatting.
- p2000.page wordt alleen nog onderaan Instellingen genoemd.

## A-Alerts 1.0.0 (build 16)
- Nieuwe typografie: alle titels in Social Gothic, overige tekst in Poppins (Light voor lopende tekst), op iPhone, iPad, Mac, Apple TV, Apple Watch en in de widgets. Navigatietitels, tabbalk en segmentknoppen gebruiken dezelfde fonts. Teksten schalen mee met de systeemtekstgrootte.

## A-Alerts 1.0.0 (build 15)
- NL-Alert en Burgernet gebruiken nu je eigen artwork: in de pager de gele driehoek en het Burgernet-huisje, op de kaart de zwarte NL-Alert-marker en de blauwe Burgernet-marker.

## A-Alerts 1.0.0 (build 14) – testbuild fase 3
- NL-Alert en Burgernet staan nu in de pager tussen de P2000-meldingen, met eigen kleur, icoon en status (actief/beëindigd).
- KNMI-weerwaarschuwingen (code geel, oranje, rood) verschijnen als gekleurde balk bovenaan de pager zolang ze gelden.
- Detailpagina per waarschuwing: gebied op de kaart, oorspronkelijke tekst (met Engelse vertaling bij NL-Alert), tijden, officiële bron en de P2000-meldingen in het gebied rond dat tijdstip (als mogelijk verband).
- Bij een P2000-melding zie je welke waarschuwing in dat gebied gold.
- Filters voor NL-Alert, Burgernet en de KNMI-codes; pushmeldingen per bron en per KNMI-code (Instellingen › Notificaties › Waarschuwingen).
- Het pagerlogo is nu het echte A-Alerts-icoon.

## A-Alerts 1.0.0 (build 13) – testbuild fase 2
- Nieuwe naam: P2000 Apeldoorn heet nu A-Alerts. Bundle ID's, app-groep, iCloud en push blijven hetzelfde, dus het is een gewone update.
- Alle appiconen (iPhone/iPad licht, donker en getint, Mac en Apple Watch) zijn gemaakt uit de lagen van het Apple TV-icoon.
- 26 plaatsen: de gemeente Apeldoorn met haar dorpen en buurtschappen, plus Teuge. Buurtschappen herkent de app aan de straat van de melding. Bestaande plaatskeuzes blijven staan.
- Privacy-manifest en Engelse vertaling van de toestemmingsteksten toegevoegd.

## 1.0.1 (build 12) – 3 november 2026
- METEO-gegevens: de app haalt het weer nu via de eigen API op, net als de website en Apple TV. WeatherKit in de app is alleen nog reserve. Daardoor staat het weer weer bij elke melding en is het overal hetzelfde.

## 1.0.1 (build 11) – 2 november 2026
- Nieuw: alarmgeluid als de app open is (iPhone, iPad, Mac en Apple TV), standaard aan. In Instellingen zet je het uit of kies je "Alleen spoed (A1, P1)", met een knop om het geluid te testen.
  - Eigen pagertonen: een korte toon bij een gewone melding, een langere bij spoed.
  - Volgt je filters en de stille modus; op iPhone ook de stilschakelaar. Komt er tegelijk een pushmelding binnen, dan klinkt het geluid maar één keer.

## 1.0.1 (build 10) – 2 november 2026
- Kaart: meldingen zonder straatnaam (vaak ambulance, alleen "Apeldoorn") staan niet meer als grote ring van pins op het centrum. Ze worden per plaats samengevoegd tot één gewone marker met rechtsboven een zwart bolletje met het aantal; tik erop voor de lijst.
- Apple TV: dezelfde plaatsmarkers; de rondleiding gaat per plaats maar één keer naar het centrum en zoomt daar verder uit.
- Website: live pager-kaart en de nieuwe meldkamer (/meldkamer/) gebruiken dezelfde plaatsmarkers.

## 1.0.0 (build 5) – 2 november 2026
- De app, de widgets en de website gebruiken de nieuwe API op Cloudflare (`p2000-apeldoorn-api.lrvdlinden.workers.dev`).

## 1.0.0 (build 9) – 2 november 2026
- Apple Watch: de app crashte direct na het openen (twee navigatiebalken in de paginaweergave). Opgelost.
- Apple TV: kleinere, rustigere letters; de klok en de titel passen weer op één regel.
- Apple TV: de markers op de kaart zijn weer zichtbaar.

## 1.0.0 (build 8) – 2 november 2026
- **Nieuw: Apple TV.** Een meldkamerscherm met de live kaart, de laatste meldingen, de tellingen van vandaag en een grote klok.
  - Een nieuwe melding verschijnt groot in beeld met een alarmscherm (instelbaar: altijd of alleen bij spoed, 10–60 seconden).
  - De kaart gaat zelf langs de laatste meldingen; het scherm blijft aan.
  - Detail met 3D-kaart, capcodes, voertuigen en het weer; statistieken vandaag tegenover gisteren.
  - Dezelfde animated splash, en je filters via iCloud.
- Het LIVE-label op de kaarten in de tijdlijn is weg.
- De app meldt anoniem of je met Apple bent ingelogd en of pushmeldingen aan staan (voor P2000Beheer).

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
