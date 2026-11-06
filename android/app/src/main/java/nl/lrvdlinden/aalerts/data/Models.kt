package nl.lrvdlinden.aalerts.data

import nl.lrvdlinden.aalerts.Fmt

import androidx.compose.ui.graphics.Color
import nl.lrvdlinden.aalerts.isDutch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.tr
import java.time.Instant

val AppJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    isLenient = true
    explicitNulls = false
    encodeDefaults = true
}

fun parseInstant(s: String?): Instant? = try { s?.let { Instant.parse(it) } } catch (_: Exception) {
    try { s?.let { java.time.OffsetDateTime.parse(it).toInstant() } } catch (_: Exception) { null }
}

/** The disciplines (same colours and artwork as the Apple apps and the website). */
enum class Dienst(val key: String, val color: Color, val textColor: Color, val icon: Int?, val marker: Int?) {
    BRANDWEER("brandweer", Color(0xFFE30613), Color(0xFFE30613), R.drawable.icon_brandweer, R.drawable.marker_brandweer),
    AMBULANCE("ambulance", Color(0xFFF4C400), Color(0xFFB45309), R.drawable.icon_ambulance, R.drawable.marker_ambulance),
    POLITIE("politie", Color(0xFF15428B), Color(0xFF15428B), R.drawable.icon_politie, R.drawable.marker_politie),
    TRAUMAHELI("traumaheli", Color(0xFF9333EA), Color(0xFF9333EA), R.drawable.icon_traumaheli, R.drawable.marker_traumaheli),
    KUSTWACHT("kustwacht", Color(0xFF0891B2), Color(0xFF0891B2), null, null),
    ONBEKEND("onbekend", Color(0xFF6B7280), Color(0xFF6B7280), null, null);

    val label: String get() = when (this) {
        BRANDWEER -> tr("Brandweer", "Fire brigade")
        AMBULANCE -> tr("Ambulance", "Ambulance")
        POLITIE -> tr("Politie", "Police")
        TRAUMAHELI -> tr("Traumaheli", "Air ambulance")
        KUSTWACHT -> tr("Kustwacht", "Coastguard")
        ONBEKEND -> tr("Onbekend", "Unknown")
    }

    companion object {
        val selectable = listOf(BRANDWEER, AMBULANCE, POLITIE, TRAUMAHELI)
        fun of(raw: String?): Dienst = when (val v = (raw ?: "").lowercase()) {
            "lifeliner", "mmt", "traumaheli" -> TRAUMAHELI
            else -> entries.firstOrNull { it.key == v } ?: ONBEKEND
        }
    }
}

@Serializable
data class Eenheid(val code: String? = null, val naam: String? = null, val type: String? = null, val regio: String? = null)

@Serializable
data class Melding(
    val id: String? = null,
    val guid: String,
    val title: String = "",
    @SerialName("full_melding") val fullMelding: String? = null,
    val dienst: String? = null,
    val prioriteit: String? = null,
    @SerialName("datum_tijd") val datumTijd: String? = null,
    val locatie: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val link: String? = null,
    val stad: String? = null,
    val regio: String? = null,
    val capcode: String? = null,
    val categorie: String? = null,
    val grip: String? = null,
    val opschaling: String? = null,
    val eenheden: List<Eenheid> = emptyList(),
    val views: Int = 0,
) {
    val datum: Instant get() = parseInstant(datumTijd) ?: Instant.EPOCH
    val millis: Long get() = datum.toEpochMilli()
    val soort: Dienst get() = Dienst.of(dienst)
    val hasCoordinate: Boolean get() = lat != null && lon != null && lat != 0.0 && lon != 0.0
    val hasStreet: Boolean get() = !locatie.isNullOrBlank() && locatie.trim().lowercase() != "onbekend"
    val plaatsNaam: String get() = stad?.trim()?.takeIf { it.isNotEmpty() && it.lowercase() != "onbekend" }?.capPlaats() ?: "Apeldoorn"
    val plaatsText: String get() {
        val parts = listOfNotNull(locatie, stad?.capPlaats()).map { it.trim() }.filter { it.isNotEmpty() && it.lowercase() != "onbekend" }
        return if (parts.isEmpty()) "Apeldoorn" else parts.joinToString(", ")
    }
    val prioriteitText: String get() {
        val cat = categorie.orEmpty()
        val p = prioriteit?.takeIf { it.isNotBlank() && it.lowercase() != "onbekend" }
        return when {
            p != null && cat.isEmpty() -> tr("Prioriteit $p", "Priority $p")
            p != null -> tr("Prioriteit $p - $cat", "Priority $p - $cat")
            else -> cat
        }
    }
    val isRecent: Boolean get() = System.currentTimeMillis() - millis < 10 * 60_000
    val isUrgent: Boolean get() = (prioriteit ?: "").uppercase() in setOf("A0", "A1", "P1")
    val isBesteld: Boolean get() = (prioriteit ?: "").uppercase() in setOf("B1", "B2", "B3")
}

fun String.capPlaats(): String = split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
fun String.plaatsKey(): String = lowercase().replace("-", " ").trim()

@Serializable
data class Waarschuwing(
    val id: String,
    val bron: String,
    val titel: String = "",
    val tekst: String? = null,
    @SerialName("tekst_en") val tekstEn: String? = null,
    val plaats: String? = null,
    val niveau: String? = null,
    val soort: String? = null,
    val status: String = "actief",
    val start: String? = null,
    val einde: String? = null,
    val lat: Double? = null,
    val lon: Double? = null,
    val link: String? = null,
    val gebied: List<List<List<Double>>>? = null,
    val meldingen: List<Melding>? = null,
) {
    val startAt: Instant get() = parseInstant(start) ?: Instant.now()
    val eindeAt: Instant? get() = parseInstant(einde)
    val isActief get() = status == "actief"
    val isBeeindigd get() = status == "beeindigd"
    val filterKey get() = if (bron == "knmi") "knmi:${niveau ?: "yellow"}" else bron
    val hasCoordinate get() = lat != null && lon != null

    val label: String get() = when (bron) {
        "nlalert" -> "NL-Alert"
        "burgernet" -> "Burgernet"
        else -> codeLabel(niveau)
    }
    val kop: String get() = when (bron) {
        "nlalert" -> label
        else -> listOfNotNull(label, soort?.takeIf { it.isNotBlank() }).joinToString(" · ")
    }
    val statusLabel: String get() = when (status) {
        "beeindigd" -> tr("Beëindigd", "Ended")
        "verwacht" -> tr("Verwacht", "Expected")
        else -> tr("Actief", "Active")
    }
    val color: Color get() = when (bron) {
        "nlalert" -> Color(0xFFFFC800)
        "burgernet" -> Color(0xFF0067B1)
        else -> codeColor(niveau)
    }
    val onColor: Color get() = when (bron) {
        "nlalert" -> Color.Black
        "burgernet" -> Color.White
        else -> if (niveau == "yellow" || niveau == null) Color.Black else Color.White
    }
    val icon: Int get() = when (bron) {
        "nlalert" -> R.drawable.icon_nlalert
        "burgernet" -> R.drawable.icon_burgernet
        else -> R.drawable.icon_knmi
    }
    val marker: Int get() = if (bron == "burgernet") R.drawable.marker_burgernet else R.drawable.marker_nlalert
    /** Dutch text, or the English one when the app runs in English and there is one. */
    val tekstLokaal: String? get() = if (!isDutch && !tekstEn.isNullOrBlank()) tekstEn else tekst

    fun contains(lat: Double, lon: Double) = (gebied ?: emptyList()).any { Geo.ringContains(it, lat, lon) }

    fun covers(plaatsNaam: String): Boolean {
        if (bron == "burgernet") return (plaats ?: "Apeldoorn").plaatsKey() == plaatsNaam.plaatsKey()
        val g = gebied ?: return true
        val p = Werkgebied.plaats(plaatsNaam) ?: return true
        return g.any { Geo.ringContains(it, p.lat, p.lon) } || g.any { Geo.distanceToRingKm(it, p.lat, p.lon) <= 2 }
    }

    /** Whether a P2000 alert lies in this warning's area around its time window. */
    fun relates(m: Melding): Boolean {
        val from = startAt.minusSeconds(2 * 3600)
        val to = (eindeAt ?: startAt.plusSeconds(6 * 3600)).plusSeconds(3600)
        if (m.datum.isBefore(from) || m.datum.isAfter(to)) return false
        if (bron == "burgernet") return m.soort == Dienst.POLITIE && (plaats ?: "Apeldoorn") in Werkgebied.plaatsenVoor(m)
        val la = m.lat ?: return false
        val lo = m.lon ?: return false
        return m.hasStreet && contains(la, lo)
    }

    companion object {
        fun codeLabel(niveau: String?) = when (niveau) {
            "red" -> tr("Code rood", "Code red")
            "orange" -> tr("Code oranje", "Code orange")
            else -> tr("Code geel", "Code yellow")
        }
        fun codeColor(niveau: String?) = when (niveau) {
            "red" -> Color(0xFFE3001B)
            "orange" -> Color(0xFFF28C28)
            else -> Color(0xFFF7C600)
        }
    }
}

@Serializable
data class Helikopter(
    val id: String,
    val naam: String,
    val soort: String = "trauma",
    val basis: String? = null,
    val callsign: String? = null,
    val registratie: String? = null,
    val type: String? = null,
    val lat: Double,
    val lon: Double,
    val koers: Double? = null,
    @SerialName("hoogte_ft") val hoogteFt: Double? = null,
    @SerialName("op_grond") val opGrond: Boolean = false,
    @SerialName("snelheid_kt") val snelheidKt: Double? = null,
    val gezien: String? = null,
) {
    val isTrauma get() = soort == "trauma"
    val afbeelding: Int get() = when {
        isTrauma -> R.drawable.heli_lifeliner
        (type ?: "").uppercase() == "A139" || id in setOf("zulu24", "zulu25", "zulu26") -> R.drawable.heli_politie_aw139
        else -> R.drawable.heli_politie
    }
    val vliegtWest: Boolean get() {
        val k = koers ?: return false
        if (opGrond) return false
        val h = ((k % 360) + 360) % 360
        return h > 180 && h < 360
    }
    /** Route colour: purple for the Lifeliners, police blue for Zulu (same as iOS and the website). */
    val kleur: Long get() = if (isTrauma) 0xFF9333EA else 0xFF15428B
    val soortLabel get() = if (isTrauma) tr("Traumahelikopter", "Air ambulance") else tr("Politiehelikopter", "Police helicopter")
    val hoogteMeter: Int? get() = if (opGrond) 0 else hoogteFt?.let { Math.round(it * 0.3048 / 10).toInt() * 10 }
    val snelheidKmh: Int? get() = snelheidKt?.let { Math.round(it * 1.852).toInt() }
    val koersTekst: String? get() {
        val k = koers ?: return null
        val dirs = if (isDutch) listOf("N", "NO", "O", "ZO", "Z", "ZW", "W", "NW") else listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
        return "${k.toInt()}° ${dirs[(((k + 22.5) % 360) / 45).toInt().coerceIn(0, 7)]}"
    }
    val info: String get() {
        val hoogte = if (opGrond) tr("op de grond", "on the ground") else hoogteMeter?.let { "$it m" } ?: "–"
        val snelheid = snelheidKmh?.let { "$it km/u" } ?: "–"
        return "$soortLabel · $hoogte · $snelheid"
    }
}

@Serializable
data class HeliResponse(val helikopters: List<Helikopter> = emptyList())

/** Estimated position now: the last position moved on along speed and heading (at most 90 s, never on the ground). */
fun Helikopter.geschat(nu: Long = System.currentTimeMillis()): Pair<Double, Double> {
    val kt = snelheidKt ?: return lat to lon
    val k = koers ?: return lat to lon
    val t = parseInstant(gezien)?.toEpochMilli() ?: return lat to lon
    if (opGrond || kt < 30) return lat to lon
    val sec = ((nu - t) / 1000.0).coerceIn(0.0, 90.0)
    val km = kt * 1.852 * sec / 3600.0
    val r = Math.toRadians(k)
    return (lat + km * Math.cos(r) / 111.32) to (lon + km * Math.sin(r) / (111.32 * Math.cos(Math.toRadians(lat))))
}

@Serializable
data class HeliSpoorPunt(val t: String, val lat: Double, val lon: Double, @SerialName("hoogte_ft") val hoogteFt: Double? = null, val grond: Boolean = false)

@Serializable
data class HeliSpoor(val punten: List<HeliSpoorPunt> = emptyList())

@Serializable
data class HeliVlucht(
    val start: String,
    val einde: String? = null,
    val onderweg: Boolean = false,
    @SerialName("duur_min") val duurMin: Int = 0,
    @SerialName("afstand_km") val afstandKm: Double = 0.0,
    @SerialName("max_hoogte_ft") val maxHoogteFt: Double = 0.0,
) {
    val tekst: String get() {
        val s = parseInstant(start)?.let { "${Fmt.shortDay(it)} ${Fmt.time(it)}" } ?: ""
        val e = parseInstant(einde)?.let { Fmt.time(it) }
        val tijd = if (onderweg || e == null) tr("$s – nog in de lucht", "$s – still in the air") else "$s – $e"
        return "$tijd · $duurMin min · ${Fmt.km(afstandKm)}"
    }
}

@Serializable
data class HeliVluchten(val vluchten: List<HeliVlucht> = emptyList())

/** Which part of the route to draw: this flight, the last 30 minutes or today. */
enum class SpoorBereik(val key: String) {
    VLUCHT("vlucht"), KORT("kort"), VANDAAG("vandaag");
    val label get() = when (this) { VLUCHT -> tr("Deze vlucht", "This flight"); KORT -> "30 min"; VANDAAG -> tr("Vandaag", "Today") }
}

/** Route points thinned to at most [max] (first and last always kept), as (lat, lon). */
fun List<HeliSpoorPunt>.lijn(max: Int = 400): List<Pair<Double, Double>> {
    if (size <= max) return map { it.lat to it.lon }
    val stap = size.toDouble() / max
    return (0 until max).map { this[(it * stap).toInt()] }.plus(last()).map { it.lat to it.lon }
}

@Serializable
data class AlertWeather(
    val condition: String? = null,
    val temperature: Double? = null,
    val apparent: Double? = null,
    val humidity: Double? = null,
    val cloudCover: Double? = null,
    val windSpeed: Double? = null,
    val windGust: Double? = null,
    val windDirection: Double? = null,
    val precipitation: Double? = null,
)

@Serializable
data class ContentPage(val title: String? = null, val content: String? = null, val version: String? = null)

@Serializable
data class ChangelogEntry(
    val id: String = "",
    val title: String? = null,
    val content: String? = null,
    val version: String? = null,
    @SerialName("release_date") val releaseDate: String? = null,
)

@Serializable
data class Kazerne(
    val id: String,
    val naam: String,
    val soort: String,
    val plaats: String? = null,
    val lat: Double,
    val lon: Double,
    val aliassen: List<String> = emptyList(),
) {
    val dienst: Dienst get() = when (soort) { "brandweer" -> Dienst.BRANDWEER; "ambulance" -> Dienst.AMBULANCE; else -> Dienst.POLITIE }
}

/** Latest APK on a-alerts.nl (downloads/android.json), for the update check. */
@Serializable
data class ApkInfo(val version: String = "", val build: Int = 0, val url: String = "", val notes: String? = null, val size: Long? = null)
