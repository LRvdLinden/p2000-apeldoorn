# A-Alerts 2.0.0 – app-informatie voor App Store Connect

## General Information
| Veld | Waarde |
|---|---|
| Name | A-Alerts |
| Bundle ID | nl.lrvdlinden.p2000apeldoorn |
| SKU | p2000apeldoorn (ongewijzigd) |
| Apple ID | TODO: staat in App Store Connect (bestaande app) |
| Primary Language | Dutch (nl-NL) |
| App-talen | Nederlands, Engels |
| Version | 2.0.0 |
| Primary Category | News – live meldingen en waarschuwingen in je eigen gemeente |
| Secondary Category | Navigation – kaart met meldingen, routes en live helikopters (zoals bij 1.0.0) |
| Content Rights | Ja, de app toont inhoud van derden: openbare P2000-meldingen, NL-Alert, Burgernet (burgernet.nl), KNMI-waarschuwingen, adsb.lol (ODbL), OpenStreetMap (ODbL: kazernes, ziekenhuizen en vliegbases) en WeatherKit. Allemaal openbare bronnen; bronvermelding in de app (Instellingen, onderaan) en op de website. |
| License Agreement | Apple Standard EULA |
| Copyright | © 2026 PixelForges |

## Age Rating (vragenlijst)
- Medische/behandelingsinformatie: **Niet vaak/mild** (meldingen noemen ongevallen en ambulance-inzetten)
- Realistisch geweld: **Niet vaak/mild** (politiemeldingen en Burgernet-oproepen noemen soms inbraak of geweld, alleen als tekst)
- Al het overige: Geen. Geen webbrowser in de app (links openen buiten de app), geen gebruikerscontent, geen chat.
- Verwachte uitkomst: 12+

## App Privacy (nutrition label)
| Datatype | Verzameld | Gekoppeld aan gebruiker | Tracking | Doel |
|---|---|---|---|---|
| Identifiers → Device ID (APNs-pushtoken) | Ja, als pushmeldingen aan staan | Nee | Nee | App Functionality |
| Location → Coarse Location (middelpunt Mijn buurt, ~100 m) | Ja, alleen bij radius + pushmeldingen | Nee | Nee | App Functionality |
| Usage Data → Product Interaction (anonieme installatieteller, appversie) | Ja | Nee | Nee | Analytics |
| Other Data → meldingsvoorkeuren en profielen | Ja | Nee | Nee | App Functionality |
| Contact Info (Inloggen met Apple) | Nee, blijft in iCloud van de gebruiker | – | – | – |
| Precise Location | Nee, afstand wordt op het toestel berekend | – | – | – |

Geen tracking (NSPrivacyTracking = false), geen advertentie- of analytics-SDK's van derden. Dit komt overeen met `Shared/PrivacyInfo.xcprivacy`.

## App Accessibility (per toestel)
Alleen wat in de code zit:
- **Dark Interface**: ja (iPhone, iPad, Mac, Apple TV; Watch is altijd donker)
- **Larger Text**: ja op iPhone, iPad en Mac (tekst gebruikt relativeTo-tekststijlen / systeemlettertype)
- **VoiceOver**: gedeeltelijk – meldingrijen, markers en knoppen hebben labels; niet volledig getest → niet claimen
- **Differentiate Without Color Alone**: ja (elke hulpdienst heeft een eigen icoon, status als tekst)
- **Sufficient Contrast, Reduced Motion, Voice Control, Captions, Audio Descriptions**: niet claimen

## URLs
- Support: https://a-alerts.nl/#vragen
- Marketing: https://a-alerts.nl
- Privacy Policy: https://a-alerts.nl/privacy/
- Apple TV Privacy Policy: tekst in `metadata/privacy/appletv-privacy-*.txt`

## Open TODO's
- Apple ID van de app invullen (staat al in App Store Connect)
- Telefoonnummer voor App Review (`metadata/review_information/phone_number.txt`)
