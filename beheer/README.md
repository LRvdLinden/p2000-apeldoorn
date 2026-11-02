# P2000Beheer

Beheer van P2000 Apeldoorn, als app voor **iPhone, iPad en Mac** (`P2000Beheer.xcodeproj`) en als **webdashboard** (`web/`, voor beheer.p2000-apeldoorn.nl).

Beide praten met het beheerdeel van de API (Cloudflare Worker in `../worker`), achter een login:

| Secret (GitHub → Worker) | Waarde |
|---|---|
| `BEHEER_USER` | gebruikersnaam (LRvdLinden) |
| `BEHEER_PASSWORD` | wachtwoord, minimaal 6 tekens. Wijzigen = iedereen uitgelogd |

## Functies
- **Dashboard:** status (feed, cron, APNs, WeatherKit, Apple Maps), actieve app-gebruikers, **wel/niet ingelogd met Apple**, push aan/uit, platforms, versies, nieuwe en actieve gebruikers per dag, **websitebezoekers** (zonder cookies), populairste pagina's, meest bekeken meldingen, meldingen vandaag vs. gisteren.
- **Meldingen:** zoeken, verbergen, titel/categorie/locatie/coördinaten corrigeren of terugdraaien.
- **Push:** eigen bericht naar iedereen of naar gebruikers van bepaalde plaatsen, met geschiedenis.
- **Teksten:** privacyverklaring, voorwaarden, disclaimer en changelog bewerken (direct live in app en website).
- **App:** Face ID / Touch ID, en een pushmelding bij storingen van de P2000-feed (> 10 min).

## App bouwen
Open `P2000Beheer.xcodeproj` (Xcode 16+), bundle ID `nl.lrvdlinden.p2000beheer`. Zet bij de App ID **Push Notifications** aan. Het projectbestand maak je opnieuw met `python3 tools/make_project.py`.

## Webdashboard
Upload de inhoud van `web/` naar de webmap van beheer.p2000-apeldoorn.nl. `robots.txt` en een noindex-tag houden zoekmachines weg.
