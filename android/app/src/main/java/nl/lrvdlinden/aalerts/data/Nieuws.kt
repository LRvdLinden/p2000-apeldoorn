package nl.lrvdlinden.aalerts.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.decodeFromJsonElement
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.tr
import java.time.Instant

/**
 * Tab Nieuws (same as iOS): police news about our places (text politie.nl, image A-Alerts), an article per KNMI warning
 * and a liveblog per Burgernet, AMBER Alert and Vermist Kind Alert with messages added by the beheer.
 */
@Serializable
data class NieuwsItem(
    val id: String,
    val soort: String,
    val bron: String,
    val titel: String = "",
    val intro: String? = null,
    val plaats: String? = null,
    val at: String? = null,
    val bijgewerkt: String? = null,
    val start: String? = null,
    val status: String? = null,
    val niveau: String? = null,
    val categorie: String? = null,
    val afbeelding: String? = null,
    val link: String? = null,
    @SerialName("bron_url") val bronUrl: String? = null,
    val waarschuwing: String? = null,
    val aantal: Int? = null,
    val alineas: List<NieuwsAlinea>? = null,
    val tijdlijn: List<NieuwsBericht>? = null,
    /** Weather articles: the content in the layout of knmi.nl (map, headline, code, advice). */
    val weer: WeerArtikel? = null,
) {
    val atInstant: Instant get() = parseInstant(at) ?: Instant.now()
    val laatste: Instant get() = maxOf(parseInstant(bijgewerkt) ?: atInstant, atInstant)
    val isAfgerond get() = status == "afgerond"
    val isLive get() = soort == "liveblog" && !isAfgerond
    val bronNaam: String get() = when (bron) {
        "burgernet" -> "Burgernet"
        "amber" -> "AMBER Alert"
        "vermistkind" -> tr("Vermist Kind", "Missing Child")
        "knmi" -> "KNMI"
        "112nieuws" -> "112 Nieuws"
        else -> tr("Politie", "Police")
    }
    val label: String get() = when (soort) {
        "liveblog" -> tr("Liveblog", "Live blog") + " · " + bronNaam
        "weer" -> tr("Weer", "Weather") + " · " + Waarschuwing.codeLabel(niveau)
        "regionaal" -> "112 Nieuws" + (plaats?.let { " · $it" } ?: "")
        else -> tr("Politie", "Police") + (plaats?.let { " · $it" } ?: "")
    }
    val kleur: Color get() = when (bron) {
        "burgernet" -> Color(0xFF0067B1)
        "amber" -> Color(0xFFEC6E24)
        "vermistkind" -> Color(0xFF1B265E)
        "knmi" -> Waarschuwing.codeColor(niveau)
        "112nieuws" -> Color(0xFFDC2626)
        else -> Color(0xFF1E3A8C)
    }
    val icon: Int get() = when (bron) {
        "burgernet" -> R.drawable.icon_burgernet
        "amber" -> R.drawable.icon_amber
        "vermistkind" -> R.drawable.icon_vermistkind
        "knmi" -> R.drawable.icon_knmi
        "112nieuws" -> when (categorie) { "brand" -> R.drawable.icon_brandweer; "traumaheli" -> R.drawable.icon_traumaheli; "politie" -> R.drawable.icon_politie; else -> R.drawable.icon_ambulance }
        else -> R.drawable.icon_politie
    }
}

@Serializable
data class NieuwsAlinea(val titel: String? = null, val tekst: String = "")

@Serializable
data class NieuwsBericht(
    val id: Int? = null,
    val at: String? = null,
    val soort: String = "update",
    val door: String = "",
    val titel: String? = null,
    val tekst: String = "",
    val plaats: String? = null,
    val foto: String? = null,
    val url: String? = null,
) {
    val atInstant: Instant get() = parseInstant(at) ?: Instant.now()
    /** Added by A-Alerts (beheer). */
    val isEigen get() = door == "a-alerts"
}

object NieuwsStore {
    var items by mutableStateOf<List<NieuwsItem>>(emptyList())
    var loading by mutableStateOf(false)
    var fout by mutableStateOf<String?>(null)
    private var geladen = 0L

    suspend fun load(force: Boolean = false) {
        if (!force && items.isNotEmpty() && System.currentTimeMillis() - geladen < 60_000) return
        loading = items.isEmpty()
        try {
            items = Api.nieuws()
            fout = null
            geladen = System.currentTimeMillis()
        } catch (e: Exception) {
            if (items.isEmpty()) fout = e.message
        } finally { loading = false }
    }
}

/** One item that fails to decode is skipped, never the whole list. */
internal fun nieuwsLijst(json: String): List<NieuwsItem> =
    (AppJson.parseToJsonElement(json) as? JsonArray).orEmpty().mapNotNull { runCatching { AppJson.decodeFromJsonElement<NieuwsItem>(it) }.getOrNull() }


/** Weather article like the warning on knmi.nl (GET /v1/nieuws/:id → "weer"). */
@Serializable
data class WeerArtikel(
    val kop: String = "",
    val code: String = "",
    val niveau: String? = null,
    val soort: String? = null,
    val omschrijving: String? = null,
    val uitgifte: String? = null,
    val details: String? = null,
    val adviezen: List<String> = emptyList(),
    val opgeheven: Boolean = false,
    val tijdvak: String? = null,
    val datumKop: String? = null,
    val vanafTot: String? = null,
    val tijdvakken: List<WeerVak>? = null,
    val gebieden: List<WeerGebied> = emptyList(),
) {
    val kleur: Color get() = Waarschuwing.codeColor(if (opgeheven) "green" else niveau)
    /** Dark text on yellow, white on the other codes. */
    val opKleur: Color get() = if (!opgeheven && (niveau == null || niveau == "yellow")) Color(0xFF1D1D1F) else Color.White
}

@Serializable
data class WeerVak(val niveau: String? = null, val code: String = "", val tekst: String = "")

@Serializable
data class WeerGebied(val niveau: String? = null, val gebied: List<List<List<Double>>>? = null)
