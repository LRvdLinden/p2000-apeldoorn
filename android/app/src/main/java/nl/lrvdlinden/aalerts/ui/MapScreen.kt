package nl.lrvdlinden.aalerts.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
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
enum class KaartLaag(val key: String) {
    MELDINGEN("meldingen"), WAARSCHUWINGEN("waarschuwingen"), KNMI("knmi"), HELIKOPTERS("helikopters"), KAZERNES("kazernes"), ZIEKENHUIZEN("ziekenhuizen"), WERKGEBIED("werkgebied");
    val label get() = when (this) {
        MELDINGEN -> tr("Meldingen", "Alerts"); WAARSCHUWINGEN -> "NL-Alert & Burgernet"; KNMI -> tr("KNMI-codes", "KNMI codes")
        HELIKOPTERS -> tr("Helikopters (live)", "Helicopters (live)"); KAZERNES -> tr("Kazernes en posten", "Stations")
        ZIEKENHUIZEN -> tr("Ziekenhuizen en vliegbases", "Hospitals and air bases"); WERKGEBIED -> tr("Gemeentegrens", "Municipal border")
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

    LaunchedEffect(KaartLaag.HELIKOPTERS.key in lagen) {
        if (KaartLaag.HELIKOPTERS.key !in lagen) return@LaunchedEffect
        while (true) { Store.refreshHelikopters(); delay(10_000) }
    }
    // Smooth movement: between updates the helicopters fly on along speed and heading (like AirAssist/iOS).
    var nu by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(KaartLaag.HELIKOPTERS.key in lagen) {
        while (KaartLaag.HELIKOPTERS.key in Settings.kaartLagen) { delay(1_000); nu = System.currentTimeMillis() }
    }
    // Route of the last 30 minutes for every helicopter in the air (at most 6), refreshed every 30 s.
    var sporen by remember { mutableStateOf<Map<String, List<HeliSpoorPunt>>>(emptyMap()) }
    LaunchedEffect(KaartLaag.HELIKOPTERS.key in lagen) {
        while (KaartLaag.HELIKOPTERS.key in Settings.kaartLagen) {
            val lucht = Store.helikopters.filter { !it.opGrond }.take(6)
            sporen = lucht.associate { it.id to Api.heliSpoor(it.id, SpoorBereik.KORT) }
            delay(30_000)
        }
    }
    // Selected helicopter: its route in the chosen range and its recent flights.
    val selHeli = selected?.takeIf { it.startsWith("h:") }?.removePrefix("h:")
    var bereik by remember { mutableStateOf(SpoorBereik.VLUCHT) }
    var selSpoor by remember { mutableStateOf<List<HeliSpoorPunt>>(emptyList()) }
    var selVluchten by remember { mutableStateOf<List<HeliVlucht>?>(null) }
    LaunchedEffect(selHeli, bereik) {
        selSpoor = emptyList()
        val id = selHeli ?: return@LaunchedEffect
        while (true) { selSpoor = Api.heliSpoor(id, bereik); delay(20_000) }
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
    }
    val warns = Store.waarschuwingen.filter { (it.startAt.toEpochMilli() >= cutoff || it.isActief) }
    val points = mutableListOf<MapPoint>()
    val areas = mutableListOf<MapArea>()
    if (KaartLaag.WERKGEBIED.key in lagen) areas += MapArea("werkgebied", Werkgebied.gemeenteGebied, 0xFFCF0A1E, 0.03, width = 1.5)
    if (KaartLaag.KNMI.key in lagen) warns.filter { it.bron == "knmi" && !it.isBeeindigd }.forEach { areas += MapArea(it.id, it.gebied ?: emptyList(), it.color.toArgb().toLong(), 0.18) }
    if (KaartLaag.WAARSCHUWINGEN.key in lagen) warns.filter { it.bron != "knmi" }.forEach { w ->
        if (w.bron == "nlalert") areas += MapArea(w.id, w.gebied ?: emptyList(), w.color.toArgb().toLong(), if (w.isBeeindigd) 0.06 else 0.2)
        if (w.hasCoordinate) points += MapPoint("w:${w.id}", w.lat!!, w.lon!!, w.marker, 34, dim = w.isBeeindigd)
    }
    if (KaartLaag.KAZERNES.key in lagen) Werkgebied.kazernes.forEach { k -> k.dienst.icon?.let { points += MapPoint("k:${k.id}", k.lat, k.lon, it, if (selected == "k:${k.id}") 30 else 24, anchorBottom = false, kazerne = k.dienst.color.toArgb().toLong()) } }
    if (KaartLaag.MELDINGEN.key in lagen) meldingen.sortedBy { it.millis }.forEach { m -> m.soort.marker?.let { points += MapPoint(m.guid, m.lat!!, m.lon!!, it, if (m.guid == selected) 46 else 34, dim = m.guid in Settings.gelezen && m.guid != selected) } }
    val lines = mutableListOf<MapLine>()
    if (KaartLaag.ZIEKENHUIZEN.key in lagen) Store.locaties.forEach { l ->
        points += MapPoint("l:${l.id}", l.lat, l.lon, l.icon, if (selected == "l:${l.id}") 30 else 22, anchorBottom = false)
    }
    if (KaartLaag.HELIKOPTERS.key in lagen) Store.helikopters.forEach { h ->
        val (la, lo) = h.geschat(nu)
        points += MapPoint("h:${h.id}", la, lo, h.afbeelding, 70, label = h.naam, flip = h.vliegtWest, anchorBottom = false)
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
    val focusHeli = focus?.takeIf { it.startsWith("h:") }?.let { f -> Store.helikopters.firstOrNull { it.id == f.removePrefix("h:") } }
    LaunchedEffect(focus) {
        if (focus?.startsWith("h:") == true && KaartLaag.HELIKOPTERS.key !in Settings.kaartLagen) Settings.kaartLagen = Settings.kaartLagen + KaartLaag.HELIKOPTERS.key
    }
    val camera = when {
        focusHeli != null -> MapCamera(focusHeli.lat, focusHeli.lon, 12.5, key = "${focusHeli.id}${focusHeli.gezien}")
        focusMelding?.hasCoordinate == true -> MapCamera(focusMelding.lat!!, focusMelding.lon!!, 15.0, key = focus)
        else -> APELDOORN
    }

    Box(Modifier.fillMaxSize()) {
        AMap(Modifier.fillMaxSize(), points = points, areas = areas, lines = lines, camera = camera, onPointClick = { selected = it }, onMapClick = { selected = null; if (nav.kaartFocus?.startsWith("h:") == true) nav.kaartFocus = null })

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
            if (Store.helikopters.isNotEmpty() && KaartLaag.HELIKOPTERS.key in lagen) {
                LazyRow(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(Store.helikopters, key = { it.id }) { h ->
                        Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.surface, onClick = { selected = "h:${h.id}"; nav.kaartFocus = "h:${h.id}" }) {
                            Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                                Image(painterResource(h.afbeelding), null, Modifier.width(34.dp).graphicsLayer { scaleX = if (h.vliegtWest) -1f else 1f })
                                Spacer(Modifier.width(6.dp)); Text(h.naam, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }

        // Preview of the selection
        val sel = selected
        Box(Modifier.align(Alignment.BottomCenter).padding(12.dp)) {
            when {
                sel == null -> {}
                sel.startsWith("h:") -> Store.helikopters.firstOrNull { it.id == sel.removePrefix("h:") }?.let {
                    HeliCard(it, bereik, { b -> bereik = b }, selVluchten,
                        afspelen = Afspelen(afspeel, speelt, snelheid, afspeelMoment, kanAfspelen = selSpoor.size >= 2,
                            onSpeel = { if (afspeel == null || afspeel!! >= 1f) afspeel = 0f; speelt = true }, onPauze = { speelt = false },
                            onZoek = { speelt = false; afspeel = it }, onSnelheid = { snelheid = it }, onStop = { speelt = false; afspeel = null })) { selected = null }
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
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            KazerneIcon(k.dienst, 36.dp); Spacer(Modifier.width(10.dp))
                            Column { Text(k.naam, fontWeight = FontWeight.SemiBold); Text(k.plaats ?: "", color = Muted, fontSize = 12.sp) }
                        }
                    }
                }
                else -> Store.melding(sel)?.let { m -> PreviewCard(onClose = { selected = null }) { MeldingRow(m) { nav.melding(m.guid) } } }
            }
        }
    }
    if (showLayers) ModalBottomSheet(onDismissRequest = { showLayers = false }, containerColor = MaterialTheme.colorScheme.background) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(tr("Kaartlagen", "Map layers"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            KaartLaag.entries.forEach { l ->
                SwitchRow(l.label, checked = l.key in Settings.kaartLagen) { Settings.kaartLagen = Settings.kaartLagen.toggle(l.key) }
            }
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
private fun HeliCard(h: Helikopter, bereik: SpoorBereik, onBereik: (SpoorBereik) -> Unit, vluchten: List<HeliVlucht>?, afspelen: Afspelen, onClose: () -> Unit) {
    PreviewCard(onClose) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(h.afbeelding), null, Modifier.width(80.dp).graphicsLayer { scaleX = if (h.vliegtWest) -1f else 1f })
                Spacer(Modifier.width(12.dp))
                Column { Text(h.naam, fontWeight = FontWeight.Bold, fontSize = 17.sp); Text(h.soortLabel + (h.basis?.let { " · $it" } ?: ""), color = Muted, fontSize = 13.sp) }
            }
            InfoRow(tr("Hoogte", "Altitude"), if (h.opGrond) tr("Op de grond", "On the ground") else h.hoogteMeter?.let { "$it m" })
            InfoRow(tr("Snelheid", "Speed"), h.snelheidKmh?.let { "$it km/u" })
            InfoRow(tr("Koers", "Heading"), h.koersTekst)
            InfoRow(tr("Laatst gezien", "Last seen"), parseInstant(h.gezien)?.let { Fmt.ago(it) })
            h.voorspelling?.let { Text(it.tekst, fontWeight = FontWeight.Medium, fontSize = 13.sp) }
            // Route on the map: this flight, the last 30 minutes or the whole day.
            Text(tr("Routespoor", "Route"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SpoorBereik.entries.forEachIndexed { i, b ->
                    SegmentedButton(selected = bereik == b, onClick = { onBereik(b) }, shape = SegmentedButtonDefaults.itemShape(i, SpoorBereik.entries.size)) { Text(b.label, fontSize = 12.sp) }
                }
            }
            if (afspelen.kanAfspelen) AfspeelBalk(afspelen)
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
