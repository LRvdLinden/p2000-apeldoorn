# A-Alerts 2.0.0 – App Store-materiaal

Alles voor App Store Connect, voor iPhone, iPad, Mac, Apple Watch en Apple TV.

## Talen
- **Afbeeldingen:** nl-NL en en-US, omdat de app Nederlands en Engels ondersteunt (`Shared/Localizable.xcstrings`).
- **Teksten (metadata):** nl-NL en en-US.
- **App Review-notities:** Engels (`metadata/review_information/notes.txt`), Nederlandse kopie ter referentie (`notes-nl.txt`, niet uploaden).

## Herkomst van de schermen
Echte schermen uit de app, gemaakt in de simulator met live data (workflow `.github/workflows/screenshots.yml`, branch `screenshots`). Mac: venster van de echte Mac-app (runner-scherm 1024×768, daarom één Mac-screenshot). Apple Watch en Apple TV: alleen het scherm, zonder kader (Apple-richtlijn).

## Inhoud
| Map | Maten | Aantal per taal |
|---|---|---|
| `screenshots/<taal>/iphone-6.3` | 1206×2622 | 6 |
| `screenshots/<taal>/iphone-6.1` | 1179×2556 | 6 |
| `screenshots/<taal>/ipad-13` | 2064×2752 | 6 |
| `screenshots/<taal>/mac` | 2880×1800 | 1 |
| `screenshots/<taal>/watch` | 410×502 | 1 |
| `screenshots/<taal>/appletv` | 1920×1080 | 3 |
| `marketing/<taal>` | header 5244×2950 + 3840×1646, search 5244×2950 + 3840×2560 + 1920×1280 | 5 |
| `metadata/` | fastlane-deliver-indeling: naam, ondertitel, promotietekst, beschrijving, trefwoorden, release notes, URL's, privacy, review-info | – |
| `app-info.md` | algemene info, leeftijdsclassificatie, app-privacy, toegankelijkheid | – |

Alle PNG's zijn RGB zonder alfakanaal, in de exacte maten van Apple.

## Uploadchecklist
1. App Store Connect › A-Alerts › 2.0.0: screenshots per toestel en taal uit `screenshots/`.
2. Teksten per taal uit `metadata/nl-NL` en `metadata/en-US`.
3. App-informatie: categorie Nieuws + Navigatie, privacy-URL https://a-alerts.nl/privacy/.
4. App Privacy: tabel uit `app-info.md`.
5. App Review Information: `notes.txt`, contactgegevens; geen inlog nodig.
6. Apple TV: privacybeleid-tekst uit `metadata/privacy/appletv-privacy-*.txt`.

## Open
- Apple ID van de app (staat in App Store Connect) in `app-info.md`.
- Telefoonnummer voor App Review: `metadata/review_information/phone_number.txt`.
