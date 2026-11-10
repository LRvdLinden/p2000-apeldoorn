package nl.lrvdlinden.aalerts.data

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.tr
import java.time.Instant

// Traffic layer on the map (GET /v1/verkeer): closures, roadworks, accidents, breakdowns and traffic jams in the region
// from the NDW open data, and the fixed speed cameras from OpenStreetMap (same as iOS and the website).

@Serializable
data class VerkeerItem(
    val id: String, val soort: String = "werk", val titel: String = "", val opmerking: String? = null, val bron: String? = null,
    val start: String? = null, val einde: String? = null, val lat: Double, val lon: Double,
    /** Route as [lon, lat] pairs. */
    val lijn: List<List<Double>>? = null,
    @SerialName("vertraging_min") val vertragingMin: Int? = null,
    @SerialName("lengte_km") val lengteKm: Double? = null,
    val weg: String? = null, val plaats: String? = null,
    /** "A1 richting Amersfoort" (or the street) and "tussen afrit 22 Twello en afrit 18 Kootwijk". */
    val kop: String? = null, val traject: String? = null, val oorzaak: String? = null, val toelichting: List<String> = emptyList(),
    val rijstroken: Rijstroken? = null, @SerialName("max_snelheid") val maxSnelheid: Int? = null, val hinder: Int? = null,
    val omleiding: Boolean = false, @SerialName("info_url") val infoUrl: String? = null, val tijdvakken: List<List<String>> = emptyList(),
) {
    @Serializable data class Rijstroken(val open: Int? = null, val totaal: Int? = null)
    val kopTekst: String get() = kop ?: weg ?: titelLokaal
    val watTekst: String? get() = listOfNotNull(if (kop != null || weg != null) titelLokaal else null, traject, plaats?.takeIf { it.isNotBlank() }).joinToString(" · ").ifBlank { null }
    val detailTekst: String? get() = listOfNotNull(
        fileTekst,
        rijstroken?.let { r -> if (r.open != null && r.totaal != null && r.open < r.totaal) tr("${r.open} van ${r.totaal} rijstroken open", "${r.open} of ${r.totaal} lanes open") else null },
        maxSnelheid?.let { tr("max. $it km/u", "max. $it km/h") },
        if (omleiding && soort == "afsluiting") tr("omleiding ingesteld", "detour in place") else null,
    ).joinToString(" · ").ifBlank { null }
    val hinderTekst: String? get() = when (hinder) { 1 -> tr("weinig hinder", "little delay"); 2 -> tr("hinder", "some delay"); 3 -> tr("veel hinder", "major delay"); else -> null }
    val tijdvakTeksten: List<String> get() = tijdvakken.mapNotNull { p ->
        if (p.size != 2) return@mapNotNull null
        val a = runCatching { Instant.parse(p[0]) }.getOrNull() ?: return@mapNotNull null
        val e = runCatching { Instant.parse(p[1]) }.getOrNull() ?: return@mapNotNull null
        "${nl.lrvdlinden.aalerts.Fmt.day(a)} ${nl.lrvdlinden.aalerts.Fmt.time(a)}–${nl.lrvdlinden.aalerts.Fmt.time(e)}"
    }
    val route: List<Pair<Double, Double>> get() = lijn.orEmpty().filter { it.size == 2 }.map { it[1] to it[0] }
    val kleur: Color get() = when (soort) {
        "ongeval" -> Color(0xFFE3001B); "afsluiting" -> Color(0xFFC4001A); "file" -> Color(0xFFB0002E); "pech" -> Color(0xFFF08C00); else -> Color(0xFFF5B400)
    }
    val icon: Int get() = when (soort) {
        "ongeval" -> R.drawable.verkeer_ongeval; "afsluiting" -> R.drawable.verkeer_afsluiting; "file" -> R.drawable.verkeer_file
        "pech" -> R.drawable.verkeer_pech; else -> R.drawable.verkeer_werk
    }
    val soortLabel: String get() = when (soort) {
        "ongeval" -> tr("Ongeval", "Accident"); "afsluiting" -> tr("Afsluiting", "Closure"); "file" -> tr("File", "Traffic jam")
        "pech" -> tr("Pech of obstakel", "Breakdown or obstacle"); else -> tr("Werkzaamheden", "Roadworks")
    }
    /** Accident and breakdown are a spot: a pin. */
    val isMarker: Boolean get() = soort == "ongeval" || soort == "pech"
    val titelLokaal: String get() = tr(titel, TITELS_EN[titel] ?: titel)
    val waar: String? get() = listOfNotNull(weg?.takeIf { it.isNotBlank() }, plaats?.takeIf { it.isNotBlank() }).joinToString(", ").ifBlank { null }
    val fileTekst: String? get() = listOfNotNull(
        lengteKm?.let { "${if (it % 1.0 == 0.0) it.toInt().toString() else it.toString().replace('.', ',')} km" },
        vertragingMin?.takeIf { it > 0 }?.let { "+$it min" },
    ).joinToString(" · ").ifBlank { null }
    val startAt: Instant? get() = start?.let { runCatching { Instant.parse(it) }.getOrNull() }
    val eindeAt: Instant? get() = einde?.let { runCatching { Instant.parse(it) }.getOrNull() }

    companion object {
        val TITELS_EN = mapOf(
            "Ongeval" to "Accident", "Ongeval, weg afgesloten" to "Accident, road closed", "Ongeval, rijstrook dicht" to "Accident, lane closed",
            "Pijlwagen bij werk of incident" to "Arrow vehicle at works or incident", "Voertuig met pech" to "Broken-down vehicle",
            "Stilstaand voertuig" to "Stationary vehicle", "Lading of vloeistof op de weg" to "Load or spillage on the road",
            "Obstakel op de weg" to "Obstacle on the road", "Stilstaand verkeer" to "Stationary traffic", "File" to "Traffic jam",
            "Langzaam rijdend verkeer" to "Slow traffic", "Werkzaamheden" to "Roadworks", "Afgesloten voor evenement" to "Closed for an event",
            "Afgesloten voor werkzaamheden" to "Closed for roadworks", "Weg afgesloten" to "Road closed",
            "Voertuig met pech, rijstrook dicht" to "Broken-down vehicle, lane closed", "Rijstrook dicht" to "Lane closed",
            "Rijstrook dicht voor werkzaamheden" to "Lane closed for roadworks", "Versmalde rijstroken" to "Narrowed lanes", "Rijstroken verlegd" to "Lanes moved",
            "Afrit dicht" to "Exit closed", "Oprit dicht" to "Entry closed", "Verbindingsweg dicht" to "Link road closed",
        )
    }
}

@Serializable
data class Flitser(val id: String, val lat: Double, val lon: Double, val max: Int? = null, val soort: String? = null) {
    val isTraject get() = soort == "trajectcontrole"
}

@Serializable
data class VerkeerResponse(val items: List<VerkeerItem> = emptyList(), val flitsers: List<Flitser> = emptyList(), val bijgewerkt: String? = null)
