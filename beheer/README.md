# P2000Beheer

Beheer van A-Alerts, als app voor **iPhone, iPad en Mac** (`P2000Beheer.xcodeproj`) en als **webdashboard** (`web/`, voor beheer.a-alerts.nl).

Beide praten met het beheerdeel van de API (Cloudflare Worker in `../worker`), achter een login:

| Secret (GitHub → Worker) | Waarde |
|---|---|
| `BEHEER_USER` | gebruikersnaam (LRvdLinden) |
| `BEHEER_PASSWORD` | wachtwoord, minimaal 6 tekens. Wijzigen = iedereen uitgelogd |

## Functies
- **Dashboard:** status (feed, cron, APNs, WeatherKit, Apple Maps), actieve app-gebruikers, **wel/niet ingelogd met Apple**, push aan/uit, platforms, versies, nieuwe en actieve gebruikers per dag, **websitebezoekers** (zonder cookies), populairste pagina's, meest bekeken meldingen, meldingen vandaag vs. gisteren.
- **Meldingen:** zoeken, verbergen, titel/categorie/locatie/coördinaten corrigeren of terugdraaien.
- **Push:** eigen bericht naar iedereen of naar gebruikers van bepaalde plaatsen, met geschiedenis.
- **Teksten:** privacyverklaring, cookies, voorwaarden, disclaimer en changelog bewerken (direct live in app en website).
- **Waarschuwingen (A-Alerts):** NL-Alert, Burgernet en KNMI zoeken en filteren, verbergen in apps en website, of handmatig beëindigen (brongegevens blijven ongewijzigd).
- **Dashboard (A-Alerts):** status van NL-Alert, Burgernet, KNMI en adsb.lol, helikopters in de lucht, waarschuwingen per bron en het gebruik van de notificatieprofielen.
- **Status:** alle onderdelen van a-alerts.nl/status met uptime en de ruwe foutmelding, afwijkingen die alleen het beheer ziet (push-wachtrij, lange stilte zonder meldingen), en storingen of gepland onderhoud plaatsen, bijwerken, afronden en verwijderen (direct op de statuspagina en in de apps).
- **Android-app:** downloads van de APK op a-alerts.nl/android/ (totaal, 30 dagen, vandaag, per dag en per versie), Android-installaties, toestellen met push en de status van Firebase-push.
- **App:** Face ID / Touch ID, en met de schakelaar *Storingen en afwijkingen* een pushmelding zodra een onderdeel van de statuspagina 3 minuten afwijkt van normaal, bij een push-wachtrij die achterloopt of een ongewoon lange stilte zonder meldingen, en weer als alles normaal is.

## App bouwen
Open `P2000Beheer.xcodeproj` (Xcode 16+), bundle ID `nl.lrvdlinden.p2000beheer`. Zet bij de App ID **Push Notifications** aan. Het projectbestand maak je opnieuw met `python3 tools/make_project.py`.

## Webdashboard
Upload de inhoud van `web/` naar de webmap van beheer.a-alerts.nl (de oude beheer.p2000-apeldoorn.nl mag ernaar doorsturen). `robots.txt` en een noindex-tag houden zoekmachines weg.
