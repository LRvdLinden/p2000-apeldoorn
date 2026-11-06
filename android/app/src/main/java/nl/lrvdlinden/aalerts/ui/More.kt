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
                Text(tr("KNMI-weercodes", "KNMI weather codes"), fontSize = 15.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("yellow", "orange", "red").forEach { c -> SelectChip(Waarschuwing.codeLabel(c), c in p.knmi) { save(p.copy(knmi = p.knmi.toggle(c))) } }
                }
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
    val title = when (name) { "privacy" -> tr("Privacyverklaring", "Privacy policy"); "terms" -> tr("Gebruiksvoorwaarden", "Terms of use"); "cookies" -> tr("Cookiebeleid", "Cookie policy"); else -> "Disclaimer" }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(title, nav) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)) {
            val p = page
            when {
                p?.content != null -> SectionCard { p.version?.let { Text(tr("Laatst bijgewerkt: ", "Last updated: ") + it, color = Muted, fontSize = 12.sp) }; Html(p.content) }
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

@Composable
fun Onboarding(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberPagerState { 5 }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) Settings.notificationsEnabled = true
        scope.launch { state.animateScrollToPage(4) }
    }
    data class Page(val icon: Int?, val vector: androidx.compose.ui.graphics.vector.ImageVector?, val title: String, val text: String)
    val pages = listOf(
        Page(R.drawable.app_icon, null, tr("Welkom bij A-Alerts", "Welcome to A-Alerts"),
            tr("Live meldingen van brandweer, ambulance, politie en traumaheli in de gemeente Apeldoorn.", "Live alerts from fire, ambulance, police and air ambulance in the municipality of Apeldoorn.")),
        Page(R.drawable.icon_nlalert, null, tr("NL-Alert, Burgernet en KNMI", "NL-Alert, Burgernet and KNMI"),
            tr("Ook NL-Alerts, Burgernet-acties en KNMI-weercodes voor de gemeente, in de tijdlijn en op de kaart.", "Also NL-Alerts, Burgernet calls and KNMI weather codes for the municipality, in the timeline and on the map.")),
        Page(null, Icons.Outlined.Map, tr("Kaart met live helikopters", "Map with live helicopters"),
            tr("Alle meldingen op de kaart, met kazernes, de Lifeliner en de politiehelikopters live.", "All alerts on the map, with stations, the Lifeliner and the police helicopters live.")),
        Page(null, Icons.Outlined.NotificationsActive, tr("Pushmeldingen", "Push notifications"),
            tr("Krijg een melding bij nieuwe meldingen die bij jou passen. Je kiest zelf plaatsen, disciplines en tijden.", "Get notified about new alerts that suit you. You choose places, services and times.")),
        Page(null, Icons.Outlined.CheckCircle, tr("Klaar!", "All set!"),
            tr("Bel bij nood altijd 112. A-Alerts is geen officiële dienst van hulpdiensten of overheid.", "In an emergency always call 112. A-Alerts is not an official service of the emergency services or government.")),
    )
    Column(Modifier.fillMaxSize().background(Color(0xFFB00A1A)).systemBarsPadding().padding(24.dp)) {
        HorizontalPager(state, Modifier.weight(1f)) { i ->
            val p = pages[i]
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Box(Modifier.size(120.dp).clip(RoundedCornerShape(28.dp)).background(Color.White.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                    if (p.icon != null) Image(painterResource(p.icon), null, Modifier.size(if (i == 0) 120.dp else 84.dp).clip(RoundedCornerShape(28.dp)))
                    else p.vector?.let { Icon(it, null, tint = Color.White, modifier = Modifier.size(64.dp)) }
                }
                Spacer(Modifier.height(28.dp))
                Text(p.title, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Text(p.text, color = Color.White.copy(alpha = 0.9f), fontSize = 16.sp, textAlign = TextAlign.Center)
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.Center) {
            repeat(5) { i -> Box(Modifier.padding(4.dp).size(if (state.currentPage == i) 10.dp else 7.dp).clip(CircleShape).background(Color.White.copy(alpha = if (state.currentPage == i) 1f else 0.5f))) }
        }
        val btn = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFFB00A1A))
        when (state.currentPage) {
            3 -> {
                Button(onClick = {
                    if (!Push.available) { scope.launch { state.animateScrollToPage(4) } }
                    else if (android.os.Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else { Settings.notificationsEnabled = true; scope.launch { state.animateScrollToPage(4) } }
                }, colors = btn, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(tr("Meldingen aanzetten", "Turn on notifications"), fontWeight = FontWeight.Bold) }
                TextButton(onClick = { scope.launch { state.animateScrollToPage(4) } }, modifier = Modifier.fillMaxWidth()) { Text(tr("Later", "Later"), color = Color.White) }
            }
            4 -> Button(onClick = onDone, colors = btn, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(tr("Aan de slag", "Get started"), fontWeight = FontWeight.Bold) }
            else -> Button(onClick = { scope.launch { state.animateScrollToPage(state.currentPage + 1) } }, colors = btn, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(tr("Volgende", "Next"), fontWeight = FontWeight.Bold) }
        }
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
