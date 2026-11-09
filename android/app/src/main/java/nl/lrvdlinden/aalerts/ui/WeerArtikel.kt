package nl.lrvdlinden.aalerts.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nl.lrvdlinden.aalerts.data.Waarschuwing
import nl.lrvdlinden.aalerts.data.WeerArtikel
import nl.lrvdlinden.aalerts.tr

// Weather article in the tab Nieuws, built like the warning on knmi.nl (same as iOS): map of the Netherlands with the
// areas in the colour of their code, the date and time window on the map, then the headline, code, description,
// issue time, "Risico's en advies" and the details.

private val NEDERLAND = MapCamera(52.15, 5.29, 6.6, fit = listOf(53.62 to 3.30, 50.70 to 7.25), key = "nl")
private val KNMI_BLAUW = Color(0xFF4FB3E8)
private val KNMI_NAVY = Color(0xFF163E6E)

private fun argb(c: Color) = c.toArgb().toLong() and 0xFFFFFFFFL

private fun icoon(soort: String?): ImageVector {
    val s = (soort ?: "").lowercase()
    return when {
        "onweer" in s || "hagel" in s || "tornado" in s -> Icons.Outlined.Thunderstorm
        "wind" in s || "storm" in s -> Icons.Outlined.Air
        "sneeuw" in s -> Icons.Outlined.AcUnit
        "glad" in s || "ijzel" in s || "vorst" in s || "kou" in s -> Icons.Outlined.AcUnit
        "mist" in s -> Icons.Outlined.Dehaze
        "regen" in s -> Icons.Outlined.WaterDrop
        "hitte" in s -> Icons.Outlined.WbSunny
        else -> Icons.Outlined.WarningAmber
    }
}

@Composable
fun WeerKaart(weer: WeerArtikel) {
    val areas = remember(weer) {
        weer.gebieden.mapIndexed { i, g ->
            MapArea("w$i", g.gebied.orEmpty(), argb(Waarschuwing.codeColor(if (weer.opgeheven) "green" else g.niveau)), 0.55, width = 1.0)
        }
    }
    Box(Modifier.fillMaxWidth().height(380.dp).clip(RoundedCornerShape(18.dp))) {
        AMap(Modifier.matchParentSize(), areas = areas, camera = NEDERLAND)
        Column(Modifier.align(Alignment.TopStart).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            weer.datumKop?.let { dag ->
                Column(Modifier.background(Color.White.copy(alpha = 0.78f), RoundedCornerShape(10.dp)).padding(horizontal = 10.dp, vertical = 6.dp)) {
                    Text(dag, color = KNMI_NAVY, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    weer.vanafTot?.let { Text(it, color = KNMI_NAVY, fontSize = 15.sp) }
                }
            }
            Box(Modifier.size(60.dp).background(Color(0xFF1D1D1F), RoundedCornerShape(12.dp)).padding(7.dp)) {
                Box(Modifier.fillMaxSize().background(weer.kleur, RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
                    Icon(icoon(weer.soort), null, tint = weer.opKleur, modifier = Modifier.size(26.dp))
                }
            }
        }
        weer.tijdvak?.takeIf { it.isNotBlank() }?.let { t ->
            val delen = t.split(" ", limit = 2)
            Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 14.dp).height(IntrinsicSize.Min)
                .background(Color(0xFF23272F), RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp))) {
                Box(Modifier.width(4.dp).fillMaxHeight().background(weer.kleur))
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (delen.size == 2) {
                        Text(delen[0], color = Color.White, fontSize = 13.sp)
                        Text(delen[1], color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    } else Text(t, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun WeerTekst(weer: WeerArtikel) {
    var detailsOpen by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(weer.kop, fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 31.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (weer.opgeheven) Waarschuwing.codeLabel("green") else weer.code, color = weer.opKleur, fontSize = 16.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.background(weer.kleur, RoundedCornerShape(6.dp)).padding(horizontal = 12.dp, vertical = 6.dp))
            if (weer.opgeheven) { Spacer(Modifier.width(8.dp)); Text(tr("Opgeheven", "Lifted"), color = Muted, fontWeight = FontWeight.SemiBold) }
        }
        weer.tijdvakken?.takeIf { it.size > 1 }?.let { vakken ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                vakken.forEach { v ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).background(Waarschuwing.codeColor(v.niveau), CircleShape)); Spacer(Modifier.width(8.dp))
                        Text("${v.code}: ${v.tekst}", fontSize = 15.sp)
                    }
                }
            }
        }
        weer.omschrijving?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 17.sp, lineHeight = 25.sp) }
        weer.uitgifte?.takeIf { it.isNotBlank() }?.let { Text(tr("Uitgifte: ", "Issued: ") + it, color = Muted, fontSize = 14.sp) }
        if (weer.adviezen.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).background(MaterialTheme.colorScheme.surface)) {
                Box(Modifier.width(4.dp).fillMaxHeight().background(KNMI_BLAUW))
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(tr("Risico's en advies", "Risks and advice"), color = KNMI_BLAUW, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    weer.adviezen.forEach { a ->
                        Row {
                            Icon(Icons.Outlined.ChevronRight, null, tint = KNMI_BLAUW, modifier = Modifier.size(20.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(a, fontSize = 16.sp, lineHeight = 23.sp)
                        }
                    }
                }
            }
        }
        weer.details?.takeIf { it.isNotBlank() }?.let { details ->
            Column {
                Row(Modifier.fillMaxWidth().clickable { detailsOpen = !detailsOpen }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Details", "Details"), color = KNMI_BLAUW, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Icon(if (detailsOpen) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = KNMI_BLAUW)
                }
                AnimatedVisibility(detailsOpen) { Text(details, fontSize = 15.sp, lineHeight = 22.sp) }
            }
        }
    }
}
