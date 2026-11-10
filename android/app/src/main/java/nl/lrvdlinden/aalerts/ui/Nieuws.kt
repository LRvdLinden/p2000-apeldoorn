package nl.lrvdlinden.aalerts.ui

import android.content.Intent
import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.ZONE
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.tr
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter

private val RED = Color(0xFFDC2626)

/** Images from the web (A-Alerts images and photos from the beheer), kept in memory. */
private object NetImages {
    val cache = object : LruCache<String, ImageBitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }
    suspend fun load(url: String): ImageBitmap? = cache.get(url) ?: withContext(Dispatchers.IO) {
        runCatching {
            (java.net.URL(url).openConnection() as java.net.HttpURLConnection).run {
                connectTimeout = 10_000; readTimeout = 15_000
                inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }?.asImageBitmap()
            }
        }.getOrNull()?.also { cache.put(url, it) }
    }
}

@Composable
fun NetImage(url: String?, fallback: Color, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop) {
    val img by produceState(url?.let { NetImages.cache.get(it) }, url) { if (value == null && url != null) value = NetImages.load(url) }
    Box(modifier.background(Brush.linearGradient(listOf(fallback, fallback.copy(alpha = 0.6f))))) {
        img?.let { Image(it, null, Modifier.matchParentSize(), contentScale = contentScale) }
    }
}

fun nieuwsWanneer(i: Instant): String {
    val s = Duration.between(i, Instant.now()).seconds
    return when {
        s < 60 -> tr("zojuist", "just now")
        s < 3600 -> tr("${s / 60} min geleden", "${s / 60} min ago")
        else -> Fmt.dayTime(i).let { if (i.atZone(ZONE).toLocalDate() == java.time.LocalDate.now(ZONE)) tr("vandaag ", "today ") + it else it }
    }
}

fun nieuwsMeta(x: NieuwsItem): String = when (x.soort) {
    "liveblog" -> listOfNotNull(tr("${x.aantal ?: 0} berichten", "${x.aantal ?: 0} messages"), tr("laatste ", "latest ") + nieuwsWanneer(x.laatste),
        if (x.isAfgerond) tr("afgerond", "ended") else null).joinToString(" · ")
    "weer" -> listOfNotNull(nieuwsWanneer(x.atInstant), if (x.isAfgerond) tr("opgeheven", "lifted") else null).joinToString(" · ")
    else -> nieuwsWanneer(x.atInstant)
}

@Composable
fun NieuwsLabel(x: NieuwsItem) {
    Row(Modifier.background(Color.White, RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Image(painterResource(x.icon), null, Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(x.label.uppercase(), color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        if (x.isLive) { Spacer(Modifier.width(6.dp)); Box(Modifier.size(7.dp).background(Color.Red, CircleShape)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NieuwsScreen(nav: Nav) {
    val scope = rememberCoroutineScope()
    var filter by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        NieuwsStore.load()
        while (true) { delay(120_000); NieuwsStore.load(force = true) }
    }
    val lijst = NieuwsStore.items.filter { filter == null || it.soort == filter }
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; NieuwsStore.load(force = true); refreshing = false } }) {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            item { Text(tr("Nieuws", "News"), fontSize = 30.sp, fontWeight = FontWeight.Bold) }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf(null to tr("Alles", "All"), "liveblog" to tr("Liveblogs", "Live blogs"), "politie" to tr("Politie", "Police"), "regionaal" to "112 Nieuws", "weer" to tr("Weer", "Weather"))) { (k, t) ->
                        FilterChip(selected = filter == k, onClick = { filter = k }, label = { Text(t) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = RED, selectedLabelColor = Color.White))
                    }
                }
            }
            when {
                NieuwsStore.loading && NieuwsStore.items.isEmpty() -> item { Box(Modifier.fillMaxWidth().padding(top = 60.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                NieuwsStore.fout != null && NieuwsStore.items.isEmpty() -> item { EmptyState(tr("Nieuws laden mislukt", "Could not load the news"), NieuwsStore.fout ?: "") }
                lijst.isEmpty() -> item { EmptyState(tr("Geen nieuws", "No news"), tr("Er is nu geen nieuws in deze categorie.", "There is no news in this category right now.")) }
                else -> itemsIndexed(lijst, key = { _, x -> x.id }) { i, x ->
                    if (i == 0) NieuwsHero(x) { nav.open("nieuws/${x.id}") } else NieuwsRij(x) { nav.open("nieuws/${x.id}") }
                }
            }
            item {
                Text(tr("Politieberichten: bron politie.nl. Afbeeldingen bij politieberichten zijn stockfoto's.", "Police news: source politie.nl. Images with police news are stock photos."),
                    color = Muted, fontSize = 11.sp, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
            }
        }
    }
}

@Composable
fun NieuwsHero(x: NieuwsItem, onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(22.dp)).clickable(onClick = onClick)) {
        NetImage(x.afbeelding, x.kleur, Modifier.matchParentSize())
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(0.4f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.85f))))
        Column(Modifier.align(Alignment.BottomStart).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NieuwsLabel(x)
            Text(x.titel, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 3, overflow = TextOverflow.Ellipsis, lineHeight = 24.sp)
            Text(nieuwsMeta(x), color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp)
        }
    }
}

@Composable
fun NieuwsRij(x: NieuwsItem, onClick: () -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            NetImage(x.afbeelding, x.kleur, Modifier.size(104.dp, 80.dp).clip(RoundedCornerShape(12.dp)))
            Spacer(Modifier.width(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(x.label, color = if (x.bron == "vermistkind") MaterialTheme.colorScheme.primary else x.kleur, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(x.titel, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 3, overflow = TextOverflow.Ellipsis, lineHeight = 19.sp)
                Text(nieuwsMeta(x), color = Muted, fontSize = 12.sp)
            }
        }
    }
}

private val DATUM = DateTimeFormatter.ofPattern("dd/MM/yyyy · HH:mm")

@Composable
fun NieuwsDetail(id: String, nav: Nav) {
    val ctx = LocalContext.current
    var x by remember(id) { mutableStateOf<NieuwsItem?>(null) }
    var klaar by remember(id) { mutableStateOf(false) }
    LaunchedEffect(id) {
        x = Api.nieuwsItem(id); klaar = true
        // A running liveblog refreshes by itself.
        while (x?.isLive == true) { delay(45_000); Api.nieuwsItem(id)?.let { x = it } }
    }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = {
        BackBar(if (x?.soort == "liveblog") tr("Liveblog", "Live blog") else tr("Nieuws", "News"), nav) {
            x?.link?.let { link ->
                IconButton(onClick = {
                    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "${x?.titel}\n$link"), tr("Delen", "Share")))
                }) { Icon(Icons.Outlined.Share, tr("Delen", "Share")) }
            }
        }
    }) { pad ->
        val d = x
        if (d == null) {
            Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
                if (klaar) EmptyState(tr("Bericht niet gevonden", "Item not found"), "") else CircularProgressIndicator()
            }
            return@Scaffold
        }
        LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            val weer = d.weer
            if (weer != null) {
                // Weather: like the warning on knmi.nl.
                item { WeerKaart(weer) }
                item { WeerTekst(weer) }
                item { Text(Fmt.day(d.atInstant) + " " + Fmt.time(d.atInstant), color = Muted, fontSize = 13.sp) }
            } else item {
                Box(Modifier.fillMaxWidth().height(250.dp).clip(RoundedCornerShape(22.dp))) {
                    NetImage(d.afbeelding, d.kleur, Modifier.matchParentSize())
                    Box(Modifier.matchParentSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.1f), 1f to Color.Black.copy(alpha = 0.85f))))
                    Column(Modifier.align(Alignment.BottomStart).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        NieuwsLabel(d)
                        Text(d.titel, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 27.sp)
                        Text(if (d.soort == "liveblog") listOf(tr("Gestart ", "Started ") + Fmt.dayTime(parseInstant(d.start) ?: d.atInstant), if (d.isAfgerond) tr("afgerond", "ended") else tr("loopt nog", "ongoing")).joinToString(" · ")
                            else listOfNotNull(Fmt.day(d.atInstant) + " " + Fmt.time(d.atInstant), d.plaats).joinToString(" · "),
                            color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                    }
                }
            }
            if (weer == null && !d.intro.isNullOrBlank() && d.soort != "liveblog") item { Text(d.intro, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp) }
            items(if (weer == null) d.alineas.orEmpty() else emptyList()) { a ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!a.titel.isNullOrBlank()) Text(a.titel, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text(a.tekst, fontSize = 16.sp, lineHeight = 23.sp)
                }
            }
            if (d.soort == "regionaal" && d.bronUrl != null) item {
                Button(onClick = { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(d.bronUrl))) } }, colors = ButtonDefaults.buttonColors(containerColor = RED), modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, null); Spacer(Modifier.width(8.dp))
                    Text(tr("Lees verder op 112nieuws.net", "Read more on 112nieuws.net"), color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
            if (d.waarschuwing != null && d.soort != "politie" && d.soort != "regionaal") item {
                Button(onClick = { nav.waarschuwing(d.waarschuwing) }, colors = ButtonDefaults.buttonColors(containerColor = d.kleur), modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.WarningAmber, null); Spacer(Modifier.width(8.dp))
                    Text(if (d.soort == "weer") tr("Bekijk de weerwaarschuwing", "View the weather warning") else tr("Bekijk de melding", "View the alert"), color = Color.White)
                }
            }
            val tl = d.tijdlijn.orEmpty()
            if (tl.isNotEmpty()) item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Tijdlijn", "Timeline"), fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text(tr("nieuwste boven", "newest on top"), color = Muted, fontSize = 12.sp)
                }
            }
            items(tl) { b ->
                val kleur = if (b.isEigen) RED else d.kleur
                Row {
                    Box(Modifier.padding(top = 6.dp).size(14.dp).background(kleur, CircleShape))
                    Spacer(Modifier.width(12.dp))
                    Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(DATUM.format(b.atInstant.atZone(ZONE)), color = Muted, fontSize = 12.sp)
                                Spacer(Modifier.width(6.dp))
                                Text(if (b.isEigen) "A-Alerts" else if (b.door == "burgernet") "Burgernet" else if (b.door == "amber" || b.door == "vermistkind") tr("Politie", "Police") else d.bronNaam,
                                    color = if (b.isEigen || d.bron != "vermistkind") kleur else MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                                    modifier = Modifier.background(kleur.copy(alpha = 0.12f), RoundedCornerShape(50)).padding(horizontal = 7.dp, vertical = 2.dp))
                            }
                            if (!b.titel.isNullOrBlank()) Text(b.titel, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            if (b.tekst.isNotBlank()) Text(b.tekst, fontSize = 15.sp, lineHeight = 21.sp)
                            b.foto?.let { NetImage(it, Color.Gray, Modifier.fillMaxWidth().heightIn(max = 280.dp).aspectRatio(4f / 3f).clip(RoundedCornerShape(12.dp)), ContentScale.Fit) }
                            b.url?.let { u ->
                                Row(Modifier.clickable { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) } }, verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Outlined.Link, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                                    Text(Uri.parse(u).host ?: u, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(when (d.soort) {
                        "politie" -> tr("Bron: politie.nl. De afbeelding is een stockfoto.", "Source: politie.nl. The image is a stock photo.")
                        "weer" -> tr("Bron: KNMI.", "Source: KNMI.")
                        "regionaal" -> tr("Bron: 112 Nieuws Nederland (112nieuws.net), met toestemming. De foto is een stockfoto.", "Source: 112 Nieuws Nederland (112nieuws.net), with permission. The photo is a stock photo.")
                        else -> if (d.bron == "burgernet") tr("Bron: Burgernet. Berichten met het label A-Alerts zijn aangevuld door A-Alerts.", "Source: Burgernet. Messages labelled A-Alerts were added by A-Alerts.")
                            else tr("Bron: Politie, via Burgernet. Berichten met het label A-Alerts zijn aangevuld door A-Alerts.", "Source: Police, via Burgernet. Messages labelled A-Alerts were added by A-Alerts.")
                    }, color = Muted, fontSize = 12.sp)
                    d.bronUrl?.takeIf { d.soort != "regionaal" }?.let { u ->
                        TextButton(onClick = { runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) } }, contentPadding = PaddingValues(0.dp)) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, null); Spacer(Modifier.width(6.dp))
                            Text(if (d.soort == "politie") tr("Lees op politie.nl", "Read on politie.nl") else tr("Bekijk de bron", "View the source"))
                        }
                    }
                }
            }
        }
    }
}
