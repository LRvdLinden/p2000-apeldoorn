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
    val voertuigen: List<Voertuig> = emptyList(),
    val views: Int = 0,
    /** The incident this alert belongs to: the guid of its first alert, worked out by the server. Null for older alerts. */
    val incident: String? = null,
) {
    val datum: Instant get() = parseInstant(datumTijd) ?: Instant.EPOCH
    val millis: Long get() = datum.toEpochMilli()
    val soort: Dienst get() = Dienst.of(dienst)
    /** Share link: a-alerts.nl/melding/<dienst>/<guid> shows the banner of the service in previews and opens the app when installed. */
    val shareUrl: String get() = "https://a-alerts.nl/melding/${soort.key}/$guid"
    val hasCoordinate: Boolean get() = lat != null && lon != null && lat != 0.0 && lon != 0.0
    /** A hectometre post in the title ("A50 Re 211,2"). */
    val hectometerpaal: Hectometerpaal? get() = Hectometerpaal.uit(title)
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
    /** A large incident (same rule as the server and iOS): GRIP, scaling up, a (very) large or medium fire, or 10+ units. */
    val isGrootIncident: Boolean get() {
        if ((grip?.toIntOrNull() ?: 0) > 0) return true
        // opschaling = size of the fire ("klein", "middel", "groot", "zeer groot"): only middel and up count.
        if (Regex("middel|groot|grip", RegexOption.IGNORE_CASE).containsMatchIn(opschaling ?: "")) return true
        val tekst = listOfNotNull(title, fullMelding, categorie).joinToString(" ")
        if (GROOT_RE.containsMatchIn(tekst)) return true
        return eenheden.size >= 10
    }
    val isBesteld: Boolean get() = (prioriteit ?: "").uppercase() in setOf("B1", "B2", "B3")
}

fun String.capPlaats(): String = split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
fun String.plaatsKey(): String = lowercase().replace("-", " ").trim()

/** One message of a Burgernet action: "start", "update" or "afloop". */
@Serializable
data class BurgernetBericht(val soort: String = "update", val plaats: String? = null, val at: String? = null, val tekst: String = "") {
    val atInstant: java.time.Instant? get() = at?.let { parseInstant(it) }
    val kop: String get() = when (soort) {
        "start" -> tr("Startbericht", "Start message")
        "afloop" -> tr("Afloopbericht", "Closing message")
        else -> tr("Update", "Update")
    }
}

@Serializable
data class Waarschuwing(
    val id: String,
    val bron: String,
    val titel: String = "",
    val tekst: String? = null,
    @SerialName("tekst_en") val tekstEn: String? = null,
    /** Burgernet: call-out and closing message apart. */
    val startbericht: String? = null,
    val afloop: String? = null,
    /** Burgernet: every message with place and time (start, updates, closing), oldest first. */
    val berichten: List<BurgernetBericht>? = null,
    /** AMBER Alert / Vermist Kind Alert: photo of the child (only while it runs) and the search radius. */
    val foto: String? = null,
    @SerialName("straal_km") val straalKm: Double? = null,
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
    /** KNMI: what to expect. */
    val verwachting: String? = null,
    /** KNMI: what to do. */
    val advies: String? = null,
    /** KNMI: headline, description, details and issue time from knmi.nl. */
    @SerialName("kop") val knmiKop: String? = null,
    /** KNMI: the time slots of the whole warning per code (only when there is more than one). */
    val tijdvakken: List<Tijdvak>? = null,
    val omschrijving: String? = null,
    val details: String? = null,
    val uitgifte: String? = null,
) {
    val heeftKnmiTekst: Boolean get() = bron == "knmi" && (knmiKop != null || omschrijving != null || verwachting != null || advies != null)
    val knmiAdviesRegels: List<String> get() = listOfNotNull(verwachting, advies).flatMap { it.split("\n") }.map { it.trim() }.filter { it.isNotEmpty() }
    val startAt: Instant get() = parseInstant(start) ?: Instant.now()
    val eindeAt: Instant? get() = parseInstant(einde)
    val isActief get() = status == "actief"
    val isBeeindigd get() = status == "beeindigd"
    /** AMBER Alert (national) or Vermist Kind Alert (regional): a missing child, from the police via Burgernet. */
    val isKind get() = bron == "amber" || bron == "vermistkind"
    val filterKey get() = if (bron == "knmi") "knmi:${niveau ?: "yellow"}" else bron
    val hasCoordinate get() = lat != null && lon != null

    val label: String get() = when (bron) {
        "nlalert" -> "NL-Alert"
        "burgernet" -> "Burgernet"
        "amber" -> "AMBER Alert"
        "vermistkind" -> tr("Vermist Kind Alert", "Missing Child Alert")
        else -> codeLabel(niveau)
    }
    /** KNMI: the code that applies now; a lifted (ended) warning is code green. */
    val codeNu: String? get() = if (bron == "knmi" && status == "beeindigd") "green" else niveau
    val isOpgeheven: Boolean get() = bron == "knmi" && status == "beeindigd"
    /** Link to this warning on a-alerts.nl (for sharing). */
    val shareUrl: String get() = "https://a-alerts.nl/waarschuwing/" + java.net.URLEncoder.encode(id, "UTF-8")
    val kop: String get() = when (bron) {
        "nlalert", "amber", "vermistkind" -> label
        else -> listOfNotNull(label, soort?.takeIf { it.isNotBlank() }).joinToString(" · ")
    }
    val statusLabel: String get() = if (isOpgeheven) tr("Opgeheven · code groen", "Lifted · code green") else when (status) {
        "beeindigd" -> tr("Beëindigd", "Ended")
        "verwacht" -> tr("Verwacht", "Expected")
        else -> tr("Actief", "Active")
    }
    val color: Color get() = when (bron) {
        "nlalert" -> Color(0xFFFFC800)
        "burgernet" -> Color(0xFF0067B1)
        "amber" -> Color(0xFFEC6E24)
        "vermistkind" -> Color(0xFF1B265E)
        else -> codeColor(niveau)
    }
    val onColor: Color get() = when (bron) {
        "nlalert" -> Color.Black
        "burgernet", "amber" -> Color.White
        "vermistkind" -> Color(0xFFF4E005)
        else -> if (niveau == "yellow" || niveau == null) Color.Black else Color.White
    }
    val icon: Int get() = when (bron) {
        "nlalert" -> R.drawable.icon_nlalert
        "burgernet" -> R.drawable.icon_burgernet
        "amber" -> R.drawable.icon_amber
        "vermistkind" -> R.drawable.icon_vermistkind
        else -> R.drawable.icon_knmi
    }
    val marker: Int get() = when (bron) {
        "burgernet" -> R.drawable.marker_burgernet
        "amber" -> R.drawable.marker_amber
        "vermistkind" -> R.drawable.marker_vermistkind
        else -> R.drawable.marker_nlalert
    }
    /** Dutch text, or the English one when the app runs in English and there is one. */
    val tekstLokaal: String? get() = if (!isDutch && !tekstEn.isNullOrBlank()) tekstEn else tekst

    fun contains(lat: Double, lon: Double) = (gebied ?: emptyList()).any { Geo.ringContains(it, lat, lon) }

    fun covers(plaatsNaam: String): Boolean {
        if (bron == "burgernet") return (plaats ?: "Apeldoorn").plaatsKey() == plaatsNaam.plaatsKey()
        if (bron == "amber") return true
        val g = gebied ?: return true
        val p = Werkgebied.plaats(plaatsNaam) ?: return true
        return g.any { Geo.ringContains(it, p.lat, p.lon) } || g.any { Geo.distanceToRingKm(it, p.lat, p.lon) <= 2 }
    }

    /** Whether a P2000 alert lies in this warning's area around its time window. */
    fun relates(m: Melding): Boolean {
        val from = startAt.minusSeconds(2 * 3600)
        val to = (eindeAt ?: startAt.plusSeconds(6 * 3600)).plusSeconds(3600)
        if (m.datum.isBefore(from) || m.datum.isAfter(to)) return false
        if (isKind) return false
        if (bron == "burgernet") return m.soort == Dienst.POLITIE && (plaats ?: "Apeldoorn") in Werkgebied.plaatsenVoor(m)
        val la = m.lat ?: return false
        val lo = m.lon ?: return false
        return m.hasStreet && contains(la, lo)
    }

    companion object {
        fun codeLabel(niveau: String?) = when (niveau) {
            "red" -> tr("Code rood", "Code red")
            "orange" -> tr("Code oranje", "Code orange")
            "green" -> tr("Code groen", "Code green")
            else -> tr("Code geel", "Code yellow")
        }
        fun codeColor(niveau: String?) = when (niveau) {
            "red" -> Color(0xFFE3001B)
            "orange" -> Color(0xFFF28C28)
            "green" -> Color(0xFF2E9E44)
            else -> Color(0xFFF7C600)
        }
    }
}

@Serializable
data class Voertuig(val nra: String? = null, val nrb: String? = null, val label: String? = null)

@Serializable
data class Tijdvak(val niveau: String = "yellow", val start: String? = null, val einde: String? = null) {
    val startAt: Instant? get() = parseInstant(start)
    val eindeAt: Instant? get() = parseInstant(einde)
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
    val voorspelling: HeliVoorspelling? = null,
    /** Layer "Defensie en overheid" (GET /v1/lucht): the drawing for this type ("chinook", "f35", "kustwacht_dash8" …). */
    val icoon: String? = null,
    /** "Now above …": the nearest Dutch place ("Teuge, Voorst"); null on the ground, above sea or abroad. */
    val boven: String? = null,
) {
    /** The same altitude and speed in the other unit (feet next to metres, knots next to km/h). */
    val hoogteTweede: String? get() = if (opGrond) null else hoogteFt?.let { if (Settings.eenheden == "luchtvaart") "${Math.round(it * 0.3048 / 10) * 10} m" else "${Math.round(it / 25) * 25} ft" }
    val snelheidTweede: String? get() = snelheidKt?.let { if (Settings.eenheden == "luchtvaart") tr("${Math.round(it * 1.852)} km/u", "${Math.round(it * 1.852)} km/h") else "${Math.round(it)} kn" }
    val isTrauma get() = soort == "trauma"
    val isLucht get() = icoon != null
    val luchtSoort: String get() = when (soort) {
        "kustwacht" -> tr("Kustwacht", "Coastguard"); "kmar" -> "Koninklijke Marechaussee"; "regering" -> tr("Regering", "Government")
        else -> tr("Defensie", "Defence")
    }
    val afbeelding: Int get() = when {
        icoon != null -> when (icoon) {
            "chinook" -> R.drawable.lucht_chinook; "apache" -> R.drawable.lucht_apache; "cougar" -> R.drawable.lucht_cougar
            "nh90" -> R.drawable.lucht_nh90; "f35" -> R.drawable.lucht_f35; "hercules" -> R.drawable.lucht_hercules
            "les" -> R.drawable.lucht_les; "vliegtuig" -> R.drawable.lucht_vliegtuig; "kustwacht_dash8" -> R.drawable.lucht_kustwacht_dash8
            "kustwacht_aw189" -> R.drawable.lucht_kustwacht_aw189; "kustwacht_heli" -> R.drawable.lucht_kustwacht_heli
            "kmar" -> R.drawable.lucht_kmar; "phgov" -> R.drawable.lucht_phgov
            else -> R.drawable.lucht_heli
        }
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
    val kleur: Long get() = if (isLucht) 0xFF586A33 else if (Settings.heliKleurPerToestel) eigenKleur else if (isTrauma) 0xFF9333EA else 0xFF15428B
    /** Fixed colour per helicopter ("Eigen kleur per helikopter"; same as iOS and the website). */
    val eigenKleur: Long get() = when (id) {
        "lifeliner1" -> 0xFFE11D48; "lifeliner2" -> 0xFFF59E0B; "lifeliner3" -> 0xFF16A34A; "lifeliner4" -> 0xFF7C3AED; "lifeliner5" -> 0xFF0891B2
        else -> listOf(0xFF1D4ED8, 0xFF0EA5E9, 0xFF4F46E5, 0xFF0284C7, 0xFF2563EB, 0xFF6366F1)[(id.filter { it.isDigit() }.toIntOrNull() ?: 0) % 6]
    }
    /** Height and speed in the chosen units (metres and km/h, or feet and knots). */
    val hoogteTekst: String get() = when {
        opGrond -> tr("Op de grond", "On the ground")
        hoogteFt == null -> "–"
        Settings.eenheden == "luchtvaart" -> "${(Math.round(hoogteFt / 50.0) * 50)} ft"
        else -> "$hoogteMeter m"
    }
    val snelheidTekst: String get() = snelheidKt?.let { if (Settings.eenheden == "luchtvaart") "${Math.round(it)} kn" else tr("${Math.round(it * 1.852)} km/u", "${Math.round(it * 1.852)} km/h") } ?: "–"
    val soortLabel get() = if (isLucht) luchtSoort else if (isTrauma) tr("Traumahelikopter", "Air ambulance") else tr("Politiehelikopter", "Police helicopter")
    /** The kind this aircraft counts as in the list of choices of the layer Luchtvaart. */
    val keuzeSoort: String get() = icoon ?: soort
    val hoogteMeter: Int? get() = if (opGrond) 0 else hoogteFt?.let { Math.round(it * 0.3048 / 10).toInt() * 10 }
    val snelheidKmh: Int? get() = snelheidKt?.let { Math.round(it * 1.852).toInt() }
    val koersTekst: String? get() {
        val k = koers ?: return null
        val dirs = if (isDutch) listOf("N", "NO", "O", "ZO", "Z", "ZW", "W", "NW") else listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
        return "${k.toInt()}° ${dirs[(((k + 22.5) % 360) / 45).toInt().coerceIn(0, 7)]}"
    }
    val info: String get() {
        return "$soortLabel · ${hoogteTekst.lowercase()} · $snelheidTekst"
    }
}

@Serializable
data class HeliResponse(val helikopters: List<Helikopter> = emptyList(), val inzet: List<HeliInzet> = emptyList())

/** A Lifeliner that was probably cancelled on its way to an alert, or did not take off (worked out from the flight). */
@Serializable
data class HeliInzet(val guid: String, val heli: String, val status: String = "", val at: String? = null, val boven: String? = null) {
    val geannuleerd get() = status == "geannuleerd"
    val titel: String get() = if (geannuleerd) (parseInstant(at)?.let { Fmt.time(it) } ?: "").let { tr("Waarschijnlijk geannuleerd om $it", "Probably cancelled at $it") }
        else tr("Opgeroepen, maar niet opgestegen", "Called, but did not take off")
    val uitleg: String get() = if (!geannuleerd) tr("De helikopter staat nog aan de grond.", "The helicopter is still on the ground.")
        else (boven?.let { tr("Keerde om boven $it. ", "Turned back above $it. ") } ?: "") + tr("Afgeleid uit de vlucht; P2000 meldt geen annulering.", "Worked out from the flight; P2000 reports no cancellation.")
}
@Serializable
data class LuchtResponse(val toestellen: List<Helikopter> = emptyList())

/** The kinds of aircraft someone can choose to see in the layer Luchtvaart: key, name, drawing. */
val LUCHT_SOORTEN: List<Triple<String, String, Int>> get() = listOf(
    Triple("trauma", "Lifeliner", R.drawable.heli_lifeliner), Triple("politie", tr("Zulu (politie)", "Zulu (police)"), R.drawable.heli_politie),
    Triple("chinook", "Chinook", R.drawable.lucht_chinook), Triple("apache", "Apache", R.drawable.lucht_apache), Triple("cougar", "Cougar", R.drawable.lucht_cougar),
    Triple("nh90", "NH90", R.drawable.lucht_nh90), Triple("heli", tr("Overige helikopter (Defensie)", "Other helicopter (defence)"), R.drawable.lucht_heli),
    Triple("f35", tr("Straaljager", "Fighter jet"), R.drawable.lucht_f35), Triple("hercules", tr("Transportvliegtuig", "Transport aircraft"), R.drawable.lucht_hercules),
    Triple("les", tr("Lesvliegtuig", "Trainer aircraft"), R.drawable.lucht_les), Triple("vliegtuig", tr("Overig vliegtuig (Defensie)", "Other aircraft (defence)"), R.drawable.lucht_vliegtuig),
    Triple("kustwacht_dash8", tr("Kustwacht vliegtuig", "Coastguard aircraft"), R.drawable.lucht_kustwacht_dash8),
    Triple("kustwacht_aw189", tr("Kustwacht helikopter", "Coastguard helicopter"), R.drawable.lucht_kustwacht_aw189),
    Triple("kmar", "Koninklijke Marechaussee", R.drawable.lucht_kmar), Triple("phgov", tr("Regeringsvliegtuig PH-GOV", "Government aircraft PH-GOV"), R.drawable.lucht_phgov),
)

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
data class HeliSpoor(val punten: List<HeliSpoorPunt> = emptyList(), val plaatsen: List<SpoorPlaats> = emptyList(), val vlucht: HeliVlucht? = null)

/** One stretch of a flight above a place (plaats null = above sea or abroad). */
@Serializable
data class SpoorPlaats(val van: String, val tot: String, val plaats: String? = null, val gemeente: String? = null)

/** Building facts from the BAG (GET /v1/meldingen/<guid>/pand). */
@Serializable
data class Pand(val bouwjaar: Int? = null, val gebruik: List<String> = emptyList(), val adressen: Int? = null) {
    val tekst: String get() = listOfNotNull(
        bouwjaar?.let { tr("Bouwjaar $it", "Built in $it") },
        gebruik.takeIf { it.isNotEmpty() }?.joinToString(", ") { PAND_EN[it]?.let { en -> tr(it, en) } ?: it },
        adressen?.takeIf { it > 1 }?.let { tr("$it adressen", "$it addresses") },
    ).joinToString(" · ")
}
private val PAND_EN = mapOf("Wonen" to "Residential", "Winkel" to "Shop", "Kantoor" to "Office", "Industrie" to "Industry", "Bijeenkomst" to "Assembly",
    "Zorg" to "Healthcare", "Onderwijs" to "Education", "Logies" to "Lodging", "Sport" to "Sports", "Cel" to "Detention", "Overig" to "Other")
@Serializable
data class PandAntwoord(val pand: Pand? = null)

@Serializable
data class HeliVlucht(
    val start: String,
    val einde: String? = null,
    val onderweg: Boolean = false,
    @SerialName("duur_min") val duurMin: Int = 0,
    @SerialName("afstand_km") val afstandKm: Double = 0.0,
    @SerialName("max_hoogte_ft") val maxHoogteFt: Double = 0.0,
) {
    /** "25 min in de lucht" */
    val inDeLucht: String get() = when {
        duurMin < 1 -> tr("Net opgestegen", "Just took off")
        duurMin < 60 -> tr("$duurMin min in de lucht", "$duurMin min in the air")
        else -> "${duurMin / 60}".let { u -> val m = "%02d".format(duurMin % 60); tr("$u u $m min in de lucht", "$u h $m min in the air") }
    }
    val tekst: String get() {
        val s = parseInstant(start)?.let { "${Fmt.shortDay(it)} ${Fmt.time(it)}" } ?: ""
        val e = parseInstant(einde)?.let { Fmt.time(it) }
        val tijd = if (onderweg || e == null) tr("$s – nog in de lucht", "$s – still in the air") else "$s – $e"
        return "$tijd · $duurMin min · ${Fmt.km(afstandKm)}"
    }
}

@Serializable
data class HeliVluchten(val vluchten: List<HeliVlucht> = emptyList())

/** Where a helicopter is probably heading (worked out by the server from its course). */
@Serializable
data class HeliVoorspelling(
    val id: String, val naam: String, val soort: String = "ziekenhuis", val lat: Double, val lon: Double,
    @SerialName("afstand_km") val afstandKm: Double = 0.0, @SerialName("eta_min") val etaMin: Int? = null, val zekerheid: Double = 0.0,
    /** soort "melding": on its way to the alert it was called for, then probably to [daarna]. */
    val guid: String? = null, val plaats: String? = null, val daarna: HeliDaarna? = null,
) {
    val isMelding get() = soort == "melding"
    val tekst: String get() {
        val eta = etaMin?.let { " · ± $it min" } ?: ""
        if (isMelding) {
            val p = plaats?.lowercase()?.replaceFirstChar { it.uppercase() }
            val doel = if (p != null) tr("Onderweg naar de melding in $p", "On its way to the alert in $p") else tr("Onderweg naar de melding", "On its way to the alert")
            return doel + eta + (daarna?.let { "\n" + tr("Daarna waarschijnlijk naar ${it.naam}", "Then probably to ${it.naam}") } ?: "")
        }
        return tr("Waarschijnlijk naar $naam", "Probably heading to $naam") + eta
    }
}

@Serializable
data class HeliDaarna(val id: String, val naam: String)

/** A hospital (emergency department, helipad or trauma centre) or a helicopter base. */
@Serializable
data class Locatie(
    val id: String, val naam: String, val lat: Double, val lon: Double, val plaats: String? = null,
    val trauma: Boolean = false, val helipad: Boolean = false,
) {
    val isBasis get() = id.startsWith("basis-")
    val icon: Int get() = when { isBasis -> R.drawable.locatie_basis; trauma -> R.drawable.locatie_trauma; else -> R.drawable.locatie_ziekenhuis }
    val soortLabel: String get() = when {
        isBasis -> tr("Helikopterbasis / vliegveld", "Helicopter base / airfield")
        trauma -> tr("Traumacentrum", "Trauma centre")
        helipad -> tr("Ziekenhuis met helipad", "Hospital with helipad")
        else -> tr("Ziekenhuis met SEH", "Hospital with emergency department")
    }
}

@Serializable
data class Locaties(val ziekenhuizen: List<Locatie> = emptyList(), val bases: List<Locatie> = emptyList())

/** Which part of the route to draw: this flight, the last 30 minutes or today. */
enum class SpoorBereik(val key: String) {
    VLUCHT("vlucht"), KORT("kort"), LANG("lang");
    val label get() = when (this) { VLUCHT -> tr("Deze vlucht", "This flight"); KORT -> "30 min"; LANG -> tr("2 uur", "2 hours") }
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

/** GET /v1/meldingen/:guid/routes: alerted stations with road route and estimate (same for every app). */
@Serializable
data class RoutesAntwoord(val kazernes: List<ApiRoute> = emptyList())

@Serializable
data class ApiRoute(
    val id: String, val naam: String, val soort: String, val lat: Double, val lon: Double, val genoemd: Boolean = false, val km: Double = 0.0,
    @SerialName("rij_min") val rijMin: Double = 0.0, @SerialName("uitruk_min") val uitrukMin: Double = 0.0,
    val aankomst: String, val route: List<List<Double>> = emptyList(),
)

/** GET /v1/meldingen/<guid>/verloop and GET /v1/app. */
@Serializable
data class VerloopAntwoord(val meldingen: List<Melding> = emptyList())
@Serializable
data class MinBuild(val ios: Int = 0, val android: Int = 0)
@Serializable
data class AppAntwoord(@SerialName("min_build") val minBuild: MinBuild = MinBuild())

/** Latest APK on a-alerts.nl (downloads/android.json), for the update check. */
@Serializable
data class ApkInfo(val version: String = "", val build: Int = 0, val url: String = "", val notes: String? = null, val size: Long? = null)


// ------------------------------------------------------------------ status (a-alerts.nl/status)

@Serializable
data class AppStatus(val bijgewerkt: String, val staat: String, val groepen: List<StatusGroep> = emptyList(), val incidenten: StatusIncidenten = StatusIncidenten())

@Serializable
data class StatusGroep(val id: String, val naam: String, @SerialName("naam_en") val naamEn: String? = null, val onderdelen: List<StatusOnderdeel> = emptyList()) {
    val titel get() = if (isDutch) naam else naamEn ?: naam
}

@Serializable
data class StatusOnderdeel(
    val id: String, val naam: String, @SerialName("naam_en") val naamEn: String? = null, val staat: String,
    val detail: String? = null, @SerialName("detail_en") val detailEn: String? = null, val uptime: Double? = null,
) {
    val titel get() = if (isDutch) naam else naamEn ?: naam
    val uitleg get() = if (isDutch) detail else detailEn ?: detail
}

@Serializable
data class StatusIncidenten(val actief: List<StatusIncident> = emptyList(), val gepland: List<StatusIncident> = emptyList())

@Serializable
data class StatusIncident(val id: Int, val titel: String, @SerialName("titel_en") val titelEn: String? = null, val soort: String, val updates: List<StatusUpdate> = emptyList()) {
    val kop get() = if (isDutch) titel else titelEn ?: titel
}

@Serializable
data class StatusUpdate(val tekst: String, @SerialName("tekst_en") val tekstEn: String? = null) {
    val regel get() = if (isDutch) tekst else tekstEn ?: tekst
}

object StatusStijl {
    fun kleur(s: String): Long = when (s) { "ok" -> 0xFF16A34A; "warn" -> 0xFFF59E0B; "down" -> 0xFFDC2626; "maint" -> 0xFF3B82F6; else -> 0xFF9CA3AF }
    fun achtergrond(s: String): Long = when (s) { "ok" -> 0xFF15803D; "warn" -> 0xFFB45309; "down" -> 0xFFB91C1C; "maint" -> 0xFF1D4ED8; else -> 0xFF6B7280 }
    fun label(s: String) = when (s) { "ok" -> tr("Werkt", "Working"); "warn" -> tr("Verstoord", "Degraded"); "down" -> tr("Storing", "Outage"); "maint" -> tr("Onderhoud", "Maintenance"); else -> tr("Onbekend", "Unknown") }
    fun kop(s: String) = when (s) { "ok" -> tr("Alle systemen werken", "All systems operational"); "maint" -> tr("Onderhoud bezig", "Maintenance in progress"); "down" -> tr("Er is een storing", "There is an outage"); else -> tr("Niet alles werkt normaal", "Not everything is working normally") }
}

private val GROOT_RE = Regex("""\bGRIP\s*[1-5]\b|zeer\s+grote\s+brand|\bgrote\s+brand\b|middel\s*brand|\bopschaling\b|\bramp\b|\bCoPI\b|grootschalig|\bMMA\b|multi\s*trauma""", RegexOption.IGNORE_CASE)

/** A zone for helicopter notifications (same shape as iOS and the server). */
@Serializable
data class HeliZone(val id: String = java.util.UUID.randomUUID().toString(), val naam: String, val lat: Double, val lon: Double, val km: Double = 5.0) {
    companion object { const val MAX = 5 }
}

/** GET /v1/radar */
@Serializable
data class RadarInfo(val beschikbaar: Boolean = false, val tiles: String? = null)

/** The sign along a motorway or provincial road: "A50 Re 211,2". */
data class Hectometerpaal(val weg: String, val zijde: String, val km: String) {
    val isSnelweg: Boolean get() = weg.startsWith("A")
    val tekst: String get() = listOf(weg, zijde, km).filter { it.isNotEmpty() }.joinToString(" ")
    companion object {
        private val RE = Regex("""(?<![\p{L}\d])([ANan])\s?(\d{1,3})\s+(?:([Rr][Ee]?|[Ll][Ii]?)\s+)?(\d{1,3})[,.](\d)(?!\d)""")
        fun uit(titel: String?): Hectometerpaal? {
            val m = RE.find(titel ?: return null) ?: return null
            val z = m.groupValues[3].lowercase()
            return Hectometerpaal(m.groupValues[1].uppercase() + m.groupValues[2], if (z.startsWith("r")) "Re" else if (z.startsWith("l")) "Li" else "",
                "${m.groupValues[4].toInt()},${m.groupValues[5]}")
        }
    }
}
