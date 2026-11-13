package nl.lrvdlinden.aalerts.data

import android.content.Context
import kotlinx.serialization.Serializable
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.tr
import java.time.Instant
import kotlin.math.*

object Geo {
    fun distanceKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = PI / 180
        val dLat = (lat2 - lat1) * r
        val dLon = (lon2 - lon1) * r
        val a = sin(dLat / 2).pow(2) + cos(lat1 * r) * cos(lat2 * r) * sin(dLon / 2).pow(2)
        return 6371 * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    /** Ray casting on a ring of [lon, lat]. */
    fun ringContains(ring: List<List<Double>>, lat: Double, lon: Double): Boolean {
        var inside = false
        var j = ring.size - 1
        for (i in ring.indices) {
            val xi = ring[i][0]; val yi = ring[i][1]; val xj = ring[j][0]; val yj = ring[j][1]
            if ((yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
            j = i
        }
        return inside
    }

    fun distanceToRingKm(ring: List<List<Double>>, lat: Double, lon: Double): Double {
        val kx = 111.32 * cos(lat * PI / 180); val ky = 110.57
        var best = Double.MAX_VALUE
        var j = ring.size - 1
        for (i in ring.indices) {
            val ax = (ring[j][0] - lon) * kx; val ay = (ring[j][1] - lat) * ky
            val bx = (ring[i][0] - lon) * kx; val by = (ring[i][1] - lat) * ky
            val dx = bx - ax; val dy = by - ay
            val len = dx * dx + dy * dy
            val t = if (len > 0) max(0.0, min(1.0, -(ax * dx + ay * dy) / len)) else 0.0
            val px = ax + t * dx; val py = ay + t * dy
            best = min(best, sqrt(px * px + py * py))
            j = i
        }
        return best
    }
}

@Serializable
data class Gemeente(val naam: String, val code: String = "", val gebied: List<List<List<Double>>> = emptyList())

@Serializable
data class Plaats(
    val naam: String,
    val groep: String = "plaats",
    val woonplaats: Boolean = false,
    val lat: Double,
    val lon: Double,
    val straalKm: Double? = null,
    val gebied: List<List<List<Double>>>? = null,
    val aliassen: List<String>? = null,
) {
    val keys: Set<String> get() = (listOf(naam) + (aliassen ?: emptyList())).map { it.plaatsKey() }.toSet()
    fun contains(lat: Double, lon: Double): Boolean {
        if (gebied?.any { Geo.ringContains(it, lat, lon) } == true) return true
        return straalKm?.let { Geo.distanceKm(lat, lon, this.lat, this.lon) <= it } ?: false
    }
}

@Serializable
data class WerkgebiedData(val versie: Int = 0, val gemeente: Gemeente, val plaatsen: List<Plaats>)

/** The working area: the municipality of Apeldoorn and its 26 places (same file as the Apple apps and the Worker). */
object Werkgebied {
    private var data: WerkgebiedData? = null
    var kazernes: List<Kazerne> = emptyList(); private set

    fun load(ctx: Context) {
        if (data != null) return
        data = runCatching { AppJson.decodeFromString<WerkgebiedData>(ctx.assets.open("werkgebied.json").bufferedReader().readText()) }.getOrNull()
        kazernes = runCatching { AppJson.decodeFromString<List<Kazerne>>(ctx.assets.open("kazernes.json").bufferedReader().readText()) }.getOrDefault(emptyList())
    }

    val plaatsen: List<Plaats> get() = data?.plaatsen ?: emptyList()
    val gemeenteGebied: List<List<List<Double>>> get() = data?.gemeente?.gebied ?: emptyList()
    val namen: List<String> get() = plaatsen.map { it.naam }
    fun plaats(naam: String): Plaats? = plaatsen.firstOrNull { naam.plaatsKey() in it.keys }

    fun plaatsenVoor(m: Melding): Set<String> {
        val out = mutableSetOf<String>()
        val stad = (m.stad ?: "").plaatsKey()
        plaatsen.firstOrNull { it.woonplaats && stad in it.keys }?.let { out += it.naam }
        val la = m.lat; val lo = m.lon
        if (m.hasStreet && la != null && lo != null) {
            for (p in plaatsen) if ((!p.woonplaats || p.gebied != null || p.straalKm != null) && p.contains(la, lo)) out += p.naam
        }
        return out
    }

    fun matches(m: Melding, selected: Set<String>): Boolean {
        if (selected.isEmpty()) return true
        val chosen = selected.map { it.plaatsKey() }.toSet()
        if (plaatsenVoor(m).any { it.plaatsKey() in chosen }) return true
        return (m.stad ?: "").plaatsKey() in chosen
    }

    fun contains(lat: Double, lon: Double, toleranceKm: Double = 0.5): Boolean {
        if (gemeenteGebied.any { Geo.ringContains(it, lat, lon) }) return true
        if (plaatsen.any { it.contains(lat, lon) }) return true
        return gemeenteGebied.any { Geo.distanceToRingKm(it, lat, lon) <= toleranceKm }
    }
}

/** One alarmed (or nearest) station with an estimated arrival: straight line × 1.3 at 50 km/h, ×0.75 with urgency. */
data class KazerneRoute(val kazerne: Kazerne, val genoemd: Boolean, val km: Double, val rijMinuten: Double, val uitrukMinuten: Double, val aankomst: Instant,
                        /** Road route (from the A-Alerts API); empty = straight line. */
                        val punten: List<Pair<Double, Double>> = emptyList()) {
    fun terPlaatse(now: Instant = Instant.now()) = !now.isBefore(aankomst)
    val vertrek: Instant get() = aankomst.minusSeconds((rijMinuten * 60).toLong())

    /** Estimated phase (same as iOS): uitrukken, onderweg, ter plaatse, ter plaatse geweest; seconds left or null. */
    fun fase(now: Instant = Instant.now()): Pair<String, Long?> = when {
        now.isBefore(vertrek) -> "uitrukken" to java.time.Duration.between(now, vertrek).seconds
        now.isBefore(aankomst) -> "onderweg" to java.time.Duration.between(now, aankomst).seconds
        java.time.Duration.between(aankomst, now).toMinutes() < 45 -> "terplaatse" to null
        else -> "geweest" to null
    }

    /** Where the unit would roughly be by this estimate (never a real position), along the route. */
    fun geschattePositie(now: Instant, doel: Pair<Double, Double>): Pair<Double, Double>? {
        if (fase(now).first != "onderweg") return null
        val lijn = if (punten.size > 1) punten else listOf(kazerne.lat to kazerne.lon, doel)
        val totaal = java.time.Duration.between(vertrek, aankomst).seconds.coerceAtLeast(1)
        val deel = (java.time.Duration.between(vertrek, now).seconds.toDouble() / totaal).coerceIn(0.0, 1.0)
        val stukken = lijn.zipWithNext { a, b -> Geo.distanceKm(a.first, a.second, b.first, b.second) }
        var rest = stukken.sum() * deel
        stukken.forEachIndexed { i, d ->
            if (rest <= d && d > 0) { val f = rest / d; val a = lijn[i]; val b = lijn[i + 1]; return (a.first + (b.first - a.first) * f) to (a.second + (b.second - a.second) * f) }
            rest -= d
        }
        return lijn.last()
    }
    val rijtijdTekst get() = if (rijMinuten < 1) tr("rijtijd < 1 min", "drive < 1 min") else tr("rijtijd ${rijMinuten.roundToInt()} min", "drive ${rijMinuten.roundToInt()} min")
    val afstandTekst get() = Fmt.km(km)
}

object Kazernes {
    /** From the A-Alerts API (road route, the same as iOS and the website); null when not available. */
    fun vanApi(a: RoutesAntwoord): List<KazerneRoute> = a.kazernes.mapNotNull { r ->
        val k = Werkgebied.kazernes.firstOrNull { it.id == r.id } ?: Kazerne(r.id, r.naam, r.soort, null, r.lat, r.lon)
        val aankomst = parseInstant(r.aankomst) ?: return@mapNotNull null
        KazerneRoute(k, r.genoemd, r.km, r.rijMin, r.uitrukMin, aankomst, r.route.filter { it.size == 2 }.map { it[0] to it[1] })
    }

    private fun uitruk(soort: String) = when (soort) { "brandweer" -> 4.0; "ambulance" -> 1.0; else -> 0.0 }

    fun routes(m: Melding): List<KazerneRoute> {
        val soort = when (m.soort) { Dienst.BRANDWEER -> "brandweer"; Dienst.AMBULANCE -> "ambulance"; Dienst.POLITIE -> "politie"; else -> return emptyList() }
        val la = m.lat ?: return emptyList(); val lo = m.lon ?: return emptyList()
        if (!m.hasStreet || !m.hasCoordinate) return emptyList()
        val all = Werkgebied.kazernes.filter { it.soort == soort }
        val namen = m.eenheden.mapNotNull { it.naam?.lowercase() } + listOf(m.fullMelding?.lowercase() ?: "")
        var gekozen = all.filter { k -> k.aliassen.any { a -> val re = Regex("\\b" + Regex.escape(a.lowercase()) + "\\b"); namen.any { re.containsMatchIn(it) } } }
        val genoemd = gekozen.isNotEmpty()
        if (gekozen.isEmpty()) all.minByOrNull { Geo.distanceKm(it.lat, it.lon, la, lo) }?.let { gekozen = listOf(it) }
        gekozen = gekozen.filter { Geo.distanceKm(it.lat, it.lon, la, lo) < 40 }.take(5)
        // Lights and siren only for A0/A1/P1 (A2/P2 drive with the traffic), as the server does.
        val spoed = m.isUrgent
        return gekozen.map { k ->
            val km = Geo.distanceKm(k.lat, k.lon, la, lo) * 1.3
            val rij = km / 50 * 60 * (if (spoed) 0.75 else 1.0)
            val u = uitruk(k.soort)
            KazerneRoute(k, genoemd, km, rij, u, m.datum.plusSeconds(((u + rij) * 60).toLong()))
        }.sortedBy { it.aankomst }
    }
}

/** Possible links between alerts ("verloop"), same rules as the app and website. */
data class MeldingVerband(val melding: Melding, val redenen: List<String>, val score: Int)

/** One unit of an incident with the time of its alarm. */
data class InzetEenheid(val naam: String, val type: String?, val tijd: java.time.Instant, val melding: Melding) {
    /** A Lifeliner or Zulu ("lifeliner3"): shown as the helicopter itself, tappable to the map. */
    val heli: String? get() = HeliKoppeling.genoemdIn(naam)
}

object Verband {
    /**
     * Every unit alarmed for this incident: the units of this alert plus those of alerts that almost certainly belong to
     * it (same address, or close by with the same unit). Oldest first, one line per unit. Second value: number of alerts.
     */
    fun inzet(m: Melding, list: List<Melding>): Pair<List<InzetEenheid>, Int> {
        val bij = (listOf(m) + gekoppeld(m, list, 12).filter { it.score >= 3 }.map { it.melding }).sortedBy { it.datum }
        val gezien = mutableSetOf<String>()
        val out = mutableListOf<InzetEenheid>()
        for (x in bij) for (e in x.eenheden) {
            val key = e.code ?: e.naam ?: continue
            if (gezien.add(key)) out += InzetEenheid(e.naam ?: key, e.type, x.datum, x)
        }
        return out to bij.size
    }

    private fun norm(s: String?) = java.text.Normalizer.normalize((s ?: "").lowercase(), java.text.Normalizer.Form.NFD).replace(Regex("[^a-z0-9]"), "")

    fun gekoppeld(m: Melding, list: List<Melding>, max: Int = 6): List<MeldingVerband> {
        val groot = !m.grip.isNullOrBlank() || !m.opschaling.isNullOrBlank()
        val venster = (if (groot) 120 else 45) * 60_000L
        val codes = m.eenheden.mapNotNull { it.code }.toSet()
        val out = mutableListOf<MeldingVerband>()
        for (o in list) {
            if (o.guid == m.guid) continue
            val dt = o.millis - m.millis
            if (abs(dt) > venster || o.isBesteld || m.isBesteld) continue
            val redenen = mutableListOf<String>()
            var score = 0
            val zelfdePlaats = o.plaatsNaam == m.plaatsNaam
            if (m.hasStreet && o.hasStreet && zelfdePlaats && norm(m.locatie) == norm(o.locatie)) { redenen += tr("Zelfde adres", "Same address"); score += 3 }
            else if (m.hasStreet && o.hasStreet && m.lat != null && o.lat != null && m.lon != null && o.lon != null) {
                val km = Geo.distanceKm(m.lat, m.lon, o.lat, o.lon)
                if (km <= 0.35) { redenen += tr("Op ${(km * 100).roundToInt() * 10} m afstand", "${(km * 100).roundToInt() * 10} m away"); score += 2 }
            }
            if (o.eenheden.any { it.code != null && it.code in codes }) { redenen += tr("Zelfde eenheid opgeroepen", "Same unit called"); score += 2 }
            if (score == 0 && zelfdePlaats && (!m.hasStreet || !o.hasStreet) && o.soort != m.soort && abs(dt) <= 15 * 60_000 && m.plaatsNaam != "Apeldoorn") {
                redenen += tr("Zelfde plaats (${m.plaatsNaam})", "Same place (${m.plaatsNaam})"); score += 1
            }
            if (score == 0) continue
            if (o.soort != m.soort) score += 1
            val min = (abs(dt) / 60_000).toInt()
            redenen += when {
                min == 0 -> tr("Zelfde minuut", "Same minute")
                dt < 0 -> tr("$min min eerder", "$min min earlier")
                else -> tr("$min min later", "$min min later")
            }
            out += MeldingVerband(o, redenen, score)
        }
        return out.sortedWith(compareByDescending<MeldingVerband> { it.score }.thenBy { abs(it.melding.millis - m.millis) }).take(max)
    }
}

/**
 * The helicopter that belongs to an alert: the Lifeliner (or Zulu) named in the call-out ("Traumaheli LifeLiner 3"),
 * or for a trauma alert without a number the trauma helicopter in the air closest to it.
 */
object HeliKoppeling {
    private val LIFELINER = Regex("life\\s*liner\\s*0?([1-4])", RegexOption.IGNORE_CASE)
    private val ZULU = Regex("zulu\\s*0?(\\d{1,2})", RegexOption.IGNORE_CASE)

    fun genoemd(m: Melding): String? = genoemdIn((m.eenheden.mapNotNull { it.naam } + listOfNotNull(m.fullMelding, m.title)).joinToString(" "))

    /** Helicopter id in a text such as the name of a unit ("Traumaheli LifeLiner 3" → "lifeliner3"). */
    fun genoemdIn(tekst: String): String? {
        LIFELINER.find(tekst)?.let { return "lifeliner${it.groupValues[1]}" }
        ZULU.find(tekst)?.let { return "zulu" + it.groupValues[1].padStart(2, '0') }
        return null
    }

    /** Whether the detail page should follow helicopters for this alert. */
    fun relevant(m: Melding) = m.soort == Dienst.TRAUMAHELI || genoemd(m) != null

    fun voor(m: Melding, helis: List<Helikopter>): Helikopter? {
        genoemd(m)?.let { id -> helis.firstOrNull { it.id == id }?.let { return it } }
        if (m.soort != Dienst.TRAUMAHELI || genoemd(m) != null) return null
        val la = m.lat ?: return null; val lo = m.lon ?: return null
        return helis.filter { it.isTrauma }.minByOrNull { Geo.distanceKm(it.lat, it.lon, la, lo) }?.takeIf { Geo.distanceKm(it.lat, it.lon, la, lo) < 120 }
    }
}
