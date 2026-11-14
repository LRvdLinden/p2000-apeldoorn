package nl.lrvdlinden.aalerts.ui

import nl.lrvdlinden.aalerts.data.Dienst

import androidx.compose.ui.graphics.Color

import androidx.compose.ui.semantics.semantics

import androidx.compose.ui.semantics.contentDescription

import androidx.compose.ui.draw.alpha

import androidx.compose.ui.graphics.compositeOver

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.tr

/** Map layers (same as the app, the website and Apple TV). */
/** Figures of one station: call-outs (an incident counts once), per hour and per day, vehicles and capcodes. */
@Composable
private fun PostCijfersBlok(id: String) {
    var c by remember(id) { mutableStateOf<PostCijfers?>(null) }
    var klaar by remember(id) { mutableStateOf(false) }
    LaunchedEffect(id) { c = Api.post(id); klaar = true }
    val p = c
    when {
        p == null && !klaar -> LinearProgressIndicator(Modifier.fillMaxWidth())
        p == null -> Text(tr("De cijfers van deze post zijn nu niet op te halen.", "The figures of this station cannot be loaded right now."), color = Muted, fontSize = 12.sp)
        p.inzetten == 0 -> Text(tr("Van deze post zijn nog geen inzetten geteld. We tellen sinds november 2026.", "No call-outs counted for this station yet. We count since November 2026."), color = Muted, fontSize = 12.sp)
        else -> {
            Text("${p.inzetten} " + (if (p.inzetten == 1) tr("inzet", "call-out") else tr("inzetten", "call-outs")) + (parseInstant(p.sinds)?.let { " · " + tr("sinds ", "since ") + Fmt.shortDay(it) } ?: ""), fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            @Composable fun balken(titel: String, rij: List<Int>, labels: List<String>) {
                val hoogste = (rij.maxOrNull() ?: 1).coerceAtLeast(1)
                Text(titel, color = Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Row(Modifier.fillMaxWidth().height(56.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    rij.forEachIndexed { i, n ->
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                            Box(Modifier.fillMaxWidth().height((2 + 40 * n / hoogste).dp).background(androidx.compose.ui.graphics.Color(0xFFDC2626), RoundedCornerShape(2.dp)))
                            Text(labels.getOrElse(i) { "" }, fontSize = 9.sp, color = Muted, maxLines = 1)
                        }
                    }
                }
            }
            balken(tr("Per uur van de dag", "Per hour of the day"), p.perUur, List(24) { if (it % 6 == 0) "$it" else "" })
            balken(tr("Per dag van de week", "Per day of the week"), p.perDag, listOf(tr("ma", "Mo"), tr("di", "Tu"), tr("wo", "We"), tr("do", "Th"), tr("vr", "Fr"), tr("za", "Sa"), tr("zo", "Su")))
            if (p.voertuigen.isNotEmpty()) {
                Text(tr("Voertuigen (${p.voertuigen.size})", "Vehicles (${p.voertuigen.size})"), color = Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                p.voertuigen.take(6).forEach { Text("${it.nr ?: ""}  ${it.label ?: ""}", fontSize = 12.sp, maxLines = 1) }
            }
            if (p.capcodes.isNotEmpty()) {
                Text(tr("Capcodes (${p.capcodes.size})", "Capcodes (${p.capcodes.size})"), color = Muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                p.capcodes.take(6).forEach { Text("${it.code ?: ""}  ${it.naam ?: ""}", fontSize = 12.sp, maxLines = 1) }
            }
            Text(tr("Een herhaling of opschaling van hetzelfde incident telt als één inzet.", "A repeat or scale-up of the same incident counts as one call-out."), color = Muted, fontSize = 11.sp)
        }
    }
}

/** The layers per category, as they are listed under "Kaartlagen". */
private val LAAG_GROEPEN get() = listOf(
    tr("Meldingen en alerts", "Alerts") to listOf(KaartLaag.MELDINGEN, KaartLaag.WAARSCHUWINGEN, KaartLaag.KNMI),
    tr("Lucht", "Air") to listOf(KaartLaag.HELIKOPTERS),
    tr("Verkeer", "Traffic") to listOf(KaartLaag.VERKEER, KaartLaag.FLITSERS),
    tr("Posten en ziekenhuizen", "Stations and hospitals") to listOf(KaartLaag.KAZERNES, KaartLaag.ZIEKENHUIZEN),
    tr("Kaart", "Map") to listOf(KaartLaag.WERKGEBIED, KaartLaag.REGIO, KaartLaag.BUIENRADAR),
)

enum class KaartLaag(val key: String) {
    MELDINGEN("meldingen"), WAARSCHUWINGEN("waarschuwingen"), KNMI("knmi"), HELIKOPTERS("helikopters"), KAZERNES("kazernes"), ZIEKENHUIZEN("ziekenhuizen"), VERKEER("verkeer"), FLITSERS("flitsers"), WERKGEBIED("werkgebied"), BUIENRADAR("buienradar"), REGIO("regio");
    val label get() = when (this) {
        MELDINGEN -> tr("Meldingen", "Alerts"); WAARSCHUWINGEN -> "NL-Alert & Burgernet"; KNMI -> tr("KNMI-codes", "KNMI codes")
        HELIKOPTERS -> tr("Luchtvaart (live)", "Aviation (live)"); KAZERNES -> tr("Kazernes en posten (brandweer, ambulance, politie)", "Stations (fire, ambulance, police)")
        ZIEKENHUIZEN -> tr("Ziekenhuizen en vliegbases", "Hospitals and air bases"); WERKGEBIED -> tr("Gemeentegrens", "Municipal border")
        BUIENRADAR -> tr("Buienradar (KNMI)", "Rain radar (KNMI)")
        REGIO -> tr("Grens veiligheidsregio", "Border of the safety region")
        VERKEER -> tr("Verkeer (NDW)", "Traffic (NDW)"); FLITSERS -> tr("Flitsers (vast)", "Speed cameras (fixed)")
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(nav: Nav) {
    val lagen = Settings.kaartLagen
    var selected by remember { mutableStateOf<String?>(nav.kaartFocus?.let { it }) }
    var showLayers by remember { mutableStateOf(false) }
    val periode = Settings.kaartPeriode
    val focus = nav.kaartFocus
    // Filter chips on the map: hidden disciplines and sources (dienst keys, "burgernet", "nlalert").
    var verborgen by remember { mutableStateOf(setOf<String>()) }
    // Tapping a Lifeliner/Zulu chip with more than one: show all of them.
    var heliFit by remember { mutableStateOf<MapCamera?>(null) }

    // Traffic and speed cameras: every minute while one of the two layers is on.
    val verkeerAan = KaartLaag.VERKEER.key in lagen || KaartLaag.FLITSERS.key in lagen
    LaunchedEffect(verkeerAan) {
        while (verkeerAan) { Store.refreshVerkeer(); delay(60_000) }
    }
    // Defence and government aircraft: only loaded while that layer is on.
    val defensieAan = KaartLaag.HELIKOPTERS.key in Settings.kaartLagen && Settings.luchtSoorten.any { it != "trauma" && it != "politie" }
    LaunchedEffect(defensieAan) {
        while (true) { Store.refreshLucht(defensieAan); if (!defensieAan) break; delay(10_000) }
    }
    // Layer Luchtvaart: only the kinds chosen under Kaartlagen; the route trail and flights work for all of them.
    val heliLijst = Store.helikopters.filter { it.soort in Settings.luchtSoorten }
    val luchtLijst = Store.lucht.filter { it.keuzeSoort in Settings.luchtSoorten }
    val vliegend = heliLijst + luchtLijst
    // Always loaded: the Lifeliner and Zulu chips show even when the helicopter layer is off.
    // The border of the safety region is asked once, when its layer is switched on.
    val regioAan = KaartLaag.REGIO.key in Settings.kaartLagen
    LaunchedEffect(regioAan) { if (regioAan) Store.laadRegio() }
    LaunchedEffect(Unit) {
        while (true) { Store.refreshHelikopters(); delay(10_000) }
    }
    // Smooth movement: between updates the helicopters fly on along speed and heading (like AirAssist/iOS).
    var nu by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(KaartLaag.HELIKOPTERS.key in lagen) {
        while (KaartLaag.HELIKOPTERS.key in Settings.kaartLagen) { delay(if (Settings.prestatieModus) 10_000 else 1_000); nu = System.currentTimeMillis() }
    }
    // Route of the last 30 minutes for every helicopter in the air (at most 6), refreshed every 30 s.
    var sporen by remember { mutableStateOf<Map<String, List<HeliSpoorPunt>>>(emptyMap()) }
    LaunchedEffect(KaartLaag.HELIKOPTERS.key in lagen) {
        while (KaartLaag.HELIKOPTERS.key in Settings.kaartLagen) {
            val lucht = (Store.helikopters + Store.lucht).filter { !it.opGrond && it.keuzeSoort in Settings.luchtSoorten }.take(6)
            sporen = lucht.associate { it.id to Api.heliSpoor(it.id, SpoorBereik.KORT) }
            delay(30_000)
        }
    }
    // Selected helicopter: its route in the chosen range and its recent flights.
    val selHeli = selected?.takeIf { it.startsWith("h:") }?.removePrefix("h:")
    var bereik by remember { mutableStateOf(SpoorBereik.entries.firstOrNull { it.key == Settings.spoorStandaard } ?: SpoorBereik.VLUCHT) }
    // Rain radar (KNMI) tiles, refreshed every 5 minutes; null when off or not available.
    var radar by remember { mutableStateOf<RadarInfo?>(null) }
    LaunchedEffect(KaartLaag.BUIENRADAR.key in lagen) {
        radar = null
        while (KaartLaag.BUIENRADAR.key in Settings.kaartLagen) { radar = Api.radar(); delay(60_000) }
    }
    // Long press on the map: make a helicopter zone or plan a route there.
    var langGedrukt by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var selSpoor by remember { mutableStateOf<List<HeliSpoorPunt>>(emptyList()) }
    var selVluchten by remember { mutableStateOf<List<HeliVlucht>?>(null) }
    // The flight as a list of places (newest first) and the flight itself ("25 min in de lucht").
    var selPlaatsen by remember { mutableStateOf<List<SpoorPlaats>>(emptyList()) }
    var selVlucht by remember { mutableStateOf<HeliVlucht?>(null) }
    LaunchedEffect(selHeli, bereik) {
        selSpoor = emptyList(); selPlaatsen = emptyList(); selVlucht = null
        val id = selHeli ?: return@LaunchedEffect
        while (true) { val s = Api.heliSpoorVol(id, bereik); selSpoor = s.punten; selPlaatsen = s.plaatsen; selVlucht = s.vlucht; delay(20_000) }
    }
    LaunchedEffect(selHeli) { selVluchten = null; selHeli?.let { selVluchten = Api.heliVluchten(it) } }
    LaunchedEffect(Unit) { Store.loadLocaties() }

    // Playback of the selected trail: position 0..1 (null = live), playing, speed (flight seconds per second).
    var afspeel by remember(selHeli, bereik) { mutableStateOf<Float?>(null) }
    var speelt by remember(selHeli, bereik) { mutableStateOf(false) }
    var snelheid by remember { mutableIntStateOf(60) }
    val tijden = remember(selSpoor) { selSpoor.map { parseInstant(it.t)?.toEpochMilli() ?: 0L } }
    val duur = if (tijden.size >= 2) (tijden.last() - tijden.first()).coerceAtLeast(1) else 0L
    LaunchedEffect(speelt, snelheid, duur) {
        while (speelt && duur > 0) {
            delay(100)
            val v = ((afspeel ?: 0f) + 100f * snelheid / duur).coerceAtMost(1f)
            afspeel = v
            if (v >= 1f) speelt = false
        }
    }
    val afspeelMoment = afspeel?.takeIf { duur > 0 }?.let { tijden.first() + (duur * it).toLong() }
    val afspeelPunt: Pair<Double, Double>? = afspeelMoment?.let { t ->
        val i = tijden.indexOfFirst { it >= t }
        when {
            i < 0 -> selSpoor.last().let { it.lat to it.lon }
            i == 0 -> selSpoor[0].let { it.lat to it.lon }
            else -> {
                val a = selSpoor[i - 1]; val b = selSpoor[i]
                val span = (tijden[i] - tijden[i - 1]).toDouble()
                val f = if (span > 0) (t - tijden[i - 1]) / span else 1.0
                (a.lat + (b.lat - a.lat) * f) to (a.lon + (b.lon - a.lon) * f)
            }
        }
    }

    val cutoff = System.currentTimeMillis() - periode * 3600_000L
    val meldingen = remember(Store.meldingen, periode, Settings.diensten, Settings.plaatsen, Settings.prioriteiten, Settings.radiusEnabled) {
        Store.meldingen.filter { it.millis >= cutoff && it.hasCoordinate && it.hasStreet && Settings.matchesList(it) }
    }.filter { it.soort.key !in verborgen }
    val warns = Store.waarschuwingen.filter { (it.startAt.toEpochMilli() >= cutoff || it.isActief) }
    val points = mutableListOf<MapPoint>()
    val areas = mutableListOf<MapArea>()
    if (KaartLaag.WERKGEBIED.key in lagen) areas += MapArea("werkgebied", Werkgebied.gemeenteGebied, 0xFFCF0A1E, 0.03, width = 1.5)
    // The border of the safety region (CBS, via PDOK): a solid teal line, hardly any fill.
    if (KaartLaag.REGIO.key in lagen && Store.regio.isNotEmpty()) areas += MapArea("regio", Store.regio, 0xFF0F766E, 0.0, width = 2.5)
    if (KaartLaag.KNMI.key in lagen) warns.filter { it.bron == "knmi" && !it.isBeeindigd }.forEach { areas += MapArea(it.id, it.gebied ?: emptyList(), it.color.toArgb().toLong(), 0.18) }
    if (KaartLaag.WAARSCHUWINGEN.key in lagen) warns.filter { it.bron != "knmi" && it.bron !in verborgen }.forEach { w ->
        if (w.bron == "nlalert") areas += MapArea(w.id, w.gebied ?: emptyList(), w.color.toArgb().toLong(), if (w.isBeeindigd) 0.06 else 0.2)
        if (w.hasCoordinate) points += MapPoint("w:${w.id}", w.lat!!, w.lon!!, w.marker, 34, dim = w.isBeeindigd)
    }
    if (KaartLaag.KAZERNES.key in lagen) Werkgebied.kazernes.forEach { k -> k.dienst.icon?.let { points += MapPoint("k:${k.id}", k.lat, k.lon, it, if (selected == "k:${k.id}") 30 else 24, anchorBottom = false, kazerne = k.dienst.color.toArgb().toLong()) } }
    // Several alerts at one address: one marker with the number on top; trauma helicopter first, then police.
    val adressen = remember(meldingen) { meldingen.groupBy { "%.4f,%.4f".format(java.util.Locale.US, it.lat, it.lon) }.filterValues { it.size > 1 }.mapValues { (_, l) -> l.sortedByDescending { it.millis } } }
    if (KaartLaag.MELDINGEN.key in lagen) {
        val samen = adressen.values.flatten().map { it.guid }.toSet()
        meldingen.filter { it.guid !in samen }.sortedBy { it.millis }.forEach { m -> m.soort.marker?.let { points += MapPoint(m.guid, m.lat!!, m.lon!!, it, if (m.guid == selected) 46 else 34, dim = m.guid in Settings.gelezen && m.guid != selected) } }
        adressen.forEach { (k, l) ->
            val boven = l.firstOrNull { it.soort == Dienst.TRAUMAHELI } ?: l.firstOrNull { it.soort == Dienst.POLITIE } ?: l.groupBy { it.soort }.maxBy { it.value.size }.value.first()
            boven.soort.marker?.let { points += MapPoint("a:$k", l[0].lat!!, l[0].lon!!, it, if (selected == "a:$k") 46 else 38, count = l.size) }
        }
    }
    val lines = mutableListOf<MapLine>()
    // Traffic from the NDW: the route as a line (closure dashed), every item as an icon; fixed speed cameras.
    val vk = Store.verkeer
    if (KaartLaag.VERKEER.key in lagen) vk?.items?.forEach { v ->
        val r = v.route
        if (r.size >= 2) lines += MapLine("vl:${v.id}", r, v.kleur.toArgb().toLong(), dashed = v.soort == "afsluiting", width = if (v.soort == "file") 6.0 else 4.0)
        // Accident and breakdown: a pin on the spot; closure, jam and roadworks: round on the stretch.
        points += MapPoint("v:${v.id}", v.lat, v.lon, v.icon, if (selected == "v:${v.id}") 32 else 26, anchorBottom = v.isMarker)
    }
    if (KaartLaag.FLITSERS.key in lagen) vk?.flitsers?.forEach { f ->
        points += MapPoint("f:${f.id}", f.lat, f.lon, R.drawable.verkeer_flitser, if (selected == "f:${f.id}") 30 else 24, anchorBottom = true)
    }
    if (KaartLaag.ZIEKENHUIZEN.key in lagen) Store.locaties.forEach { l ->
        points += MapPoint("l:${l.id}", l.lat, l.lon, l.icon, if (selected == "l:${l.id}") 30 else 22, anchorBottom = false)
    }
    if (KaartLaag.HELIKOPTERS.key in lagen) vliegend.forEach { h ->
        val (la, lo) = h.geschat(nu)
        points += MapPoint("h:${h.id}", la, lo, h.afbeelding, Settings.heliBreedte, label = h.naam, flip = h.vliegtWest, anchorBottom = false)
        val spoor = if (h.id == selHeli && selSpoor.isNotEmpty()) selSpoor else sporen[h.id].orEmpty()
        val afspelen = h.id == selHeli && afspeelPunt != null
        if (spoor.isNotEmpty()) lines += MapLine("spoor:${h.id}", spoor.lijn() + listOfNotNull((la to lo).takeIf { !afspelen }),
            if (afspelen) (h.kleur and 0x00FFFFFF) or 0x66000000 else h.kleur, dashed = false, width = if (h.id == selHeli) 4.5 else 3.0)
        if (afspelen && afspeelMoment != null) {
            lines += MapLine("afgespeeld:${h.id}", selSpoor.filterIndexed { i, _ -> tijden[i] <= afspeelMoment }.map { it.lat to it.lon } + afspeelPunt!!, h.kleur, dashed = false, width = 6.0)
            points += MapPoint("afspeel:${h.id}", afspeelPunt.first, afspeelPunt.second, h.afbeelding, 54, flip = h.vliegtWest, anchorBottom = false)
        }
        // Probable destination: thin dashed line to the hospital or base.
        h.voorspelling?.takeIf { selHeli == null || selHeli == h.id }?.let { v -> lines += MapLine("dest:${h.id}", listOf(la to lo, v.lat to v.lon), h.kleur, dashed = true, width = 2.0) }
    }

    val focusMelding = focus?.let { Store.melding(it) }
    // Following a helicopter: the camera moves along with every new position.
    val focusHeli = focus?.takeIf { it.startsWith("h:") }?.let { f -> (Store.helikopters + Store.lucht).firstOrNull { it.id == f.removePrefix("h:") } }
    LaunchedEffect(focus) {
        if (focus?.startsWith("h:") == true && KaartLaag.HELIKOPTERS.key !in Settings.kaartLagen) Settings.kaartLagen = Settings.kaartLagen + KaartLaag.HELIKOPTERS.key
    }
    val camera = when {
        heliFit != null -> heliFit!!
        focusHeli != null -> MapCamera(focusHeli.lat, focusHeli.lon, 12.5, key = "${focusHeli.id}${focusHeli.gezien}")
        focusMelding?.hasCoordinate == true -> MapCamera(focusMelding.lat!!, focusMelding.lon!!, 15.0, key = focus)
        else -> APELDOORN
    }

    Box(Modifier.fillMaxSize()) {
        AMap(Modifier.fillMaxSize(), points = points, areas = areas, lines = lines, camera = camera, onPointClick = { selected = it }, onMapClick = { selected = null; heliFit = null; if (nav.kaartFocus?.startsWith("h:") == true) nav.kaartFocus = null },
            onLongPress = { la, lo -> langGedrukt = la to lo },
            radarTiles = radar?.takeIf { it.beschikbaar && KaartLaag.BUIENRADAR.key in lagen }?.tiles)

        // Period and layers
        Column(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 8.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                LazyRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(listOf(1, 6, 24, 72)) { u ->
                        FilterChip(selected = periode == u, onClick = { Settings.kaartPeriode = u },
                            label = { Text(if (u < 24) "$u " + tr("uur", "h") else "${u / 24} " + tr(if (u == 24) "dag" else "dagen", if (u == 24) "day" else "days"), fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(containerColor = MaterialTheme.colorScheme.surface, selectedContainerColor = MaterialTheme.colorScheme.primary, selectedLabelColor = MaterialTheme.colorScheme.onPrimary))
                    }
                }
                Spacer(Modifier.width(8.dp))
                SmallFloatingActionButton(onClick = { showLayers = true }, containerColor = MaterialTheme.colorScheme.surface) { Icon(Icons.Outlined.Layers, tr("Kaartlagen", "Map layers")) }
            }
            // Filter chips: disciplines, Burgernet and NL-Alert (always), Lifeliner and Zulu (when in the list).
            val alleMeldingen = Store.meldingen.filter { it.millis >= cutoff && it.hasCoordinate && Settings.matchesList(it) }
            val aantalBron = { b: String -> Store.waarschuwingen.count { it.bron == b && (it.startAt.toEpochMilli() >= cutoff || it.isActief) } }
            val heliGroepen = listOf("trauma" to "Lifeliner", "politie" to "Zulu").mapNotNull { (soort, naam) ->
                heliLijst.filter { it.soort == soort }.takeIf { it.isNotEmpty() }?.let { Triple(soort, naam, it) }
            }
            LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                // A pill with 0 is hidden and comes back as soon as there is one.
                items(listOf(Dienst.BRANDWEER, Dienst.AMBULANCE, Dienst.POLITIE, Dienst.TRAUMAHELI).filter { d -> alleMeldingen.any { it.soort == d } }, key = { it.key }) { d ->
                    val on = d.key !in verborgen && KaartLaag.MELDINGEN.key in lagen
                    KaartChip(on, d.color, "${d.label}: ${alleMeldingen.count { it.soort == d }}", {
                        if (KaartLaag.MELDINGEN.key !in lagen) { Settings.kaartLagen = Settings.kaartLagen + KaartLaag.MELDINGEN.key; verborgen = verborgen - d.key }
                        else verborgen = if (on) verborgen + d.key else verborgen - d.key
                    }) {
                        d.icon?.let { Image(painterResource(it), null, Modifier.size(16.dp)) }
                        Spacer(Modifier.width(4.dp)); Text("${alleMeldingen.count { it.soort == d }}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                val bronnen = listOf(Triple("burgernet", "Burgernet", Color(0xFF0067B1)), Triple("nlalert", "NL-Alert", Color(0xFFE3001B)),
                    Triple("amber", "AMBER Alert", Color(0xFFEC6E24)), Triple("vermistkind", tr("Vermist Kind Alert", "Missing Child Alert"), Color(0xFF1B265E)))
                    .filter { aantalBron(it.first) > 0 }
                items(bronnen, key = { it.first }) { (b, naam, kleur) ->
                    val n = aantalBron(b)
                    val on = b !in verborgen && KaartLaag.WAARSCHUWINGEN.key in lagen
                    KaartChip(on, kleur, "$naam: $n", {
                        if (KaartLaag.WAARSCHUWINGEN.key !in lagen) { Settings.kaartLagen = Settings.kaartLagen + KaartLaag.WAARSCHUWINGEN.key; verborgen = verborgen - b }
                        else verborgen = if (on) verborgen + b else verborgen - b
                    }) {
                        Image(painterResource(when (b) { "burgernet" -> R.drawable.icon_burgernet; "amber" -> R.drawable.icon_amber; "vermistkind" -> R.drawable.icon_vermistkind; else -> R.drawable.icon_nlalert }), null, Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp)); Text("$n", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                // Pill for the layer Defensie en overheid: only while the layer is on and something is flying.
                if (KaartLaag.HELIKOPTERS.key in lagen && luchtLijst.isNotEmpty()) item(key = "defensie") {
                    val list = luchtLijst
                    KaartChip(true, Color(0xFF586A33), tr("Defensie", "Defence") + ": ${list.size}", {
                        if (list.size == 1) { heliFit = null; selected = "h:${list[0].id}" }
                        else { selected = null; heliFit = MapCamera(list[0].lat, list[0].lon, 8.0, fit = list.map { it.lat to it.lon }, key = "fit-defensie-${System.nanoTime()}") }
                    }) {
                        Image(painterResource(list[0].afbeelding), null, Modifier.width(30.dp).height(15.dp))
                        Spacer(Modifier.width(4.dp)); Text("${list.size}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                items(heliGroepen, key = { it.first }) { (_, naam, list) ->
                    KaartChip(KaartLaag.HELIKOPTERS.key in lagen, Color(list[0].kleur), "$naam: ${list.size}", {
                        if (KaartLaag.HELIKOPTERS.key !in lagen) Settings.kaartLagen = Settings.kaartLagen + KaartLaag.HELIKOPTERS.key
                        if (list.size == 1) { heliFit = null; selected = "h:${list[0].id}"; nav.kaartFocus = "h:${list[0].id}" }
                        else { selected = null; nav.kaartFocus = null; heliFit = MapCamera(list[0].lat, list[0].lon, 9.0, fit = list.map { it.lat to it.lon }, key = "fit-$naam-${System.nanoTime()}") }
                    }) {
                        Image(painterResource(list[0].afbeelding), null, Modifier.width(30.dp).height(15.dp))
                        Spacer(Modifier.width(4.dp)); Text("${list.size}", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Preview of the selection
        val sel = selected
        Box(Modifier.align(Alignment.BottomCenter).padding(12.dp)) {
            when {
                sel == null -> {}
                sel.startsWith("h:") -> (Store.helikopters + Store.lucht).firstOrNull { it.id == sel.removePrefix("h:") }?.let {
                    HeliCard(it, bereik, { b -> bereik = b }, selVluchten, selPlaatsen, selVlucht,
                        afspelen = Afspelen(afspeel, speelt, snelheid, afspeelMoment, kanAfspelen = selSpoor.size >= 2,
                            onSpeel = { if (afspeel == null || afspeel!! >= 1f) afspeel = 0f; speelt = true }, onPauze = { speelt = false },
                            onZoek = { speelt = false; afspeel = it }, onSnelheid = { snelheid = it }, onStop = { speelt = false; afspeel = null })) { selected = null }
                }
                sel.startsWith("v:") -> Store.verkeer?.items?.firstOrNull { it.id == sel.removePrefix("v:") }?.let { v ->
                    PreviewCard(onClose = { selected = null }) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Image(painterResource(v.icon), null, Modifier.size(36.dp, if (v.isMarker) 45.dp else 36.dp))
                                Spacer(Modifier.width(10.dp))
                                Column {
                                    Text(v.soortLabel.uppercase(), color = v.kleur, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    Text(v.kopTekst, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            v.watTekst?.let { Text(it, fontSize = 15.sp) }
                            v.detailTekst?.let { Text(it, color = v.kleur, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
                            (listOfNotNull(v.oorzaak) + v.toelichting).forEach { Text(it, fontSize = 14.sp) }
                            if (v.tijdvakTeksten.isNotEmpty()) Text(v.tijdvakTeksten.joinToString(" · "), fontSize = 14.sp)
                            val tijden = listOfNotNull(v.startAt?.let { tr("Sinds ", "Since ") + Fmt.dayTime(it) }, v.eindeAt?.let { tr("Tot ", "Until ") + Fmt.dayTime(it) }, v.hinderTekst)
                            if (tijden.isNotEmpty()) Text(tijden.joinToString(" · "), color = Muted, fontSize = 13.sp)
                            v.bron?.let { Text(tr("Bron: $it via NDW", "Source: $it via NDW"), color = Muted, fontSize = 13.sp) }
                        }
                    }
                }
                sel.startsWith("f:") -> Store.verkeer?.flitsers?.firstOrNull { it.id == sel.removePrefix("f:") }?.let { f ->
                    PreviewCard(onClose = { selected = null }) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Image(painterResource(R.drawable.verkeer_flitser), null, Modifier.size(36.dp, 45.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(if (f.isTraject) tr("Trajectcontrole", "Average speed check") else tr("Flitser", "Speed camera"), fontSize = 17.sp, fontWeight = FontWeight.Bold)
                            }
                            f.max?.let { Text(tr("Max. $it km/u", "Max. $it km/h"), fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
                            Text(tr("Vaste flitser uit OpenStreetMap. Mobiele controles staan in geen enkele open bron.", "Fixed speed camera from OpenStreetMap. Mobile checks are not in any open source."), color = Muted, fontSize = 13.sp)
                        }
                    }
                }
                sel.startsWith("l:") -> Store.locaties.firstOrNull { it.id == sel.removePrefix("l:") }?.let { l ->
                    PreviewCard(onClose = { selected = null }) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Image(painterResource(l.icon), null, Modifier.size(36.dp)); Spacer(Modifier.width(10.dp))
                                Column { Text(l.naam, fontWeight = FontWeight.SemiBold); Text(listOfNotNull(l.soortLabel, l.plaats).joinToString(" · "), color = Muted, fontSize = 12.sp) }
                            }
                            Store.helikopters.filter { it.voorspelling?.id == l.id }.forEach { h ->
                                Text(tr("${h.naam} is waarschijnlijk onderweg hierheen", "${h.naam} is probably on its way here") + (h.voorspelling?.etaMin?.let { " · ± $it min" } ?: ""), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
                sel.startsWith("w:") -> Store.waarschuwing(sel.removePrefix("w:"))?.let { w -> PreviewCard(onClose = { selected = null }) { WaarschuwingRow(w) { nav.waarschuwing(w.id) } } }
                sel.startsWith("k:") -> Werkgebied.kazernes.firstOrNull { it.id == sel.removePrefix("k:") }?.let { k ->
                    PreviewCard(onClose = { selected = null }) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                KazerneIcon(k.dienst, 36.dp); Spacer(Modifier.width(10.dp))
                                Column { Text(k.naam, fontWeight = FontWeight.SemiBold); Text(k.plaats ?: "", color = Muted, fontSize = 12.sp) }
                            }
                            PostCijfersBlok(k.id)
                        }
                    }
                }
                sel.startsWith("a:") -> adressen[sel.removePrefix("a:")]?.let { l ->
                    PreviewCard(onClose = { selected = null }) {
                        Column(Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState())) {
                            Text(tr("${l.size} meldingen op ${l[0].plaatsText}", "${l.size} alerts at ${l[0].plaatsText}"), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp))
                            l.forEach { m -> MeldingRow(m) { nav.melding(m.guid) } }
                        }
                    }
                }
                else -> Store.melding(sel)?.let { m -> PreviewCard(onClose = { selected = null }) { MeldingRow(m) { nav.melding(m.guid) } } }
            }
        }
    }
    langGedrukt?.let { (la, lo) ->
        AlertDialog(onDismissRequest = { langGedrukt = null }, title = { Text(tr("Deze plek", "This spot")) },
            text = {
                Column {
                    if (Settings.heliZones.size < HeliZone.MAX) TextButton(onClick = {
                        ZoneConcept.nieuw = HeliZone(naam = if (Settings.heliZones.isEmpty()) tr("Thuis", "Home") else tr("Zone ${Settings.heliZones.size + 1}", "Zone ${Settings.heliZones.size + 1}"),
                            lat = Math.round(la * 1e4) / 1e4, lon = Math.round(lo * 1e4) / 1e4)
                        langGedrukt = null; nav.open("helizones")
                    }) { Text(tr("Maak hier een heli-zone", "Create a helicopter zone here")) }
                    TextButton(onClick = {
                        langGedrukt = null
                        runCatching { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("google.navigation:q=$la,$lo"))) }
                            .onFailure { ctx.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("geo:$la,$lo?q=$la,$lo"))) }
                    }) { Text(tr("Route hierheen", "Route here")) }
                }
            },
            confirmButton = {}, dismissButton = { TextButton(onClick = { langGedrukt = null }) { Text(tr("Annuleer", "Cancel")) } })
    }
    if (showLayers) ModalBottomSheet(onDismissRequest = { showLayers = false }, containerColor = MaterialTheme.colorScheme.background) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(tr("Kaartlagen", "Map layers"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            LAAG_GROEPEN.forEach { (titel, lagen) ->
                Text(titel.uppercase(), color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
                lagen.forEach { l ->
                    SwitchRow(l.label, checked = l.key in Settings.kaartLagen) { Settings.kaartLagen = Settings.kaartLagen.toggle(l.key) }
                }
            }
            // Layer Luchtvaart: which kinds of aircraft show on the map, with the number flying now.
            if (KaartLaag.HELIKOPTERS.key in Settings.kaartLagen) {
                Text(tr("Toestellen op de kaart", "Aircraft on the map"), fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                val alle = Store.helikopters + Store.luchtAlle
                LaunchedEffect(Unit) { Store.refreshLuchtAlle() }
                LUCHT_SOORTEN.forEach { (k, naam, img) ->
                    val n = alle.count { it.keuzeSoort == k && !it.opGrond }
                    Row(Modifier.fillMaxWidth().clickable { Settings.luchtSoorten = Settings.luchtSoorten.toggle(k) }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = k in Settings.luchtSoorten, onCheckedChange = { Settings.luchtSoorten = Settings.luchtSoorten.toggle(k) })
                        Image(painterResource(img), null, Modifier.width(56.dp).height(22.dp))
                        Spacer(Modifier.width(8.dp)); Text(naam, Modifier.weight(1f), fontSize = 14.sp)
                        if (n > 0) Text("$n", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Muted)
                    }
                }
            }
            if (KaartLaag.BUIENRADAR.key in Settings.kaartLagen) Text(
                if (radar?.beschikbaar == false) tr("De buienradar is nog niet beschikbaar.", "The rain radar is not available yet.") else tr("Buienradar: KNMI, elke 5 minuten nieuw.", "Rain radar: KNMI, updated every 5 minutes."),
                color = Muted, fontSize = 12.sp)
            NavRow(tr("Kaart en helikopters", "Map and helicopters"), tr("Licht of donker, routespoor, eenheden", "Light or dark, route trail, units")) { showLayers = false; nav.open("kaartweergave") }
            Text(tr("Kaart: © OpenFreeMap, © OpenMapTiles, © OpenStreetMap. Helikopters: adsb.lol (ODbL), posities kunnen achterlopen.",
                "Map: © OpenFreeMap, © OpenMapTiles, © OpenStreetMap. Helicopters: adsb.lol (ODbL), positions may lag."), color = Muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun PreviewCard(onClose: () -> Unit, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp, modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp)) {
        Box {
            content()
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).size(28.dp)) { Icon(Icons.Filled.Close, tr("Sluiten", "Close"), modifier = Modifier.size(16.dp)) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HeliCard(h: Helikopter, bereik: SpoorBereik, onBereik: (SpoorBereik) -> Unit, vluchten: List<HeliVlucht>?, plaatsen: List<SpoorPlaats>, vlucht: HeliVlucht?, afspelen: Afspelen, onClose: () -> Unit) {
    PreviewCard(onClose) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(h.afbeelding), null, Modifier.width(80.dp).graphicsLayer { scaleX = if (h.vliegtWest) -1f else 1f })
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) { Text(h.naam, fontWeight = FontWeight.Bold, fontSize = 17.sp); Text(h.soortLabel + (h.basis?.let { " · $it" } ?: ""), color = Muted, fontSize = 13.sp) }
                // The bell on this aircraft: a push when it takes off, wherever that is.
                val volgt = h.id in Settings.heliVolg
                IconButton(onClick = { Settings.heliVolg = if (volgt) Settings.heliVolg - h.id else if (Settings.heliVolg.size < 40) Settings.heliVolg + h.id else Settings.heliVolg }, modifier = Modifier.padding(end = 24.dp)) {
                    Icon(if (volgt) Icons.Filled.Notifications else Icons.Outlined.Notifications,
                        if (volgt) tr("Geen melding meer als ${h.naam} opstijgt", "No more notification when ${h.naam} takes off") else tr("Melding als ${h.naam} opstijgt", "Notify me when ${h.naam} takes off"),
                        tint = if (volgt) androidx.compose.ui.graphics.Color(0xFFF59E0B) else Muted)
                }
            }
            if (!h.opGrond) Row(verticalAlignment = Alignment.CenterVertically) {
                Text(h.boven?.let { tr("Nu boven $it", "Now above $it") } ?: tr("Nu boven zee of over de grens", "Now above sea or across the border"), fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
                if (vlucht?.onderweg == true) Text(vlucht.inDeLucht, color = androidx.compose.ui.graphics.Color(0xFF16A34A), fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
            }
            InfoRow(tr("Hoogte", "Altitude"), listOfNotNull(h.hoogteTekst, h.hoogteTweede).joinToString(" · "))
            InfoRow(tr("Snelheid", "Speed"), listOfNotNull(h.snelheidTekst, h.snelheidTweede).joinToString(" · "))
            if (!h.opGrond && h.koers != null) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(tr("Koers", "Heading"), color = Muted, fontSize = 14.sp, modifier = Modifier.weight(1f))
                // A small compass: the needle points where the aircraft is heading.
                Icon(Icons.Filled.Navigation, null, tint = androidx.compose.ui.graphics.Color(0xFFDC2626),
                    modifier = Modifier.size(16.dp).graphicsLayer { rotationZ = h.koers.toFloat() })
                Spacer(Modifier.width(6.dp)); Text(h.koersTekst ?: "–", fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
            InfoRow(tr("Laatst gezien", "Last seen"), parseInstant(h.gezien)?.let { Fmt.ago(it) })
            h.voorspelling?.let { Text(it.tekst, fontWeight = FontWeight.Medium, fontSize = 13.sp) }
            Store.annuleringVan(h.id)?.let { HeliInzetRegel(it) }
            // Route on the map: this flight, the last 30 minutes or the whole day.
            Text(tr("Routespoor", "Route"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SpoorBereik.entries.forEachIndexed { i, b ->
                    SegmentedButton(selected = bereik == b, onClick = { onBereik(b) }, shape = SegmentedButtonDefaults.itemShape(i, SpoorBereik.entries.size)) { Text(b.label, fontSize = 12.sp) }
                }
            }
            if (afspelen.kanAfspelen) AfspeelBalk(afspelen)
            if (plaatsen.isNotEmpty()) {
                Text(tr("Waar geweest", "Where it has been"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                plaatsen.take(5).forEachIndexed { i, p ->
                    val nu = i == 0 && vlucht?.onderweg == true
                    val van = parseInstant(p.van)?.let { Fmt.time(it) } ?: ""
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (nu) van else "$van–${parseInstant(p.tot)?.let { Fmt.time(it) } ?: ""}", color = Muted, fontSize = 12.sp, modifier = Modifier.width(88.dp))
                        Text(p.plaats ?: tr("Boven zee of over de grens", "Above sea or across the border"), fontSize = 13.sp, fontWeight = if (p.plaats != null) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (nu) androidx.compose.ui.graphics.Color(0xFF16A34A) else if (p.plaats == null) Muted else androidx.compose.ui.graphics.Color.Unspecified)
                        p.gemeente?.takeIf { it != p.plaats }?.let { Spacer(Modifier.width(6.dp)); Text(it, color = Muted, fontSize = 12.sp, maxLines = 1) }
                    }
                }
            }
            Text(tr("Vluchten", "Flights"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            when {
                vluchten == null -> LinearProgressIndicator(Modifier.fillMaxWidth())
                vluchten.isEmpty() -> Text(tr("Nog geen vluchten opgeslagen.", "No flights saved yet."), color = Muted, fontSize = 12.sp)
                else -> vluchten.take(4).forEach { v ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(8.dp).background(if (v.onderweg) androidx.compose.ui.graphics.Color(0xFF22C55E) else Muted, RoundedCornerShape(50)))
                        Spacer(Modifier.width(8.dp)); Text(v.tekst, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

/** State and actions of the trail playback ("Vlucht terugspelen"). */
private class Afspelen(
    val positie: Float?, val speelt: Boolean, val snelheid: Int, val moment: Long?, val kanAfspelen: Boolean,
    val onSpeel: () -> Unit, val onPauze: () -> Unit, val onZoek: (Float) -> Unit, val onSnelheid: (Int) -> Unit, val onStop: () -> Unit,
)

@Composable
private fun AfspeelBalk(a: Afspelen) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (a.speelt) a.onPauze() else a.onSpeel() }) {
                Icon(if (a.speelt) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (a.speelt) tr("Pauze", "Pause") else tr("Vlucht terugspelen", "Play back flight"))
            }
            Slider(value = a.positie ?: 1f, onValueChange = a.onZoek, modifier = Modifier.weight(1f))
            TextButton(onClick = { a.onSnelheid(when (a.snelheid) { 30 -> 60; 60 -> 120; 120 -> 300; else -> 30 }) }) { Text("${a.snelheid}×", fontSize = 12.sp) }
            if (a.positie != null) IconButton(onClick = a.onStop) { Icon(Icons.Filled.Close, tr("Terug naar live", "Back to live")) }
        }
        a.moment?.let { Text(tr("Terugspelen: ", "Playback: ") + Fmt.time(java.time.Instant.ofEpochMilli(it)), color = Muted, fontSize = 11.sp) }
    }
}

/** Filter chip on the map: coloured outline when on, faded when off. */
@Composable
private fun KaartChip(on: Boolean, color: Color, label: String, onClick: () -> Unit, content: @Composable RowScope.() -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(50), color = if (on) color.copy(alpha = 0.22f).compositeOver(MaterialTheme.colorScheme.surface) else MaterialTheme.colorScheme.surface,
        border = if (on) androidx.compose.foundation.BorderStroke(1.dp, color) else null,
        modifier = Modifier.alpha(if (on) 1f else 0.55f).semantics { contentDescription = label }) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, content = content)
    }
}
