package nl.lrvdlinden.aalerts.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.automirrored.outlined.List
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.ZONE
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.tr
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen(nav: Nav) {
    val scope = rememberCoroutineScope()
    val today = LocalDate.now(ZONE)
    val t = remember(Store.meldingen) { Store.stats(today) }
    val y = remember(Store.meldingen) { Store.stats(today.minusDays(1)) }
    val gray = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
    LaunchedEffect(Unit) { Store.refreshAlleWaarschuwingen() }

    Scaffold(containerColor = MaterialTheme.colorScheme.background, contentWindowInsets = WindowInsets.statusBars,
        topBar = { TopAppBar(title = { Text(tr("Statistieken", "Statistics"), fontWeight = FontWeight.Bold) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)) }) { pad ->
        PullToRefreshBox(isRefreshing = false, onRefresh = { scope.launch { Store.refresh(); Store.refreshAlleWaarschuwingen() } }, modifier = Modifier.padding(pad)) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionCard(tr("Vandaag vs. gisteren", "Today vs. yesterday"), Icons.Outlined.CalendarToday) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        TotalTile(tr("Vandaag", "Today"), t.totaal, MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                        TotalTile(tr("Gisteren", "Yesterday"), y.totaal, MaterialTheme.colorScheme.onSurfaceVariant, Modifier.weight(1f))
                    }
                    val diff = t.totaal - y.totaalTotNu
                    Text((if (diff >= 0) "▲ +$diff" else "▼ $diff") + "  " + tr("Gisteren om deze tijd: ${y.totaalTotNu} meldingen", "Yesterday at this time: ${y.totaalTotNu} alerts"), color = Muted, fontSize = 13.sp)
                }
                SectionCard(tr("Per discipline", "By service"), Icons.Outlined.Category) {
                    val max = (Dienst.selectable.maxOf { maxOf(t.perDienst[it] ?: 0, y.perDienst[it] ?: 0) }).coerceAtLeast(1)
                    Dienst.selectable.forEach { d ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            DienstIcon(d, 24.dp); Spacer(Modifier.width(8.dp))
                            Column(Modifier.weight(1f)) {
                                Text(d.label, fontSize = 13.sp)
                                Bar((t.perDienst[d] ?: 0) / max.toFloat(), d.color)
                                Bar((y.perDienst[d] ?: 0) / max.toFloat(), gray)
                            }
                            Spacer(Modifier.width(8.dp))
                            Text("${t.perDienst[d] ?: 0}", fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                        }
                    }
                    Legend(gray)
                }
                SectionCard(tr("Per uur", "By hour"), Icons.Outlined.Schedule) {
                    val primary = MaterialTheme.colorScheme.primary
                    val max = (t.perUur.max().coerceAtLeast(y.perUur.max())).coerceAtLeast(1)
                    Canvas(Modifier.fillMaxWidth().height(120.dp)) {
                        val w = size.width / 24f
                        for (h in 0 until 24) {
                            val hy = size.height * y.perUur[h] / max
                            drawRoundRect(gray, Offset(h * w + w * 0.1f, size.height - hy), Size(w * 0.8f, hy), CornerRadius(3f))
                            val ht = size.height * t.perUur[h] / max
                            drawRoundRect(primary, Offset(h * w + w * 0.25f, size.height - ht), Size(w * 0.5f, ht), CornerRadius(3f))
                        }
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { listOf("00", "06", "12", "18", "23").forEach { Text(it, color = Muted, fontSize = 10.sp) } }
                    Legend(gray)
                }
                if (t.perPrioriteit.isNotEmpty() || y.perPrioriteit.isNotEmpty()) SectionCard(tr("Per prioriteit", "By priority"), Icons.Outlined.PriorityHigh) {
                    (t.perPrioriteit.keys + y.perPrioriteit.keys).sorted().forEach { p -> InfoRow(p, "${t.perPrioriteit[p] ?: 0}  ·  " + tr("gisteren", "yesterday") + " ${y.perPrioriteit[p] ?: 0}") }
                }
                if (t.perCategorie.isNotEmpty()) SectionCard(tr("Meest voorkomend vandaag", "Most common today"), Icons.AutoMirrored.Outlined.List) {
                    t.perCategorie.entries.sortedByDescending { it.value }.take(8).forEach { InfoRow(it.key, "${it.value}") }
                }
                WaarschuwingStats(nav)
                Text(tr("Statistieken worden berekend uit de meldingen van vandaag en gisteren.", "Statistics are calculated from today's and yesterday's alerts."), color = Muted, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun WaarschuwingStats(nav: Nav) {
    val list = Store.alleWaarschuwingen.ifEmpty { Store.waarschuwingen }
    SectionCard(tr("Waarschuwingen (14 dagen)", "Warnings (14 days)"), Icons.Outlined.WarningAmber) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("nlalert", "burgernet", "knmi").forEach { b ->
                val n = list.count { it.bron == b }
                val actief = list.count { it.bron == b && it.isActief }
                Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(10.dp)) {
                    Text(bronNaam(b), fontSize = 12.sp, color = Muted)
                    Text("$n", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text(tr("$actief actief", "$actief active"), fontSize = 11.sp, color = if (actief > 0) Color(0xFF16A34A) else Muted)
                }
            }
        }
        TextButton(onClick = { nav.open("waarschuwingen") }) { Text(tr("Alle waarschuwingen", "All warnings")) }
    }
}

@Composable
private fun TotalTile(label: String, value: Int, tint: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(tint.copy(alpha = 0.1f)).padding(12.dp)) {
        Text(label, color = tint, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text("$value", fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text(tr("meldingen", "alerts"), color = Muted, fontSize = 12.sp)
    }
}

@Composable
private fun Bar(f: Float, color: Color) {
    Box(Modifier.padding(vertical = 1.dp).fillMaxWidth(f.coerceIn(0.01f, 1f)).height(6.dp).clip(RoundedCornerShape(3.dp)).background(color))
}

@Composable
private fun Legend(gray: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(MaterialTheme.colorScheme.primary)); Text(" " + tr("Vandaag", "Today") + "   ", fontSize = 11.sp, color = Muted)
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(gray)); Text(" " + tr("Gisteren", "Yesterday"), fontSize = 11.sp, color = Muted)
    }
}
