package nl.lrvdlinden.aalerts

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Dutch or English, like the Apple apps (nl + en). Follows the app language set in Android (per-app language). */
val isDutch: Boolean get() = Locale.getDefault().language == "nl"

/** Every text in the app exists in Dutch and English, side by side in the code. */
fun tr(nl: String, en: String): String = if (isDutch) nl else en

val ZONE: ZoneId = ZoneId.of("Europe/Amsterdam")

object Fmt {
    private val locale get() = if (isDutch) Locale("nl", "NL") else Locale.UK
    fun time(i: Instant): String = DateTimeFormatter.ofPattern("HH:mm", locale).format(i.atZone(ZONE))
    fun day(i: Instant): String = DateTimeFormatter.ofPattern("EEEE d MMMM", locale).format(i.atZone(ZONE)).replaceFirstChar { it.uppercase() }
    fun shortDay(i: Instant): String = DateTimeFormatter.ofPattern("d MMM", locale).format(i.atZone(ZONE))
    fun dayTime(i: Instant): String {
        val d = i.atZone(ZONE).toLocalDate()
        val today = LocalDate.now(ZONE)
        return when (d) {
            today -> time(i)
            today.minusDays(1) -> tr("gisteren", "yesterday") + " " + time(i)
            else -> shortDay(i) + " " + time(i)
        }
    }
    fun dayHeader(d: LocalDate): String {
        val today = LocalDate.now(ZONE)
        return when (d) {
            today -> tr("Vandaag", "Today")
            today.minusDays(1) -> tr("Gisteren", "Yesterday")
            else -> DateTimeFormatter.ofPattern("EEEE d MMMM", locale).format(d).replaceFirstChar { it.uppercase() }
        }
    }
    fun ago(i: Instant): String {
        val min = ((System.currentTimeMillis() - i.toEpochMilli()) / 60_000).coerceAtLeast(0)
        return when {
            min < 1 -> tr("zojuist", "just now")
            min < 60 -> tr("$min min geleden", "$min min ago")
            min < 24 * 60 -> tr("${min / 60} uur geleden", "${min / 60} h ago")
            else -> dayTime(i)
        }
    }
    fun km(km: Double): String = if (km < 1) "${(km * 100).toInt() * 10} m" else String.format(locale, "%.1f km", km)
}
