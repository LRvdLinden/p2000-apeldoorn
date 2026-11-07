package nl.lrvdlinden.aalerts.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nl.lrvdlinden.aalerts.data.Api
import nl.lrvdlinden.aalerts.data.AppStatus
import nl.lrvdlinden.aalerts.data.StatusStijl
import nl.lrvdlinden.aalerts.tr

/** Status of A-Alerts (same data as a-alerts.nl/status), loaded at most once a minute. */
object StatusCache {
    var status by mutableStateOf<AppStatus?>(null); private set
    var fout by mutableStateOf(false); private set
    var geladen by mutableLongStateOf(0L); private set
    suspend fun load(force: Boolean = false) {
        if (!force && System.currentTimeMillis() - geladen < 60_000) return
        val s = Api.status()
        if (s != null) { status = s; fout = false } else fout = true
        geladen = System.currentTimeMillis()
    }
}

@Composable
private fun Dot(staat: String, size: Int = 10) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(Color(StatusStijl.kleur(staat))))
}

/** The Settings row: "Status" with a coloured dot and the state. */
@Composable
fun StatusNavRow(onClick: () -> Unit) {
    LaunchedEffect(Unit) { StatusCache.load() }
    val s = StatusCache.status
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick).padding(vertical = 8.dp).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.MonitorHeart, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Text("Status", Modifier.weight(1f))
        if (s != null) { Dot(s.staat); Spacer(Modifier.width(8.dp)); Text(StatusStijl.label(s.staat), color = Muted, fontSize = 14.sp) }
    }
}

@Composable
fun StatusScreen(nav: Nav) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { StatusCache.load(force = true) }
    val s = StatusCache.status
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar("Status", nav) }) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when {
                s != null -> {
                    item {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(StatusStijl.achtergrond(s.staat))).padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(StatusStijl.kop(s.staat), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                            s.incidenten.actief.firstOrNull()?.let { inc ->
                                Text(inc.kop, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                inc.updates.firstOrNull()?.let { Text(it.regel, color = Color.White.copy(alpha = 0.92f), fontSize = 14.sp) }
                            }
                        }
                    }
                    items(s.groepen, key = { it.id }) { g ->
                        SectionCard(g.titel) {
                            g.onderdelen.forEach { o ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                                    Dot(o.staat); Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(o.titel, fontSize = 15.sp)
                                        o.uitleg?.let { Text(it, color = Muted, fontSize = 12.sp) }
                                    }
                                    Text(StatusStijl.label(o.staat), color = Muted, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                    if (s.incidenten.gepland.isNotEmpty()) item {
                        SectionCard(tr("Gepland onderhoud", "Scheduled maintenance")) {
                            s.incidenten.gepland.forEach { i ->
                                Text(i.kop, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                i.updates.firstOrNull()?.let { Text(it.regel, color = Muted, fontSize = 12.sp) }
                            }
                        }
                    }
                }
                StatusCache.fout -> item {
                    Text(tr("De status kan nu niet worden opgehaald.", "The status can't be loaded right now."), color = Muted, modifier = Modifier.padding(20.dp))
                }
                else -> item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            }
            item {
                TextButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://a-alerts.nl/status/"))) }, modifier = Modifier.fillMaxWidth()) {
                    Text(tr("Volledige status op a-alerts.nl/status", "Full status at a-alerts.nl/status"))
                }
            }
        }
    }
}
