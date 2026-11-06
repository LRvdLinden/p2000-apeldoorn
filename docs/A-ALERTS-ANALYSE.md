# A-Alerts – fase 1: analyse van de bestaande app

Vastgelegd op 6 november 2026, vanaf `main` @ `0764f00` (P2000 Apeldoorn 1.0.1, build 12).
Terugvalpunt: branch **`release/p2000-1.0.1-build12`** (zelfde commit). A-Alerts wordt gebouwd op branch **`a-alerts`**.

Alles in deze lijst blijft **ongewijzigd**. Alleen zichtbare namen, teksten, iconen en nieuwe functies veranderen.

## 1. Targets en technische identificaties

| Target | Platform | Bundle ID | Interne `PRODUCT_NAME` (blijft) | Weergavenaam nu → A-Alerts |
|---|---|---|---|---|
| P2000 Apeldoorn | iOS, iPadOS, macOS | `nl.lrvdlinden.p2000apeldoorn` | P2000 Apeldoorn | P2000 Apeldoorn → **A-Alerts** |
| P2000 Apeldoorn Watch | watchOS | `nl.lrvdlinden.p2000apeldoorn.watchkitapp` | P2000 Apeldoorn Watch | P2000 → **A-Alerts** |
| P2000 Apeldoorn Widgets | iOS, macOS | `nl.lrvdlinden.p2000apeldoorn.widgets` | P2000 Apeldoorn Widgets | P2000 Apeldoorn → **A-Alerts** |
| P2000 Apeldoorn Watch Widgets | watchOS | `nl.lrvdlinden.p2000apeldoorn.watchkitapp.widgets` | P2000 Apeldoorn Watch Widgets | P2000 → **A-Alerts** |
| P2000 Apeldoorn TV | tvOS | `nl.lrvdlinden.p2000apeldoorn` (universal purchase) | P2000 Apeldoorn TV | P2000 Apeldoorn → **A-Alerts** |
| P2000Beheer (los project in `beheer/`) | iOS, macOS | `nl.lrvdlinden.p2000beheer` | – | valt buiten A-Alerts |

- Team ID: **EU3UY476T6**, automatisch ondertekenen.
- Deployment targets: iOS 18.0, macOS 15.0, watchOS 11.0, tvOS 18.0 (blijven zo).
- App-categorie: `public.app-category.news`.
- Versie: was 1.0.1 (12) → A-Alerts **1.0.0**, build loopt door vanaf **13**. Dat mag, omdat er nog geen versie in de App Store is uitgebracht.
- Waarom de interne productnaam blijft: de naam van het programma en de modulenaam hangen eraan, en daarmee de koppeling met bestaande widgets op het beginscherm.

## 2. Capabilities en entitlements (allemaal ongewijzigd)

| Entitlement | Waarde | Targets |
|---|---|---|
| App Group | `group.nl.lrvdlinden.p2000apeldoorn` | alle |
| iCloud key-value store | `$(TeamIdentifierPrefix)nl.lrvdlinden.p2000apeldoorn` | alle |
| Push (`aps-environment`) | development (Xcode zet production bij archiveren) | iOS, macOS |
| Time-sensitive notifications | aan | iOS, macOS |
| Sign in with Apple | Default | iOS, macOS |
| WeatherKit | aan | iOS, macOS |
| App Sandbox + netwerk + locatie | aan | macOS |

- URL-scheme: `p2000apeldoorn://` (iOS en watchOS) – **blijft**, want widgets en pushmeldingen gebruiken het.
- Achtergrondmodus: `remote-notification`.
- Widget-kinds (mogen nooit veranderen, anders verdwijnen geplaatste widgets): `LatestMelding`, `MeldingenList`, `Vandaag` (+ de Watch-varianten).

## 3. Opslag van gebruikersinstellingen

Alle instellingen staan in `AppSettings` (Shared/AppSettings.swift):
- in de App Group-defaults onder `settings.<naam>`;
- gesynchroniseerd via iCloud key-value (behalve de apparaat-gebonden sleutels).

| Sleutel | Wat | Sync |
|---|---|---|
| `settings.diensten`, `settings.plaatsen`, `settings.prioriteiten` | lijstfilters | iCloud |
| `settings.groupByDay`, `settings.hideRead`, `settings.bewaard`, `settings.gelezen` | weergave, bewaard en gelezen | iCloud |
| `settings.appearance`, `settings.mapType` | uiterlijk en kaarttype | iCloud |
| `settings.notificationsEnabled`, `settings.notifDiensten`, `settings.notifPlaatsen`, `settings.notifPrioriteiten` | pushfilters | iCloud |
| `settings.quietMode`, `settings.quietFrom`, `settings.quietTo`, `settings.criticalAlerts` | stille modus | iCloud |
| `settings.radiusEnabled`, `settings.radiusKm`, `settings.radiusMode`, `settings.fixedLat`, `settings.fixedLon`, `settings.fixedName` | Mijn buurt | iCloud |
| `settings.useLocation`, `settings.appLock`, `settings.onboardingDone`, `settings.currentLat`, `settings.currentLon` | apparaat-gebonden | nee |
| `settings.migrated` | eenmalige verhuizing naar App Group (build 1) | nee |
| `alarm.sound`, `alarm.onlyUrgent` | alarmgeluid in de app (UserDefaults.standard) | nee |

Plaatsen worden opgeslagen als **namen** ("Apeldoorn", "Teuge", …). De nieuwe lijst behoudt alle bestaande namen. Een bestaande keuze blijft daardoor geldig zonder omzetting.

**Regel voor A-Alerts:** bestaande sleutels worden nooit hernoemd of gewist. Nieuwe structuren, zoals meldingsprofielen in fase 7, krijgen **eigen nieuwe sleutels** en worden eenmalig gevuld vanuit de oude. Zo blijven de oude waarden staan voor een eventuele terugval naar 1.0.1.

## 4. Backend (Cloudflare Worker `p2000-apeldoorn-api`)

- Adres: `https://p2000-apeldoorn-api.lrvdlinden.workers.dev` (blijft; staat als `P2000_API_URL` in Config/Base.xcconfig).
- D1-database `p2000-apeldoorn`, tabellen: meldingen, devices, outbox, weather, kv, overrides, installs, install_days, visits, pageviews, admin_devices.
- Cron elke minuut; de P2000-feed wordt 5× per minuut gelezen.
- Bestaande routes, die alle blijven werken voor de huidige app:
  - `/health`
  - `/v1/meldingen[/:guid[/view|/weather]]`
  - `/v1/mapkit-token`
  - `/v1/content/{privacy|terms|disclaimer}`, `/v1/changelog`
  - `/v1/devices[/:token]`, `/v1/installs`, `/v1/visit`
  - `/v1/beheer/*`
- Push: APNs via de outbox. Apparaten registreren met filters (diensten, plaatsen, prioriteiten, straal, stille modus).

Nieuwe bronnen komen er alleen **bij**, als nieuwe routes en tabellen.

## 5. Bestaande functies (moeten na elke fase nog werken)

| Platform | Functies |
|---|---|
| iPhone, iPad, Mac | Pager-tijdlijn (per dag gegroepeerd, gelezen grijs), zoeken, filters (dienst/plaats/prioriteit), kaart (6 u/24 u/7 d, plaatsmarkers met teller), detail (kaart, Look Around, capcodes, METEO, delen, bewaren), statistieken (vandaag vs gisteren), push met Mijn buurt en stille modus, alarmgeluid in de app, Face ID-vergrendeling, Sign in with Apple + iCloud-sync, widgets, onboarding, Meer apps-kaart, review-prompt |
| Apple Watch | Lijst, statistieken, complicaties |
| Apple TV | Meldkamer met kaart-rondleiding, alarmscherm, detail, statistieken, instellingen, alarmgeluid |
| Website | **Valt buiten deze opdracht** en wordt niet aangepast tot Léon akkoord geeft. |

## 6. Iconen

- **Bron van waarheid:** het tvOS-icoon (`P2000ApeldoornTV/Assets.xcassets/App Icon & Top Shelf Image.brandassets`). Het heeft drie lagen:
  - **achter:** rode kaarttextuur;
  - **midden:** pulserende ringen;
  - **voor:** wit schild met uitroepteken.
- **Nu:** het iOS-, macOS- en watchOS-icoon is een vlak rood vlak met het schild, zonder kaart en ringen. Die worden in fase 2 opnieuw gemaakt uit de tvOS-lagen.
