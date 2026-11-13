package nl.lrvdlinden.aalerts.data

import android.content.Context
import nl.lrvdlinden.aalerts.isDutch
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import nl.lrvdlinden.aalerts.ZONE
import nl.lrvdlinden.aalerts.tr
import java.time.Instant
import java.util.UUID
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/** A notification profile: own places, services, priorities, warnings and times (max. 5, same shape as iOS and the server). */
@Serializable
data class MeldingProfiel(
    val id: String = UUID.randomUUID().toString(),
    val naam: String,
    val actief: Boolean = true,
    val diensten: Set<String> = emptySet(),
    val plaatsen: Set<String> = emptySet(),
    val prioriteiten: Set<String> = emptySet(),
    val nlalert: Boolean = true,
    val burgernet: Boolean = false,
    val knmi: Set<String> = setOf("orange", "red"),
    val altijd: Boolean = true,
    val van: Int = 7 * 60,
    val tot: Int = 23 * 60,
    val dagen: Set<Int> = (1..7).toSet(),
) {
    val tijdSamenvatting: String get() {
        if (altijd) return tr("Altijd", "Always")
        fun f(m: Int) = "%02d:%02d".format(m / 60, m % 60)
        val d = when {
            dagen.size == 7 -> tr("elke dag", "every day")
            dagen == (1..5).toSet() -> tr("werkdagen", "weekdays")
            dagen == setOf(6, 7) -> tr("weekend", "weekend")
            else -> dagen.sorted().joinToString(", ") { dagKort(it) }
        }
        return "${f(van)}–${f(tot)}, $d"
    }
    val samenvatting: String get() {
        val parts = mutableListOf<String>()
        parts += if (diensten.isEmpty()) tr("Alle disciplines", "All services") else diensten.sorted().joinToString(", ") { Dienst.of(it).label }
        parts += when (plaatsen.size) { 0 -> tr("alle plaatsen", "all places"); 1 -> plaatsen.first(); else -> tr("${plaatsen.size} plaatsen", "${plaatsen.size} places") }
        if (prioriteiten.isNotEmpty()) parts += prioriteiten.sorted().joinToString("/")
        return parts.joinToString(" · ")
    }
    companion object {
        const val MAX = 5
        fun dagKort(d: Int) = (if (isDutch) listOf("ma", "di", "wo", "do", "vr", "za", "zo") else listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"))[(d - 1).coerceIn(0, 6)]
    }
}

/** All settings, stored on this device (SharedPreferences) and observable from Compose. */
object Settings {
    private lateinit var prefs: SharedPreferences
    fun init(ctx: Context) {
        if (::prefs.isInitialized) return
        prefs = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)
        for (p in all) p.load()
        if (profielen.isEmpty()) profielen = listOf(MeldingProfiel(naam = tr("Standaard", "Default")))
        // New map layer "verkeer" (NDW: closures, roadworks, accidents, breakdowns, jams): on once for everyone (as on iOS).
        if (!prefs.getBoolean("laag.verkeer.v1", false)) {
            kaartLagen = kaartLagen + "verkeer"
            prefs.edit().putBoolean("laag.verkeer.v1", true).apply()
        }
    }

    var onPushSettingsChanged: (() -> Unit)? = null
    private val all = mutableListOf<P<*>>()

    private class P<T>(val key: String, val default: T, val push: Boolean, val read: (SharedPreferences, String, T) -> T, val write: (SharedPreferences.Editor, String, T) -> Unit) : ReadWriteProperty<Any?, T> {
        var state = mutableStateOf(default)
        fun load() { state.value = if (prefs.contains(key)) read(prefs, key, default) else default }
        override fun getValue(thisRef: Any?, property: KProperty<*>): T = state.value
        override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
            if (state.value == value) return
            state.value = value
            prefs.edit().also { write(it, key, value) }.apply()
            if (push) onPushSettingsChanged?.invoke()
        }
    }

    private fun bool(key: String, d: Boolean, push: Boolean = false) = P(key, d, push, { p, k, x -> p.getBoolean(k, x) }, { e, k, v -> e.putBoolean(k, v) }).also { all += it }
    private fun int(key: String, d: Int, push: Boolean = false) = P(key, d, push, { p, k, x -> p.getInt(k, x) }, { e, k, v -> e.putInt(k, v) }).also { all += it }
    private fun dbl(key: String, d: Double, push: Boolean = false) = P(key, d, push, { p, k, x -> Double.fromBits(p.getLong(k, x.toBits())) }, { e, k, v -> e.putLong(k, v.toBits()) }).also { all += it }
    private fun str(key: String, d: String, push: Boolean = false) = P(key, d, push, { p, k, x -> p.getString(k, x) ?: x }, { e, k, v -> e.putString(k, v) }).also { all += it }
    private fun set(key: String, d: Set<String>, push: Boolean = false) = P(key, d, push, { p, k, x -> p.getStringSet(k, x)?.toSet() ?: x }, { e, k, v -> e.putStringSet(k, v) }).also { all += it }

    // List filters
    var diensten by set("diensten", emptySet())
    var plaatsen by set("plaatsen", emptySet())
    var prioriteiten by set("prioriteiten", emptySet())
    var waarschuwingFilter by set("waarschuwingFilter", emptySet())
    var groupByDay by bool("groupByDay", true)
    var hideRead by bool("hideRead", false)
    var bewaard by set("bewaard", emptySet())
    /** Followed capcodes ("code|naam"): push and list also outside places, radius and profiles (as on iOS). */
    var volgCapcodes by set("volgCapcodes", emptySet(), push = true)
    private var gelezenRaw by str("gelezen", "")

    // Appearance
    var appearance by str("appearance", "systeem")
    /** Layer Luchtvaart: the kinds of aircraft shown on the map ("trauma", "politie", "chinook", "f35", "kustwacht_dash8" …). */
    var luchtSoorten by set("luchtSoorten", setOf("trauma", "politie"))
    var kaartLagen by set("kaartLagen", setOf("meldingen", "waarschuwingen", "knmi", "verkeer", "helikopters", "werkgebied", "ziekenhuizen"))
    var kaartPeriode by int("kaartPeriode", 24)

    // Notifications
    var notificationsEnabled by bool("notificationsEnabled", false, push = true)
    var quietMode by bool("quietMode", false, push = true)
    /** In-app alarm sound when a new alert comes in while the app is open (as on iOS). */
    var alarmSound by bool("alarmSound", true)
    var alarmOnlyUrgent by bool("alarmOnlyUrgent", false)
    /** Show the distance from your location in the list and on the alert page (as on iOS). */
    var toonAfstand by bool("toonAfstand", false)
    /** KNMI: a push one hour before a code starts, and one when it is lifted (code green). For all profiles. */
    var pushKnmiVooraf by bool("pushKnmiVooraf", true, push = true)
    /** AMBER Alert and Vermist Kind Alert: one switch each (not per profile), on by default. */
    var pushAmber by bool("pushAmber", true, push = true)
    var pushVermistKind by bool("pushVermistKind", true, push = true)
    /** Tab Nieuws: push when A-Alerts adds a message to a liveblog (on), and for new police news (off). */
    var pushNieuwsLiveblog by bool("pushNieuwsLiveblog", true, push = true)
    var pushNieuwsPolitie by bool("pushNieuwsPolitie", false, push = true)
    var pushNieuwsRegio by bool("pushNieuwsRegio", false, push = true)
    var pushKnmiOpgeheven by bool("pushKnmiOpgeheven", true, push = true)
    var quietFrom by int("quietFrom", 23 * 60, push = true)
    var quietTo by int("quietTo", 7 * 60, push = true)
    var criticalAlerts by bool("criticalAlerts", true, push = true)
    private var profielenRaw by str("profielen", "", push = true)

    // Helicopter zones and large incidents (same as iOS)
    private var heliZonesRaw by str("heliZones", "", push = true)
    var heliOpstijgen by bool("heliOpstijgen", true, push = true)
    var heliLanden by bool("heliLanden", true, push = true)
    var heliBinnen by bool("heliBinnen", true, push = true)
    var heliSoorten by set("heliSoorten", setOf("trauma"), push = true)
    /** The bell on one aircraft: a push when it takes off (ids such as "lifeliner3" or "lucht-480c21"). */
    var heliVolg by set("heliVolg", emptySet(), push = true)
    /** Zone notifications paused until (epoch ms; 0 = not paused). */
    var heliPauzeTot by P("heliPauzeTot", 0L, true, { p, k, x -> p.getLong(k, x) }, { e, k, v -> e.putLong(k, v) }).also { all += it }
    var grootIncident by bool("grootIncident", false, push = true)
    var grootPlaatsen by set("grootPlaatsen", emptySet(), push = true)

    // Map display ("Kaart en helikopters")
    var spoorStandaard by str("spoorStandaard", "vlucht")
    var heliKleurPerToestel by bool("heliKleurPerToestel", false)
    var heliIcoon by str("heliIcoon", "normaal")
    var eenheden by str("eenheden", "metrisch")
    /** Map colours: "licht" (default), "donker" or "auto" (follow the app/device's light or dark mode). */
    private var kaartThemaRaw by str("kaartThema", "")
    var kaartThema: String
        get() = kaartThemaRaw.ifEmpty { "licht" }
        set(v) { kaartThemaRaw = v }
    var gedemptKaart by bool("gedemptKaart", false)
    var prestatieModus by bool("prestatieModus", false)

    var heliZones: List<HeliZone>
        get() = runCatching { AppJson.decodeFromString<List<HeliZone>>(heliZonesRaw) }.getOrDefault(emptyList())
        set(v) { heliZonesRaw = AppJson.encodeToString(v.take(HeliZone.MAX)) }
    val heliGepauzeerd get() = heliPauzeTot > System.currentTimeMillis()
    /** Width of the helicopter drawing on the map in dp. */
    val heliBreedte get() = when (heliIcoon) { "klein" -> 46; "groot" -> 84; else -> 64 }

    // Radius
    var radiusEnabled by bool("radiusEnabled", false, push = true)
    var radiusKm by dbl("radiusKm", 5.0, push = true)
    var radiusMode by str("radiusMode", "huidig", push = true)
    var fixedPlaats by str("fixedPlaats", "Apeldoorn", push = true)
    var currentLat by dbl("currentLat", 0.0)
    var currentLon by dbl("currentLon", 0.0)

    // Device
    var appLock by bool("appLock", false)
    var onboardingDone by bool("onboardingDone", false)
    var firstUse by P("firstUse", 0L, false, { p, k, x -> p.getLong(k, x) }, { e, k, v -> e.putLong(k, v) }).also { all += it }
    var lastReviewAsk by P("lastReviewAsk", 0L, false, { p, k, x -> p.getLong(k, x) }, { e, k, v -> e.putLong(k, v) }).also { all += it }

    var profielen: List<MeldingProfiel>
        get() = runCatching { AppJson.decodeFromString<List<MeldingProfiel>>(profielenRaw) }.getOrDefault(emptyList())
        set(v) { profielenRaw = AppJson.encodeToString(v.take(MeldingProfiel.MAX)) }

    // Read alerts (max. 600), shown greyed out.
    val gelezen: Set<String> get() = gelezenRaw.split(",").filter { it.isNotEmpty() }.toSet()
    fun markRead(guid: String) {
        val list = gelezenRaw.split(",").filter { it.isNotEmpty() }
        if (guid in list) return
        gelezenRaw = (list + guid).takeLast(600).joinToString(",")
    }
    /** Why this device got no push for an alert (same rules as the server and iOS), or null when it would have got one. */
    fun geenPushReden(m: Melding): String? {
        if (!notificationsEnabled) return tr("Pushmeldingen staan uit in Instellingen.", "Notifications are off in Settings.")
        if (volgtCapcode(m)) return null
        if (grootWanted(m)) return null
        val km = if (radiusKm % 1.0 == 0.0) radiusKm.toInt().toString() else radiusKm.toString()
        if (radiusEnabled) radiusCenter?.let { c ->
            val la = m.lat; val lo = m.lon
            if (la == null || lo == null) return tr("Je gebruikt Mijn buurt ($km km) en deze melding heeft geen precieze plek.", "You use My area ($km km) and this alert has no exact location.")
            if (Geo.distanceKm(c.first, c.second, la, lo) > radiusKm) return tr("De melding ligt buiten je straal van $km km (Mijn buurt).", "The alert is outside your $km km radius (My area).")
        }
        val t = java.time.Instant.ofEpochMilli(m.millis).atZone(java.time.ZoneId.of("Europe/Amsterdam"))
        val min = t.hour * 60 + t.minute
        fun hm(x: Int) = "%02d:%02d".format(x / 60, x % 60)
        if (quietMode) {
            val stil = if (quietFrom == quietTo) true else if (quietFrom < quietTo) min in quietFrom until quietTo else (min >= quietFrom || min < quietTo)
            if (stil && !(criticalAlerts && m.isUrgent)) return tr("De melding kwam binnen tijdens je stille uren (${hm(quietFrom)}–${hm(quietTo)}).", "The alert came in during your quiet hours (${hm(quietFrom)}–${hm(quietTo)}).")
        }
        val dag = t.dayOfWeek.value
        fun geldt(p: MeldingProfiel): Boolean {
            if (!p.actief) return false
            if (p.altijd || p.van == p.tot) return true
            return if (p.van < p.tot) min >= p.van && min < p.tot && dag in p.dagen
            else if (min >= p.van) dag in p.dagen else min < p.tot && (if (dag == 1) 7 else dag - 1) in p.dagen
        }
        fun past(p: MeldingProfiel) = (p.diensten.isEmpty() || m.soort.key in p.diensten) && Werkgebied.matches(m, p.plaatsen) &&
            (p.prioriteiten.isEmpty() || (m.prioriteit ?: "").uppercase() in p.prioriteiten)
        val actief = profielen.filter { geldt(it) }
        if (actief.isEmpty()) return tr("Geen van je meldingsprofielen was actief op dat moment (tijden of dagen).", "None of your notification profiles was active at that time (times or days).")
        if (actief.any { past(it) }) return null
        val p = actief.first()
        if (p.diensten.isNotEmpty() && m.soort.key !in p.diensten) return tr("Profiel ‘${p.naam}’ volgt ${m.soort.label.lowercase()} niet.", "Profile ‘${p.naam}’ does not follow ${m.soort.label.lowercase()}.")
        if (p.prioriteiten.isNotEmpty() && (m.prioriteit ?: "").uppercase() !in p.prioriteiten) return tr("Profiel ‘${p.naam}’ volgt prioriteit ${m.prioriteit ?: "onbekend"} niet.", "Profile ‘${p.naam}’ does not follow priority ${m.prioriteit ?: "unknown"}.")
        return tr("De plaats valt buiten de plaatsen van profiel ‘${p.naam}’.", "The place is outside the places of profile ‘${p.naam}’.")
    }

    /** "Groot incident": on, in the chosen places, and not in quiet hours (unless critical and urgent). */
    fun grootWanted(m: Melding): Boolean {
        if (!grootIncident || !m.isGrootIncident) return false
        if (grootPlaatsen.isNotEmpty() && !Werkgebied.matches(m, grootPlaatsen)) return false
        if (quietMode) {
            val t = java.time.Instant.ofEpochMilli(m.millis).atZone(java.time.ZoneId.of("Europe/Amsterdam"))
            val min = t.hour * 60 + t.minute
            val stil = if (quietFrom == quietTo) true else if (quietFrom < quietTo) min in quietFrom until quietTo else (min >= quietFrom || min < quietTo)
            if (stil && !(criticalAlerts && m.isUrgent)) return false
        }
        return true
    }

    private fun capKey(c: String) = c.filter { it.isDigit() }
    val gevolgd: Map<String, String> get() = volgCapcodes.associate { it.substringBefore("|") to it.substringAfter("|", it.substringBefore("|")) }
    fun volgt(code: String) = capKey(code) in gevolgd
    fun toggleVolg(code: String, naam: String?) {
        val k = capKey(code); if (k.isEmpty()) return
        volgCapcodes = if (volgt(k)) volgCapcodes.filterNot { it.substringBefore("|") == k }.toSet()
            else if (volgCapcodes.size < 50) volgCapcodes + "$k|${naam ?: k}" else volgCapcodes
    }
    fun volgtCapcode(m: Melding): Boolean = gevolgd.isNotEmpty() && (listOf(m.capcode) + m.eenheden.map { it.code }).filterNotNull().any { capKey(it) in gevolgd }

    fun toggleBewaard(guid: String) { bewaard = if (guid in bewaard) bewaard - guid else bewaard + guid }

    val listFilterActive get() = diensten.isNotEmpty() || plaatsen.isNotEmpty() || prioriteiten.isNotEmpty() || radiusActive || waarschuwingFilter.isNotEmpty()

    val radiusCenter: Pair<Double, Double>? get() =
        if (radiusMode == "vast") Werkgebied.plaats(fixedPlaats)?.let { it.lat to it.lon }
        else if (currentLat != 0.0) currentLat to currentLon else null
    val radiusActive get() = radiusEnabled && radiusCenter != null

    fun withinRadius(m: Melding): Boolean {
        if (!radiusEnabled) return true
        val c = radiusCenter ?: return true
        val la = m.lat ?: return false; val lo = m.lon ?: return false
        return m.hasCoordinate && Geo.distanceKm(c.first, c.second, la, lo) <= radiusKm
    }

    fun matchesList(m: Melding): Boolean {
        // A followed capcode is always shown, also outside the list filters.
        if (volgtCapcode(m)) return true
        if (!withinRadius(m)) return false
        if (diensten.isNotEmpty() && m.soort.key !in diensten) return false
        if (!Werkgebied.matches(m, plaatsen)) return false
        if (prioriteiten.isNotEmpty() && (m.prioriteit ?: "").uppercase() !in prioriteiten) return false
        return true
    }

    fun matchesList(w: Waarschuwing): Boolean {
        if (waarschuwingFilter.isNotEmpty() && w.filterKey !in waarschuwingFilter && w.bron !in waarschuwingFilter) return false
        if (plaatsen.isNotEmpty() && plaatsen.none { w.covers(it) }) return false
        val c = radiusCenter
        if (radiusEnabled && c != null) {
            if (w.bron == "amber") return true // all of the Netherlands
            if (w.bron == "burgernet" || w.gebied == null) {
                val la = w.lat ?: return false; val lo = w.lon ?: return false
                if (Geo.distanceKm(c.first, c.second, la, lo) > radiusKm + 2) return false
            } else if (!w.contains(c.first, c.second) && (w.gebied ?: emptyList()).none { Geo.distanceToRingKm(it, c.first, c.second) <= radiusKm }) return false
        }
        return true
    }

    /** The server shape of the device settings (POST /v1/devices), same as the iPhone sends. */
    fun serverSettings(): Map<String, Any?> {
        val p = profielen
        val first = p.firstOrNull()
        val out = mutableMapOf<String, Any?>(
            "enabled" to true,
            "plaatsen" to (first?.plaatsen ?: emptySet()).sorted(),
            "diensten" to (first?.diensten ?: emptySet()).sorted(),
            "prioriteiten" to (first?.prioriteiten ?: emptySet()).sorted(),
            "quiet" to quietMode, "quiet_from" to quietFrom, "quiet_to" to quietTo, "critical" to criticalAlerts,
            "waarschuwingen" to mapOf(
                "nlalert" to p.any { it.actief && it.nlalert },
                "burgernet" to p.any { it.actief && it.burgernet },
                "knmi" to p.filter { it.actief }.flatMap { it.knmi }.toSet().sorted(),
                "knmiVooraf" to pushKnmiVooraf,
                "knmiOpgeheven" to pushKnmiOpgeheven,
                "amber" to pushAmber,
                "vermistkind" to pushVermistKind,
                "nieuwsLiveblog" to pushNieuwsLiveblog,
                "nieuwsPolitie" to pushNieuwsPolitie,
                "nieuwsRegio" to pushNieuwsRegio,
            ),
            "capcodes" to gevolgd.keys.sorted(),
            "heli" to mutableMapOf<String, Any?>(
                "zones" to heliZones.map { mapOf("id" to it.id, "naam" to it.naam, "lat" to it.lat, "lon" to it.lon, "km" to it.km) },
                "opstijgen" to heliOpstijgen, "landen" to heliLanden, "binnen" to heliBinnen, "soorten" to heliSoorten.sorted(),
                "volg" to heliVolg.sorted(),
            ).also { if (heliGepauzeerd) it["pauze_tot"] = heliPauzeTot },
            "groot" to mapOf("aan" to grootIncident, "plaatsen" to grootPlaatsen.sorted()),
            "profielen" to p.map {
                mapOf("id" to it.id, "naam" to it.naam, "actief" to it.actief, "diensten" to it.diensten.sorted(), "plaatsen" to it.plaatsen.sorted(),
                    "prioriteiten" to it.prioriteiten.sorted(), "nlalert" to it.nlalert, "burgernet" to it.burgernet, "knmi" to it.knmi.sorted(),
                    "altijd" to it.altijd, "van" to it.van, "tot" to it.tot, "dagen" to it.dagen.sorted())
            },
        )
        val c = radiusCenter
        if (radiusEnabled && c != null) {
            out["radius_km"] = radiusKm
            out["lat"] = Math.round(c.first * 1000) / 1000.0
            out["lon"] = Math.round(c.second * 1000) / 1000.0
        }
        return out
    }

    /** Distance in km from your (last known) location, when "Afstand tonen" is on. */
    fun afstandKm(m: Melding): Double? {
        if (!toonAfstand || currentLat == 0.0) return null
        val la = m.lat ?: return null; val lo = m.lon ?: return null
        return Geo.distanceKm(currentLat, currentLon, la, lo)
    }

    fun isQuiet(at: Instant = Instant.now()): Boolean {
        if (!quietMode) return false
        val t = at.atZone(ZONE); val now = t.hour * 60 + t.minute
        if (quietFrom == quietTo) return true
        return if (quietFrom < quietTo) now in quietFrom until quietTo else now >= quietFrom || now < quietTo
    }

    fun summary(set: Set<String>, label: (String) -> String) = when (set.size) {
        0 -> tr("Alles", "All")
        1 -> label(set.first())
        else -> tr("${set.size} geselecteerd", "${set.size} selected")
    }
}
