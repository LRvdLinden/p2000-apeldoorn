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
    private var gelezenRaw by str("gelezen", "")

    // Appearance
    var appearance by str("appearance", "systeem")
    var kaartLagen by set("kaartLagen", setOf("meldingen", "waarschuwingen", "knmi", "helikopters", "werkgebied", "ziekenhuizen"))
    var kaartPeriode by int("kaartPeriode", 24)

    // Notifications
    var notificationsEnabled by bool("notificationsEnabled", false, push = true)
    var quietMode by bool("quietMode", false, push = true)
    var quietFrom by int("quietFrom", 23 * 60, push = true)
    var quietTo by int("quietTo", 7 * 60, push = true)
    var criticalAlerts by bool("criticalAlerts", true, push = true)
    private var profielenRaw by str("profielen", "", push = true)

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
            ),
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
