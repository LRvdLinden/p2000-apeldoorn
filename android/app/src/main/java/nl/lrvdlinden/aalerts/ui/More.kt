package nl.lrvdlinden.aalerts.ui

import android.Manifest
import android.annotation.SuppressLint
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.widget.TextView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.text.HtmlCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.push.Push
import nl.lrvdlinden.aalerts.tr

// ------------------------------------------------------------------ profile editor

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProfielScreen(id: String, nav: Nav) {
    val ctx = LocalContext.current
    val p = Settings.profielen.firstOrNull { it.id == id }
    if (p == null) { LaunchedEffect(Unit) { nav.back() }; return }
    fun save(np: MeldingProfiel) { Settings.profielen = Settings.profielen.map { if (it.id == id) np else it } }
    var naam by remember(id) { mutableStateOf(p.naam) }

    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(p.naam, nav) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard {
                OutlinedTextField(naam, { naam = it; if (it.isNotBlank()) save(p.copy(naam = it.take(40))) }, label = { Text(tr("Naam", "Name")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                SwitchRow(tr("Profiel actief", "Profile active"), checked = p.actief) { save(p.copy(actief = it)) }
            }
            SectionCard(tr("Disciplines", "Services"), Icons.Outlined.Category) {
                Text(tr("Niets gekozen = alle disciplines", "Nothing chosen = all services"), color = Muted, fontSize = 12.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Dienst.selectable.forEach { d -> SelectChip(d.label, d.key in p.diensten) { save(p.copy(diensten = p.diensten.toggle(d.key))) } }
                }
            }
            SectionCard(tr("Plaatsen", "Places"), Icons.Outlined.Place) {
                Text(tr("Niets gekozen = de hele gemeente", "Nothing chosen = the whole municipality"), color = Muted, fontSize = 12.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Werkgebied.namen.forEach { n -> SelectChip(n, n in p.plaatsen) { save(p.copy(plaatsen = p.plaatsen.toggle(n))) } }
                }
            }
            SectionCard(tr("Prioriteit", "Priority"), Icons.Outlined.PriorityHigh) {
                Text(tr("Niets gekozen = alle prioriteiten", "Nothing chosen = all priorities"), color = Muted, fontSize = 12.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("A0", "A1", "A2", "B1", "B2", "P1", "P2", "P3").forEach { x -> SelectChip(x, x in p.prioriteiten) { save(p.copy(prioriteiten = p.prioriteiten.toggle(x))) } }
                }
            }
            SectionCard(tr("Waarschuwingen", "Warnings"), Icons.Outlined.WarningAmber) {
                SwitchRow("NL-Alert", tr("Alarmberichten van de overheid", "Government alert messages"), p.nlalert) { save(p.copy(nlalert = it)) }
                SwitchRow("Burgernet", tr("Vermissingen en zoekacties", "Missing persons and searches"), p.burgernet) { save(p.copy(burgernet = it)) }
                // Missing children: one switch per device (same on iOS).
                SwitchRow("AMBER Alert", tr("Landelijke oproep als een kind vermist is en in levensgevaar kan zijn", "National call when a child is missing and may be in danger"), Settings.pushAmber) { Settings.pushAmber = it }
                SwitchRow(tr("Vermist Kind Alert", "Missing Child Alert"), tr("Regionale oproep, als het zoekgebied in het werkgebied valt (alle plaatsen en buurtschappen)", "Regional call, when the search area lies in the working area (all places and hamlets)"), Settings.pushVermistKind) { Settings.pushVermistKind = it }
                SwitchRow(tr("VNOG-incidenten", "VNOG incidents"), tr("Grote incidenten van de Veiligheidsregio Noord- en Oost-Gelderland: nieuw incident, elke update, hogere GRIP en afsluiting. Alleen de gemeente Apeldoorn en Teuge", "Major incidents from the safety region Noord- en Oost-Gelderland: new incident, every update, higher GRIP level and closing. Only the municipality of Apeldoorn and Teuge"), Settings.pushVnog) { Settings.pushVnog = it }
                Text(tr("KNMI-weercodes", "KNMI weather codes"), fontSize = 15.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("yellow", "orange", "red").forEach { c -> SelectChip(Waarschuwing.codeLabel(c), c in p.knmi) { save(p.copy(knmi = p.knmi.toggle(c))) } }
                }
                // Same as iOS: extra KNMI pushes, for all profiles.
                SwitchRow(tr("Een uur voordat de code ingaat", "One hour before the code starts"), tr("Als de waarschuwing al eerder bekend was", "When the warning was known earlier"), Settings.pushKnmiVooraf) { Settings.pushKnmiVooraf = it }
                SwitchRow(tr("Als de code is opgeheven", "When the code is lifted"), tr("Code groen: er geldt voor dit weer geen code meer", "Code green: no code applies for this weather any more"), Settings.pushKnmiOpgeheven) { Settings.pushKnmiOpgeheven = it }
            }
            SectionCard(tr("Wanneer", "When"), Icons.Outlined.Schedule) {
                SwitchRow(tr("Altijd", "Always"), checked = p.altijd) { save(p.copy(altijd = it)) }
                if (!p.altijd) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = { TimePickerDialog(ctx, { _, h, m -> save(p.copy(van = h * 60 + m)) }, p.van / 60, p.van % 60, true).show() }, Modifier.weight(1f)) { Text(tr("Van ", "From ") + hm(p.van)) }
                        OutlinedButton(onClick = { TimePickerDialog(ctx, { _, h, m -> save(p.copy(tot = h * 60 + m)) }, p.tot / 60, p.tot % 60, true).show() }, Modifier.weight(1f)) { Text(tr("Tot ", "Until ") + hm(p.tot)) }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (1..7).forEach { d -> SelectChip(MeldingProfiel.dagKort(d), d in p.dagen) { save(p.copy(dagen = if (d in p.dagen) p.dagen - d else p.dagen + d)) } }
                    }
                }
            }
            if (Settings.profielen.size > 1) TextButton(onClick = { Settings.profielen = Settings.profielen.filter { it.id != id }; nav.back() }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                Text(tr("Profiel verwijderen", "Delete profile"))
            }
        }
    }
}

// ------------------------------------------------------------------ radius ("Mijn buurt")

@SuppressLint("MissingPermission")
fun lastLocation(ctx: Context): Pair<Double, Double>? {
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) return null
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    return lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }?.let { it.latitude to it.longitude }
}

fun updateLocation(ctx: Context) {
    lastLocation(ctx)?.let { (la, lo) -> Settings.currentLat = Math.round(la * 1000) / 1000.0; Settings.currentLon = Math.round(lo * 1000) / 1000.0 }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RadiusScreen(nav: Nav) {
    val ctx = LocalContext.current
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { updateLocation(ctx); if (Settings.radiusEnabled) Push.sync() }
    LaunchedEffect(Unit) { updateLocation(ctx) }
    val c = Settings.radiusCenter
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Mijn buurt", "My area"), nav) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard {
                SwitchRow(tr("Alleen meldingen in mijn buurt", "Only alerts in my area"), tr("Voor de lijst, de kaart en pushmeldingen", "For the list, the map and notifications"), Settings.radiusEnabled) { Settings.radiusEnabled = it }
                Text(tr("Straal: ${Settings.radiusKm.toInt()} km", "Radius: ${Settings.radiusKm.toInt()} km"), fontWeight = FontWeight.Medium)
                Slider(Settings.radiusKm.toFloat(), { Settings.radiusKm = it.toInt().toDouble() }, valueRange = 1f..25f, steps = 23)
            }
            SectionCard(tr("Middelpunt", "Centre"), Icons.Outlined.MyLocation) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(Settings.radiusMode == "huidig", { Settings.radiusMode = "huidig" }, SegmentedButtonDefaults.itemShape(0, 2)) { Text(tr("Mijn locatie", "My location")) }
                    SegmentedButton(Settings.radiusMode == "vast", { Settings.radiusMode = "vast" }, SegmentedButtonDefaults.itemShape(1, 2)) { Text(tr("Vaste plaats", "Fixed place")) }
                }
                if (Settings.radiusMode == "huidig") {
                    if (Settings.currentLat == 0.0) {
                        Text(tr("A-Alerts heeft je locatie nodig. Die blijft op je toestel; de server krijgt alleen een afgeronde positie (±100 m) voor pushmeldingen.",
                            "A-Alerts needs your location. It stays on your device; the server only gets a rounded position (±100 m) for notifications."), color = Muted, fontSize = 13.sp)
                        Button(onClick = { perm.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)) }) { Text(tr("Locatie gebruiken", "Use location")) }
                    } else Text(tr("Huidige locatie bekend (afgerond).", "Current location known (rounded)."), color = Muted, fontSize = 13.sp)
                } else {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Werkgebied.namen.forEach { n -> SelectChip(n, Settings.fixedPlaats == n) { Settings.fixedPlaats = n } }
                    }
                }
            }
            if (c != null) AMap(Modifier.fillMaxWidth().height(260.dp).clip(RoundedCornerShape(18.dp)),
                areas = listOf(MapArea("r", listOf(circle(c.first, c.second, Settings.radiusKm)), 0xFFCF0A1E, 0.12)),
                camera = MapCamera(c.first, c.second, when { Settings.radiusKm <= 2 -> 13.0; Settings.radiusKm <= 6 -> 11.5; Settings.radiusKm <= 12 -> 10.5; else -> 9.5 }, key = "${c.first}${Settings.radiusKm}"),
                interactive = false)
        }
    }
}

/** A circle as a ring of [lon, lat]. */
fun circle(lat: Double, lon: Double, km: Double): List<List<Double>> = (0..64).map { i ->
    val a = 2 * Math.PI * i / 64
    listOf(lon + km / (111.32 * Math.cos(Math.toRadians(lat))) * Math.cos(a), lat + km / 110.57 * Math.sin(a))
}

// ------------------------------------------------------------------ texts

@Composable
fun Html(html: String) {
    val color = MaterialTheme.colorScheme.onSurface.toArgb()
    val link = MaterialTheme.colorScheme.primary.toArgb()
    AndroidView(factory = { TextView(it).apply { textSize = 15f; movementMethod = android.text.method.LinkMovementMethod.getInstance() } },
        update = { it.setTextColor(color); it.setLinkTextColor(link); it.text = HtmlCompat.fromHtml(html, HtmlCompat.FROM_HTML_MODE_COMPACT) })
}

@Composable
fun ContentScreen(name: String, nav: Nav) {
    var page by remember(name) { mutableStateOf<ContentPage?>(null) }
    var loaded by remember(name) { mutableStateOf(false) }
    LaunchedEffect(name) { page = Api.content(name); loaded = true }
    val title = when (name) { "privacy" -> tr("Privacyverklaring", "Privacy policy"); "terms" -> tr("Gebruiksvoorwaarden", "Terms of use"); "cookies" -> tr("Cookiebeleid", "Cookie policy"); "hulp" -> tr("Hulp en veelgestelde vragen", "Help and FAQ"); else -> "Disclaimer" }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(title, nav) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)) {
            val p = page
            // Help: search in the questions (every <h2> with the text under it is one question).
            var zoek by remember(name) { mutableStateOf("") }
            if (name == "hulp" && p?.content != null) {
                OutlinedTextField(zoek, { zoek = it }, singleLine = true, placeholder = { Text(tr("Zoek in de vragen", "Search the questions")) },
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp), shape = RoundedCornerShape(12.dp))
            }
            val inhoud = p?.content?.let { html ->
                val q = zoek.trim().lowercase()
                if (name != "hulp" || q.isEmpty()) html else {
                    val vragen = html.split("<h2").drop(1).filter { it.replace(Regex("<[^>]+>"), " ").lowercase().contains(q) }
                    if (vragen.isEmpty()) "<p>" + tr("Geen vraag gevonden. Probeer een ander woord.", "No question found. Try another word.") + "</p>" else vragen.joinToString("") { "<h2$it" }
                }
            }
            when {
                p?.content != null && inhoud != null -> SectionCard { p.version?.let { Text(tr("Laatst bijgewerkt: ", "Last updated: ") + it, color = Muted, fontSize = 12.sp) }; Html(inhoud) }
                !loaded -> Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                else -> EmptyState(tr("Niet beschikbaar", "Not available"), tr("De tekst kon niet worden geladen.", "The text could not be loaded."))
            }
        }
    }
}

@Composable
fun ChangelogScreen(nav: Nav) {
    var list by remember { mutableStateOf<List<ChangelogEntry>?>(null) }
    LaunchedEffect(Unit) { list = Api.changelog() }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Wat is nieuw", "What's new"), nav) }) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val l = list
            if (l == null) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            else items(l, key = { it.id + it.version }) { e ->
                SectionCard(listOfNotNull(e.version, e.title).joinToString(" · ")) {
                    e.releaseDate?.let { d -> parseInstant(if (d.length == 10) d + "T12:00:00Z" else d)?.let { Text(Fmt.day(it), color = Muted, fontSize = 12.sp) } }
                    e.content?.let { Html(it) }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ welcome

/** First launch, as on iOS: welcome, then the first notification profile in steps (where, which, warnings, quiet), ready. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Onboarding(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val laatste = 5
    val state = rememberPagerState { laatste + 1 }
    val rood = Color(0xFFB00A1A)
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) Settings.notificationsEnabled = true }
    val locPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { updateLocation(ctx); Push.sync() }
    var gebied by remember { mutableStateOf(when { Settings.radiusEnabled -> "buurt"; Settings.profielen.firstOrNull()?.plaatsen?.isNotEmpty() == true -> "plaatsen"; else -> "gemeente" }) }
    val p = Settings.profielen.firstOrNull() ?: MeldingProfiel(naam = tr("Standaard", "Default"))
    fun save(np: MeldingProfiel) { Settings.profielen = listOf(np) + Settings.profielen.drop(1) }

    @Composable fun Keuze(titel: String, sub: String, gekozen: Boolean, onClick: () -> Unit) {
        Surface(onClick = onClick, shape = RoundedCornerShape(16.dp), color = if (gekozen) Color.White else Color.White.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(titel, color = if (gekozen) rood else Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    Text(sub, color = (if (gekozen) rood else Color.White).copy(alpha = 0.8f), fontSize = 13.sp)
                }
                Icon(if (gekozen) Icons.Filled.CheckCircle else Icons.Outlined.Circle, null, tint = if (gekozen) rood else Color.White)
            }
        }
    }
    @Composable fun Chip(titel: String, aan: Boolean, onClick: () -> Unit) {
        Surface(onClick = onClick, shape = CircleShape, color = if (aan) Color.White else Color.White.copy(alpha = 0.14f),
            border = if (aan) null else androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.45f))) {
            Text(titel, color = if (aan) rood else Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
        }
    }
    @Composable fun Schakelaar(titel: String, sub: String, aan: Boolean, onChange: (Boolean) -> Unit) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.12f)).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(titel, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                Text(sub, color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
            }
            Switch(aan, onChange)
        }
    }
    @Composable fun Stap(titel: String, tekst: String, inhoud: @Composable ColumnScope.() -> Unit) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Spacer(Modifier.height(24.dp))
            Text(titel, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            Text(tekst, color = Color.White.copy(alpha = 0.9f), fontSize = 15.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(4.dp))
            inhoud()
            Spacer(Modifier.height(24.dp))
        }
    }
    fun hm(x: Int) = "%02d:%02d".format(x / 60, x % 60)

    Column(Modifier.fillMaxSize().background(rood).systemBarsPadding().padding(24.dp)) {
        HorizontalPager(state, Modifier.weight(1f)) { i ->
            when (i) {
                0 -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Image(painterResource(R.drawable.app_icon), null, Modifier.size(120.dp).clip(RoundedCornerShape(28.dp)))
                    Spacer(Modifier.height(28.dp))
                    Text(tr("Welkom bij A-Alerts", "Welcome to A-Alerts"), color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(12.dp))
                    Text(tr("Live meldingen van brandweer, ambulance, politie en traumaheli in de gemeente Apeldoorn, met NL-Alert, Burgernet en KNMI. In een paar stappen stel je in waarvoor je een melding wilt.",
                        "Live alerts from fire, ambulance, police and air ambulance in the municipality of Apeldoorn, with NL-Alert, Burgernet and KNMI. In a few steps you choose what you want to be notified about."),
                        color = Color.White.copy(alpha = 0.9f), fontSize = 16.sp, textAlign = TextAlign.Center)
                }
                1 -> Stap(tr("Waar wil je meldingen van?", "Where do you want alerts from?"), tr("Dit is je eerste meldingsprofiel. Later voeg je er meer toe, bijvoorbeeld voor je werk of je ouders.", "This is your first notification profile. You can add more later, for example for work or your parents.")) {
                    Keuze(tr("De hele gemeente Apeldoorn", "The whole municipality of Apeldoorn"), tr("Alle plaatsen, en Teuge", "All places, and Teuge"), gebied == "gemeente") {
                        gebied = "gemeente"; save(p.copy(plaatsen = emptySet())); Settings.radiusEnabled = false
                    }
                    Keuze(tr("Bepaalde plaatsen", "Certain places"), tr("Kies je wijk of dorp", "Choose your area or village"), gebied == "plaatsen") { gebied = "plaatsen"; Settings.radiusEnabled = false }
                    if (gebied == "plaatsen") FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Werkgebied.namen.forEach { n -> Chip(n, n in p.plaatsen) { save(p.copy(plaatsen = p.plaatsen.toggle(n))) } }
                    }
                    Keuze(tr("Rond mijn locatie", "Around my location"), tr("Binnen ${Settings.radiusKm.toInt()} km van waar je bent", "Within ${Settings.radiusKm.toInt()} km of where you are"), gebied == "buurt") {
                        gebied = "buurt"; save(p.copy(plaatsen = emptySet())); Settings.radiusMode = "huidig"; Settings.radiusEnabled = true
                        locPerm.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                    }
                    if (gebied == "buurt") Slider(Settings.radiusKm.toFloat(), { Settings.radiusKm = it.toInt().toDouble() }, valueRange = 1f..15f, steps = 13,
                        colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Color.White))
                }
                2 -> Stap(tr("Welke meldingen wil je?", "Which alerts do you want?"), tr("Niets gekozen is alles. Je ziet in de pager altijd alle meldingen; dit bepaalt waarvoor je een pushmelding krijgt.", "Nothing chosen means everything. The pager always shows all alerts; this decides what you get notified about.")) {
                    Text(tr("Disciplines", "Services"), color = Color.White.copy(alpha = 0.85f), fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth())
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Dienst.selectable.forEach { d -> Chip(d.label, d.key in p.diensten) { save(p.copy(diensten = p.diensten.toggle(d.key))) } }
                    }
                    Text(tr("Hoe dringend", "How urgent"), color = Color.White.copy(alpha = 0.85f), fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                    Keuze(tr("Alle meldingen", "All alerts"), tr("Ook besteld vervoer en meldingen zonder haast", "Also planned transport and non-urgent alerts"), p.prioriteiten.isEmpty()) { save(p.copy(prioriteiten = emptySet())) }
                    Keuze(tr("Alleen spoed", "Urgent only"), tr("A1 en P1: met zwaailicht en sirene", "A1 and P1: with lights and siren"), p.prioriteiten == setOf("A1", "P1")) { save(p.copy(prioriteiten = setOf("A1", "P1"))) }
                    Keuze(tr("Spoed en snel", "Urgent and fast"), tr("A1, A2, P1 en P2", "A1, A2, P1 and P2"), p.prioriteiten == setOf("A1", "A2", "P1", "P2")) { save(p.copy(prioriteiten = setOf("A1", "A2", "P1", "P2"))) }
                }
                3 -> Stap(tr("Ook waarschuwingen?", "Warnings too?"), tr("NL-Alert, Burgernet, AMBER Alert en Vermist Kind Alert staan in de pager tussen de meldingen; een KNMI-weercode staat als balk bovenaan zolang hij geldt. Kies waarvoor je een pushmelding wilt.", "NL-Alert, Burgernet, AMBER Alert and Missing Child Alert are in the pager between the alerts; a KNMI weather code is a bar at the top while it applies. Choose what you want to be notified about.")) {
                    Schakelaar("NL-Alert", tr("Alarmberichten van de overheid", "Government alert messages"), p.nlalert) { save(p.copy(nlalert = it)) }
                    Schakelaar("Burgernet", tr("Vermissingen en zoekacties", "Missing persons and searches"), p.burgernet) { save(p.copy(burgernet = it)) }
                    Schakelaar("AMBER Alert", tr("Kind vermist en in levensgevaar, heel Nederland", "Child missing and in danger, all of the Netherlands"), Settings.pushAmber) { Settings.pushAmber = it }
                    Schakelaar(tr("Vermist Kind Alert", "Missing Child Alert"), tr("Vermist kind in het werkgebied (alle plaatsen en buurtschappen)", "Missing child in the working area (all places and hamlets)"), Settings.pushVermistKind) { Settings.pushVermistKind = it }
                    Schakelaar(tr("VNOG-incidenten", "VNOG incidents"), tr("Grote incidenten met updates van de veiligheidsregio", "Major incidents with updates from the safety region"), Settings.pushVnog) { Settings.pushVnog = it }
                    Schakelaar(tr("Liveblogs", "Live blogs"), tr("Aanvullingen van A-Alerts op een liveblog (tab Nieuws)", "Updates from A-Alerts in a live blog (News tab)"), Settings.pushNieuwsLiveblog) { Settings.pushNieuwsLiveblog = it }
                    Text(tr("KNMI-weercodes", "KNMI weather codes"), color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth())
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        listOf("yellow", "orange", "red").forEach { c -> Chip(Waarschuwing.codeLabel(c), c in p.knmi) { save(p.copy(knmi = p.knmi.toggle(c))) } }
                    }
                }
                4 -> Stap(tr("Even rust?", "Some quiet?"), tr("Tijdens je stille uren komen meldingen zonder geluid binnen. Spoedmeldingen mogen dan wel geluid maken.", "During your quiet hours notifications arrive silently. Urgent alerts may still make a sound.")) {
                    Schakelaar(tr("Stille uren", "Quiet hours"), tr("Van ${hm(Settings.quietFrom)} tot ${hm(Settings.quietTo)}", "From ${hm(Settings.quietFrom)} to ${hm(Settings.quietTo)}"), Settings.quietMode) { Settings.quietMode = it }
                    if (Settings.quietMode) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = { android.app.TimePickerDialog(ctx, { _, h, m -> Settings.quietFrom = h * 60 + m }, Settings.quietFrom / 60, Settings.quietFrom % 60, true).show() }, Modifier.weight(1f)) { Text(tr("Van ", "From ") + hm(Settings.quietFrom), color = Color.White) }
                        OutlinedButton(onClick = { android.app.TimePickerDialog(ctx, { _, h, m -> Settings.quietTo = h * 60 + m }, Settings.quietTo / 60, Settings.quietTo % 60, true).show() }, Modifier.weight(1f)) { Text(tr("Tot ", "Until ") + hm(Settings.quietTo), color = Color.White) }
                    }
                    Schakelaar(tr("Spoed altijd met geluid", "Urgent always with sound"), tr("A1 en P1 ook tijdens stille uren", "A1 and P1 also during quiet hours"), Settings.criticalAlerts) { Settings.criticalAlerts = it }
                }
                else -> Stap(tr("Je profiel staat klaar", "Your profile is ready"), tr("Zet pushmeldingen aan om ze te ontvangen. Alles pas je later aan in Instellingen › Meldingen. Bel bij nood altijd 112.", "Turn on notifications to receive them. You can change everything later in Settings › Notifications. In an emergency always call 112.")) {
                    val waar = when { Settings.radiusEnabled -> tr("Binnen ${Settings.radiusKm.toInt()} km van je locatie", "Within ${Settings.radiusKm.toInt()} km of your location"); p.plaatsen.isNotEmpty() -> p.plaatsen.sorted().joinToString(", "); else -> tr("De hele gemeente Apeldoorn", "The whole municipality of Apeldoorn") }
                    val wsch = listOfNotNull("NL-Alert".takeIf { p.nlalert }, "Burgernet".takeIf { p.burgernet }, "AMBER Alert".takeIf { Settings.pushAmber },
                        p.knmi.takeIf { it.isNotEmpty() }?.let { k -> "KNMI " + listOf("yellow", "orange", "red").filter { it in k }.joinToString(", ") { Waarschuwing.codeLabel(it).substringAfter(" ") } })
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.12f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(waar, p.samenvatting.substringBefore(" · "), if (p.prioriteiten.isEmpty()) tr("Alle meldingen", "All alerts") else p.prioriteiten.sorted().joinToString(", "),
                            wsch.ifEmpty { listOf(tr("Geen waarschuwingen", "No warnings")) }.joinToString(" · ")).plus(
                            if (Settings.quietMode) listOf(tr("Stil van ${hm(Settings.quietFrom)} tot ${hm(Settings.quietTo)}", "Quiet from ${hm(Settings.quietFrom)} to ${hm(Settings.quietTo)}")) else emptyList()
                        ).forEach { Text("•  $it", color = Color.White, fontSize = 15.sp) }
                    }
                    OutlinedButton(onClick = {
                        if (!Push.available) return@OutlinedButton
                        if (android.os.Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS) else Settings.notificationsEnabled = true
                    }, enabled = !Settings.notificationsEnabled, modifier = Modifier.fillMaxWidth()) {
                        Text(if (Settings.notificationsEnabled) tr("Pushmeldingen staan aan", "Notifications are on") else tr("Pushmeldingen aanzetten", "Turn on notifications"), color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.Center) {
            repeat(laatste + 1) { i -> Box(Modifier.padding(4.dp).size(if (state.currentPage == i) 10.dp else 7.dp).clip(CircleShape).background(Color.White.copy(alpha = if (state.currentPage == i) 1f else 0.5f))) }
        }
        val btn = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = rood)
        if (state.currentPage == laatste) Button(onClick = onDone, colors = btn, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(tr("Aan de slag", "Get started"), fontWeight = FontWeight.Bold) }
        else Button(onClick = { scope.launch { state.animateScrollToPage(state.currentPage + 1) } }, colors = btn, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(tr("Volgende", "Next"), fontWeight = FontWeight.Bold) }
    }
}

// ------------------------------------------------------------------ review prompt

/**
 * Ask for a review: first 4 hours after first use, then at most once a week, a few seconds after opening
 * (never during the welcome screen or while locked). The APK is not in a store, so we ask to share A-Alerts.
 */
@Composable
fun ReviewPrompt() {
    val ctx = LocalContext.current
    var show by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(6_000)
        val now = System.currentTimeMillis()
        if ((ctx as? nl.lrvdlinden.aalerts.MainActivity)?.locked == true) return@LaunchedEffect
        if (now - Settings.firstUse > 4 * 3600_000L && now - Settings.lastReviewAsk > 7 * 86_400_000L) { Settings.lastReviewAsk = now; show = true }
    }
    if (show) AlertDialog(
        onDismissRequest = { show = false },
        title = { Text(tr("Vind je A-Alerts handig?", "Do you like A-Alerts?")) },
        text = { Text(tr("Vertel het door! Deel A-Alerts met buren, familie of vrienden in de gemeente Apeldoorn.", "Spread the word! Share A-Alerts with neighbours, family or friends in the municipality of Apeldoorn.")) },
        confirmButton = { TextButton(onClick = {
            show = false
            ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, tr("A-Alerts: live meldingen in de gemeente Apeldoorn – https://a-alerts.nl", "A-Alerts: live alerts in the municipality of Apeldoorn – https://a-alerts.nl")), tr("Delen", "Share")))
        }) { Text(tr("Delen", "Share")) } },
        dismissButton = { TextButton(onClick = { show = false }) { Text(tr("Niet nu", "Not now")) } },
    )
}
