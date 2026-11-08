package nl.lrvdlinden.aalerts.ui

import android.content.Context
import nl.lrvdlinden.aalerts.isDutch
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import nl.lrvdlinden.aalerts.BuildConfig
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.tr
import java.time.Instant
import kotlin.math.roundToInt

@Composable
fun MeldingDetail(guid: String, nav: Nav) {
    var m by remember(guid) { mutableStateOf(Store.melding(guid)) }
    var loaded by remember(guid) { mutableStateOf(m != null) }
    var weer by remember(guid) { mutableStateOf<AlertWeather?>(null) }
    var weerKlaar by remember(guid) { mutableStateOf(false) }
    LaunchedEffect(guid) {
        if (m == null) { m = Api.melding(guid); loaded = true }
        Settings.markRead(guid)
        Api.addView(guid)
        // Weather for every alert: try again a few times when the server has a hiccup.
        for (i in 0 until 3) { weer = Api.weather(guid); if (weer != null) break; delay(4_000L * (i + 1)) }
        weerKlaar = true
    }
    val melding = m
    if (melding == null) {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Melding", "Alert"), nav) }) { pad ->
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                if (!loaded) CircularProgressIndicator()
                else EmptyState(tr("Melding niet gevonden", "Alert not found"), tr("Meldingen blijven 3 dagen beschikbaar.", "Alerts stay available for 3 days."))
            }
        }
        return
    }
    MeldingContent(melding, weer, weerKlaar, nav)
}

@Composable
private fun MeldingContent(m: Melding, weer: AlertWeather?, weerKlaar: Boolean, nav: Nav) {
    val ctx = LocalContext.current
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) { while (true) { delay(5_000); now = Instant.now() } }
    // Road route and estimate from the A-Alerts API (same as iOS and the website); until then the local estimate.
    var routes by remember(m.guid) { mutableStateOf(Kazernes.routes(m)) }
    LaunchedEffect(m.guid) { Api.routes(m.guid)?.let { a -> Kazernes.vanApi(a).takeIf { it.isNotEmpty() }?.let { routes = it } } }
    // Lifeliner/Zulu named in the alert: live on the map (every 10 s).
    val heliRelevant = remember(m.guid) { HeliKoppeling.relevant(m) }
    if (heliRelevant) LaunchedEffect(m.guid) { while (true) { Store.refreshHelikopters(); delay(10_000) } }
    val heli = if (heliRelevant) HeliKoppeling.voor(m, Store.helikopters) else null
    // Route of this flight and smooth movement between updates.
    var heliSpoor by remember { mutableStateOf<List<HeliSpoorPunt>>(emptyList()) }
    LaunchedEffect(heli?.id) {
        heliSpoor = emptyList()
        val id = heli?.id ?: return@LaunchedEffect
        while (true) { heliSpoor = Api.heliSpoor(id, SpoorBereik.VLUCHT); delay(20_000) }
    }
    var nu by remember { mutableLongStateOf(System.currentTimeMillis()) }
    if (heli != null) LaunchedEffect(Unit) { while (true) { delay(2_000); nu = System.currentTimeMillis() } }
    val heliPos = heli?.geschat(nu)
    val heliNaam = remember(m.guid) { HeliKoppeling.genoemd(m)?.let { id -> id.replace("lifeliner", "Lifeliner ").replace("zulu", "Zulu ") } }
    val verband = remember(m.guid, Store.meldingen) { Verband.gekoppeld(m, Store.meldingen) }
    val waarschuwingen = remember(m.guid, Store.waarschuwingen) { Store.waarschuwingen.filter { it.bron != "knmi" && it.relates(m) } }
    val knmi = remember(m.guid, Store.waarschuwingen) {
        Store.waarschuwingen.filter { it.bron == "knmi" && (m.lat == null || m.lon == null || it.contains(m.lat, m.lon) || it.gebied == null) && !m.datum.isBefore(it.startAt) && (it.eindeAt?.let { e -> !m.datum.isAfter(e) } ?: true) }
    }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        val scroll = rememberScrollState()
        Column(Modifier.fillMaxSize().verticalScroll(scroll)) {
            // Map header
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val h = (maxWidth * 0.9f).coerceIn(300.dp, 440.dp)
                if (m.hasCoordinate) {
                    val la = m.lat!!; val lo = m.lon!!
                    val pts = mutableListOf<MapPoint>()
                    routes.forEach { r -> pts += MapPoint("k:${r.kazerne.id}", r.kazerne.lat, r.kazerne.lon, r.kazerne.dienst.icon ?: R.drawable.icon_brandweer, 26, r.kazerne.naam.substringAfter(" ").take(18), anchorBottom = false, kazerne = r.kazerne.dienst.color.toArgb().toLong()) }
                    m.soort.marker?.let { pts += MapPoint(m.guid, la, lo, it, 44) }
                    // Estimated vehicle on its way (an estimate from the times, not a real position).
                    routes.forEach { r -> r.geschattePositie(now, la to lo)?.let { (pla, plo) ->
                        pts += MapPoint("v:${r.kazerne.id}", pla, plo, r.kazerne.dienst.icon ?: R.drawable.icon_brandweer, 22, tr("schatting", "estimate"), anchorBottom = false, kazerne = r.kazerne.dienst.color.toArgb().toLong())
                    } }
                    heli?.let { h -> pts += MapPoint("h:${h.id}", heliPos!!.first, heliPos.second, h.afbeelding, 64, label = h.naam, flip = h.vliegtWest, anchorBottom = false) }
                    AMap(
                        Modifier.fillMaxWidth().height(h),
                        points = pts,
                        lines = routes.map { r -> MapLine(r.kazerne.id, r.punten.takeIf { it.size > 1 } ?: listOf(r.kazerne.lat to r.kazerne.lon, la to lo), m.soort.color.toArgb().toLong(), width = 2.5) } +
                            listOfNotNull(
                                heli?.takeIf { heliSpoor.isNotEmpty() }?.let { h -> MapLine("spoor", heliSpoor.lijn() + heliPos!!, h.kleur, dashed = false, width = 4.0) },
                                heli?.let { h -> MapLine("heli", listOf(heliPos!!, la to lo), 0xFF9333EA) }),
                        camera = MapCamera(la, lo, if (m.hasStreet) 15.0 else 12.5,
                            fit = (routes.map { it.kazerne.lat to it.kazerne.lon } + listOfNotNull(heli?.let { it.lat to it.lon })).let { if (it.isNotEmpty()) it + listOf(la to lo) else emptyList() },
                            key = m.guid + (heli != null)),
                        interactive = false,
                        onMapClick = { nav.toonOpKaart(m.guid) },
                    )
                } else {
                    Box(Modifier.fillMaxWidth().height(200.dp).background(m.soort.color.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) { DienstIcon(m.soort, 72.dp) }
                }
            }
            Column(Modifier.padding(horizontal = 14.dp).offset(y = (-24).dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Main card
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DienstIcon(m.soort, 44.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(m.soort.label, color = m.soort.textColor, fontWeight = FontWeight.Bold)
                                PrioBadge(m)
                                if (m.isRecent) LiveBadge()
                            }
                            Text(Fmt.day(m.datum) + " · " + Fmt.time(m.datum), color = Muted, fontSize = 13.sp)
                        }
                    }
                    Text(m.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Place, null, tint = Muted, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                        Text(m.plaatsText, color = Muted)
                    }
                    if (m.prioriteitText.isNotBlank()) Text(m.prioriteitText, fontSize = 14.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                        if (!m.grip.isNullOrBlank()) Pill("GRIP ${m.grip}", Color(0xFF7C3AED))
                        if (!m.opschaling.isNullOrBlank()) Pill(tr("Opschaling: ", "Scaled up: ") + m.opschaling, Color(0xFFE3001B))
                        Pill(Fmt.ago(m.datum), Muted)
                        if (m.views > 0) Pill("${m.views}× " + tr("bekeken", "viewed"), Muted)
                    }
                }
                // Actions
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val saved = m.guid in Settings.bewaard
                    ActionButton(if (saved) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder, if (saved) tr("Bewaard", "Saved") else tr("Bewaar", "Save"), Modifier.weight(1f)) { Settings.toggleBewaard(m.guid) }
                    ActionButton(Icons.Outlined.Share, tr("Delen", "Share"), Modifier.weight(1f)) { share(ctx, m) }
                    if (m.hasCoordinate) ActionButton(Icons.Outlined.Map, tr("Kaart", "Map"), Modifier.weight(1f)) { nav.toonOpKaart(m.guid) }
                    if (m.hasCoordinate && m.hasStreet) ActionButton(Icons.Outlined.Directions, tr("Route", "Route"), Modifier.weight(1f)) { openRoute(ctx, m.lat!!, m.lon!!, m.plaatsText) }
                }
                if (weer != null) WeerCard(weer) else SectionCard(tr("Weer ter plaatse", "Weather at the scene"), Icons.Outlined.WbSunny) {
                    if (!weerKlaar) LinearProgressIndicator(Modifier.fillMaxWidth())
                    else Text(tr("Het weer is nu even niet beschikbaar. Open de melding later opnieuw.", "The weather is not available right now. Open the alert again later."), color = Muted, fontSize = 13.sp)
                }
                if (heliRelevant) HeliLiveCard(m, heli, heliNaam) { id -> nav.toonHeli(id) }
                m.fullMelding?.takeIf { it.isNotBlank() }?.let {
                    SectionCard(tr("Oproep", "Call-out"), Icons.Outlined.Sms) {
                        Text(it, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
                    }
                }
                if (routes.isNotEmpty()) SectionCard(tr("Kazernes en aanrijtijd", "Stations and arrival"), Icons.Outlined.LocalFireDepartment) {
                    routes.forEach { r ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            KazerneIcon(r.kazerne.dienst, 30.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(r.kazerne.naam, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                                Text((if (r.genoemd) tr("Genoemd in de oproep", "Named in the call-out") else tr("Dichtstbijzijnde volgens de kaart", "Nearest on the map")) + " · ${r.afstandTekst} · ${r.rijtijdTekst}", color = Muted, fontSize = 12.sp)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                val (fase, sec) = r.fase(now)
                                val min = sec?.let { ((it + 59) / 60).coerceAtLeast(1) }
                                when (fase) {
                                    "uitrukken" -> { Text(tr("Uitrukken", "Turning out"), color = Color(0xFFDC2626), fontWeight = FontWeight.SemiBold, fontSize = 13.sp); Text(tr("vertrek over $min min", "leaves in $min min"), color = Muted, fontSize = 12.sp) }
                                    "onderweg" -> { Text(tr("Onderweg", "En route"), color = Color(0xFFF59E0B), fontWeight = FontWeight.SemiBold, fontSize = 13.sp); Text(tr("nog $min min · ± ", "$min min left · ± ") + Fmt.time(r.aankomst), color = Muted, fontSize = 12.sp) }
                                    "terplaatse" -> Text(tr("Ter plaatse", "On scene"), color = Color(0xFF16A34A), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    else -> Text(tr("Ter plaatse geweest", "Has been on scene"), color = Muted, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                    Text(tr("Schatting op basis van het alarmeringstijdstip, de gebruikelijke uitruktijd en de rijtijd volgens Apple Kaarten, bij spoed (A1, P1) een kwart korter. A-Alerts ontvangt geen positie van de voertuigen: het voertuigje op de kaart staat waar een eenheid volgens die schatting ongeveer zou rijden.",
                        "Estimate based on the alarm time, the usual turnout time and the driving time by Apple Maps, a quarter shorter for urgent calls (A1, P1). A-Alerts receives no vehicle positions: the vehicle on the map is where a unit would roughly be by this estimate."), color = Muted, fontSize = 11.sp)
                }
                if (m.eenheden.isNotEmpty()) SectionCard(tr("Eenheden", "Units"), Icons.Outlined.Groups) {
                    Text(tr("Tik op de ster om een eenheid te volgen. Je krijgt dan ook meldingen van die capcode buiten je plaatsen en straal.",
                        "Tap the star to follow a unit. You then also get alerts for that capcode outside your places and radius."), color = Muted, fontSize = 12.sp)
                    m.eenheden.forEach { e ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(e.naam ?: e.code ?: "–", fontSize = 14.sp)
                                e.code?.let { Text(it, color = Muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace) }
                            }
                            e.code?.let { code ->
                                val volgt = Settings.volgt(code)
                                IconButton(onClick = { Settings.toggleVolg(code, e.naam) }) {
                                    Icon(if (volgt) Icons.Filled.Star else Icons.Outlined.StarBorder, if (volgt) tr("Niet meer volgen", "Unfollow") else tr("Volg deze capcode", "Follow this capcode"),
                                        tint = if (volgt) Color(0xFFF5B800) else Muted)
                                }
                            }
                        }
                    }
                }
                Settings.geenPushReden(m)?.let { reden ->
                    // Why this device got no push (the alert is in the list, but not in your notifications), as on iOS.
                    SectionCard(tr("Geen pushmelding op dit toestel", "No notification on this device"), Icons.Outlined.NotificationsOff) {
                        Text(reden, fontSize = 14.sp)
                        Text(tr("De melding staat wel in de lijst. Pas je meldingen aan in Instellingen › Meldingen.", "The alert is in the list. Change your notifications in Settings › Notifications."), color = Muted, fontSize = 12.sp)
                    }
                }
                if (knmi.isNotEmpty() || waarschuwingen.isNotEmpty()) SectionCard(tr("Waarschuwingen in de buurt", "Warnings nearby"), Icons.Outlined.WarningAmber) {
                    (waarschuwingen + knmi).forEach { w ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { nav.waarschuwing(w.id) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            WaarschuwingIcon(w, 28.dp); Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(w.kop, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                                Text(w.titel, color = Muted, fontSize = 12.sp, maxLines = 1)
                            }
                            Icon(Icons.Filled.ChevronRight, null, tint = Muted)
                        }
                    }
                }
                if (verband.isNotEmpty()) SectionCard(tr("Verloop", "Timeline"), Icons.Outlined.Timeline) {
                    Text(tr("Meldingen die mogelijk bij dit incident horen.", "Alerts that may belong to this incident."), color = Muted, fontSize = 12.sp)
                    verband.forEach { v ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { nav.melding(v.melding.guid) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            DienstIcon(v.melding.soort, 28.dp); Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(v.melding.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                                Text(v.redenen.joinToString(" · "), color = Muted, fontSize = 12.sp, maxLines = 2)
                            }
                            Text(Fmt.time(v.melding.datum), color = Muted, fontSize = 12.sp)
                        }
                    }
                }
                SectionCard(tr("Gegevens", "Details"), Icons.Outlined.Info) {
                    InfoRow(tr("Discipline", "Service"), m.soort.label)
                    InfoRow(tr("Prioriteit", "Priority"), m.prioriteit)
                    InfoRow(tr("Categorie", "Category"), m.categorie)
                    InfoRow(tr("Plaats", "Place"), m.plaatsNaam)
                    InfoRow(tr("Regio", "Region"), m.regio)
                    InfoRow("Capcode", m.capcode)
                    InfoRow(tr("Tijd", "Time"), Fmt.day(m.datum) + " " + Fmt.time(m.datum))
                    if (m.lat != null && m.lon != null) InfoRow(tr("Coördinaten", "Coordinates"), "%.5f, %.5f".format(m.lat, m.lon))
                }
                Spacer(Modifier.height(24.dp))
            }
        }
        // Floating top bar over the map
        // Bar behind the status bar once the content scrolls over the map.
        if (scroll.value > 200) Box(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background.copy(alpha = 0.96f)).statusBarsPadding().height(52.dp))
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 6.dp)) {
            RoundIcon(Icons.AutoMirrored.Filled.ArrowBack, tr("Terug", "Back")) { nav.back() }
            Spacer(Modifier.weight(1f))
            RoundIcon(Icons.Outlined.Share, tr("Delen", "Share")) { share(ctx, m) }
        }
    }
}

@Composable
fun RoundIcon(icon: ImageVector, desc: String, onClick: () -> Unit) {
    Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, desc, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(22.dp))
    }
}

@Composable
fun ActionButton(icon: ImageVector, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, modifier = modifier) {
        Column(Modifier.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Text(label, fontSize = 12.sp, maxLines = 1)
        }
    }
}

@Composable
fun WeerCard(w: AlertWeather?, live: Boolean = false) {
    w ?: return
    SectionCard(if (live) tr("Het weer nu", "Weather now") else tr("Weer ter plaatse", "Weather at the scene"), Icons.Outlined.WbSunny) {
        if (live) Text(tr("Live · Apeldoorn · elke 5 minuten bijgewerkt", "Live · Apeldoorn · updated every 5 minutes"), color = Color(0xFF16A34A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        w.condition?.let { Text(conditie(it), fontWeight = FontWeight.Medium) }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            w.temperature?.let { Stat("${it.roundToInt()}°", tr("Temperatuur", "Temperature")) }
            w.apparent?.let { Stat("${it.roundToInt()}°", tr("Gevoel", "Feels like")) }
            w.windSpeed?.let { Stat("${it.roundToInt()} km/u", tr("Wind", "Wind") + (w.windDirection?.let { d -> " " + windRichting(d) } ?: "")) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            w.windGust?.let { Stat("${it.roundToInt()} km/u", tr("Windstoten", "Gusts")) }
            w.humidity?.let { Stat("${(it * 100).roundToInt()}%", tr("Luchtvochtigheid", "Humidity")) }
            w.precipitation?.let { Stat("%.1f mm".format(it), tr("Neerslag", "Rain")) }
        }
        Text("Apple Weer", color = Muted, fontSize = 11.sp)
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column { Text(value, fontWeight = FontWeight.Bold, fontSize = 18.sp); Text(label, color = Muted, fontSize = 11.sp) }
}

fun windRichting(d: Double): String {
    val dirs = if (isDutch) listOf("N", "NO", "O", "ZO", "Z", "ZW", "W", "NW") else listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    return dirs[(((d + 22.5) % 360) / 45).toInt().coerceIn(0, 7)]
}

fun conditie(c: String): String {
    val nl = mapOf("Clear" to "Helder", "MostlyClear" to "Overwegend helder", "PartlyCloudy" to "Half bewolkt", "MostlyCloudy" to "Overwegend bewolkt",
        "Cloudy" to "Bewolkt", "Foggy" to "Mist", "Haze" to "Nevel", "Drizzle" to "Motregen", "Rain" to "Regen", "HeavyRain" to "Zware regen",
        "Showers" to "Buien", "ScatteredThunderstorms" to "Lokaal onweer", "Thunderstorms" to "Onweer", "Snow" to "Sneeuw", "Flurries" to "Sneeuwvlokken",
        "Sleet" to "Natte sneeuw", "Windy" to "Winderig", "Breezy" to "Fris", "Hail" to "Hagel", "FreezingRain" to "IJzel", "Frigid" to "Streng koud", "Hot" to "Heet")
    val en = c.replace(Regex("([a-z])([A-Z])"), "$1 $2")
    return if (isDutch) nl[c] ?: en else en
}

fun share(ctx: Context, m: Melding) {
    val text = "${m.title}\n${m.plaatsText} · ${Fmt.dayTime(m.datum)}\n${m.prioriteitText}\n\nA-Alerts – ${BuildConfig.WEBSITE}/melding/${m.guid}"
    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), tr("Delen", "Share")))
}

/** Opens navigation in Google Maps (or another maps app). */
fun openRoute(ctx: Context, lat: Double, lon: Double, label: String) {
    val nav = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lon"))
    val geo = Intent(Intent.ACTION_VIEW, Uri.parse("geo:$lat,$lon?q=$lat,$lon(${Uri.encode(label)})"))
    runCatching { ctx.startActivity(nav) }.recoverCatching { ctx.startActivity(geo) }
        .recoverCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lon"))) }
}

/** The Lifeliner (or Zulu) of this alert, live: altitude, speed, distance to the scene and "Volg op kaart". */
@Composable
fun HeliLiveCard(m: Melding, h: Helikopter?, naam: String?, onFollow: (String) -> Unit) {
    SectionCard(h?.naam ?: naam ?: tr("Traumahelikopter", "Air ambulance"), Icons.Outlined.Flight) {
        if (h == null) {
            Text(tr("${naam ?: "De traumahelikopter"} is nu niet live te zien. Laag vliegend of aan de grond ontbreekt de positie soms.",
                "${naam ?: "The air ambulance"} is not visible live right now. Flying low or on the ground, the position is sometimes missing."), color = Muted, fontSize = 13.sp)
            return@SectionCard
        }
        val km = if (m.lat != null && m.lon != null) Geo.distanceKm(h.lat, h.lon, m.lat, m.lon) else null
        Row(verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(h.afbeelding), null,
                Modifier.width(76.dp).graphicsLayer { scaleX = if (h.vliegtWest) -1f else 1f })
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(h.naam, fontWeight = FontWeight.Bold); LiveBadge()
                }
                Text(h.info, color = Muted, fontSize = 12.sp)
                km?.let { d ->
                    val eta = h.snelheidKmh?.takeIf { it > 40 && !h.opGrond }?.let { v -> Math.round(d / v * 60.0) }
                    Text(tr("${Fmt.km(d)} van de melding", "${Fmt.km(d)} from the alert") + (eta?.let { tr(" · ± $it min", " · ± $it min") } ?: ""), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
        h.voorspelling?.let { Text(it.tekst, fontSize = 13.sp, fontWeight = FontWeight.Medium) }
        Button(onClick = { onFollow(h.id) }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.MyLocation, null); Spacer(Modifier.width(8.dp)); Text(tr("Volg ${h.naam} op de kaart", "Follow ${h.naam} on the map"))
        }
        Text(tr("Positie via adsb.lol, kan enkele seconden achterlopen.", "Position via adsb.lol, may lag a few seconds."), color = Muted, fontSize = 11.sp)
    }
}
