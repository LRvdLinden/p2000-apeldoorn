# P2000 Apeldoorn – Apple apps

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
- **Detail**: alle info, een kaart met de originele marker, *Open in Kaarten* en *Route*, de eenheden en voertuigen, het weer tijdens de melding, en de afstand tot jou.
- **Kaart**: Apple Maps met de **markers van de website** (brandweer, ambulance, politie, traumaheli). Je filtert op periode (6 uur, 24 uur, 7 dagen) en discipline. Meldingen op dezelfde plek worden net als op de site in een cirkel gezet.
- **Statistieken**: vandaag, deze maand (met vorige maand ernaast), per uur, per weekdag, per prioriteit en de meest voorkomende categorieën.
- **Instellingen**: account, notificaties (plaatsen, disciplines, prioriteit, stille modus, kritieke meldingen), filters, huidige locatie, donkere modus, kaarttype, app-vergrendeling met Face ID/Touch ID, recensie, feedback, changelog, voorwaarden, privacy, disclaimer en de kaart **Meer apps van de ontwikkelaar** (in alle talen).
- **iCloud-sync**: instellingen en bewaarde meldingen worden via iCloud key-value storage gelijkgehouden op iPhone, iPad, Mac en Watch.
- **Review-prompt**: de eerste keer 4 uur na het eerste gebruik op dat apparaat, daarna hoogstens één keer per week. Hij verschijnt alleen op een rustig moment: een paar seconden na het openen, en nooit tijdens de splash, het welkomstscherm of als de app vergrendeld is.
- **Apple Watch**: de laatste meldingen, een detailscherm met kaart en de tellingen van vandaag.

## Databronnen

1. **Base44**: `https://p2000-apeldoorn.nl/api/apps/69b6661a41c2b1b46f95682e/entities/…`. Hier komen de geschiedenis (`P2000Melding`), de statistieken (`MaandStatistiek`), de `Changelog`, de `PrivacyVerklaring`, de `TermsOfUse` en de `DisclaimerContent` vandaan. Dit zijn dezelfde endpoints die de website gebruikt.
2. **p2000.page live-feed** (`service.p2000.page/api-…`). De app vraagt deze elke 15 seconden op en houdt alleen de plaatsen in de gemeente Apeldoorn over. Zodra Base44 dezelfde melding heeft (`uid` = `guid`), wint de Base44-versie, want die bevat categorie, weer en views.

### Sleutel van de live-feed

De URL bevat een persoonlijke sleutel en staat **niet** in git.

- **Lokaal:** kopieer `Config/Secrets.example.xcconfig` naar `Config/Secrets.xcconfig` en vul je URL in. Schrijf daarbij `https:/$()/` in plaats van `https://`, want `//` begint in een .xcconfig een commentaar.
- **GitHub Actions:** zet de repo-secret `P2000_PAGE_API_URL` (de volledige URL). De workflow *Build* maakt daar `Secrets.xcconfig` van.

Zonder sleutel werkt de app gewoon, maar dan alleen via Base44.

## Pushmeldingen

Op iPhone en iPad gebruikt de app de bestaande **OneSignal-app** van de website (App ID `4b1d5c83-…`), via Swift Package `OneSignal-XCFramework`.

- Zet in OneSignal bij *Apple iOS (APNs)* een `.p8`-sleutel van team EU3UY476T6 voor bundle `nl.lrvdlinden.p2000apeldoorn`.
- Na *Inloggen met Apple* is de OneSignal external ID het Apple user-ID.
- Elk toestel stuurt deze **tags** mee:

| tag | waarde |
|---|---|
| `app` | `ios` |
| `meldingen` | `1`/`0` |
| `plaatsen` | `alle` of bv. `apeldoorn,ugchelen` (kleine letters, spatie i.p.v. streepje) |
| `diensten` | `alle` of bv. `ambulance,brandweer` |
| `prioriteiten` | `alle` of bv. `A1,P1` |
| `stil`, `stil_van`, `stil_tot` | stille modus aan/uit en de tijden in minuten na middernacht |
| `kritiek` | `1` = A0/A1/P1 komen ook in de stille modus door |
| `taal` | `nl`/`en` |

Geef bij de push `additionalData.guid` (de melding-guid) mee. Dan opent een tik meteen de juiste melding.

Op de **Mac** stuurt de app lokale meldingen zolang hij draait, met dezelfde filters.

## Bouwen

1. Open `P2000Apeldoorn.xcodeproj` in Xcode 16 of nieuwer. De mappen zijn gesynchroniseerd, dus nieuwe bestanden komen er vanzelf in.
2. Kies het scheme **P2000 Apeldoorn** en als bestemming een iPhone, iPad, *My Mac* of een Apple Watch. De Watch-app wordt automatisch in de iOS-app ingebed.
3. Zet in de Developer-portal bij de App ID's deze capabilities aan: **Sign in with Apple**, **Push Notifications** en **iCloud (Key-value storage)**. Met automatische signing doet Xcode dit meestal zelf.

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
