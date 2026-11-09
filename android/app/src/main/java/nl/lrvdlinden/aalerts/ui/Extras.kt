package nl.lrvdlinden.aalerts.ui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.push.Push
import nl.lrvdlinden.aalerts.tr
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

// A-Alerts (same as iOS build 53): helicopter zones, large incidents, map display, "Klopt deze melding niet?"
// and the banner when Android blocks the notifications.

/** Zone being created from a long press on the map (picked up by the zone screen). */
object ZoneConcept { var nieuw by mutableStateOf<HeliZone?>(null) }

/** A circle of [km] around a spot as a ring of [lon, lat] (for MapArea). */
fun cirkel(lat: Double, lon: Double, km: Double, n: Int = 48): List<List<Double>> = (0..n).map { i ->
    val a = 2 * Math.PI * i / n
    listOf(lon + km / (111.32 * Math.cos(Math.toRadians(lat))) * Math.sin(a), lat + km / 110.574 * Math.cos(a))
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun HeliZonesScreen(nav: Nav) {
    var bewerk by remember { mutableStateOf<HeliZone?>(ZoneConcept.nieuw) }
    LaunchedEffect(Unit) { ZoneConcept.nieuw = null }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Helikopters in je zone", "Helicopters in your zone"), nav) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (Settings.heliGepauzeerd) SectionCard {
                val tot = java.time.Instant.ofEpochMilli(Settings.heliPauzeTot).atZone(ZoneId.systemDefault()).toLocalTime()
                Text(tr("Gepauzeerd tot ${hm(tot.hour * 60 + tot.minute)}", "Paused until ${hm(tot.hour * 60 + tot.minute)}"), color = Color(0xFFEA580C), fontWeight = FontWeight.SemiBold)
                TextButton(onClick = { Settings.heliPauzeTot = 0L }) { Text(tr("Hervat de zonemeldingen", "Resume zone notifications")) }
            }
            SectionCard(tr("Zones", "Zones"), Icons.Outlined.TripOrigin) {
                Settings.heliZones.forEach { z ->
                    NavRow(z.naam, "${fmtKm(z.km)} km") { bewerk = z }
                }
                if (Settings.heliZones.size < HeliZone.MAX) TextButton(onClick = {
                    val c = Settings.radiusCenter ?: (52.2112 to 5.9699)
                    bewerk = HeliZone(naam = if (Settings.heliZones.isEmpty()) tr("Thuis", "Home") else tr("Zone ${Settings.heliZones.size + 1}", "Zone ${Settings.heliZones.size + 1}"), lat = c.first, lon = c.second)
                }) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text(tr("Zone toevoegen", "Add zone")) }
                Text(tr("Tip: houd een plek op de kaart ingedrukt om daar meteen een zone te maken. Maximaal vijf zones.", "Tip: press and hold a spot on the map to create a zone there. Up to five zones."), color = Muted, fontSize = 12.sp)
            }
            SectionCard(tr("Meld mij bij", "Notify me on"), Icons.Outlined.NotificationsActive) {
                SwitchRow(tr("Opstijgen in je zone", "Taking off in your zone"), checked = Settings.heliOpstijgen) { Settings.heliOpstijgen = it }
                SwitchRow(tr("Landen in je zone", "Landing in your zone"), checked = Settings.heliLanden) { Settings.heliLanden = it }
                SwitchRow(tr("Je zone in vliegen", "Flying into your zone"), checked = Settings.heliBinnen) { Settings.heliBinnen = it }
            }
            SectionCard(tr("Welke helikopters", "Which helicopters"), Icons.Outlined.FlightTakeoff) {
                fun zet(s: String, on: Boolean) { val v = if (on) Settings.heliSoorten + s else Settings.heliSoorten - s; if (v.isNotEmpty()) Settings.heliSoorten = v }
                SwitchRow(tr("Traumahelikopters (Lifeliner)", "Trauma helicopters (Lifeliner)"), checked = "trauma" in Settings.heliSoorten) { zet("trauma", it) }
                SwitchRow(tr("Politiehelikopters (Zulu)", "Police helicopters (Zulu)"), checked = "politie" in Settings.heliSoorten) { zet("politie", it) }
            }
            if (Settings.heliZones.isNotEmpty() && !Settings.heliGepauzeerd) SectionCard(tr("Pauzeer zonemeldingen", "Pause zone notifications"), Icons.Outlined.PauseCircle) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { Settings.heliPauzeTot = System.currentTimeMillis() + 3600_000 }) { Text(tr("1 uur", "1 hour")) }
                    OutlinedButton(onClick = { Settings.heliPauzeTot = System.currentTimeMillis() + 4 * 3600_000 }) { Text(tr("4 uur", "4 hours")) }
                    OutlinedButton(onClick = {
                        Settings.heliPauzeTot = LocalDate.now().plusDays(1).atTime(LocalTime.of(7, 0)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                    }) { Text(tr("Tot morgen 07:00", "Until tomorrow 07:00")) }
                }
                Text(tr("Handig als je een dagje weg bent of een helikopterbasis in je zone hebt. De stille uren gelden ook voor zonemeldingen.", "Handy when you're away for a day or have a helicopter base in your zone. Quiet hours also apply to zone notifications."), color = Muted, fontSize = 12.sp)
            }
        }
    }
    bewerk?.let { z -> HeliZoneDialog(z, isNieuw = Settings.heliZones.none { it.id == z.id }, onDismiss = { bewerk = null }) }
}

private fun fmtKm(km: Double) = if (km % 1.0 == 0.0) km.toInt().toString() else km.toString()

/** Name, spot (the middle of the map) and size of a zone. */
@Composable
fun HeliZoneDialog(zone: HeliZone, isNieuw: Boolean, onDismiss: () -> Unit) {
    var naam by remember { mutableStateOf(zone.naam) }
    var km by remember { mutableDoubleStateOf(zone.km) }
    var midden by remember { mutableStateOf(zone.lat to zone.lon) }
    val camera = remember { MapCamera(zone.lat, zone.lon, 11.0, key = zone.id) }
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text(if (isNieuw) tr("Nieuwe zone", "New zone") else zone.naam) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(naam, { naam = it.take(40) }, label = { Text(tr("Naam", "Name")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Box(Modifier.fillMaxWidth().height(240.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))) {
                    AMap(Modifier.fillMaxSize(), camera = camera,
                        areas = listOf(MapArea("zone", listOf(cirkel(midden.first, midden.second, km)), 0xFF9333EA, 0.15)),
                        onCameraIdle = { la, lo -> midden = la to lo })
                    Text("+", fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.Center))
                }
                Text(tr("Straal: ${fmtKm(km)} km", "Radius: ${fmtKm(km)} km"))
                Slider(value = km.toFloat(), onValueChange = { km = Math.round(it * 2) / 2.0 }, valueRange = 1f..25f)
                Text(tr("Schuif de kaart tot het kruisje op de goede plek staat.", "Move the map until the cross is on the right spot."), color = Muted, fontSize = 12.sp)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val z = zone.copy(naam = naam.ifBlank { tr("Zone", "Zone") }, lat = Math.round(midden.first * 1e4) / 1e4, lon = Math.round(midden.second * 1e4) / 1e4, km = km)
                Settings.heliZones = if (isNieuw) (Settings.heliZones + z).take(HeliZone.MAX) else Settings.heliZones.map { if (it.id == z.id) z else it }
                onDismiss()
            }) { Text(tr("Bewaar", "Save")) }
        },
        dismissButton = {
            Row {
                if (!isNieuw) TextButton(onClick = { Settings.heliZones = Settings.heliZones.filterNot { it.id == zone.id }; onDismiss() }) {
                    Text(tr("Verwijder", "Delete"), color = MaterialTheme.colorScheme.error)
                }
                TextButton(onClick = onDismiss) { Text(tr("Annuleer", "Cancel")) }
            }
        })
}

/** "Groot incident" and the link to the helicopter zones (in the settings, under the profiles). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExtraMeldingenCard(nav: Nav) {
    SectionCard(tr("Extra meldingen", "Extra notifications"), Icons.Outlined.LocalFireDepartment) {
        SwitchRow(tr("Groot incident", "Large incident"),
            tr("GRIP, opschaling, een grote of middelbrand of tien of meer eenheden, ook buiten je profielen", "GRIP, scaling up, a large or medium fire or ten or more units, also outside your profiles"),
            Settings.grootIncident) { Settings.grootIncident = it }
        if (Settings.grootIncident) {
            Text(tr("Plaatsen (niets gekozen = hele werkgebied)", "Places (nothing chosen = whole area)"), color = Muted, fontSize = 12.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Werkgebied.namen.forEach { n -> SelectChip(n, n in Settings.grootPlaatsen) { Settings.grootPlaatsen = Settings.grootPlaatsen.toggle(n) } }
            }
        }
        NavRow(tr("Helikopters in je zone", "Helicopters in your zone"),
            when { Settings.heliZones.isEmpty() -> tr("Uit", "Off"); Settings.heliGepauzeerd -> tr("Gepauzeerd", "Paused"); else -> "${Settings.heliZones.size}" },
            Icons.Outlined.FlightTakeoff) { nav.open("helizones") }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KaartWeergaveScreen(nav: Nav) {
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = { BackBar(tr("Kaart en helikopters", "Map and helicopters"), nav) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionCard(tr("Kaart", "Map"), Icons.Outlined.Map) {
                Text(tr("Kleuren", "Colours"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Keuzes(listOf("licht" to tr("Licht", "Light"), "donker" to tr("Donker", "Dark"), "auto" to tr("Automatisch", "Automatic")), Settings.kaartThema) { Settings.kaartThema = it }
                Text(tr("Automatisch volgt de lichte of donkere modus van je telefoon.", "Automatic follows your phone's light or dark mode."), color = Muted, fontSize = 12.sp)
                SwitchRow(tr("Rustige kaartkleuren", "Muted map colours"), tr("Meldingen en helikopters vallen beter op", "Alerts and helicopters stand out more"), Settings.gedemptKaart) { Settings.gedemptKaart = it }
            }
            SectionCard(tr("Helikopters", "Helicopters"), Icons.Outlined.FlightTakeoff) {
                Text(tr("Routespoor", "Route trail"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Keuzes(SpoorBereik.entries.map { it.key to it.label }, Settings.spoorStandaard) { Settings.spoorStandaard = it }
                SwitchRow(tr("Eigen kleur per helikopter", "Own colour per helicopter"), checked = Settings.heliKleurPerToestel) { Settings.heliKleurPerToestel = it }
                Text(tr("Grootte op de kaart", "Size on the map"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Keuzes(listOf("klein" to tr("Klein", "Small"), "normaal" to tr("Normaal", "Normal"), "groot" to tr("Groot", "Large")), Settings.heliIcoon) { Settings.heliIcoon = it }
                Text(tr("Eenheden", "Units"), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Keuzes(listOf("metrisch" to tr("Meter en km/u", "Metres and km/h"), "luchtvaart" to tr("Voet en knopen", "Feet and knots")), Settings.eenheden) { Settings.eenheden = it }
            }
            SectionCard(tr("Prestaties", "Performance"), Icons.Outlined.Speed) {
                SwitchRow(tr("Prestatiemodus", "Performance mode"), tr("Minder animaties; helikopters bewegen niet vloeiend tussen twee posities. Fijn op oudere toestellen.", "Fewer animations; helicopters don't move smoothly between two positions. Nice on older phones."), Settings.prestatieModus) { Settings.prestatieModus = it }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Keuzes(opties: List<Pair<String, String>>, gekozen: String, onKies: (String) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        opties.forEachIndexed { i, (k, l) ->
            SegmentedButton(selected = gekozen == k, onClick = { onKies(k) }, shape = SegmentedButtonDefaults.itemShape(i, opties.size)) { Text(l, fontSize = 12.sp, maxLines = 1) }
        }
    }
}

/** "Klopt deze melding niet?": reason, note and (for the location) the right spot. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MeldingFeedbackDialog(m: Melding, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    val redenen = listOf("locatie" to tr("De plek klopt niet", "The location is wrong"), "dienst" to tr("Verkeerde hulpdienst", "Wrong service"),
        "prioriteit" to tr("Verkeerde prioriteit", "Wrong priority"), "dubbel" to tr("Dubbele melding", "Duplicate alert"),
        "test" to tr("Test- of proefalarm", "Test or trial alarm"), "anders" to tr("Iets anders", "Something else"))
    var reden by remember { mutableStateOf("locatie") }
    var toelichting by remember { mutableStateOf("") }
    var plekKiezen by remember { mutableStateOf(false) }
    var midden by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var verstuurd by remember { mutableStateOf(false) }
    var bezig by remember { mutableStateOf(false) }
    val camera = remember { MapCamera(m.lat ?: 52.2112, m.lon ?: 5.9699, 15.0, key = m.guid) }
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text(tr("Klopt deze melding niet?", "Is this alert wrong?")) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(m.title, fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    redenen.forEach { (k, l) -> SelectChip(l, reden == k) { reden = k } }
                }
                OutlinedTextField(toelichting, { toelichting = it.take(500) }, label = { Text(tr("Toelichting (niet verplicht)", "Note (optional)")) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                if (reden == "locatie") {
                    SwitchRow(tr("Geef de juiste plek aan", "Mark the right spot"), checked = plekKiezen) { plekKiezen = it }
                    if (plekKiezen) Box(Modifier.fillMaxWidth().height(220.dp)) {
                        AMap(Modifier.fillMaxSize(), camera = camera, onCameraIdle = { la, lo -> midden = la to lo })
                        Text("📍", fontSize = 28.sp, modifier = Modifier.align(Alignment.Center).offset(y = (-14).dp))
                    }
                }
                status?.let { Text(it, color = if (verstuurd) Color(0xFF16A34A) else MaterialTheme.colorScheme.error, fontSize = 13.sp) }
                Text(tr("Je melding gaat anoniem naar de beheerder van A-Alerts. Een foute plek of tekst komt meestal uit de meldkamer zelf.", "Your report goes anonymously to the A-Alerts team. A wrong spot or text usually comes from the dispatch centre itself."), color = Muted, fontSize = 11.sp)
            }
        },
        confirmButton = {
            if (!verstuurd) TextButton(enabled = !bezig, onClick = {
                bezig = true
                scope.launch {
                    val body = mutableMapOf<String, Any?>("reden" to reden, "toelichting" to toelichting, "platform" to "android")
                    if (reden == "locatie" && plekKiezen) midden?.let { body["lat"] = it.first; body["lon"] = it.second }
                    val fout = Api.meldingFeedback(m.guid, body)
                    bezig = false
                    if (fout == null) { verstuurd = true; status = tr("Bedankt! We kijken ernaar.", "Thanks! We'll look into it.") } else status = fout
                }
            }) { Text(tr("Verstuur", "Send")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(if (verstuurd) tr("Klaar", "Done") else tr("Annuleer", "Cancel")) } })
}

/** Red banner when notifications are on in the app but blocked by Android. */
@Composable
fun MeldingenUitBanner(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    var geblokkeerd by remember { mutableStateOf(false) }
    val lifecycle = androidx.compose.ui.platform.LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, e -> if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) geblokkeerd = Push.available && !Push.systemAllowed }
        lifecycle.addObserver(obs)
        geblokkeerd = Push.available && !Push.systemAllowed
        onDispose { lifecycle.removeObserver(obs) }
    }
    if (!Settings.notificationsEnabled || !geblokkeerd) return
    Surface(color = Color(0xFFDC2626), shape = RoundedCornerShape(16.dp), modifier = modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.NotificationsOff, null, tint = Color.White)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(tr("Pushmeldingen staan uit", "Notifications are off"), color = Color.White, fontWeight = FontWeight.SemiBold)
                Text(tr("Je hebt meldingen aangezet in A-Alerts, maar Android houdt ze tegen.", "You turned on notifications in A-Alerts, but Android blocks them."), color = Color.White.copy(alpha = 0.9f), fontSize = 12.sp)
                Spacer(Modifier.height(6.dp))
                Button(onClick = {
                    val i = if (Build.VERSION.SDK_INT >= 26) Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, ctx.packageName)
                        else Intent(AndroidSettings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
                    ctx.startActivity(i)
                }, colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFFDC2626))) { Text(tr("Open instellingen", "Open settings"), fontSize = 12.sp) }
            }
        }
    }
}

/** "Groot incident" badge on an alert page. */
@Composable
fun GrootIncidentBadge(m: Melding) {
    Surface(color = Color(0xFFDC2626), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.LocalFireDepartment, null, tint = Color.White)
            Spacer(Modifier.width(8.dp))
            Text(tr("Groot incident", "Large incident"), color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            m.grip?.toIntOrNull()?.takeIf { it > 0 }?.let { Text("GRIP $it", color = Color.White, fontWeight = FontWeight.Bold) }
        }
    }
}

/** "Toestel-ID" for support, under Disclaimer: tap to copy. */
@Composable
fun ToestelIdRow() {
    val ctx = LocalContext.current
    val code = remember { nl.lrvdlinden.aalerts.data.InstallPing.toestelId(ctx) }
    var gekopieerd by remember { mutableStateOf(false) }
    LaunchedEffect(gekopieerd) { if (gekopieerd) { kotlinx.coroutines.delay(2000); gekopieerd = false } }
    Row(Modifier.fillMaxWidth().clickable {
        val cm = ctx.getSystemService(android.content.ClipboardManager::class.java)
        cm?.setPrimaryClip(android.content.ClipData.newPlainText(tr("Toestel-ID", "Device ID"), code))
        gekopieerd = true
    }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.Tag, null, tint = Muted)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(tr("Toestel-ID", "Device ID"))
            Text(tr("Geef dit door als je een vraag hebt; er staat geen naam of nummer in.", "Share this if you have a question; it contains no name or number."), color = Muted, fontSize = 12.sp)
        }
        Text(if (gekopieerd) tr("Gekopieerd", "Copied") else code, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
            color = if (gekopieerd) Color(0xFF16A34A) else Muted)
    }
}
