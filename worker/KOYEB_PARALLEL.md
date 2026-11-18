# Parallelle P2000-ingest: p2000.page + Koyeb

**Scope:** alleen A-Alerts (`p2000-apeldoorn`, de `a-alerts`-branch). De Homey-app `nl.lrvdlinden.p2000` en de repo `p2000-listener` worden **niet** aangepast. Base44 wordt niet gebruikt.

## Werking

- `p2000.page` is en blijft de **primaire REST-bron**; de bestaande Worker-cron blijft deze gebruiken.
- De `AAlertsKoyebListener` Durable Object maakt **één afzonderlijke** WebSocket-verbinding met `wss://p2000-martijnpoppen.koyeb.app`. Deze bron draait continu parallel, niet pas bij een storing.
- Koyeb levert landelijk; alleen meldingen uit de bestaande A-Alerts-woonplaatsen worden verwerkt.
- Beide bronnen gebruiken dezelfde `ingestParsed()`-pipeline: D1, incidentherkenning, posten en bestaande APNs/FCM-outbox met alle bestaande gebruikersvoorkeuren.
- Is een GUID al bekend, dan wordt de melding overgeslagen. Omdat de twee leveranciers mogelijk andere GUIDs gebruiken, geldt daarnaast een conservatieve vergelijking op plaats, dienst, brontekst en tijd (max. 120 s), plus een unieke D1 `dedup_key`. Alleen een daadwerkelijk ingevoegde D1-rij kan een nieuwe push veroorzaken.
- De publieke `link` van via Koyeb ontvangen meldingen is `https://p2000.page/api`: voor eindgebruikers blijft **p2000.page** de getoonde bron.
- De primaire feed krijgt na HTTP 403/429 of een foutrecord tijdelijk vijf minuten backoff. Dit voorkomt extra IP-limietverzoeken maar zet Koyeb niet uit.
- Oude Base44-backfillnetwerkaanroepen worden verwijderd.

## Veilig activeren

1. Merge en deploy **niet** voordat tests slagen en de Cloudflare Wrangler-configuratie is beoordeeld. De reguliere workflow deployt uitsluitend vanaf `main`, niet vanaf `a-alerts`; voorkom dat de verouderde `main`-branch de uitgebreide A-Alerts-backend overschrijft.
2. Cloudflare ondersteunt de SQLite-backed Durable Object `AAlertsKoyebListener` via de nieuwe binding `KOYEB_LISTENER`. De D1-migratie voegt `meldingen.dedup_key` toe; bestaande rijen blijven ongemoeid.
3. Een afzonderlijke synthetische A-Alerts client-ID is vanaf GitHub Actions bevestigd op 18 november 2026: verbinden en een geldige P2000-melding ontvangen. De ID staat als gewone Wrangler-variabele en is **niet** gelijk aan jouw echte Homey-ID. Het is nog geen garantie op blijvende werking op Cloudflare zelf.
4. De reguliere `worker.yml` deployt alleen na een push op de `a-alerts`-branch. De aparte Koyeb-verbinding is standaard geconfigureerd met de tijdens de read-only probe geverifieerde synthetische identiteit.
5. Monitor `/health`: `feed.lastOk`, `feed.lastError`, `koyeb.configured`, `koyeb.lastMessage`, `koyeb.lastAdded`. Controleer in `/v1/meldingen` dat beide bronnen dezelfde gebeurtenis maar **eenmalig** tonen.
6. Test een Koyeb-melding en dezelfde p2000.page-melding zowel in omgekeerde aankomstvolgorde als met verschillende GUIDs, en controleer D1 en outbox. Bij een storing blijft de algemene P2000-status op **degraded** (niet down) wanneer Koyeb nog nieuwe events ontvangt.

## Cloudflare kosten en beperkingen

Uitgaande WebSockets in Durable Objects kunnen **niet hibernaten**. De verbinding kan daardoor Duration-gebruik en mogelijk kosten veroorzaken; bekijk Cloudflare's actuele Durable Objects-limieten en budgetwaarschuwingen. De verbinding kan na runtime-herstart vanzelf herverbinden via Durable Object-alarms en cron, maar is geen mathematische 100%-beschikbaarheidsgarantie.

## Controle vóór productie

- De echte Koyeb-handshake met een *afzonderlijke* synthetische A-Alerts-identiteit is succesvol uitgevoerd via de read-only GitHub Actions-probe.
- Cloudflare-account, Worker-deployments, secrets en live logs zijn niet rechtstreeks beschikbaar in deze ChatGPT-sessie.
- De oorspronkelijke p2000.page-toegang is momenteel IP-beperkt. Koyeb kan geen berichten ophalen die zijn verstuurd terwijl **beide** live verbindingen onderbroken waren; daarvoor is een bron met historische replay nodig.
