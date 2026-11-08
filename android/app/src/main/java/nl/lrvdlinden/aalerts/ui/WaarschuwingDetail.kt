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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
        // Weather code: the weather is live, refreshed every 5 minutes while the page is open.
        while (w?.bron == "knmi") {
            kotlinx.coroutines.delay(300_000)
            Api.waarschuwingWeather(id)?.let { weer = it }
        }
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
            // TalkBack: a spoken description of the map, as on iOS.
            val kaartTekst = if (x.bron == "knmi") tr("Kaart: ${Waarschuwing.codeLabel(x.codeNu)} voor ${(x.soort ?: x.titel).lowercase()} in ${x.plaats ?: "de gemeente Apeldoorn"}.",
                "Map: ${Waarschuwing.codeLabel(x.codeNu)} for ${(x.soort ?: x.titel).lowercase()} in ${x.plaats ?: "the municipality of Apeldoorn"}.")
                else tr("Kaart: ${x.kop} in ${x.plaats ?: "de gemeente Apeldoorn"}.", "Map: ${x.kop} in ${x.plaats ?: "the municipality of Apeldoorn"}.")
            BoxWithConstraints(Modifier.fillMaxWidth().semantics { contentDescription = kaartTekst }) {
                val h = (maxWidth * 0.9f).coerceIn(300.dp, 440.dp)
                val rings = x.gebied ?: emptyList()
                val fit = rings.flatten().map { it[1] to it[0] }
                val la = x.lat ?: fit.map { it.first }.average().takeIf { !it.isNaN() } ?: 52.2112
                val lo = x.lon ?: fit.map { it.second }.average().takeIf { !it.isNaN() } ?: 5.9699
                AMap(
                    Modifier.fillMaxWidth().height(h).alpha(if (ended) 0.85f else 1f),
                    points = if (x.bron != "knmi" && x.hasCoordinate) listOf(MapPoint(x.id, x.lat!!, x.lon!!, x.marker, 40, dim = ended)) else emptyList(),
                    areas = listOf(MapArea(x.id, rings, (if (ended && !x.isOpgeheven) Color.Gray else x.color).toArgb().toLong(), 0.2)) +
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
                                Tag(x.kop, if (ended && !x.isOpgeheven) Color.Gray else x.color, if (ended && !x.isOpgeheven) Color.White else x.onColor)
                                Tag(x.statusLabel, if (x.isOpgeheven) Color(0xFF2E9E44) else if (ended) MaterialTheme.colorScheme.surfaceVariant else Color(0xFF16A34A), if (ended && !x.isOpgeheven) MaterialTheme.colorScheme.onSurface else Color.White)
                            }
                            Text(wTijd(x), color = Muted, fontSize = 13.sp)
                        }
                    }
                    Text(x.titel, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    x.plaats?.let { Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Place, null, tint = Muted, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text(it, color = Muted) } }
                }
                if (x.isOpgeheven) {
                    // Lifted: code green now, or another warning that applies now.
                    val ander = Store.waarschuwingen.firstOrNull { it.bron == "knmi" && it.status == "actief" && it.id != x.id }
                    SectionCard(tr("Code groen", "Code green"), Icons.Outlined.CheckCircle) {
                        Text(tr("Deze weerwaarschuwing is opgeheven.", "This weather warning has been lifted."), fontSize = 15.sp)
                        x.niveau?.takeIf { it != "green" }?.let { n ->
                            Text(tr("Eerder gold ", "Earlier: ") + listOfNotNull(Waarschuwing.codeLabel(n), x.soort).joinToString(" · ") +
                                (x.eindeAt?.let { tr(" tot ", " until ") + Fmt.day(it) + " " + Fmt.time(it) } ?: "") + ".", color = Muted, fontSize = 14.sp)
                        }
                        if (ander != null) TextButton(onClick = { nav.waarschuwing(ander.id) }) { Text(tr("Nu geldt: ", "Now in force: ") + ander.kop) }
                        else Text(tr("Er geldt nu geen weerwaarschuwing van het KNMI voor de gemeente Apeldoorn.", "No KNMI weather warning applies to the municipality of Apeldoorn now."), fontSize = 14.sp)
                    }
                }
                if (x.heeftKnmiTekst) {
                    // As on knmi.nl, in Dutch only.
                    if (x.knmiKop != null || x.omschrijving != null) SectionCard {
                        x.knmiKop?.let { Text(it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                        x.omschrijving?.let { Text(it, fontSize = 15.sp) }
                        x.uitgifte?.let { Text(tr("Uitgifte: ", "Issued: ") + it, color = Muted, fontSize = 12.sp) }
                    }
                    x.tijdvakken?.takeIf { it.size > 1 }?.let { vakken ->
                        // The course of the whole warning per code, as on iOS.
                        SectionCard(tr("Verloop", "Course"), Icons.Outlined.Schedule) {
                            vakken.forEach { t ->
                                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.alpha(if ((t.eindeAt ?: java.time.Instant.MAX).isBefore(java.time.Instant.now())) 0.5f else 1f)) {
                                    Box(Modifier.size(8.dp, 28.dp).clip(RoundedCornerShape(4.dp)).background(Waarschuwing.codeColor(t.niveau)))
                                    Spacer(Modifier.width(10.dp))
                                    Text(Waarschuwing.codeLabel(t.niveau), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                    Text((t.startAt?.let { Fmt.day(it) + " " + Fmt.time(it) } ?: "") + " – " + (t.eindeAt?.let { Fmt.time(it) } ?: ""), color = Muted, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                    val regels = x.knmiAdviesRegels
                    if (regels.isNotEmpty() || x.details != null) SectionCard(tr("Risico's en advies", "Risks and advice"), Icons.Outlined.Warning) {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            regels.forEach { r -> Row { Text("•  ", fontSize = 15.sp); Text(r, fontSize = 15.sp) } }
                        }
                        x.details?.let { Text(tr("Meer informatie", "More information"), fontWeight = FontWeight.SemiBold); Text(it, fontSize = 15.sp) }
                        x.plaats?.let { Text(tr("Geldt voor: ", "Applies to: ") + it, color = Muted, fontSize = 13.sp) }
                    }
                } else x.tekstLokaal?.takeIf { it.isNotBlank() }?.let {
                    SectionCard(tr("Bericht", "Message"), Icons.Outlined.Campaign) { Text(it, fontSize = 15.sp) }
                }
                SectionCard(tr("Tijden", "Times"), Icons.Outlined.Schedule) {
                    InfoRow(tr("Begin", "Start"), Fmt.day(x.startAt) + " " + Fmt.time(x.startAt))
                    x.eindeAt?.let { InfoRow(if (ended) tr("Beëindigd", "Ended") else tr("Tot", "Until"), Fmt.day(it) + " " + Fmt.time(it)) }
                    InfoRow(tr("Bron", "Source"), bronNaam(x.bron))
                }
                WeerCard(weer, live = x.bron == "knmi")
                // A weather code covers a whole region: no alerts nearby.
                if (x.bron != "knmi" && nearby.isNotEmpty()) SectionCard(tr("Meldingen in de buurt", "Alerts nearby"), Icons.Outlined.NotificationsActive) {
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
                    Text(codeUitleg(x.codeNu), fontSize = 14.sp)
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
            Spacer(Modifier.weight(1f))
            // Share the warning on a-alerts.nl (not the source), so a later visit shows the current state.
            RoundIcon(Icons.Outlined.Share, tr("Delen", "Share")) {
                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, x.kop).putExtra(Intent.EXTRA_TEXT, "${x.kop}: ${x.titel}\n${x.shareUrl}"), tr("Delen", "Share")))
            }
        }
    }
}

fun bronNaam(bron: String) = when (bron) { "nlalert" -> "NL-Alert"; "burgernet" -> "Burgernet"; else -> "KNMI" }

fun codeUitleg(niveau: String?) = when (niveau) {
    "red" -> tr("Code rood: extreem weer met grote kans op enorme schade, letsel of verkeersontwrichting. Kom in actie en volg de adviezen van de overheid.",
        "Code red: extreme weather with a high risk of major damage, injury or traffic disruption. Take action and follow government advice.")
    "orange" -> tr("Code oranje: gevaarlijk weer met kans op schade, letsel of grote overlast. Wees voorbereid.",
        "Code orange: dangerous weather with a risk of damage, injury or major disruption. Be prepared.")
    "green" -> tr("Code groen: er wordt geen gevaarlijk weer verwacht.", "Code green: no dangerous weather is expected.")
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
