# P2000 Apeldoorn – Apple apps

![P2000 Apeldoorn](docs/hero.jpg)

De officiële app van [p2000-apeldoorn.nl](https://p2000-apeldoorn.nl) voor **iPhone, iPad, Mac en Apple Watch**. Je ziet alle P2000-meldingen van brandweer, ambulance, politie en traumaheli in de gemeente Apeldoorn: live, op de kaart en met statistieken.

| | |
|---|---|
| Bundle ID | `nl.lrvdlinden.p2000apeldoorn` (watch: `…​.watchkitapp`) |
| Versie | 1.0.0 (build 1) |
| Platforms | iOS/iPadOS 18+, macOS 15+, watchOS 11+ |
| Talen | Nederlands (bron), Engels |
| Team | EU3UY476T6 |

## Functies

- **Animated splash**: het schild valt in beeld, pager-pulsen golven uit en daarna gaat de app open.
- **Welkomstscherm** met pushmeldingen en *Inloggen met Apple*. Inloggen is optioneel.
- **Pager**: de live tijdlijn zoals op de site. Meldingen zijn per dag gegroepeerd, met een live klok en een online-status, en de cijfers van vandaag per discipline. Je kunt zoeken en filteren (disciplines, plaatsen, prioriteit). Meldingen kun je bewaren of delen, en op iPad en Mac staat de detailweergave ernaast (split view).
- **Detail**: dezelfde opbouw als p2000-apeldoorn.nl/melding/…. Bovenaan een grote kaart met marker en een **Look Around**-preview. Daaronder de *Let op*-melding als er geen straat is, het incidentnummer en de views, en een hoofdkaart met plaats, categorie, prioriteit en tijd. Er is alleen een **Apple Kaarten**-knop. Verder: Beschrijving, Capcodes, Voertuigen, **METEO-gegevens via WeatherKit** (historisch weer per uur, op het tijdstip en de plek van de melding) en Meldinggegevens. De lettertypen zijn Poppins en Social Gothic, als je die toevoegt.
- **Kaart**: Apple Maps met de **markers van de website** (brandweer, ambulance, politie, traumaheli). Je filtert op periode (6 uur, 24 uur, 7 dagen) en discipline. Meldingen op dezelfde plek worden net als op de site in een cirkel gezet.
- **Statistieken**: vandaag, deze maand (met vorige maand ernaast), per uur, per weekdag, per prioriteit en de meest voorkomende categorieën.
- **Instellingen**: account, notificaties (plaatsen, disciplines, prioriteit, stille modus, kritieke meldingen), filters, huidige locatie, donkere modus, kaarttype, app-vergrendeling met Face ID/Touch ID, recensie, feedback, changelog, voorwaarden, privacy, disclaimer en de kaart **Meer apps van de ontwikkelaar** (in alle talen).
- **iCloud-sync**: instellingen en bewaarde meldingen worden via iCloud key-value storage gelijkgehouden op iPhone, iPad, Mac en Watch.
- **Review-prompt**: de eerste keer 4 uur na het eerste gebruik op dat apparaat, daarna hoogstens één keer per week. Hij verschijnt alleen op een rustig moment: een paar seconden na het openen, en nooit tijdens de splash, het welkomstscherm of als de app vergrendeld is.
- **Apple Watch**: de laatste meldingen, een detailscherm met kaart en de tellingen van vandaag.

## Screenshots

<p><img src="docs/iphone-01.jpg" width="200"> <img src="docs/iphone-02.jpg" width="200"> <img src="docs/iphone-03.jpg" width="200"> <img src="docs/iphone-07.jpg" width="200"></p>
<p><img src="docs/iphone-04.jpg" width="200"> <img src="docs/iphone-05.jpg" width="200"> <img src="docs/mac.jpg" width="412"></p>

## Lettertypen

Poppins (SIL OFL) zit in `P2000Apeldoorn/Fonts`. **Social Gothic Bold** is het kopjeslettertype van de website. Het is een commercieel lettertype van Canada Type en zit er daarom niet in. Heb je een app-licentie, zet dan `SocialGothic-Bold.otf` in `P2000Apeldoorn/Fonts`. De app pakt hem automatisch op; zonder dat bestand gebruikt hij een smal systeemlettertype.

## Architectuur: de app staat los van de website

```
p2000.page-feed ──► server/ (Railway, Node 24 + SQLite) ──► REST-API ──► iPhone · iPad · Mac · Watch · widgets
                                   │
                                   └──► Apple Push Notification service (APNs) ──► pushmeldingen
```

De app en de widgets gebruiken **alleen de eigen API**. De sleutel van p2000.page staat alleen op de server.

### server/
- Vraagt de p2000.page-feed elke 10 seconden op en bewaart alleen meldingen uit de gemeente Apeldoorn.
- Per melding bepaalt hij de prioriteit, de categorie, de eenheden (capcodes), de voertuigen en de coördinaten.
- Endpoints:
  - `GET /v1/meldingen` en `GET /v1/meldingen/:guid`
  - `POST /v1/meldingen/:guid/view`
  - `GET /v1/stats/:yyyy-mm`
  - `GET /v1/content/privacy|terms|disclaimer` en `GET /v1/changelog`
- Pushmeldingen gaan rechtstreeks via APNs (een JWT op basis van je .p8-sleutel):
  - `POST /v1/devices` registreert een toestel met zijn instellingen: plaatsen, disciplines, prioriteiten, stille modus, kritieke meldingen en de radius (km + middelpunt, afgerond op ~100 m).
  - `DELETE /v1/devices/:token` meldt een toestel af.
  - `POST /v1/devices/:token/test` stuurt een testmelding.
  - `POST /v1/broadcast` stuurt een bericht naar iedereen, met `Authorization: Bearer ADMIN_TOKEN`.
- Testen: `cd server && npm test`.
- Geschiedenis eenmalig overnemen van de website (optioneel): zet in Railway de variabele `BACKFILL=1`. De server importeert dan bij het opstarten de laatste 5000 meldingen, met `BACKFILL_LIMIT` voor meer. Dat gebeurt alleen zolang de database (bijna) leeg is.

### Deploy naar Railway
1. Log in op [railway.com](https://railway.com) met GitHub en neem het **Hobby**-plan ($5 per maand, inclusief $5 gebruik).
2. Kies **New Project → Deploy from GitHub repo → LRvdLinden/p2000-apeldoorn**.
3. Service → **Settings**:
   - Hernoem de service naar `p2000-api`.
   - Zet **Root Directory** op `/server`.
   - Zet **Watch Paths** op `/server/**`.
4. Service → **Variables**. GitHub-secrets kun je niet uitlezen, dus plak de waarden hier opnieuw: `P2000_PAGE_API_URL`, `APN_KEY_ID`, `APN_TEAM_ID`, `APN_P8_CERT` (de hele .p8, inclusief de BEGIN- en END-regel) en eenmalig `BACKFILL=1`.
5. Klik met de rechtermuisknop op de service → **Attach volume** → mount path `/data`.
6. **Settings → Networking**:
   - Klik op **Generate Domain**. Je krijgt een `…up.railway.app`-adres.
   - Voeg daarna eventueel een **Custom Domain** toe: `api.p2000-apeldoorn.nl` met een CNAME bij je domeinbeheerder.
7. Controleer `https://<domein>/health`. Je moet `"ok":true` en `"apns":true` zien.

Bij elke push naar `server/` deployt Railway zelf. De GitHub-workflow draait alleen de tests.

## Pushmeldingen in de app
- iPhone, iPad en Mac gebruiken echte APNs-pushmeldingen. De Apple Watch krijgt de meldingen van de iPhone mee.
- Debug-builds gebruiken APNs-sandbox. TestFlight- en App Store-builds gebruiken productie.
- Tik je op een melding, dan opent de app die melding. Dat werkt via `guid` in de payload.

## Mijn buurt (radius)
Bij Instellingen → **Mijn buurt** kies je een straal van 0,5 tot 25 km rond **je locatie** of een **vast punt**. Een vast punt kies je door op de kaart te tikken of een adres te zoeken. De straal geldt voor de lijst, de kaart (met een cirkel), de widgets én de pushmeldingen.

## Tijdlijn
- De Pager toont alleen de meldingen van de laatste **24 uur**.
- Meldingen die je al hebt geopend worden **grijs**. Met *Verberg bekeken meldingen* zie je ze niet meer.

## Bouwen

1. Open `P2000Apeldoorn.xcodeproj` in Xcode 16 of nieuwer. De mappen zijn gesynchroniseerd, dus nieuwe bestanden komen er vanzelf in.
2. Kies het scheme **P2000 Apeldoorn** en als bestemming een iPhone, iPad, *My Mac* of een Apple Watch. De Watch-app wordt automatisch in de iOS-app ingebed.
3. Zet in de Developer-portal bij de App ID's deze capabilities aan: **Sign in with Apple**, **Push Notifications** (ook *Time Sensitive Notifications*), **iCloud (Key-value storage)**, **App Groups** (`group.nl.lrvdlinden.p2000apeldoorn`) en **WeatherKit** (ook onder *Services*). Doe dat ook voor de widget- en Watch-App ID's (App Groups en iCloud). Met automatische signing doet Xcode dit meestal zelf.

Teksten vertaal je in `tools/en.json`. Met `python3 tools/make_strings.py` maak je daarna `Shared/Localizable.xcstrings` opnieuw. Het projectbestand maak je opnieuw met `python3 tools/make_project.py`.

## Structuur

```
P2000Apeldoorn/        iOS · iPadOS · macOS (App, Services, Views, Assets)
P2000ApeldoornWatch/   watchOS-app
Shared/                modellen, API's, store, instellingen, splash, gedeelde UI, strings
Config/                xcconfig, Info.plist's, entitlements
tools/                 generators voor strings en projectbestand
```

© 2026 P2000 Apeldoorn. Made & Powered by [PixelForges](https://pixelforges.nl). Bron: [p2000.page](https://p2000.page).
