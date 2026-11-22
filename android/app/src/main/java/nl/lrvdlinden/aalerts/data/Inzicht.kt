package nl.lrvdlinden.aalerts.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import nl.lrvdlinden.aalerts.isDutch
import java.time.LocalDate
import java.net.URLEncoder

// Insight into the alerts, from api.a-alerts.nl (same as iOS): the hectometre post the server placed, the explanation of
// the abbreviations in a P2000 text, the figures of the last 28 days (also per place and unit) and the share image.
// Every field is optional: what the server does not (yet) send is left out, never invented.

/** `hm` of an alert: {"weg":"A50","hm":1234,"zijde":"Re","tekst":"A50 Re hm 123,4"}. */
@Serializable
data class HmInfo(val weg: String? = null, val hm: Int? = null, val zijde: String? = null, val tekst: String? = null)

@Serializable
data class Afkorting(
    val term: String = "",
    val uitleg: String = "",
    @SerialName("uitleg_en") val uitlegEn: String? = null,
    val dienst: String? = null,
    val hoofdletters: Boolean = false,
) {
    /** In the language of the app (English when the server has an English text). */
    val tekst: String get() = if (!isDutch && !uitlegEn.isNullOrBlank()) uitlegEn else uitleg
}

@Serializable
data class AfkortingenAntwoord(val bijgewerkt: String? = null, val items: List<Afkorting> = emptyList())

/** The list of abbreviations: from the server, kept on the device so it also works offline. */
object Afkortingen {
    var items by mutableStateOf<List<Afkorting>>(emptyList()); private set
    var fout by mutableStateOf<String?>(null); private set
    private var geladen = 0L
    private var cacheGelezen = false

    suspend fun laad(ctx: Context, force: Boolean = false) {
        val prefs = ctx.getSharedPreferences("afkortingen", Context.MODE_PRIVATE)
        if (!cacheGelezen) {
            cacheGelezen = true
            prefs.getString("v1", null)?.let { raw -> runCatching { AppJson.decodeFromString<AfkortingenAntwoord>(raw) }.getOrNull()?.let { a -> items = a.items.filter { it.term.isNotBlank() && it.uitleg.isNotBlank() } } }
        }
        if (!force && System.currentTimeMillis() - geladen < 6 * 3600_000L && items.isNotEmpty()) return
        try {
            val raw = Api.afkortingenRaw()
            val lijst = AppJson.decodeFromString<AfkortingenAntwoord>(raw).items.filter { it.term.isNotBlank() && it.uitleg.isNotBlank() }
            if (lijst.isNotEmpty()) { items = lijst; prefs.edit().putString("v1", raw).apply() }
            geladen = System.currentTimeMillis()
            fout = null
        } catch (e: Exception) {
            if (items.isEmpty()) fout = e.message
        }
    }

    data class Treffer(val start: Int, val end: Int, val afkorting: Afkorting)

    /** The abbreviations in a text in the order they appear. Whole words only; longest term first ("OvD-B" before "OvD"). */
    fun zoek(tekst: String, lijst: List<Afkorting> = items): List<Treffer> {
        val uit = mutableListOf<Treffer>()
        for (a in lijst.sortedByDescending { it.term.length }) {
            val opties = if (a.hoofdletters) emptySet() else setOf(RegexOption.IGNORE_CASE)
            val re = Regex("(?<![\\p{L}\\p{N}])" + Regex.escape(a.term) + "(?![\\p{L}\\p{N}])", opties)
            re.findAll(tekst).forEach { m ->
                val r = m.range
                if (uit.none { it.start <= r.last && r.first < it.end }) uit += Treffer(r.first, r.last + 1, a)
            }
        }
        return uit.sortedBy { it.start }
    }
}

@Serializable
data class StatDag(val datum: String = "", val totaal: Int = 0, @SerialName("per_dienst") val perDienst: Map<String, Int> = emptyMap()) {
    val date: LocalDate? get() = runCatching { LocalDate.parse(datum.take(10)) }.getOrNull()
}

@Serializable
data class StatPlaats(val plaats: String = "", val aantal: Int = 0)

@Serializable
data class StatEenheid(val code: String? = null, val naam: String? = null, val dienst: String? = null, val aantal: Int = 0) {
    val titel: String get() = naam?.takeIf { it.isNotBlank() } ?: code ?: "–"
}

@Serializable
data class StatGisteren(val totaal: Int? = null, val gemiddeld: Double? = null)

@Serializable
data class StatToestel(val naam: String = "", val aantal: Int = 0)

@Serializable
data class StatHelis(val inzetten: Int? = null, @SerialName("per_toestel") val perToestel: List<StatToestel> = emptyList())

/** GET /v1/statistiek?dagen=28[&plaats=][&eenheid=] */
@Serializable
data class Statistiek(
    val bijgewerkt: String? = null,
    val dagen: Int = 28,
    val totaal: Int = 0,
    @SerialName("per_uur") val perUurRaw: List<Int> = emptyList(),
    @SerialName("per_weekdag") val perWeekdagRaw: List<Int> = emptyList(),
    @SerialName("per_dienst") val perDienst: Map<String, Int> = emptyMap(),
    @SerialName("per_prioriteit") val perPrioriteit: Map<String, Int> = emptyMap(),
    @SerialName("per_dag") val perDag: List<StatDag> = emptyList(),
    @SerialName("top_plaatsen") val topPlaatsen: List<StatPlaats> = emptyList(),
    @SerialName("top_eenheden") val topEenheden: List<StatEenheid> = emptyList(),
    val gisteren: StatGisteren? = null,
    val helikopters: StatHelis? = null,
) {
    val perUur: List<Int> get() = if (perUurRaw.size == 24) perUurRaw else List(24) { 0 }
    /** Monday…Sunday. */
    val perWeekdag: List<Int> get() = if (perWeekdagRaw.size == 7) perWeekdagRaw else List(7) { 0 }
    val druksteUur: Int? get() = perUur.withIndex().maxByOrNull { it.value }?.takeIf { it.value > 0 }?.index
    val druksteWeekdag: Int? get() = perWeekdag.withIndex().maxByOrNull { it.value }?.takeIf { it.value > 0 }?.index
}

/** What a list of alerts is filtered on: a place or a unit (capcode). */
sealed class MeldingFilter {
    data class Plaats(val naam: String) : MeldingFilter()
    data class Eenheid(val code: String, val naam: String?) : MeldingFilter()

    val titel: String get() = when (this) { is Plaats -> naam; is Eenheid -> naam?.takeIf { it.isNotBlank() } ?: code }
    val query: String get() = when (this) {
        is Plaats -> "plaats=" + URLEncoder.encode(naam, "UTF-8").replace("+", "%20")
        is Eenheid -> "eenheid=" + URLEncoder.encode(code, "UTF-8").replace("+", "%20")
    }
    /** Navigation route ("lijst/plaats/Apeldoorn"). */
    val route: String get() = when (this) {
        is Plaats -> "lijst/plaats/" + URLEncoder.encode(naam, "UTF-8") + "/-"
        is Eenheid -> "lijst/eenheid/" + URLEncoder.encode(code, "UTF-8") + "/" + URLEncoder.encode(naam?.ifBlank { "-" } ?: "-", "UTF-8")
    }
}

/** The figures of the last 28 days, kept for a quarter of an hour. */
object StatistiekStore {
    var stat by mutableStateOf<Statistiek?>(null); private set
    var fout by mutableStateOf<String?>(null); private set
    private var geladen = 0L
    suspend fun laad(force: Boolean = false) {
        if (!force && stat != null && System.currentTimeMillis() - geladen < 15 * 60_000L) return
        try { stat = Api.statistiek(28); geladen = System.currentTimeMillis(); fout = null }
        catch (e: Exception) { if (stat == null) fout = e.message }
    }
}
