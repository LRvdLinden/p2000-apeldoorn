package nl.lrvdlinden.aalerts.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import nl.lrvdlinden.aalerts.ZONE
import java.time.Instant
import java.time.LocalDate

/** Alerts, warnings and helicopters in memory, refreshed by the screens (15 s for alerts, 10 s for helicopters). */
object Store {
    var meldingen by mutableStateOf<List<Melding>>(emptyList()); private set
    var waarschuwingen by mutableStateOf<List<Waarschuwing>>(emptyList()); private set
    var alleWaarschuwingen by mutableStateOf<List<Waarschuwing>>(emptyList()); private set
    var helikopters by mutableStateOf<List<Helikopter>>(emptyList()); private set
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var lastUpdated by mutableStateOf<Instant?>(null); private set
    private val lock = Mutex()

    suspend fun refresh() = lock.withLock {
        loading = true
        try {
            meldingen = Api.meldingen(300).sortedByDescending { it.millis }
            InAppAlarm.handle(meldingen)
            error = null
            lastUpdated = Instant.now()
        } catch (e: Exception) {
            error = e.message
        } finally { loading = false }
        runCatching { waarschuwingen = Api.waarschuwingen(7) }
    }

    suspend fun refreshAlleWaarschuwingen() { runCatching { alleWaarschuwingen = Api.waarschuwingen(14) } }
    suspend fun refreshHelikopters() { val r = Api.helikoptersVol(); helikopters = r.helikopters; heliInzet = r.inzet }
    /** Lifeliners that were probably cancelled on their way to an alert, or did not take off. */
    var heliInzet by mutableStateOf<List<HeliInzet>>(emptyList()); private set
    fun inzetVoor(guid: String) = heliInzet.firstOrNull { it.guid == guid }
    /** The last cancellation of this helicopter, at most half an hour ago. */
    fun annuleringVan(heliId: String) = heliInzet.firstOrNull { x -> x.heli == heliId && x.geannuleerd && (parseInstant(x.at)?.let { java.time.Duration.between(it, java.time.Instant.now()).toMinutes() < 30 } ?: false) }
    var lucht by mutableStateOf<List<Helikopter>>(emptyList()); private set
    suspend fun refreshLucht(aan: Boolean) { lucht = if (aan) Api.lucht() else emptyList(); if (aan) luchtAlle = lucht }
    /** Unfiltered, for the numbers in the list of choices. */
    var luchtAlle by mutableStateOf<List<Helikopter>>(emptyList()); private set
    suspend fun refreshLuchtAlle() { luchtAlle = Api.lucht() }

    /** Traffic (NDW) and fixed speed cameras: refreshed every minute while the map shows one of the two layers. */
    var verkeer by mutableStateOf<VerkeerResponse?>(null); private set
    suspend fun refreshVerkeer() { Api.verkeer()?.let { verkeer = it } }

    /** Hospitals and bases: loaded once. */
    var locaties by mutableStateOf<List<Locatie>>(emptyList()); private set
    suspend fun loadLocaties() { if (locaties.isEmpty()) locaties = Api.locaties() }

    fun melding(guid: String) = meldingen.firstOrNull { it.guid == guid }
    fun waarschuwing(id: String) = (waarschuwingen + alleWaarschuwingen).firstOrNull { it.id == id }

    /** Active KNMI codes for the bar above the list. */
    /** Bar at the top of the pager: a missing child (AMBER Alert, Vermist Kind Alert) first, then the KNMI codes. */
    val knmiActief: List<Waarschuwing> get() = waarschuwingen.filter { it.isKind && it.isActief }.sortedByDescending { it.startAt } +
        waarschuwingen.filter { it.bron == "knmi" && !it.isBeeindigd }

    fun stats(day: LocalDate): DayStats = DayStats(day, meldingen)
}

/** Statistics for one day (computed in the app, like on iOS). */
class DayStats(val day: LocalDate, list: List<Melding>) {
    var totaal = 0; private set
    var totaalTotNu = 0; private set
    val perDienst = mutableMapOf<Dienst, Int>()
    val perPrioriteit = mutableMapOf<String, Int>()
    val perCategorie = mutableMapOf<String, Int>()
    val perUur = IntArray(24)

    init {
        val now = java.time.ZonedDateTime.now(ZONE)
        val nowSec = now.toLocalTime().toSecondOfDay()
        for (m in list) {
            val z = m.datum.atZone(ZONE)
            if (z.toLocalDate() != day) continue
            totaal++
            perDienst[m.soort] = (perDienst[m.soort] ?: 0) + 1
            m.prioriteit?.takeIf { it.isNotBlank() && it.lowercase() != "onbekend" }?.uppercase()?.let { perPrioriteit[it] = (perPrioriteit[it] ?: 0) + 1 }
            m.categorie?.takeIf { it.isNotBlank() }?.let { perCategorie[it] = (perCategorie[it] ?: 0) + 1 }
            perUur[z.hour]++
            if (z.toLocalTime().toSecondOfDay() <= nowSec) totaalTotNu++
        }
    }
}
