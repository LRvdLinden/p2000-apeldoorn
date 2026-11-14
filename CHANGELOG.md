# Changelog

## A-Alerts 2.0.1 (build 98)
- **Nieuwe tekening van het regeringstoestel PH-GOV** naar de echte beschildering: zilvergrijze neus, oranje zwaai, donkerblauwe staart en achterbuik, oranje winglet. App, Android, de kaart op de website, de homepage en de luchtvaartpagina (`tools/lucht/phgov.svg`; op de website als `lucht_phgov2.png`, omdat afbeeldingen 30 dagen in de cache blijven). Zonder rijkswapen, tekst en registratie.
- **Kaart "Meer apps van de ontwikkelaar"** in Instellingen: de regel `lrvdlinden.app` onder de knop is weg (app); op Android heet de knop nu "Bekijk".
- **Kustwachtvliegtuig niet op de kaart:** de bron geeft de Dash 8 met toestelcode `c005e9` nog onder zijn eerdere Canadese registratie (`C-FCGE`), waardoor de Nederlandse registratie nooit paste. De server zet die om naar `PH-CGE` en herkent de Kustwacht nu ook aan de roepnaam `NCG…`. Alleen de server.
- De server van build 97 (Medic 01) was niet uitgerold omdat een oude test faalde; die gaat met deze build mee.

## A-Alerts 2.0.1 (build 97)
- **Medic 01** (ambulancehelikopter voor de Waddeneilanden; roepnaam `MEDIC01`, registratie `PH-OOP`, basis Leeuwarden) staat op de kaart als "Medic 01 · Ambulancehelikopter", met de tekening van de Lifeliner, het spoor, de vluchten en de bel. De server geeft `medic: true` mee; voor oudere app-versies blijft `soort` "trauma", zodat de tekening en de kaartlaag blijven werken (daar heet hij "Traumahelikopter"). Hij telt nergens als Lifeliner: niet bij "opgestegen voor de melding", niet bij de bestemming, niet bij "waarschijnlijk geannuleerd" en niet als dichtstbijzijnde traumaheli bij een melding (server, app, Android en pager).
- Homepage en luchtvaartpagina: Medic 01 toegevoegd. `tools/maak_luchtvaart.py` kon niet meer draaien door het versienummer achter een afbeelding; hersteld.

## A-Alerts 2.0.1 (build 96)
- **Kaartje van een toestel opent klein** (app, Android en pager): naam, boven welke plaats, hoe lang in de lucht en één regel met koers, hoogte en snelheid. "Meer over deze vlucht" (in de app ook omhoog vegen) vouwt de rest uit: de drie vakken, het spoor, terugspelen, waar geweest, de vluchten en "Klopt dit toestel niet?". Zo blijven het toestel en zijn vliegspoor in beeld. De bel is ongewijzigd.
- **Naam onder een toestel alleen nog bij het gekozen toestel** op de kaart (app, Android en pager). De meldkamer, de widget en de kaart bij een melding tonen de naam nog wel.

## A-Alerts 2.0.1 (build 95)
- **Tekening van de politiehelikopter AW139 (Zulu 24, 25, 26) hersteld.** In het bestand stond een deel van de onderdelen verschoven (hoofdrotor, achterwiel, lichtblauwe lijn, staartlicht, ruit op de neus) en het kader sneed de staartrotor, de buik en de wielen af. De tekening zelf is niet veranderd. App, Android en website (kaart, pager, meldkamer).

## A-Alerts 2.0.1 (build 94)
- **Verloop: de nieuwste melding staat bovenaan** (app, Android en pager); de regel "Opgeschaald naar …" staat nog steeds bij de melding waarmee de inzet groter werd.
- Ambulance zonder adres bij een verkeersongeval: het venster is 5 minuten (was 15).
- Die ambulance staat op de kaart nu op het adres van het ongeval (straat en plek overgenomen van de eerste melding met een adres), ook als de ambulance als eerste binnenkwam. Alleen de server; geen nieuwe build nodig.

## A-Alerts 2.0.1 (build 93)
Alles wat vliegt. Server: `worker/src/vliegend.js`.
- **Waar een toestel op de grond staat:** ziekenhuis, basis of op locatie (`plek`, `plek_soort` in `GET /v1/helikopters` en `/v1/lucht`); de pushmelding bij landen zegt "Bij Radboudumc", "Terug op de basis: …" of "Op locatie in …".
- **Meerdere helikopters op één plek** (binnen 1,5 km, op de grond of laag en langzaam, geen ziekenhuis of basis): `samen` bij het toestel en een pushmelding voor wie een van die toestellen volgt of er een zone omheen heeft (`heli.meerdere`, standaard aan).
- **Roepnaam gewijzigd:** pushmelding bij een gevolgd toestel (`heli.volg_roepnaam`, standaard aan).
- **Status per toestel:** `GET /v1/helikopters/status` (in de lucht, op de basis, op de grond, uit beeld; één kv-rij, hooguit één keer per minuut geschreven). In de app en op Android bij Instellingen › Helikopters onder de bel.
- **Weer:** dezelfde aanroep geeft `weer` als er een KNMI-code geldt voor mist, harde wind, onweer, sneeuw of ijzel; het kaartje van een toestel meldt dan dat er weinig inzet te verwachten is.
- **Oude positie:** na een minuut grijs en "(verouderd)" (was twee minuten, en alleen in de app).
- **Eigen geluid** bij helikoptermeldingen (`heli.wav`, zelf gemaakt; iOS via `aps.sound`, Android via het nieuwe kanaal `heli2`). Een oudere app-versie zonder dat bestand speelt het gewone geluid.
- **Klopt dit toestel niet?** `POST /v1/helikopters/<id>/melden`; komt in beheer bij Gemelde fouten (geen wijziging in de beheer-apps nodig).
- **Ambulance zonder adres bij een verkeersongeval** ("Ambu 06121 HV weg letsel Apeldoorn") hoort nu op de server bij de aanrijding van politie of brandweer in dezelfde plaats binnen 5 minuten, alleen als er precies één zo'n incident is (`zonderAdres` in `worker/src/incident.js`). De app koppelde dit al zelf vanuit de ambulancemelding; nu ziet ook de politiemelding de ambulance.
- Bestond al en is niet opnieuw gebouwd: zones, de verwachte bestemming met aankomsttijd, de vluchtgeschiedenis en de eigen tekeningen per type toestel.

## A-Alerts 2.0.1 (build 92)
- **Cijfers per kazerne.** Tik op de kaart op een post: aantal inzetten (een herhaling of opschaling van hetzelfde incident telt als één), per uur van de dag en per dag van de week, en de voertuigen en capcodes van die post. Server: tabel `post_inzet` (één rij per post per inzet), `GET /v1/posten/<id>`; de meldingen die er al stonden zijn één keer meegeteld. App, Android en pager.
- **Bel bij een toestel:** ook een pushmelding bij landen (standaard uit) en bij de terugvlucht (standaard aan; een start binnen 90 minuten na een landing). Instellingen › Helikopters, app en Android (`heli.volg_landen`, `heli.volg_terug`).
- **Verloop:** een regel "Opgeschaald naar Middelbrand" (of GRIP) bij de melding waarmee de inzet groter wordt. App, Android en pager.
- **Kaartlaag "Grens veiligheidsregio"** (Noord- en Oost-Gelderland; CBS gebiedsindelingen via PDOK, `tools/geodata/fetch_veiligheidsregio.py`, `GET /v1/veiligheidsregio`). App, Android en pager.
- **Ander app-icoon** (iPhone en iPad): Standaard (volgt het systeem, dus donker in de donkere modus), Donker en Blauw.
- **Zoeken ook buiten je filters** (app en Android; de pager zocht al binnen de filters) en zoeken in de eenheden. **Hulp is doorzoekbaar** in de app, op Android en op de site, met vijf nieuwe vragen.
- **Waarschuwingen 30 dagen terug** (was 14).
- **Mededeling van de makers:** in beheer (P2000Beheer, LRbeheer en web-beheer) bij Teksten; verschijnt als balk in de app, als venster op Android en als kaartje op de pager, tot je hem sluit. `GET /v1/app` geeft hem mee.
- Uit de bron: `groep` is het groepsnummer van de pagerzender (geen koppeling van meldingen) en wordt niet gebruikt.
- Niet gebouwd: een ander app-icoon op Android. De status uitrukken, onderweg en ter plaatse en de capcode met een ster bestonden al op alle platformen.

## A-Alerts 2.0.1 (build 91)
- **Incident op de server.** Elke nieuwe melding krijgt bij binnenkomst een `incident`: de guid van de eerste melding van die inzet (`worker/src/incident.js`). Zelfde regels als eerst in de apps: zelfde adres in dezelfde plaats, of binnen 350 m met dezelfde eenheid, binnen 45 minuten (120 bij een groot incident); besteld vervoer, herbezetting en proefalarm horen nooit bij een inzet. Meldingen van de laatste zes uur zonder incident krijgen er alsnog een.
- `GET /v1/meldingen/<guid>/verloop`: alle meldingen van dezelfde inzet, oudste eerst. De app, Android en de pager halen hiermee ook meldingen op die niet (meer) in de lijst staan.
- Verloop en "Eenheden bij deze inzet" gebruiken de inzet van de server: zelfde inzet is zeker ("Zelfde inzet"), een andere inzet hooguit een mogelijk verband. Oudere meldingen zonder inzet vallen terug op de regels in de app.
- Pushmeldingen: nog steeds één per P2000-melding, en elke melding staat in de lijst. Meldingen van dezelfde inzet staan bij elkaar in het berichtencentrum (`thread-id` = inzet).
- Velden uit de bron die we nu bewaren (`vlaggen`): groot, kruising, spam, groep. "groot" telt mee als groot incident; bij "kruising" blijft de coördinaat van de bron staan (niet het midden van de straat). Spam en groep worden alleen bewaard, nog niet gebruikt.
- Categorieën: de straatnaam wordt uit de tekst gehaald voordat de regels kijken; nieuw zijn Verkeersongeval ("Ongeval wegvervoer"), Assistentie ambulance ("Ass. Ambu", tilassistentie) en herbezetting ook bij "Herbezet./kazerneren". Meldingen van de laatste twee dagen worden opnieuw beoordeeld.
- Minimale versie: `GET /v1/app` geeft de laagste build die nog werkt (`MIN_BUILD_IOS` en `MIN_BUILD_ANDROID` in `worker/wrangler.toml`, nu 0 = geen minimum). Een oudere build toont "Werk de app bij".
- De databasekolommen `incident` en `vlaggen` worden bij het uitrollen één keer toegevoegd (`.github/workflows/worker.yml`).

## Worker (14 november 2026)
- Categorie: een straatnaam met "dieren" of "paard" erin (Laan van de Dierenriem, Paardenmarkt) maakte van een melding "Dier in problemen". De regel kijkt nu alleen naar hele woorden. Nieuw: "Gebouwbrand" voor "BR gebouw", bedrijf, winkel, kantoor, school en horeca. Meldingen van de laatste week die fout stonden worden rechtgezet.

## Worker (13 november 2026, avond)
- Burgernet: de tekst begon soms twee keer met dezelfde zin(nen), omdat burgernet.nl de openingszin vóór het bericht herhaalt. De herhaling wordt nu weggehaald in de worker (`ontdubbel`), dus ook in het kant-en-klare bericht van de Homey-app, de pushmelding en de app.

## A-Alerts 2.0.1 (build 90)
- De WhatsApp-knop en de regel "© A-Alerts … Made & Powered by PixelForges" staan niet meer onder iedere melding (ze staan nog in Instellingen).

## A-Alerts 2.0.1 (build 89)
- Onder iedere melding staat de bron: "Bron: p2000.page" (aan te tikken in de app, op Android en in de pager; als tekst op Apple TV en Apple Watch).

## Nieuws en website (13 november 2026)
- Stockfoto's bij het nieuws: het label "Foto: JS Fotografie" stond nog in vijf foto's zelf (en in hun deelafbeeldingen). Die zijn opnieuw gemaakt uit de originelen, zonder label; de naam staat nu nergens meer (`?v=5`).
- Pager: de kaart van een helikopter of vliegtuig heeft marges, schuift binnen het paneel en is op een telefoon een blad onderaan; de kaartlagen staan per categorie op een eigen regel en het paneel is niet breder dan nodig.
- Status: de controle van de website probeert het na een fout nog één keer voordat er een storing wordt gemeld (tijdens het uploaden van een nieuwe versie geeft de host kort HTTP 403).

## A-Alerts 2.0.1 (build 88)
- Verloop en "Eenheden bij deze inzet": een herbezetting van een kazerne ("Herbezet./kazerneren") of een proefalarm hoort nooit bij een inzet, ook niet als dezelfde eenheid is opgeroepen. App, Android (daar nu ook besteld vervoer B1–B3 uitgesloten) en pager.

## A-Alerts 2.0.1 (build 87)
- Lifeliner waarschijnlijk geannuleerd: P2000 meldt geen annulering, dus de server leidt het af uit de vlucht. De helikopter die in de melding is genoemd kwam dichterbij, is niet in de buurt van de melding geweest (4 km, of 6 km bij alleen een straatnaam) en vliegt daarna minstens twee minuten en 3 km van de melding af. Bij de melding en op de helikopterkaart staat dan "Waarschijnlijk geannuleerd om 11:42" met de plaats waar hij omkeerde. Staat de helikopter tien minuten na de oproep nog aan de grond: "Opgeroepen, maar niet opgestegen". App, Android en pager (`inzet` in `GET /v1/helikopters`).
- Wie de bel bij die helikopter aan heeft staan, krijgt er een pushmelding van.

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
