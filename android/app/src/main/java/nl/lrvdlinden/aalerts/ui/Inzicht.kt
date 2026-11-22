package nl.lrvdlinden.aalerts.ui

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.tr
import java.io.File
import java.time.DayOfWeek
import java.time.format.TextStyle as DagStijl
import java.util.Locale

// MARK: Abbreviations

/** The P2000 text with the abbreviations it explains underlined; tap one for its meaning (same as iOS). */
@Composable
fun AfkortingTekst(tekst: String, style: TextStyle, modifier: Modifier = Modifier) {
    val treffers = remember(tekst, Afkortingen.items) { Afkortingen.zoek(tekst) }
    var gekozen by remember { mutableStateOf<Afkorting?>(null) }
    val onderstreept = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline))
    val tekstMetLinks = remember(tekst, treffers) {
        buildAnnotatedString {
            var i = 0
            treffers.forEach { t ->
                if (t.start > i) append(tekst.substring(i, t.start))
                withLink(LinkAnnotation.Clickable(t.afkorting.term, onderstreept) { gekozen = t.afkorting }) { append(tekst.substring(t.start, t.end)) }
                i = t.end
            }
            if (i < tekst.length) append(tekst.substring(i))
        }
    }
    Text(tekstMetLinks, style = style, modifier = modifier)
    gekozen?.let { a ->
        AlertDialog(onDismissRequest = { gekozen = null }, confirmButton = { TextButton(onClick = { gekozen = null }) { Text("OK") } },
            title = { Text(a.term, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold) }, text = { Text(a.tekst) })
    }
}

/** "Afkortingen in deze melding": every explained term once, also readable for TalkBack. */
@Composable
fun AfkortingenInMelding(m: Melding, nav: Nav) {
    val lijst = remember(m.guid, Afkortingen.items) {
        Afkortingen.zoek(listOfNotNull(m.title, m.fullMelding).joinToString(" ")).map { it.afkorting }.distinctBy { it.term }
    }
    if (lijst.isEmpty()) return
    SectionCard(tr("Afkortingen in deze melding", "Abbreviations in this alert"), Icons.AutoMirrored.Outlined.MenuBook) {
        lijst.forEach { a ->
            Row(Modifier.semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.Top) {
                Text(a.term, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = Color(0xFFDC2626), fontSize = 14.sp, modifier = Modifier.widthIn(min = 56.dp))
                Spacer(Modifier.width(10.dp))
                Text(a.tekst, color = Muted, fontSize = 14.sp)
            }
        }
        TextButton(onClick = { nav.open("afkortingen") }) { Text(tr("Alle afkortingen", "All abbreviations")) }
    }
}

/** Searchable list of every abbreviation (Instellingen › Over deze app). */
@Composable
fun AfkortingenScreen(nav: Nav) {
    val ctx = LocalContext.current
    var zoek by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { Afkortingen.laad(ctx) }
    val lijst = remember(zoek, Afkortingen.items) {
        val q = zoek.trim()
        Afkortingen.items.sortedBy { it.term.lowercase() }.filter { q.isEmpty() || it.term.contains(q, true) || it.tekst.contains(q, true) }
    }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Afkortingen", "Abbreviations"), nav) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            OutlinedTextField(zoek, { zoek = it }, Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), singleLine = true,
                placeholder = { Text(tr("Zoek een afkorting", "Search an abbreviation")) }, leadingIcon = { Icon(Icons.Outlined.Search, null) })
            when {
                Afkortingen.items.isEmpty() && Afkortingen.fout != null -> EmptyState(tr("Afkortingen niet geladen", "Abbreviations not loaded"), Afkortingen.fout ?: "")
                Afkortingen.items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                lijst.isEmpty() -> EmptyState(tr("Niets gevonden", "Nothing found"), zoek)
                else -> LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                    items(lijst, key = { it.term }) { a ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp).semantics(mergeDescendants = true) {}) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(a.term, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                a.dienst?.let { Dienst.of(it) }?.takeIf { it != Dienst.ONBEKEND }?.let { d -> Pill(d.label, d.textColor) }
                            }
                            Text(a.tekst, color = Muted, fontSize = 14.sp)
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

// MARK: Statistics of the last 28 days

/** "Laatste 28 dagen" in Statistieken: figures from the server (all alerts, not only what this device loaded). */
@Composable
fun Laatste28Dagen(nav: Nav) {
    LaunchedEffect(Unit) { StatistiekStore.laad() }
    Text(tr("Laatste 28 dagen", "Last 28 days"), fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
    val s = StatistiekStore.stat
    when {
        s != null -> StatistiekKaarten(s, nav)
        StatistiekStore.fout != null -> SectionCard(tr("Laatste 28 dagen", "Last 28 days"), Icons.Outlined.WarningAmber) {
            Text(tr("Cijfers konden niet worden geladen (${StatistiekStore.fout}).", "Figures could not be loaded (${StatistiekStore.fout})."), color = Muted, fontSize = 13.sp)
        }
        else -> Box(Modifier.fillMaxWidth().height(80.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    }
}

@Composable
fun StatistiekKaarten(s: Statistiek, nav: Nav, metPlaatsen: Boolean = true, metEenheden: Boolean = true) {
    val rood = Color(0xFFDC2626)
    SectionCard(tr("${s.dagen} dagen", "${s.dagen} days"), Icons.Outlined.CalendarMonth) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Tegel(tr("Meldingen", "Alerts"), "${s.totaal}", Modifier.weight(1f))
            Tegel(tr("Per dag", "Per day"), if (s.dagen > 0) "%.1f".format(s.totaal / s.dagen.toDouble()) else "–", Modifier.weight(1f))
        }
        s.gisteren?.totaal?.let { t ->
            val gem = s.gisteren.gemiddeld ?: 0.0
            Text(tr("Gisteren $t, gemiddeld %.1f per dag".format(gem), "Yesterday $t, on average %.1f a day".format(gem)), color = Muted, fontSize = 13.sp)
        }
        Text(tr("Zonder testoproepen en proefalarmen.", "Without test calls and test alarms."), color = Muted, fontSize = 11.sp)
    }
    if (s.perDag.size > 1) SectionCard(tr("Per dag", "Per day"), Icons.Outlined.BarChart) {
        val max = (s.perDag.maxOfOrNull { it.totaal } ?: 1).coerceAtLeast(1)
        Canvas(Modifier.fillMaxWidth().height(120.dp).semantics { contentDescription = tr("Meldingen per dag", "Alerts per day") }) {
            val w = size.width / s.perDag.size
            s.perDag.forEachIndexed { i, d ->
                var y = size.height
                val delen = Dienst.selectable.map { it to (d.perDienst[it.key] ?: 0) }.filter { it.second > 0 }
                if (delen.isEmpty()) {
                    val h = size.height * d.totaal / max
                    drawRoundRect(rood, Offset(i * w + w * 0.15f, size.height - h), Size(w * 0.7f, h), CornerRadius(2f))
                } else delen.forEach { (dienst, n) ->
                    val h = size.height * n / max
                    drawRect(dienst.color, Offset(i * w + w * 0.15f, y - h), Size(w * 0.7f, h)); y -= h
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Dienst.selectable.forEach { d -> Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(9.dp).clip(RoundedCornerShape(2.dp)).background(d.color)); Text(" " + d.label, fontSize = 11.sp, color = Muted) } }
        }
    }
    SectionCard(tr("Per discipline", "By service"), Icons.Outlined.Category) {
        val max = (s.perDienst.values.maxOrNull() ?: 1).coerceAtLeast(1)
        Dienst.selectable.forEach { d ->
            val n = s.perDienst[d.key] ?: 0
            Row(verticalAlignment = Alignment.CenterVertically) {
                DienstIcon(d, 24.dp); Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) { Text(d.label, fontSize = 13.sp); Balk(n / max.toFloat(), d.color) }
                Spacer(Modifier.width(8.dp)); Text("$n", fontWeight = FontWeight.Bold, modifier = Modifier.widthIn(min = 32.dp))
            }
        }
    }
    SectionCard(tr("Per uur van de dag", "By hour of the day"), Icons.Outlined.Schedule) {
        Staven(s.perUur, rood, tr("Meldingen per uur", "Alerts per hour"))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { listOf("00", "06", "12", "18", "23").forEach { Text(it, color = Muted, fontSize = 10.sp) } }
        s.druksteUur?.let { u -> Text(tr("Drukste uur: %02d:00–%02d:00".format(u, (u + 1) % 24), "Busiest hour: %02d:00–%02d:00".format(u, (u + 1) % 24)), color = Muted, fontSize = 12.sp) }
    }
    SectionCard(tr("Per dag van de week", "By day of the week"), Icons.Outlined.DateRange) {
        Staven(s.perWeekdag, rood, tr("Meldingen per weekdag", "Alerts per weekday"), nadruk = s.druksteWeekdag)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceAround) {
            DayOfWeek.values().forEach { Text(it.getDisplayName(DagStijl.SHORT, Locale.getDefault()), color = Muted, fontSize = 10.sp) }
        }
    }
    if (metPlaatsen && s.topPlaatsen.isNotEmpty()) SectionCard(tr("Drukste plaatsen", "Busiest places"), Icons.Outlined.Place) {
        val max = s.topPlaatsen.first().aantal.coerceAtLeast(1)
        s.topPlaatsen.take(8).forEach { p -> RijMetBalk(p.plaats.capPlaats(), p.aantal, max, Color(0xFF3B82F6)) { nav.open(MeldingFilter.Plaats(p.plaats).route) } }
    }
    if (metEenheden && s.topEenheden.isNotEmpty()) SectionCard(tr("Meest ingezette eenheden", "Most deployed units"), Icons.Outlined.Groups) {
        val max = s.topEenheden.first().aantal.coerceAtLeast(1)
        s.topEenheden.take(8).forEach { e ->
            RijMetBalk(e.titel, e.aantal, max, Dienst.of(e.dienst).color, e.code?.takeIf { it.isNotBlank() }?.let { c -> { nav.open(MeldingFilter.Eenheid(c, e.naam).route) } })
        }
    }
    s.helikopters?.takeIf { (it.inzetten ?: 0) > 0 || it.perToestel.isNotEmpty() }?.let { h ->
        SectionCard(tr("Traumahelikopters", "Air ambulances"), Icons.Outlined.FlightTakeoff) {
            h.inzetten?.let { Text(tr("$it inzetten", "$it missions"), fontSize = 20.sp, fontWeight = FontWeight.Bold) }
            val max = (h.perToestel.maxOfOrNull { it.aantal } ?: 1).coerceAtLeast(1)
            h.perToestel.forEach { t -> RijMetBalk(t.naam, t.aantal, max, Dienst.TRAUMAHELI.color, null) }
        }
    }
}

@Composable
private fun Tegel(label: String, waarde: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(Color(0xFFDC2626).copy(alpha = 0.1f)).padding(12.dp).semantics(mergeDescendants = true) {}) {
        Text(label, color = Color(0xFFDC2626), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text(waarde, fontSize = 28.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Balk(f: Float, color: Color) {
    Box(Modifier.padding(vertical = 2.dp).fillMaxWidth(f.coerceIn(0.01f, 1f)).height(6.dp).clip(RoundedCornerShape(3.dp)).background(color))
}

@Composable
private fun Staven(waarden: List<Int>, kleur: Color, beschrijving: String, nadruk: Int? = null) {
    val max = (waarden.maxOrNull() ?: 1).coerceAtLeast(1)
    Canvas(Modifier.fillMaxWidth().height(110.dp).semantics { contentDescription = beschrijving }) {
        val w = size.width / waarden.size
        waarden.forEachIndexed { i, n ->
            val h = size.height * n / max
            drawRoundRect(if (nadruk == null || nadruk == i) kleur else kleur.copy(alpha = 0.45f), Offset(i * w + w * 0.15f, size.height - h), Size(w * 0.7f, h), CornerRadius(3f))
        }
    }
}

@Composable
private fun RijMetBalk(titel: String, n: Int, max: Int, kleur: Color, onClick: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Row { Text(titel, fontSize = 14.sp, maxLines = 1, modifier = Modifier.weight(1f)); Text("$n", fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
            Balk(n / max.toFloat(), kleur)
        }
        if (onClick != null) Icon(Icons.Filled.ChevronRight, null, tint = Muted)
    }
}

// MARK: Alerts of one place or unit

@Composable
fun MeldingenLijstScreen(filter: MeldingFilter, nav: Nav) {
    var meldingen by remember(filter) { mutableStateOf<List<Melding>>(emptyList()) }
    var stat by remember(filter) { mutableStateOf<Statistiek?>(null) }
    var fout by remember(filter) { mutableStateOf<String?>(null) }
    var laden by remember(filter) { mutableStateOf(true) }
    LaunchedEffect(filter) {
        coroutineScope {
            val l = async { runCatching { Api.meldingen(filter, 100) } }
            val c = async { runCatching { Api.statistiek(28, filter) } }
            l.await().onSuccess { meldingen = it; fout = null }.onFailure { fout = it.message }
            stat = c.await().getOrNull()
        }
        laden = false
    }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(filter.titel, nav) }) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize()) {
            stat?.let { s ->
                item {
                    SectionCard(modifier = Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text("${s.totaal}", fontSize = 30.sp, fontWeight = FontWeight.Bold); Spacer(Modifier.width(8.dp))
                            Text(tr("meldingen in ${s.dagen} dagen", "alerts in ${s.dagen} days"), color = Muted, modifier = Modifier.padding(bottom = 4.dp))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Dienst.selectable.forEach { d -> (s.perDienst[d.key] ?: 0).takeIf { it > 0 }?.let { n -> Pill("${d.label} $n", d.textColor) } }
                        }
                        s.druksteUur?.let { u -> Text(tr("Drukste uur: %02d:00–%02d:00".format(u, (u + 1) % 24), "Busiest hour: %02d:00–%02d:00".format(u, (u + 1) % 24)), color = Muted, fontSize = 12.sp) }
                        if (s.totaal > 0) Staven(s.perUur, Color(0xFFDC2626), tr("Meldingen per uur", "Alerts per hour"))
                    }
                }
            }
            when {
                laden && meldingen.isEmpty() -> item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                fout != null && meldingen.isEmpty() -> item { EmptyState(tr("Meldingen konden niet worden geladen", "Alerts could not be loaded"), fout ?: "") }
                meldingen.isEmpty() -> item { EmptyState(tr("Geen meldingen gevonden", "No alerts found"), "") }
            }
            items(meldingen, key = { it.guid }) { m -> MeldingRow(m) { nav.melding(m.guid) }; HorizontalDivider() }
        }
    }
}

// MARK: Share as image

/** The server draws the alert as an image (landscape, square or story), shared as a PNG (same as iOS). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeelAfbeeldingDialog(m: Melding, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    var formaat by remember { mutableStateOf("og") }
    var bestand by remember { mutableStateOf<File?>(null) }
    var fout by remember { mutableStateOf<String?>(null) }
    var poging by remember { mutableIntStateOf(0) }
    LaunchedEffect(formaat, poging) {
        bestand = null; fout = null
        runCatching {
            val bytes = Api.afbeelding(m.guid, formaat)
            File(File(ctx.cacheDir, "deel").apply { mkdirs() }, "A-Alerts-${m.guid.takeLast(12)}-$formaat.png").apply { writeBytes(bytes) }
        }.onSuccess { bestand = it }.onFailure { fout = it.message }
    }
    val opties = listOf("og" to tr("Liggend", "Landscape"), "vierkant" to tr("Vierkant", "Square"), "staand" to tr("Staand", "Portrait"))
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text(tr("Deel als afbeelding", "Share as image")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    opties.forEachIndexed { i, (key, label) ->
                        SegmentedButton(selected = formaat == key, onClick = { formaat = key }, shape = SegmentedButtonDefaults.itemShape(i, opties.size)) { Text(label, fontSize = 12.sp) }
                    }
                }
                Text(when (formaat) {
                    "vierkant" -> tr("Voor een Instagram-bericht (1080 × 1350)", "For an Instagram post (1080 × 1350)")
                    "staand" -> tr("Voor een story (1080 × 1920)", "For a story (1080 × 1920)")
                    else -> tr("Voor berichten en X (1200 × 630)", "For messages and X (1200 × 630)")
                }, color = Muted, fontSize = 12.sp)
                val f = bestand
                when {
                    f != null -> {
                        val bmp = remember(f) { BitmapFactory.decodeFile(f.path)?.asImageBitmap() }
                        bmp?.let { Image(it, tr("Voorbeeld van de afbeelding", "Preview of the image"), Modifier.fillMaxWidth().heightIn(max = 260.dp).clip(RoundedCornerShape(10.dp))) }
                    }
                    fout != null -> {
                        Text(tr("De afbeelding kon niet worden gemaakt ($fout).", "The image could not be made ($fout)."), color = Muted, fontSize = 13.sp)
                        TextButton(onClick = { poging++ }) { Text(tr("Opnieuw proberen", "Try again")) }
                    }
                    else -> Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text(tr("Afbeelding maken…", "Making image…"), color = Muted) }
                }
            }
        },
        confirmButton = { TextButton(enabled = bestand != null, onClick = { bestand?.let { deelAfbeelding(ctx, it, m) }; onDismiss() }) { Text(tr("Deel afbeelding", "Share image")) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Sluit", "Close")) } })
}

fun deelAfbeelding(ctx: Context, f: File, m: Melding) {
    val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".bestanden", f)
    val intent = Intent(Intent.ACTION_SEND).setType("image/png")
        .putExtra(Intent.EXTRA_STREAM, uri)
        .putExtra(Intent.EXTRA_TEXT, "${m.title}\n\nA-Alerts – ${m.shareUrl}")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    ctx.startActivity(Intent.createChooser(intent, tr("Deel afbeelding", "Share image")))
}
