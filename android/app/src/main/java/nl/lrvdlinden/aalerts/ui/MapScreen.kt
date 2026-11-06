package nl.lrvdlinden.aalerts.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
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
    MELDINGEN("meldingen"), WAARSCHUWINGEN("waarschuwingen"), KNMI("knmi"), HELIKOPTERS("helikopters"), KAZERNES("kazernes"), WERKGEBIED("werkgebied");
    val label get() = when (this) {
        MELDINGEN -> tr("Meldingen", "Alerts"); WAARSCHUWINGEN -> "NL-Alert & Burgernet"; KNMI -> tr("KNMI-codes", "KNMI codes")
        HELIKOPTERS -> tr("Helikopters (live)", "Helicopters (live)"); KAZERNES -> tr("Kazernes en posten", "Stations"); WERKGEBIED -> tr("Gemeentegrens", "Municipal border")
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
    if (KaartLaag.KAZERNES.key in lagen) Werkgebied.kazernes.forEach { k -> k.dienst.icon?.let { points += MapPoint("k:${k.id}", k.lat, k.lon, it, 20, anchorBottom = false) } }
    if (KaartLaag.MELDINGEN.key in lagen) meldingen.sortedBy { it.millis }.forEach { m -> m.soort.marker?.let { points += MapPoint(m.guid, m.lat!!, m.lon!!, it, if (m.guid == selected) 46 else 34, dim = m.guid in Settings.gelezen && m.guid != selected) } }
    if (KaartLaag.HELIKOPTERS.key in lagen) Store.helikopters.forEach { h -> points += MapPoint("h:${h.id}", h.lat, h.lon, h.afbeelding, 70, label = h.naam, flip = h.vliegtWest, anchorBottom = false) }

    val focusMelding = focus?.let { Store.melding(it) }
    // Following a helicopter: the camera moves along with every new position.
    val focusHeli = focus?.takeIf { it.startsWith("h:") }?.let { f -> Store.helikopters.firstOrNull { it.id == f.removePrefix("h:") } }
    LaunchedEffect(focus) {
        if (focus?.startsWith("h:") == true && KaartLaag.HELIKOPTERS.key !in Settings.kaartLagen) Settings.kaartLagen = Settings.kaartLagen + KaartLaag.HELIKOPTERS.key
    }
    val camera = when {
        focusHeli != null -> MapCamera(focusHeli.lat, focusHeli.lon, 12.5, key = "${focusHeli.id}${focusHeli.lat}${focusHeli.lon}")
        focusMelding?.hasCoordinate == true -> MapCamera(focusMelding.lat!!, focusMelding.lon!!, 15.0, key = focus)
        else -> APELDOORN
    }

    Box(Modifier.fillMaxSize()) {
        AMap(Modifier.fillMaxSize(), points = points, areas = areas, camera = camera, onPointClick = { selected = it }, onMapClick = { selected = null; if (nav.kaartFocus?.startsWith("h:") == true) nav.kaartFocus = null })

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
                sel.startsWith("h:") -> Store.helikopters.firstOrNull { it.id == sel.removePrefix("h:") }?.let { HeliCard(it) { selected = null } }
                sel.startsWith("w:") -> Store.waarschuwing(sel.removePrefix("w:"))?.let { w -> PreviewCard(onClose = { selected = null }) { WaarschuwingRow(w) { nav.waarschuwing(w.id) } } }
                sel.startsWith("k:") -> Werkgebied.kazernes.firstOrNull { it.id == sel.removePrefix("k:") }?.let { k ->
                    PreviewCard(onClose = { selected = null }) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            DienstIcon(k.dienst, 32.dp); Spacer(Modifier.width(10.dp))
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

@Composable
private fun HeliCard(h: Helikopter, onClose: () -> Unit) {
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
            InfoRow(tr("Registratie", "Registration"), h.registratie)
            InfoRow(tr("Laatst gezien", "Last seen"), parseInstant(h.gezien)?.let { Fmt.ago(it) })
        }
    }
}
