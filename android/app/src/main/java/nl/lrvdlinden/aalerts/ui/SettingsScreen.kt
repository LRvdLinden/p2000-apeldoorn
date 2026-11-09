package nl.lrvdlinden.aalerts.ui

import android.Manifest
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Article
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.launch
import nl.lrvdlinden.aalerts.BuildConfig
import nl.lrvdlinden.aalerts.MainActivity
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.data.*
import nl.lrvdlinden.aalerts.push.Push
import nl.lrvdlinden.aalerts.tr

fun hm(m: Int) = "%02d:%02d".format(m / 60, m % 60)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(nav: Nav) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var testResult by remember { mutableStateOf<String?>(null) }
    var update by remember { mutableStateOf<ApkInfo?>(null) }
    var systemAllowed by remember { mutableStateOf(Push.systemAllowed) }
    LaunchedEffect(Unit) { update = Api.apkInfo()?.takeIf { it.build > BuildConfig.VERSION_CODE } }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        systemAllowed = Push.systemAllowed
        if (ok) Settings.notificationsEnabled = true
    }
    val locPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { updateLocation(ctx) }
    LaunchedEffect(Settings.toonAfstand) { if (Settings.toonAfstand) updateLocation(ctx) }

    Scaffold(containerColor = MaterialTheme.colorScheme.background, contentWindowInsets = WindowInsets.statusBars,
        topBar = { TopAppBar(title = { Text(tr("Instellingen", "Settings"), fontWeight = FontWeight.Bold) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            update?.let { u ->
                SectionCard(tr("Nieuwe versie beschikbaar", "New version available"), Icons.Outlined.SystemUpdate) {
                    Text(tr("Versie ${u.version} (${u.build}) staat klaar op a-alerts.nl.", "Version ${u.version} (${u.build}) is ready on a-alerts.nl."), fontSize = 14.sp)
                    u.notes?.let { Text(it, color = Muted, fontSize = 13.sp) }
                    Button(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.WEBSITE}/android/"))) }) { Text(tr("Bijwerken", "Update")) }
                }
            }

            MeldingenUitBanner()
            SectionCard(tr("Pushmeldingen", "Push notifications"), Icons.Outlined.Notifications) {
                if (!Push.available) {
                    Text(tr("Deze versie is gebouwd zonder pushmeldingen.", "This version was built without push notifications."), color = Muted, fontSize = 13.sp)
                } else {
                    SwitchRow(tr("Pushmeldingen", "Push notifications"), tr("Nieuwe meldingen die bij je profielen passen", "New alerts that match your profiles"), Settings.notificationsEnabled && systemAllowed) { on ->
                        if (on && !Push.systemAllowed) {
                            if (Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                            else ctx.startActivity(Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, ctx.packageName))
                        } else Settings.notificationsEnabled = on
                    }
                    if (Settings.notificationsEnabled && !systemAllowed) {
                        Text(tr("Meldingen staan uit in Android. Zet ze aan bij de app-instellingen.", "Notifications are off in Android. Turn them on in the app settings."), color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                    }
                    if (Build.VERSION.SDK_INT >= 26) NavRow(tr("Geluid en trillen per soort", "Sound and vibration per type"), tr("Android-meldingskanalen", "Android notification channels"), Icons.Outlined.VolumeUp) {
                        ctx.startActivity(Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(AndroidSettings.EXTRA_APP_PACKAGE, ctx.packageName))
                    }
                }
            }

            SectionCard(tr("Meldingsprofielen", "Notification profiles"), Icons.Outlined.Tune) {
                Text(tr("Tot ${MeldingProfiel.MAX} profielen, elk met eigen plaatsen, disciplines, waarschuwingen en tijden.", "Up to ${MeldingProfiel.MAX} profiles, each with its own places, services, warnings and times."), color = Muted, fontSize = 12.sp)
                Settings.profielen.forEach { p ->
                    NavRow(p.naam + if (!p.actief) tr(" (uit)", " (off)") else "", p.samenvatting + " · " + p.tijdSamenvatting) { nav.open("profiel/${enc(p.id)}") }
                }
                if (Settings.profielen.size < MeldingProfiel.MAX) TextButton(onClick = {
                    val p = MeldingProfiel(naam = tr("Profiel ${Settings.profielen.size + 1}", "Profile ${Settings.profielen.size + 1}"))
                    Settings.profielen = Settings.profielen + p
                    nav.open("profiel/${enc(p.id)}")
                }) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text(tr("Profiel toevoegen", "Add profile")) }
            }

            ExtraMeldingenCard(nav)

            SectionCard(tr("Stille uren", "Quiet hours"), Icons.Outlined.Bedtime) {
                SwitchRow(tr("Stille uren", "Quiet hours"), tr("Geen meldingen tussen ${hm(Settings.quietFrom)} en ${hm(Settings.quietTo)}", "No notifications between ${hm(Settings.quietFrom)} and ${hm(Settings.quietTo)}"), Settings.quietMode) { Settings.quietMode = it }
                if (Settings.quietMode) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = { TimePickerDialog(ctx, { _, h, m -> Settings.quietFrom = h * 60 + m }, Settings.quietFrom / 60, Settings.quietFrom % 60, true).show() }, Modifier.weight(1f)) { Text(tr("Van ", "From ") + hm(Settings.quietFrom)) }
                    OutlinedButton(onClick = { TimePickerDialog(ctx, { _, h, m -> Settings.quietTo = h * 60 + m }, Settings.quietTo / 60, Settings.quietTo % 60, true).show() }, Modifier.weight(1f)) { Text(tr("Tot ", "Until ") + hm(Settings.quietTo)) }
                }
                SwitchRow(tr("Kritieke meldingen", "Critical alerts"), tr("A0, A1 en P1 komen ook tijdens stille uren door", "A0, A1 and P1 still come through during quiet hours"), Settings.criticalAlerts) { Settings.criticalAlerts = it }
            }

            if (Push.available && Settings.notificationsEnabled) SectionCard {
                Button(onClick = { scope.launch { testResult = Push.sendTest() ?: tr("Verstuurd. Zie je niets binnen een halve minuut? Kijk bij Instellingen › Apps › A-Alerts › Meldingen en zet batterijbesparing voor A-Alerts uit.", "Sent. Nothing within half a minute? Check Settings › Apps › A-Alerts › Notifications and turn off battery optimisation for A-Alerts.") } }, modifier = Modifier.fillMaxWidth()) {
                    Text(tr("Stuur een testmelding", "Send a test notification"))
                }
                testResult?.let { Text(it, color = Muted, fontSize = 13.sp) }
            }

            // In-app alarm sound (as on iOS).
            SectionCard(tr("Meldingen in de app", "Alerts in the app"), Icons.Outlined.VolumeUp) {
                SwitchRow(tr("Alarmgeluid in de app", "Alarm sound in the app"), tr("Een geluid als er een nieuwe melding binnenkomt terwijl de app open is. Het volgt je filters en de stille uren.", "A sound when a new alert comes in while the app is open. It follows your filters and quiet hours."), Settings.alarmSound) { Settings.alarmSound = it }
                if (Settings.alarmSound) {
                    SwitchRow(tr("Alleen bij spoed", "Only for urgent alerts"), tr("A0, A1 en P1", "A0, A1 and P1"), Settings.alarmOnlyUrgent) { Settings.alarmOnlyUrgent = it }
                    OutlinedButton(onClick = { InAppAlarm.test(Settings.alarmOnlyUrgent) }, modifier = Modifier.fillMaxWidth()) { Text(tr("Geluid testen", "Test sound")) }
                }
            }

            SectionCard(tr("Mijn buurt", "My area"), Icons.Outlined.MyLocation) {
                NavRow(tr("Gevolgde capcodes", "Followed capcodes"), if (Settings.gevolgd.isEmpty()) tr("Geen", "None") else "${Settings.gevolgd.size}", Icons.Outlined.StarBorder) { nav.open("capcodes") }
                SwitchRow(tr("Afstand tonen", "Show distance"), tr("Hoe ver een melding van je locatie is", "How far an alert is from your location"), Settings.toonAfstand) {
                    Settings.toonAfstand = it
                    if (it) locPerm.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                }
                NavRow(tr("Straal rond een locatie", "Radius around a location"), if (Settings.radiusEnabled) "${Settings.radiusKm.toInt()} km · " + (if (Settings.radiusMode == "vast") Settings.fixedPlaats else tr("huidige locatie", "current location")) else tr("Uit", "Off")) { nav.open("buurt") }
            }

            SectionCard(tr("Weergave", "Appearance"), Icons.Outlined.Palette) {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    listOf("systeem" to tr("Systeem", "System"), "licht" to tr("Licht", "Light"), "donker" to tr("Donker", "Dark")).forEachIndexed { i, (k, l) ->
                        SegmentedButton(selected = Settings.appearance == k, onClick = { Settings.appearance = k }, shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text(l, fontSize = 13.sp) }
                    }
                }
                NavRow(tr("Kaart en helikopters", "Map and helicopters"), tr("Licht of donker, routespoor, eenheden, prestatiemodus", "Light or dark, route trail, units, performance mode"), Icons.Outlined.Map) { nav.open("kaartweergave") }
                Text(tr("Je instellingen gaan mee in de Android-back-up (Google), zodat je ze op een nieuwe telefoon terugkrijgt.", "Your settings are part of the Android backup (Google), so you get them back on a new phone."), color = Muted, fontSize = 12.sp)
            }

            SectionCard(tr("Privacy", "Privacy"), Icons.Outlined.Lock) {
                val act = ctx as? MainActivity
                SwitchRow(tr("App-vergrendeling", "App lock"), tr("Ontgrendel met vingerafdruk, gezicht of pincode", "Unlock with fingerprint, face or PIN"), Settings.appLock, enabled = act?.canLock == true) { Settings.appLock = it }
            }

            SectionCard(tr("Informatie", "Information"), Icons.Outlined.Info) {
                StatusNavRow { nav.open("status") }
                NavRow(tr("Hulp en veelgestelde vragen", "Help and FAQ"), icon = Icons.AutoMirrored.Outlined.HelpOutline) { nav.open("content/hulp") }
                NavRow(tr("Wat is nieuw", "What's new"), icon = Icons.Outlined.NewReleases) { nav.open("changelog") }
                NavRow(tr("Privacyverklaring", "Privacy policy"), icon = Icons.Outlined.PrivacyTip) { nav.open("content/privacy") }
                NavRow(tr("Gebruiksvoorwaarden", "Terms of use"), icon = Icons.AutoMirrored.Outlined.Article) { nav.open("content/terms") }
                NavRow("Disclaimer", icon = Icons.Outlined.Gavel) { nav.open("content/disclaimer") }
                ToestelIdRow()
                NavRow(tr("Website a-alerts.nl", "Website a-alerts.nl"), icon = Icons.Outlined.Language) { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.WEBSITE))) }
                if (Build.VERSION.SDK_INT >= 33) NavRow(tr("Taal van de app", "App language"), tr("Nederlands of Engels", "Dutch or English"), Icons.Outlined.Translate) {
                    ctx.startActivity(Intent(AndroidSettings.ACTION_APP_LOCALE_SETTINGS, Uri.parse("package:${ctx.packageName}")))
                }
            }

            SectionCard(tr("Volg ons", "Follow us"), Icons.Outlined.Groups) {
                NavRow(tr("WhatsApp-groep", "WhatsApp group"), icon = Icons.Outlined.Forum) { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://chat.whatsapp.com/IgZ5zvVTD25Getrk91nIMf"))) }
            }

            MoreAppsCard()

            Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Image(painterResource(R.drawable.app_icon), null, Modifier.size(56.dp).clip(RoundedCornerShape(14.dp)))
                Text("A-Alerts", fontWeight = FontWeight.Bold)
                Text(tr("Versie", "Version") + " ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · Android", color = Muted, fontSize = 12.sp)
                Text(tr("Bel bij nood altijd 112.", "In an emergency always call 112."), color = Muted, fontSize = 12.sp)
                Text("© ${java.time.Year.now().value} A-Alerts. All rights reserved.", color = Muted, fontSize = 12.sp)
                Text(tr("Made & Powered by PixelForges", "Made & Powered by PixelForges"), color = Muted, fontSize = 12.sp,
                    modifier = Modifier.clickable { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://pixelforges.nl"))) })
                Spacer(Modifier.height(6.dp))
                Text(tr("P2000-gegevens via p2000.page", "P2000 data via p2000.page"), color = Muted, fontSize = 11.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).padding(4.dp))
            }
        }
    }
}

/** "Meer apps van de ontwikkelaar" (same card as in the Apple apps). */
@Composable
fun MoreAppsCard() {
    val ctx = LocalContext.current
    SectionCard(tr("Meer apps van de ontwikkelaar", "More apps by the developer"), Icons.Outlined.Apps) {
        Text(tr("Bekijk alle apps van LRvdLinden: voor iPhone, iPad, Mac, Apple TV, Homey en Android.", "See all apps by LRvdLinden: for iPhone, iPad, Mac, Apple TV, Homey and Android."), color = Muted, fontSize = 13.sp)
        OutlinedButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://lrvdlinden.app"))) }) { Text("lrvdlinden.app") }
    }
}
