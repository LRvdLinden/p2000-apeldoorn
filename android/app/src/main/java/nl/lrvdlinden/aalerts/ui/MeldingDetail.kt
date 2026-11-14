package nl.lrvdlinden.aalerts.ui

import android.content.Context
import nl.lrvdlinden.aalerts.isDutch
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.border
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
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
import androidx.compose.ui.draw.rotate
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
    var toonFeedback by remember(m.guid) { mutableStateOf(false) }
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
    // Every alert of this incident, also the ones the list does not hold any more (asked from the server).
    LaunchedEffect(m.guid) { Store.laadVerloop(m) }
    val verband = remember(m.guid, Store.meldingen, Store.incidentExtra) { Verband.gekoppeld(m, Store.metVerloop) }
    // Every unit of this incident with the time of its alarm, and the building (BAG) at a fire alert with a house number.
    val inzet = remember(m.guid, Store.meldingen, Store.incidentExtra) { Verband.inzet(m, Store.metVerloop) }
    var pand by remember(m.guid) { mutableStateOf<nl.lrvdlinden.aalerts.data.Pand?>(null) }
    LaunchedEffect(m.guid) { if (m.soort == Dienst.BRANDWEER && m.hasStreet && m.locatie?.any { it.isDigit() } == true) pand = Api.pand(m.guid) }
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
                    heli?.let { h -> pts += MapPoint("h:${h.id}", heliPos!!.first, heliPos.second, h.afbeelding, Settings.heliBreedte, label = h.naam, flip = h.vliegtWest, anchorBottom = false) }
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
                    if (m.isGrootIncident) GrootIncidentBadge(m)
                    Text(m.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Place, null, tint = Muted, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                        Text(m.hectometerpaal?.let { "${it.tekst}, ${m.plaatsNaam}" } ?: m.plaatsText, color = Muted, modifier = Modifier.weight(1f))
                        m.hectometerpaal?.let { HectometerBord(it) }
                    }
                    pand?.tekst?.takeIf { it.isNotBlank() }?.let { t ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Apartment, null, tint = Muted, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp))
                            Column { Text(t, fontSize = 14.sp); Text(tr("Gebouw volgens de BAG (Kadaster)", "Building according to the BAG (Kadaster)"), color = Muted, fontSize = 11.sp) }
                        }
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
                var routeOpen by remember { mutableStateOf(false) }
                if (routeOpen) RouteSheet(m) { routeOpen = false }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val saved = m.guid in Settings.bewaard
                    ActionButton(if (saved) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder, if (saved) tr("Bewaard", "Saved") else tr("Bewaar", "Save"), Modifier.weight(1f)) { Settings.toggleBewaard(m.guid) }
                    ActionButton(Icons.Outlined.Share, tr("Delen", "Share"), Modifier.weight(1f)) { share(ctx, m) }
                    if (m.hasCoordinate) ActionButton(Icons.Outlined.Map, tr("Kaart", "Map"), Modifier.weight(1f)) { nav.toonOpKaart(m.guid) }
                    if (m.hasCoordinate) ActionButton(Icons.Outlined.Directions, tr("Route", "Route"), Modifier.weight(1f)) { routeOpen = true }
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
                if (m.voertuigen.isNotEmpty()) SectionCard(tr("Voertuigen (${m.voertuigen.size})", "Vehicles (${m.voertuigen.size})"), Icons.Outlined.LocalShipping) {
                    m.voertuigen.forEach { v ->
                        Column {
                            Text(v.label ?: tr("Voertuig", "Vehicle"), fontSize = 14.sp)
                            (v.nrb ?: v.nra)?.let { Text(it, color = Color(0xFFDC2626), fontSize = 12.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold) }
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
                if (inzet.second >= 2 && inzet.first.size >= 2) SectionCard(tr("Eenheden bij deze inzet (${inzet.first.size})", "Units at this incident (${inzet.first.size})"), Icons.Outlined.LocalShipping) {
                    Text(tr("Alle eenheden uit de ${inzet.second} meldingen die bij deze inzet horen, met de tijd van alarmering.", "All units from the ${inzet.second} alerts that belong to this incident, with the time of their alarm."), color = Muted, fontSize = 12.sp)
                    inzet.first.forEach { e ->
                        val hid = e.heli
                        if (hid != null) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { nav.toonHeli(hid) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            val trauma = hid.startsWith("lifeliner")
                            Text(Fmt.time(e.tijd), fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.width(52.dp))
                            androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(if (trauma) R.drawable.heli_lifeliner else R.drawable.heli_politie), null, Modifier.width(54.dp).height(20.dp)); Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(if (trauma) "Lifeliner ${hid.removePrefix("lifeliner")}" else "Zulu ${hid.removePrefix("zulu")}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text(if (trauma) tr("Traumahelikopter · toon op de kaart", "Air ambulance · show on the map") else tr("Politiehelikopter · toon op de kaart", "Police helicopter · show on the map"), color = Muted, fontSize = 12.sp)
                            }
                            Icon(Icons.Filled.ChevronRight, null, tint = Muted)
                        } else Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(Fmt.time(e.tijd), fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.width(52.dp))
                            Box(Modifier.width(6.dp).height(28.dp).background(e.melding.soort.color, RoundedCornerShape(3.dp))); Spacer(Modifier.width(10.dp))
                            Column { Text(e.naam, fontSize = 14.sp); e.type?.takeIf { it.isNotBlank() }?.let { Text(it, color = Muted, fontSize = 12.sp) } }
                        }
                    }
                }
                if (verband.isNotEmpty()) SectionCard(tr("Verloop", "Timeline"), Icons.Outlined.Timeline) {
                    Text(if (verband.all { it.zeker }) tr("Meldingen van dezelfde inzet.", "Alerts of the same incident.")
                        else tr("Meldingen van dezelfde inzet, en meldingen die er mogelijk bij horen (geen zekerheid).", "Alerts of the same incident, and alerts that may belong to it (not certain)."), color = Muted, fontSize = 12.sp)
                    // "↑ Opgeschaald naar Middelbrand": an alert that is a step up from the one before it.
                    val stappen = remember(m.guid, verband) { Verband.opschalingen(listOf(m) + verband.map { it.melding }) }
                    stappen[m.guid]?.let { Text("↑ " + tr("Deze melding: opgeschaald naar $it", "This alert: scaled up to $it"), color = Color(0xFFF59E0B), fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                    verband.sortedByDescending { it.melding.millis }.forEach { v ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { nav.melding(v.melding.guid) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            DienstIcon(v.melding.soort, 28.dp); Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                stappen[v.melding.guid]?.let { Text("↑ " + tr("Opgeschaald naar $it", "Scaled up to $it"), color = Color(0xFFF59E0B), fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
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
                    Settings.afstandKm(m)?.let { InfoRow(tr("Afstand", "Distance"), "%.1f km".format(it).replace(".", ",")) }
                    if (m.lat != null && m.lon != null) InfoRow(tr("Coördinaten", "Coordinates"), "%.5f, %.5f".format(m.lat, m.lon))
                }
                // The source of every P2000 alert.
                val bronOpen = androidx.compose.ui.platform.LocalUriHandler.current
                Text(tr("Bron: p2000.page", "Source: p2000.page"), color = Muted, fontSize = 13.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().clickable { bronOpen.openUri("https://p2000.page") }.padding(vertical = 4.dp))
                OutlinedButton(onClick = { toonFeedback = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.Feedback, null); Spacer(Modifier.width(8.dp)); Text(tr("Klopt deze melding niet?", "Is this alert wrong?"))
                }
                Spacer(Modifier.height(24.dp))
            }
        }
        if (toonFeedback) MeldingFeedbackDialog(m) { toonFeedback = false }
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
    val ctx = LocalContext.current
    val blauw = Color(0xFF60A5FA)
    // Same layout as iOS: "METEO-gegevens" with a row per value.
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("METEO-gegevens", "Weather data"), fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f))
            if (live) Text("● " + tr("Live", "Live"), color = Color(0xFF16A34A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        w.temperature?.let { t ->
            MeteoRij(Icons.Outlined.Thermostat, blauw, tr("Temperatuur", "Temperature"), w.apparent?.let { tr("Gevoelstemperatuur ${it.roundToInt()}°C", "Feels like ${it.roundToInt()}°C") }, "${t.roundToInt()}°C")
        }
        w.cloudCover?.let { c ->
            HorizontalDivider()
            MeteoRij(Icons.Outlined.Cloud, blauw, tr("Bewolking", "Cloud cover"), w.condition?.let { conditie(it) }, "${(if (c <= 1) c * 100 else c).roundToInt()}%")
        }
        w.windDirection?.let { d ->
            HorizontalDivider()
            MeteoRij(Icons.Outlined.Navigation, blauw, tr("Windrichting", "Wind direction"), tr("De wind waait vanuit het ${windRichting(d)}", "The wind blows from the ${windRichting(d)}"), windRichting(d), rotatie = (d + 180).toFloat())
        }
        w.windSpeed?.let { v ->
            HorizontalDivider()
            MeteoRij(Icons.Outlined.Air, blauw, tr("Windsnelheid", "Wind speed"), tr("Windvlagen tot ${(w.windGust ?: v * 1.5).roundToInt()} km/h", "Gusts up to ${(w.windGust ?: v * 1.5).roundToInt()} km/h"), "${v.roundToInt()} km/h")
        }
        Text(if (live) tr("Het weer van nu in Apeldoorn, elke 5 minuten bijgewerkt", "The weather right now in Apeldoorn, updated every 5 minutes") else tr("Gegevens zijn op basis van incident tijdstip en locatie", "Data based on the time and place of the incident"),
            color = Muted, fontSize = 11.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Text("Apple Weather", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Muted)
            TextButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://weatherkit.apple.com/legal-attribution.html"))) }) { Text(tr("Overige gegevensbronnen", "Other data sources"), fontSize = 11.sp) }
        }
    }
}

@Composable
private fun MeteoRij(icon: ImageVector, kleur: Color, titel: String, sub: String?, waarde: String, rotatie: Float = 0f) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = kleur, modifier = Modifier.size(24.dp).rotate(rotatie))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(titel, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            sub?.let { Text(it, color = Muted, fontSize = 12.sp) }
        }
        Text(waarde, fontWeight = FontWeight.Bold, fontSize = 17.sp)
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
    val text = "${m.title}\n${m.plaatsText} · ${Fmt.dayTime(m.datum)}\n${m.prioriteitText}\n\nA-Alerts – ${m.shareUrl}"
    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), tr("Delen", "Share")))
}

/** "Route naar incident": Google Maps, Apple Kaarten or copy the address (same choices as iOS and the live pager). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteSheet(m: Melding, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    var gekopieerd by remember { mutableStateOf(false) }
    val adres = if (m.hasStreet) "${m.locatie}, ${m.plaatsText}" else m.plaatsText
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MaterialTheme.colorScheme.background) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(tr("Route naar incident", "Route to incident"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(adres, color = Muted, fontSize = 14.sp)
            if (!m.hasStreet) Text(tr("De meldkamer gaf geen straat door: de route gaat naar het midden van de plaats.",
                "The control room gave no street: the route goes to the centre of the town."), color = Muted, fontSize = 12.sp)
            RouteOptie(R.drawable.routeapp_googlemaps, "Google Maps", tr("Route met de auto in Google Maps", "Driving route in Google Maps")) {
                openRoute(ctx, m.lat!!, m.lon!!, m.plaatsText); onDismiss()
            }
            RouteOptie(R.drawable.routeapp_applemaps, tr("Apple Kaarten", "Apple Maps"), tr("Route met de auto in Apple Kaarten", "Driving route in Apple Maps")) {
                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://maps.apple.com/?daddr=${m.lat},${m.lon}&dirflg=d&q=${Uri.encode(adres)}"))) }
                onDismiss()
            }
            RouteOptie(null, if (gekopieerd) tr("Gekopieerd", "Copied") else tr("Kopieer adres", "Copy address"), tr("Om zelf in een andere app te plakken", "To paste into another app yourself")) {
                val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("Adres", adres)); gekopieerd = true
            }
        }
    }
}

@Composable
private fun RouteOptie(icon: Int?, titel: String, subtitel: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surface).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(Muted.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
            if (icon != null) androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(icon), null, Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)))
            else Icon(Icons.Outlined.ContentCopy, null, tint = Muted)
        }
        Column(Modifier.weight(1f)) {
            Text(titel, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(subtitel, color = Muted, fontSize = 13.sp)
        }
    }
}

/** Opens navigation in Google Maps (or another maps app). */
fun openRoute(ctx: Context, lat: Double, lon: Double, label: String) {
    val nav = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lon"))
    val geo = Intent(Intent.ACTION_VIEW, Uri.parse("geo:$lat,$lon?q=$lat,$lon(${Uri.encode(label)})"))
    runCatching { ctx.startActivity(nav) }.recoverCatching { ctx.startActivity(geo) }
        .recoverCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lon"))) }
}

/** The orange line "Waarschijnlijk geannuleerd om 11:42". */
@Composable
fun HeliInzetRegel(x: nl.lrvdlinden.aalerts.data.HeliInzet) {
    val kleur = if (x.geannuleerd) Color(0xFFF59E0B) else Muted
    Column(Modifier.fillMaxWidth().background(kleur.copy(alpha = 0.14f), RoundedCornerShape(12.dp)).padding(10.dp)) {
        Text(x.titel, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Text(x.uitleg, color = Muted, fontSize = 12.sp)
    }
}

/** The Lifeliner (or Zulu) of this alert, live: altitude, speed, distance to the scene and "Volg op kaart". */
@Composable
fun HeliLiveCard(m: Melding, h: Helikopter?, naam: String?, onFollow: (String) -> Unit) {
    SectionCard(h?.naam ?: naam ?: tr("Traumahelikopter", "Air ambulance"), Icons.Outlined.Flight) {
        // Probably cancelled on its way here, or did not take off (worked out from the flight).
        Store.inzetVoor(m.guid)?.let { HeliInzetRegel(it) }
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

/** The green hectometre sign: road number (red for an A road, yellow for an N road), the side and the number. */
@Composable
fun HectometerBord(p: nl.lrvdlinden.aalerts.data.Hectometerpaal) {
    val groen = Color(0xFF0A7A3D)
    Column(
        Modifier.semantics(mergeDescendants = true) { contentDescription = tr("Hectometerpaal ${p.tekst}", "Hectometre post ${p.tekst}") }
            .background(groen, RoundedCornerShape(6.dp)).padding(1.5.dp).border(1.5.dp, Color.White, RoundedCornerShape(5.dp))
            .widthIn(min = 50.dp).padding(horizontal = 6.dp, vertical = 3.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(p.weg, color = if (p.isSnelweg) Color.White else Color.Black, fontSize = 11.sp, lineHeight = 13.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.background(if (p.isSnelweg) Color(0xFFD0021B) else Color(0xFFFFD200), RoundedCornerShape(3.dp))
                    .border(1.dp, if (p.isSnelweg) Color.White else Color.Black, RoundedCornerShape(3.dp)).padding(horizontal = 4.dp))
            if (p.zijde.isNotEmpty()) Text(p.zijde, color = Color.White, fontSize = 10.sp, lineHeight = 12.sp, fontWeight = FontWeight.Bold)
        }
        Text(p.km, color = Color.White, fontSize = 17.sp, lineHeight = 19.sp, fontWeight = FontWeight.Bold)
    }
}
