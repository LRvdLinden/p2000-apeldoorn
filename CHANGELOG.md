# Changelog

## A-Alerts 2.0.1 (build 86)
- Een melding met alleen een straatnaam (zonder huisnummer) staat nu op het midden van die straat volgens het wegenbestand (PDOK), in plaats van bij een willekeurig huis ernaast. Voorbeeld: Kanaal Noord in Apeldoorn. Meldingen van de laatste zes uur worden rechtgezet.
- "Eenheden bij deze inzet": een Lifeliner of Zulu staat er met de tekening van de helikopter en is aan te tikken; je gaat dan naar de kaart en volgt dat toestel. App, Android en pager.

## A-Alerts 2.0.1 (build 85)
- Helikopter- en vliegtuigkaart: "Nu boven <plaats>" (dichtstbijzijnde Nederlandse woonplaats uit een vaste lijst van 2503 plaatsen in de worker, PDOK; boven zee of over de grens als er binnen 7 km geen plaats ligt), "25 min in de lucht", en de vlucht als lijst van plaatsen met de tijd (één regel per plaats, nieuwste bovenaan; korte uitstapjes en korte stukken boven zee vallen weg). Hoogte in meters én voet, snelheid in km/u én knopen, kompasje bij de koers. App, Android en pager.
- Bel per toestel (app en Android): een pushmelding zodra dat toestel opstijgt, waar het ook is (`settings.heli.volg`, hooguit 40 toestellen).
- "Eenheden bij deze inzet": alle eenheden uit de meldingen die bij dezelfde inzet horen (zelfde adres, of vlakbij met dezelfde eenheid), met de tijd van alarmering. App, Android en pager.
- Gebouwgegevens bij een brandmelding met huisnummer: bouwjaar, gebruik en aantal adressen uit de BAG (Kadaster, via PDOK), `GET /v1/meldingen/<guid>/pand`, één keer opgezocht per melding.
- Kaartlagen per categorie (meldingen en alerts, lucht, verkeer, posten en ziekenhuizen, kaart) in de app, Apple TV, Android, pager en meldkamer. De laag "Kazernes en posten" noemt nu ook ambulanceposten en politiebureaus (die stonden er al in).

## A-Alerts 2.0.1 (build 84)
- Laag Luchtvaart: bij Defensie alleen Nederlandse militaire toestellen (toesteladres 480000–487FFF); buitenlandse toestellen en "Kustwacht overig" zijn vervallen.
- De toevoeging "(voorheen P2000 Apeldoorn)" is overal weg: website, juridische teksten, README.

## A-Alerts 2.0.1 (build 83)
- Eén kaartlaag "Luchtvaart" in plaats van "Helikopters" en "Defensie en overheid". Bij Kaartlagen kies je per soort toestel of je het ziet (16 soorten, met tekening en het aantal in de lucht); standaard Lifeliner en Zulu. App, Apple TV, Android, pager en meldkamer.
- Routespoor en vluchten van de laatste twee uur voor alle toestellen in de laag, niet alleen Lifeliner en Zulu (worker bewaart per toestel hooguit één positie per 30 seconden).
- Koninklijke Marechaussee herkend op registratie (D-IAMT, D-IBMT); militaire toestellen zonder eigen tekening krijgen een leesbare naam (Global 5000, A330 tanker, Eurofighter …) of, als er geen type bekend is, hun roepnaam.
- Website: a-alerts.nl/luchtvaart heeft een eigen deelafbeelding (og/luchtvaart.jpg), volledige meta-tags en gestructureerde gegevens.

## Website (12 november 2026)
- Nieuwe pagina a-alerts.nl/luchtvaart: alle 17 toestellen met tekening en uitleg, een vliegende lucht met draaiende rotors en een live teller.
- Homepage: blok "Zie wat er boven je vliegt" met een bewegende kaart en een knop naar de uitleg. Beide gemaakt door `tools/maak_luchtvaart.py` (tekeningen in `tools/lucht/`).

## A-Alerts 2.0.1 (build 82)
- Kaart: een pill met 0 is verborgen en komt terug zodra er iets is (app, Android, pager en meldkamer).
- Website: de balk met kaartlagen in de pager en de meldkamer klapt open en dicht met de knop "Lagen" in de bovenste balk.

## A-Alerts 2.0.1 (build 81)
- Nieuwe kaartlaag "Defensie en overheid" (standaard uit) in de app, Apple TV, Android, de pager en de meldkamer: Defensie, Kustwacht, Koninklijke Marechaussee en PH-GOV met veertien eigen tekeningen. Bron adsb.lol (`/v1/lucht`); herkenning op het vaste toesteladres en het type, de roepnaam is alleen een label. Pill "Defensie" zodra de laag aan staat en er iets vliegt.

## A-Alerts 2.0.1 (build 80)
- Hectometerpaal: een melding met bijvoorbeeld "A50 Re 211,2" in de titel staat op die paal op de kaart (PDOK), en bij de locatie staat het groene hectometerbordje (app, Android en website).
- Kaart: meerdere meldingen op één adres staan samen op één marker met het aantal erboven; traumahelikopter bovenop, anders politie, anders de dienst met de meeste meldingen.

## A-Alerts 2.0.0 (build 33)
- Instellingen: 'Verstuur feedback' (mail) is weg.
- Gebruiksvoorwaarden, privacyverklaring en disclaimer komen als A-Alerts-teksten van de server zodra de nieuwe worker live staat.

## A-Alerts 2.0.0 (build 32)
- Fix: tikken op een pushmelding liet de app soms crashen; de app opent nu direct de melding (of de waarschuwing), ook als hij nog niet draaide.
- Apple TV gelijk aan de app (behalve pushmeldingen): tabblad Waarschuwingen (14 dagen), kaartlagen in Instellingen (meldingen, NL-Alert, Burgernet, KNMI-gebieden, grens werkgebied, kazernes, helikopters), helikopters in de lucht met hoogte, snelheid en koers, kazernes met lijn naar de melding op de kaart, en bij een waarschuwing het weer en de meldingen in de buurt.
- Website gelijk aan de app: Alle waarschuwingen (14 dagen), kaartlaag Grens werkgebied, infokaart bij een helikopter, echte autoroutes van de kazernes met aankomsttijd, Look Around bij Burgernet.

## A-Alerts 2.0.0 (build 31)
- NL-Alert, Burgernet en KNMI: METEO-gegevens op de detailpagina komen nu van onze server (dezelfde WeatherKit-bron als bij een melding), met WeatherKit in de app als reserve. Ook op de website.

## A-Alerts 2.0.0 (build 30)
- NL-Alert, Burgernet en KNMI hebben nu dezelfde detailpagina als een P2000-melding: grote kaart met marker (en gebied), glazen balk met delen, Look Around bij Burgernet, knoppen voor locatie, 3D en grote kaart, hoofdkaart met plaats, status, tijd en afstand, het bericht, METEO-gegevens van dat moment, meldingen in de buurt en de gegevens.
- Een afgelopen NL-Alert of Burgernet-actie wordt in de pager grijs, net als een melding die je al hebt bekeken (ook op de website en Apple TV).
- Website: nieuwe icoonbestanden en favicon.ico, zodat nergens meer het oude icoon uit de cache verschijnt.

## A-Alerts 2.0.0 (build 29)
- Meldingdetail rustiger: kleinere titel en regels, kleinere kopjes bij kazernes, verloop en de sheets voor route en delen.

## A-Alerts 2.0.0 (build 28)
- NL-Alert-icoon en -kaartmarker op basis van het echte NL-Alert-logo; KNMI heeft een eigen icoon (zon en wolk op blauw).
- Pager: NL-Alert en Burgernet tonen de tijd van de melding (met eindtijd als hij is afgelopen) in plaats van 'x minuten geleden'.
- Welkomstscherm: twee nieuwe pagina's, over NL-Alert, Burgernet en KNMI, en over Lifeliners, Zulu's, kazernes en kaartlagen.
- Statistieken: nieuwe kaart Waarschuwingen met NL-Alert, Burgernet en KNMI (vandaag, gisteren, 7 dagen, nu actief).
- Apple TV: NL-Alert en Burgernet in de meldkamerlijst en op de kaart, KNMI als balk, detail van een waarschuwing, gealarmeerde kazernes met geschatte aankomst en het verloop bij een melding, en waarschuwingen in de statistieken.

## A-Alerts 2.0.0 (build 27)
- Route naar incident: de echte app-iconen van Apple Kaarten en Google Maps (uit de assets routeapp_applemaps en routeapp_googlemaps; zonder die afbeeldingen een symbool).

## A-Alerts 2.0.0 (build 26)
- Meldingdetail: de kaart is vierkanter, en de balk en kaartknoppen staan weer onder de statusbalk (op sommige iPhones zaten ze erachter en waren ze niet te bedienen).

## A-Alerts 2.0.0 (build 25) – nieuwe naam overal
- Alle links in de app gaan naar a-alerts.nl: gedeelde meldingen (a-alerts.nl/melding/…), de website in Instellingen en op Apple TV, en de feedbackmail.
- Privacyverklaring, cookies, gebruiksvoorwaarden, disclaimer en Wat is nieuw opnieuw geschreven voor A-Alerts.
- De API blijft op hetzelfde adres; er hoeft niets te verhuizen.

## A-Alerts 2.0.0 (build 24)
- Helikopters op de kaart als zijaanzicht per type: Lifeliner (EC135, geel), politie EC135 (Zulu 01–06) en politie AW139 (Zulu 24–26). De tekening draait mee met de vliegrichting (naar het westen: neus naar links).

## A-Alerts 2.0.0 (build 23)
- Mac: de push-extensie heeft nu App Sandbox (vereist voor de Mac App Store; gaf een fout bij het archiveren).

## A-Alerts 2.0.0 (build 22)
- Gealarmeerde kazernes op de melding: alle kazernes uit de oproep, met afstand, rijtijd en een geschatte status (onderweg met tijd, of ter plaatse); hun routes als stippellijn op de kaart. Altijd een schatting, zonder voertuigposities.
- Instellingen › Waarschuwingen: pushmeldingen voor NL-Alert, Burgernet en KNMI (vanaf welke code) voor al je profielen tegelijk.
- Alle waarschuwingen: NL-Alert, Burgernet en KNMI van de laatste twee weken, per dag, met status en tijd.
- Pushmeldingen voor waarschuwingen volgen nu ook Mijn buurt: alleen als het gebied (of de Burgernet-locatie) binnen je straal valt, net als de lijst in de app.

## A-Alerts 2.0.0 (build 21)
- Detailpagina vernieuwd: glazen balk bovenaan met terug, plaats en straat, en knoppen voor route, bewaren en delen.
- Kaart met knoppen voor je eigen locatie (melding en jij samen in beeld), 3D en een grote kaart met een balk onderin om terug te gaan.
- Verloop: meldingen die mogelijk bij dezelfde inzet horen als tijdlijn met tijd, minuten erna en 'Deze melding'.
- Route naar incident: afstand en rijtijd, Apple Kaarten, Google Maps of adres kopiëren.
- Melding delen: voorbeeld, Deel via…, link kopiëren of de melding met link kopiëren (link naar p2000-apeldoorn.nl).

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
