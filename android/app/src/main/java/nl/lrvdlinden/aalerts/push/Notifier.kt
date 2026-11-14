package nl.lrvdlinden.aalerts.push

import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import nl.lrvdlinden.aalerts.MainActivity
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.tr

/** Notification channels (Android lets the user set sound and importance per channel) and building notifications. */
object Notifier {
    const val CH_MELDINGEN = "meldingen"
    const val CH_URGENT = "urgent"
    const val CH_WAARSCHUWINGEN = "waarschuwingen"
    const val CH_NLALERT = "nlalert"
    const val CH_ALGEMEEN = "algemeen"
    const val CH_LIFELINER = "lifeliner"
    /** Helicopter pushes with the own sound (a channel keeps its sound for ever, so this is a new one). */
    const val CH_HELI = "heli2"
    const val CH_KIND = "kind"
    const val CH_NIEUWS = "nieuws"

    fun createChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannelGroup(NotificationChannelGroup("p2000", tr("P2000-meldingen", "P2000 alerts")))
        nm.createNotificationChannelGroup(NotificationChannelGroup("warn", tr("Waarschuwingen", "Warnings")))
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build()
        fun ch(id: String, name: String, desc: String, imp: Int, group: String?) = NotificationChannel(id, name, imp).apply {
            description = desc
            group?.let { this.group = it }
            setSound(sound, attrs)
            enableVibration(true)
            enableLights(true)
            lightColor = 0xFFCF0A1E.toInt()
        }
        // Helicopters: the own rotor sound instead of the default one.
        val heliGeluid = android.net.Uri.parse("android.resource://${ctx.packageName}/${R.raw.heli}")
        nm.createNotificationChannel(NotificationChannel(CH_HELI, tr("Helikopters en vliegtuigen", "Helicopters and aircraft"), NotificationManager.IMPORTANCE_HIGH).apply {
            description = tr("Opstijgen, landen, je zones, de bel en een Lifeliner voor een melding", "Take-off, landing, your zones, the bell and a Lifeliner for an alert")
            group = "p2000"
            setSound(heliGeluid, attrs)
            enableVibration(true)
        })
        nm.deleteNotificationChannel(CH_LIFELINER)
        nm.createNotificationChannels(listOf(
            ch(CH_MELDINGEN, tr("Meldingen", "Alerts"), tr("Nieuwe P2000-meldingen die bij je profielen passen", "New P2000 alerts that match your profiles"), NotificationManager.IMPORTANCE_HIGH, "p2000"),
            ch(CH_URGENT, tr("Spoedmeldingen (A0, A1, P1)", "Urgent alerts (A0, A1, P1)"), tr("Meldingen met de hoogste prioriteit", "Alerts with the highest priority"), NotificationManager.IMPORTANCE_HIGH, "p2000"),
            ch(CH_NLALERT, "NL-Alert", tr("NL-Alerts in de gemeente Apeldoorn", "NL-Alerts in the municipality of Apeldoorn"), NotificationManager.IMPORTANCE_HIGH, "warn"),
            ch(CH_KIND, tr("AMBER Alert en Vermist Kind Alert", "AMBER Alert and Missing Child Alert"), tr("Oproepen van de politie bij een vermist kind", "Police calls for a missing child"), NotificationManager.IMPORTANCE_HIGH, "warn"),
            ch(CH_WAARSCHUWINGEN, tr("Burgernet en KNMI", "Burgernet and KNMI"), tr("Burgernet-acties en KNMI-weercodes", "Burgernet calls and KNMI weather codes"), NotificationManager.IMPORTANCE_DEFAULT, "warn"),
            ch(CH_NIEUWS, tr("Nieuws en liveblogs", "News and live blogs"), tr("Aanvullingen op liveblogs en politienieuws", "Live blog updates and police news"), NotificationManager.IMPORTANCE_DEFAULT, "warn"),
            ch(CH_ALGEMEEN, tr("Algemeen", "General"), tr("Berichten van A-Alerts en testmeldingen", "Messages from A-Alerts and test notifications"), NotificationManager.IMPORTANCE_DEFAULT, null),
        ))
    }

    private val DIENST_KLEUR = mapOf("brandweer" to 0xFFE30613, "ambulance" to 0xFFF4C400, "politie" to 0xFF15428B, "traumaheli" to 0xFF9333EA,
        "nlalert" to 0xFFFFC800, "burgernet" to 0xFF0067B1, "knmi" to 0xFF3E9FDB, "amber" to 0xFFEC6E24, "vermistkind" to 0xFF1B265E)
    private val ICON = mapOf("brandweer" to R.drawable.icon_brandweer, "ambulance" to R.drawable.icon_ambulance, "politie" to R.drawable.icon_politie,
        "traumaheli" to R.drawable.icon_traumaheli, "nlalert" to R.drawable.icon_nlalert, "burgernet" to R.drawable.icon_burgernet, "knmi" to R.drawable.icon_knmi,
        "amber" to R.drawable.icon_amber, "vermistkind" to R.drawable.icon_vermistkind)

    /** A push from the server (data message, see worker/src/fcm.js). */
    fun show(ctx: Context, data: Map<String, String>) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        val title = data["title"] ?: "A-Alerts"
        val body = data["body"].orEmpty()
        val guid = data["guid"]
        val waarschuwing = data["waarschuwing"]
        val nieuws = data["nieuws"]
        val bron = data["bron"]
        val heli = data["heli"]
        val soort = if (heli != null) "traumaheli" else data["dienst"] ?: bron ?: data["thread"]?.takeUnless { it.startsWith("nieuws") }
        val urgent = data["urgent"] == "1"
        val channel = when {
            heli != null -> CH_HELI
            nieuws != null -> CH_NIEUWS
            bron == "nlalert" -> CH_NLALERT
            bron == "amber" || bron == "vermistkind" -> CH_KIND
            waarschuwing != null -> CH_WAARSCHUWINGEN
            guid != null && urgent -> CH_URGENT
            guid != null -> CH_MELDINGEN
            else -> CH_ALGEMEEN
        }
        val open = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            guid?.let { putExtra(MainActivity.EXTRA_GUID, it) }
            waarschuwing?.let { putExtra(MainActivity.EXTRA_WAARSCHUWING, it) }
            nieuws?.let { putExtra(MainActivity.EXTRA_NIEUWS, it) }
        }
        val id = ((heli ?: "") + (guid ?: waarschuwing ?: nieuws ?: title) + (if (nieuws != null) body else "")).hashCode()
        val pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val b = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor((DIENST_KLEUR[soort] ?: 0xFFCF0A1E).toInt())
            .setContentTitle(title)
            .setContentText(body.lineSequence().firstOrNull().orEmpty())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(if (urgent || bron == "nlalert" || bron == "amber") NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setCategory(if (bron == "nlalert") NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_EVENT)
            .setGroup(if (waarschuwing != null) "warn" else "p2000")
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
        ICON[soort]?.let { res -> runCatching { BitmapFactory.decodeResource(ctx.resources, res) }.getOrNull()?.let { b.setLargeIcon(it) } }
        if (guid != null) {
            val save = Intent(ctx, ActionReceiver::class.java).apply { action = ActionReceiver.ACTION_BEWAAR; putExtra(MainActivity.EXTRA_GUID, guid); putExtra("nid", id) }
            b.addAction(0, tr("Bewaar", "Save"), PendingIntent.getBroadcast(ctx, id + 1, save, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            val kaart = Intent(open).putExtra(MainActivity.EXTRA_KAART, true)
            b.addAction(0, tr("Toon op kaart", "Show on map"), PendingIntent.getActivity(ctx, id + 2, kaart, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        runCatching { NotificationManagerCompat.from(ctx).notify(id, b.build()) }
    }
}
