package nl.lrvdlinden.aalerts.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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

/** One row of the timeline: a P2000 alert or an NL-Alert/Burgernet warning. */
sealed interface TimelineItem { val millis: Long; val key: String }
data class TMelding(val m: Melding) : TimelineItem { override val millis = m.millis; override val key = m.guid }
data class TWaarschuwing(val w: Waarschuwing) : TimelineItem { override val millis = w.startAt.toEpochMilli(); override val key = "w:" + w.id }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PagerScreen(nav: Nav) {
    val scope = rememberCoroutineScope()
    var showFilter by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }

    val gelezen = Settings.gelezen
    val items: List<TimelineItem> = remember(Store.meldingen, Store.waarschuwingen, Settings.diensten, Settings.plaatsen, Settings.prioriteiten,
        Settings.waarschuwingFilter, Settings.radiusEnabled, Settings.radiusKm, Settings.hideRead, query, gelezen.size, Settings.zoekBuitenFilters) {
        val q = query.trim().lowercase()
        // While searching, "also outside my filters" finds alerts that the list filters would hide.
        val alles = q.isNotEmpty() && Settings.zoekBuitenFilters
        val ms = Store.meldingen.filter { alles || Settings.matchesList(it) }
            .filter { alles || !Settings.hideRead || it.guid !in gelezen }
            .filter { q.isEmpty() || it.title.lowercase().contains(q) || it.plaatsText.lowercase().contains(q) || (it.capcode ?: "").contains(q) || (it.fullMelding ?: "").lowercase().contains(q) || it.eenheden.any { u -> (u.code ?: "").contains(q) || (u.naam ?: "").lowercase().contains(q) } }
            .map { TMelding(it) }
        val oldest = Store.meldingen.minOfOrNull { it.millis } ?: 0L
        val ws = Store.waarschuwingen.filter { it.bron != "knmi" && Settings.matchesList(it) && it.startAt.toEpochMilli() >= oldest }
            .filter { q.isEmpty() || it.titel.lowercase().contains(q) || (it.tekst ?: "").lowercase().contains(q) }
            .map { TWaarschuwing(it) }
        (ms + ws).sortedByDescending { it.millis }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets.statusBars,
        topBar = {
            TopAppBar(
                // Saved alerts top left; the Saved screen has a back button to the pager.
                navigationIcon = { IconButton(onClick = { nav.open("bewaard") }) { Icon(Icons.Outlined.BookmarkBorder, tr("Bewaard", "Saved")) } },
                title = {
                    if (searching) OutlinedTextField(query, { query = it }, singleLine = true, placeholder = { Text(tr("Zoek in meldingen", "Search alerts")) },
                        modifier = Modifier.fillMaxWidth().padding(end = 8.dp), shape = RoundedCornerShape(12.dp))
                    else Text("A-Alerts", fontWeight = FontWeight.Bold)
                },
                actions = {
                    // While searching: also find alerts outside the list filters.
                    if (searching) IconButton(onClick = { Settings.zoekBuitenFilters = !Settings.zoekBuitenFilters }) {
                        Icon(if (Settings.zoekBuitenFilters) Icons.Filled.FilterAltOff else Icons.Outlined.FilterAlt,
                            if (Settings.zoekBuitenFilters) tr("Zoekt ook buiten je filters; tik om alleen binnen je filters te zoeken", "Also searching outside your filters; tap to search within your filters only")
                            else tr("Zoekt binnen je filters; tik om ook daarbuiten te zoeken", "Searching within your filters; tap to also search outside them"))
                    }
                    IconButton(onClick = { searching = !searching; if (!searching) query = "" }) { Icon(if (searching) Icons.Filled.Close else Icons.Outlined.Search, tr("Zoeken", "Search")) }
                    IconButton(onClick = { nav.open("waarschuwingen") }) { Icon(Icons.Outlined.WarningAmber, tr("Alle waarschuwingen", "All warnings")) }
                    // Quick switch: hide viewed alerts (as on iOS).
                    IconButton(onClick = { Settings.hideRead = !Settings.hideRead }) {
                        Icon(if (Settings.hideRead) Icons.Filled.VisibilityOff else Icons.Outlined.Visibility, if (Settings.hideRead) tr("Toon bekeken meldingen", "Show viewed alerts") else tr("Verberg bekeken meldingen", "Hide viewed alerts"))
                    }
                    IconButton(onClick = { showFilter = true }) {
                        BadgedBox(badge = { if (Settings.listFilterActive) Badge(containerColor = MaterialTheme.colorScheme.primary) }) {
                            Icon(Icons.Outlined.FilterList, tr("Filteren", "Filter"))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { pad ->
        PullToRefreshBox(isRefreshing = Store.loading && Store.meldingen.isNotEmpty(), onRefresh = { scope.launch { Store.refresh() } }, modifier = Modifier.padding(pad).fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                item(key = "uit") { MeldingenUitBanner(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) }
                item(key = "knmi") { KnmiBar(Store.knmiActief) { nav.waarschuwing(it.id) } }
                val verborgen = if (Settings.hideRead) Store.meldingen.count { it.guid in gelezen } else 0
                if (items.isEmpty()) item(key = "empty") {
                    when {
                        verborgen > 0 && query.isBlank() -> Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Outlined.CheckCircle, null, tint = Color(0xFF16A34A), modifier = Modifier.size(44.dp))
                            Spacer(Modifier.height(8.dp))
                            Text(tr("Je bent helemaal bij", "You're all caught up"), fontWeight = FontWeight.Bold, fontSize = 18.sp)
                            Text(tr("Je hebt alle $verborgen meldingen al bekeken. Nieuwe meldingen verschijnen hier vanzelf.", "You've seen all $verborgen alerts. New alerts appear here automatically."), color = Muted, fontSize = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                            TextButton(onClick = { Settings.hideRead = false }) { Text(tr("Toon bekeken meldingen", "Show viewed alerts")) }
                        }
                        Store.meldingen.isEmpty() && Store.loading -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                        Store.meldingen.isEmpty() && Store.error != null -> EmptyState(tr("Geen verbinding", "No connection"), tr("De meldingen konden niet worden geladen. Trek omlaag om het opnieuw te proberen.", "Alerts could not be loaded. Pull down to try again."))
                        else -> EmptyState(tr("Geen meldingen", "No alerts"), tr("Er zijn geen meldingen die bij je filter passen.", "No alerts match your filter."))
                    }
                }
                var lastDay: LocalDate? = null
                val grouped = mutableListOf<Pair<LocalDate?, TimelineItem>>()
                for (it in items) {
                    val d = java.time.Instant.ofEpochMilli(it.millis).atZone(ZONE).toLocalDate()
                    grouped += (if (Settings.groupByDay && d != lastDay) d else null) to it
                    lastDay = d
                }
                for ((day, it) in grouped) {
                    if (day != null) item(key = "d$day") {
                        Text(Fmt.dayHeader(day), fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Muted,
                            modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).padding(start = 16.dp, top = 14.dp, bottom = 4.dp))
                    }
                    item(key = it.key) {
                        Surface(color = MaterialTheme.colorScheme.surface, modifier = Modifier.padding(horizontal = 12.dp, vertical = 3.dp).clip(RoundedCornerShape(14.dp))) {
                            when (it) {
                                is TMelding -> MeldingRow(it.m) { nav.melding(it.m.guid) }
                                is TWaarschuwing -> WaarschuwingRow(it.w) { nav.waarschuwing(it.w.id) }
                            }
                        }
                    }
                }
                if (verborgen > 0 && items.isNotEmpty()) item(key = "bij") {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, tint = Color(0xFF16A34A))
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(tr("Je bent helemaal bij", "You're all caught up"), fontWeight = FontWeight.SemiBold)
                            Text(tr("$verborgen bekeken meldingen verborgen", "$verborgen viewed alerts hidden"), color = Muted, fontSize = 12.sp)
                        }
                        TextButton(onClick = { Settings.hideRead = false }) { Text(tr("Toon", "Show")) }
                    }
                }
                item(key = "footer") {
                    Text(Store.lastUpdated?.let { tr("Bijgewerkt om ", "Updated at ") + Fmt.time(it) } ?: "", color = Muted, fontSize = 12.sp,
                        modifier = Modifier.fillMaxWidth().padding(16.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
        }
    }
    if (showFilter) FilterSheet { showFilter = false }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FilterSheet(onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = MaterialTheme.colorScheme.background) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(tr("Filteren", "Filter"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            SectionCard(tr("Disciplines", "Services")) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Dienst.selectable.forEach { d -> SelectChip(d.label, d.key in Settings.diensten) { Settings.diensten = Settings.diensten.toggle(d.key) } }
                }
            }
            SectionCard(tr("Waarschuwingen", "Warnings")) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("nlalert" to "NL-Alert", "burgernet" to "Burgernet", "amber" to "AMBER Alert", "vermistkind" to tr("Vermist Kind Alert", "Missing Child Alert"), "vnog" to tr("VNOG-incidenten", "VNOG incidents"), "knmi:yellow" to Waarschuwing.codeLabel("yellow"), "knmi:orange" to Waarschuwing.codeLabel("orange"), "knmi:red" to Waarschuwing.codeLabel("red"))
                        .forEach { (k, l) -> SelectChip(l, k in Settings.waarschuwingFilter) { Settings.waarschuwingFilter = Settings.waarschuwingFilter.toggle(k) } }
                }
            }
            SectionCard(tr("Plaatsen", "Places")) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Werkgebied.namen.forEach { p -> SelectChip(p, p in Settings.plaatsen) { Settings.plaatsen = Settings.plaatsen.toggle(p) } }
                }
            }
            SectionCard(tr("Prioriteit", "Priority")) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("A0", "A1", "A2", "B1", "B2", "P1", "P2", "P3").forEach { p -> SelectChip(p, p in Settings.prioriteiten) { Settings.prioriteiten = Settings.prioriteiten.toggle(p) } }
                }
            }
            SectionCard(tr("Weergave", "Display")) {
                SwitchRow(tr("Groeperen per dag", "Group by day"), checked = Settings.groupByDay) { Settings.groupByDay = it }
                SwitchRow(tr("Verberg bekeken meldingen", "Hide viewed alerts"), checked = Settings.hideRead) { Settings.hideRead = it }
                SwitchRow(tr("Alleen mijn buurt", "Only my area"), tr("Straal van ${Settings.radiusKm.toInt()} km", "Radius of ${Settings.radiusKm.toInt()} km"), checked = Settings.radiusEnabled) { Settings.radiusEnabled = it }
            }
            TextButton(onClick = { Settings.diensten = emptySet(); Settings.plaatsen = emptySet(); Settings.prioriteiten = emptySet(); Settings.waarschuwingFilter = emptySet(); Settings.radiusEnabled = false }) {
                Text(tr("Alle filters wissen", "Clear all filters"))
            }
        }
    }
}

fun Set<String>.toggle(v: String) = if (v in this) this - v else this + v

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BewaardScreen(nav: Nav) {
    val list = Store.meldingen.filter { it.guid in Settings.bewaard }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Bewaard", "Saved"), nav) }) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize()) {
            if (list.isEmpty()) item {
                EmptyState(tr("Nog niets bewaard", "Nothing saved yet"),
                    tr("Tik bij een melding op het bladwijzer-icoon om hem te bewaren. Meldingen blijven 3 dagen beschikbaar.", "Tap the bookmark icon on an alert to save it. Alerts stay available for 3 days."))
            }
            items(list, key = { it.guid }) { m ->
                Surface(color = MaterialTheme.colorScheme.surface, modifier = Modifier.padding(horizontal = 12.dp, vertical = 3.dp).clip(RoundedCornerShape(14.dp))) {
                    MeldingRow(m) { nav.melding(m.guid) }
                }
            }
        }
    }
}

/** Followed capcodes (star in an alert), as on iOS. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VolgCapcodesScreen(nav: Nav) {
    val list = Settings.gevolgd.entries.sortedBy { it.value }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Gevolgde capcodes", "Followed capcodes"), nav) }) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize()) {
            if (list.isEmpty()) item {
                EmptyState(tr("Nog geen capcodes gevolgd", "No capcodes followed yet"),
                    tr("Open een melding en tik bij Eenheden op de ster van een eenheid, bijvoorbeeld je eigen kazerne.", "Open an alert and tap the star of a unit, for example your own fire station."))
            }
            items(list, key = { it.key }) { (code, naam) ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(naam, fontWeight = FontWeight.Medium)
                        Text(code, color = Muted, fontSize = 12.sp)
                    }
                    TextButton(onClick = { Settings.toggleVolg(code, naam) }) { Text(tr("Niet meer volgen", "Unfollow")) }
                }
            }
            if (list.isNotEmpty()) item {
                Text(tr("Je krijgt een melding en ziet de melding in de lijst als een van deze capcodes wordt opgeroepen, ook buiten je plaatsen, straal en profielen. De stille modus geldt wel.",
                    "You get a notification and see the alert in the list when one of these capcodes is called, also outside your places, radius and profiles. Quiet hours still apply."),
                    color = Muted, fontSize = 12.sp, modifier = Modifier.padding(16.dp))
            }
        }
    }
}
