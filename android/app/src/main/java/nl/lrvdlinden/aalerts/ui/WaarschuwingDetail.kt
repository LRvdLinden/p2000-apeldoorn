package nl.lrvdlinden.aalerts.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.tr

@Composable
fun WaarschuwingDetail(id: String, nav: Nav) {
    var w by remember(id) { mutableStateOf(Store.waarschuwing(id)) }
    var gekoppeld by remember(id) { mutableStateOf<List<Melding>>(emptyList()) }
    var weer by remember(id) { mutableStateOf<AlertWeather?>(null) }
    var loaded by remember(id) { mutableStateOf(false) }
    LaunchedEffect(id) {
        Api.waarschuwing(id)?.let { w = it; gekoppeld = it.meldingen ?: emptyList() }
        loaded = true
        weer = Api.waarschuwingWeather(id)
    }
    val x = w
    if (x == null) {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Waarschuwing", "Warning"), nav) }) { pad ->
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                if (!loaded) CircularProgressIndicator() else EmptyState(tr("Niet gevonden", "Not found"), tr("Deze waarschuwing is niet meer beschikbaar.", "This warning is no longer available."))
            }
        }
        return
    }
    val ctx = LocalContext.current
    val nearby = remember(x.id, Store.meldingen, gekoppeld) {
        (gekoppeld + Store.meldingen.filter { x.relates(it) }).distinctBy { it.guid }.sortedByDescending { it.millis }.take(10)
    }
    val ended = x.isBeeindigd

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        val scroll = rememberScrollState()
        Column(Modifier.fillMaxSize().verticalScroll(scroll)) {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                val h = (maxWidth * 0.9f).coerceIn(300.dp, 440.dp)
                val rings = x.gebied ?: emptyList()
                val fit = rings.flatten().map { it[1] to it[0] }
                val la = x.lat ?: fit.map { it.first }.average().takeIf { !it.isNaN() } ?: 52.2112
                val lo = x.lon ?: fit.map { it.second }.average().takeIf { !it.isNaN() } ?: 5.9699
                AMap(
                    Modifier.fillMaxWidth().height(h).alpha(if (ended) 0.85f else 1f),
                    points = if (x.bron != "knmi" && x.hasCoordinate) listOf(MapPoint(x.id, x.lat!!, x.lon!!, x.marker, 40, dim = ended)) else emptyList(),
                    areas = listOf(MapArea(x.id, rings, (if (ended) Color.Gray else x.color).toArgb().toLong(), 0.2)) +
                        listOf(MapArea("werkgebied", Werkgebied.gemeenteGebied, 0xFFCF0A1E, 0.0, width = 1.5)),
                    camera = MapCamera(la, lo, if (x.bron == "burgernet") 13.5 else 11.0, fit = if (fit.size > 2) fit else emptyList(), key = x.id),
                    interactive = false,
                )
            }
            Column(Modifier.padding(horizontal = 14.dp).offset(y = (-24).dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        WaarschuwingIcon(x, 44.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Tag(x.kop, if (ended) Color.Gray else x.color, if (ended) Color.White else x.onColor)
                                Tag(x.statusLabel, if (ended) MaterialTheme.colorScheme.surfaceVariant else Color(0xFF16A34A), if (ended) MaterialTheme.colorScheme.onSurface else Color.White)
                            }
                            Text(wTijd(x), color = Muted, fontSize = 13.sp)
                        }
                    }
                    Text(x.titel, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    x.plaats?.let { Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Place, null, tint = Muted, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(it, color = Muted) } }
                }
                if (x.bron == "knmi" && (x.verwachting != null || x.advies != null)) {
                    // KNMI writes these per area, in Dutch only.
                    x.verwachting?.let { SectionCard(tr("Wat kun je verwachten?", "What to expect"), Icons.Outlined.Warning) { Text(it, fontSize = 15.sp) } }
                    x.advies?.let { SectionCard(tr("Wat moet je doen?", "What to do"), Icons.Outlined.VerifiedUser) { Text(it, fontSize = 15.sp) } }
                } else x.tekstLokaal?.takeIf { it.isNotBlank() }?.let {
                    SectionCard(tr("Bericht", "Message"), Icons.Outlined.Campaign) { Text(it, fontSize = 15.sp) }
                }
                SectionCard(tr("Tijden", "Times"), Icons.Outlined.Schedule) {
                    InfoRow(tr("Begin", "Start"), Fmt.day(x.startAt) + " " + Fmt.time(x.startAt))
                    x.eindeAt?.let { InfoRow(if (ended) tr("Beëindigd", "Ended") else tr("Tot", "Until"), Fmt.day(it) + " " + Fmt.time(it)) }
                    InfoRow(tr("Bron", "Source"), bronNaam(x.bron))
                }
                WeerCard(weer)
                if (nearby.isNotEmpty()) SectionCard(tr("Meldingen in de buurt", "Alerts nearby"), Icons.Outlined.NotificationsActive) {
                    nearby.forEach { m ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { nav.melding(m.guid) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            DienstIcon(m.soort, 28.dp); Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(m.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                                Text(m.plaatsText, color = Muted, fontSize = 12.sp, maxLines = 1)
                            }
                            Text(Fmt.dayTime(m.datum), color = Muted, fontSize = 12.sp)
                        }
                    }
                }
                if (x.bron == "knmi") SectionCard(tr("Wat betekent de code?", "What does the code mean?"), Icons.Outlined.Info) {
                    Text(codeUitleg(x.niveau), fontSize = 14.sp)
                }
                x.link?.let { link ->
                    OutlinedButton(onClick = { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link))) } }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, null); Spacer(Modifier.width(8.dp)); Text(tr("Meer bij ", "More at ") + bronNaam(x.bron))
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
        // Bar behind the status bar once the content scrolls over the map.
        if (scroll.value > 200) Box(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background.copy(alpha = 0.96f)).statusBarsPadding().height(52.dp))
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 6.dp)) {
            RoundIcon(Icons.AutoMirrored.Filled.ArrowBack, tr("Terug", "Back")) { nav.back() }
        }
    }
}

fun bronNaam(bron: String) = when (bron) { "nlalert" -> "NL-Alert"; "burgernet" -> "Burgernet"; else -> "KNMI" }

fun codeUitleg(niveau: String?) = when (niveau) {
    "red" -> tr("Code rood: extreem weer met grote kans op enorme schade, letsel of verkeersontwrichting. Kom in actie en volg de adviezen van de overheid.",
        "Code red: extreme weather with a high risk of major damage, injury or traffic disruption. Take action and follow government advice.")
    "orange" -> tr("Code oranje: gevaarlijk weer met kans op schade, letsel of grote overlast. Wees voorbereid.",
        "Code orange: dangerous weather with a risk of damage, injury or major disruption. Be prepared.")
    else -> tr("Code geel: het weer kan gevaarlijk zijn. Let op en pas je zo nodig aan.", "Code yellow: the weather can be dangerous. Be aware and adapt if needed.")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WaarschuwingenScreen(nav: Nav) {
    val scope = rememberCoroutineScope()
    var bron by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { Store.refreshAlleWaarschuwingen() }
    val list = Store.alleWaarschuwingen.filter { bron == null || it.bron == bron }.sortedWith(compareBy<Waarschuwing> { it.isBeeindigd }.thenByDescending { it.startAt })
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Alle waarschuwingen", "All warnings"), nav) }) { pad ->
        PullToRefreshBox(isRefreshing = false, onRefresh = { scope.launch { Store.refreshAlleWaarschuwingen() } }, modifier = Modifier.padding(pad).fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item { SelectChip(tr("Alles", "All"), bron == null) { bron = null } }
                        items(listOf("nlalert", "burgernet", "knmi")) { b -> SelectChip(bronNaam(b), bron == b) { bron = if (bron == b) null else b } }
                    }
                    Text(tr("Laatste 14 dagen in de gemeente Apeldoorn", "Last 14 days in the municipality of Apeldoorn"), color = Muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                }
                if (list.isEmpty()) item { EmptyState(tr("Geen waarschuwingen", "No warnings"), tr("Er waren de afgelopen 14 dagen geen waarschuwingen.", "There were no warnings in the last 14 days.")) }
                items(list, key = { it.id }) { w ->
                    Surface(color = MaterialTheme.colorScheme.surface, modifier = Modifier.padding(horizontal = 12.dp, vertical = 3.dp).clip(RoundedCornerShape(14.dp))) {
                        WaarschuwingRow(w) { nav.waarschuwing(w.id) }
                    }
                }
            }
        }
    }
}
