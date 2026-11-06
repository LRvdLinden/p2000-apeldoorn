# A-Alerts 2.0.0 – fase 10: test

## Automatisch gecontroleerd

| Controle | Resultaat |
|---|---|
| Build iPhone/iPad + Apple Watch, Mac, Apple TV, widgets, push-extensie, P2000Beheer (GitHub Actions, `build.yml`) | geslaagd (run 42206794343, build 20) |
| Worker-tests (`cd worker && npm test`): werkgebied, NL-Alert/Burgernet/KNMI, profielen, helikopters, beheer, pushpayloads | 25 geslaagd |
| Bundle-ID's t.o.v. 1.0.1 (build 12) | gelijk; alleen `…p2000apeldoorn.notificationservice` erbij |
| Entitlements (app, watch, widgets, tv) | ongewijzigd |
| App Group `group.nl.lrvdlinden.p2000apeldoorn`, URL-schema `p2000apeldoorn` | ongewijzigd |
| Widget-kinds `LatestMelding`, `MeldingenList`, `Vandaag` | ongewijzigd |
| Instellingen-sleutels (`settings.<naam>`, iCloud) | geen enkele sleutel verwijderd of hernoemd; nieuw: `waarschuwingFilter`, `pushNLAlert`, `pushBurgernet`, `pushKnmi`, `profielen`, `kaartLagen` |
| Website | niet gewijzigd |

## Migratie van instellingen (1.0.1 → 2.0.0)

- Bij de eerste start maakt de app profiel **Standaard** van de bestaande notificatiekeuzes (plaatsen, disciplines,
  prioriteiten, NL-Alert/Burgernet/KNMI). Het eerste profiel wordt teruggeschreven naar de oude sleutels, zodat een
  toestel met 1.0.1 en de server dezelfde keuzes blijven zien.
- Filters, bewaarde en gelezen meldingen, Mijn buurt, stille modus, kritieke meldingen, kaarttype, weergave,
  Face ID en onboarding blijven onder dezelfde sleutels staan.
- Server: een toestel zonder profielen (oude versie) krijgt pushmeldingen volgens de oude regels (getest).

## Handmatig testen op toestellen

1. **Update-test:** installeer 1.0.1 (TestFlight of App Store), stel plaatsen, disciplines, prioriteit en stille
   modus in, bewaar een melding. Installeer daarna 2.0.0 eroverheen.
   - Instellingen › Notificaties › Profielen: één profiel *Standaard* met dezelfde keuzes.
   - Bewaarde melding en filters staan er nog; widgets werken zonder ze opnieuw toe te voegen.
2. **Pager:** NL-Alert/Burgernet tussen de meldingen; KNMI-balk bij een actieve code.
3. **Detail:** kaart met knoppen bovenin, Look Around, *Geschatte aanrijtijd*, *Mogelijk verband*, waarschuwingen in het gebied.
4. **Kaart:** knop Kaartlagen, elke laag aan/uit; helikopters (alleen als er een in de lucht is); kazernes tikken.
5. **Profielen:** profiel toevoegen (max 5), tijden en dagen, profiel uitzetten; *Stuur een testmelding*.
6. **Push (echt toestel, geen simulator):** een nieuwe melding met straat toont een kaartje; knoppen *Bewaar* en
   *Open in Apple Kaarten*; tikken opent de melding of waarschuwing.
7. **Mac, iPad, Apple Watch, Apple TV:** app start, lijst en kaart laden, Apple TV-kaart toont helikopters.
8. **Toegankelijkheid:** grotere tekst (Instellingen › Toegankelijkheid) schaalt mee.

## Voor de release

- Versie **2.0.0**: hoger dan 1.0.1 in de App Store.
- Nieuwe App ID voor de push-extensie (`nl.lrvdlinden.p2000apeldoorn.notificationservice`): Xcode maakt die met
  automatisch ondertekenen zelf aan.
- App Store-teksten: `appstore/A-Alerts-2.0.0/nl.txt` en `en.txt` (naam, ondertitel, promotietekst, beschrijving,
  trefwoorden, nieuw in deze versie, notities voor App Review).
- Na de release: branch `a-alerts` samenvoegen met `main` (de worker draait nu vanaf `a-alerts`).
