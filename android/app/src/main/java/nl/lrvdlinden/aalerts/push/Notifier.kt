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
        nm.createNotificationChannels(listOf(
            ch(CH_MELDINGEN, tr("Meldingen", "Alerts"), tr("Nieuwe P2000-meldingen die bij je profielen passen", "New P2000 alerts that match your profiles"), NotificationManager.IMPORTANCE_HIGH, "p2000"),
            ch(CH_URGENT, tr("Spoedmeldingen (A0, A1, P1)", "Urgent alerts (A0, A1, P1)"), tr("Meldingen met de hoogste prioriteit", "Alerts with the highest priority"), NotificationManager.IMPORTANCE_HIGH, "p2000"),
            ch(CH_NLALERT, "NL-Alert", tr("NL-Alerts in de gemeente Apeldoorn", "NL-Alerts in the municipality of Apeldoorn"), NotificationManager.IMPORTANCE_HIGH, "warn"),
            ch(CH_WAARSCHUWINGEN, tr("Burgernet en KNMI", "Burgernet and KNMI"), tr("Burgernet-acties en KNMI-weercodes", "Burgernet calls and KNMI weather codes"), NotificationManager.IMPORTANCE_DEFAULT, "warn"),
            ch(CH_ALGEMEEN, tr("Algemeen", "General"), tr("Berichten van A-Alerts en testmeldingen", "Messages from A-Alerts and test notifications"), NotificationManager.IMPORTANCE_DEFAULT, null),
        ))
    }

    private val DIENST_KLEUR = mapOf("brandweer" to 0xFFE30613, "ambulance" to 0xFFF4C400, "politie" to 0xFF15428B, "traumaheli" to 0xFF9333EA,
        "nlalert" to 0xFFFFC800, "burgernet" to 0xFF0067B1, "knmi" to 0xFF3E9FDB)
    private val ICON = mapOf("brandweer" to R.drawable.icon_brandweer, "ambulance" to R.drawable.icon_ambulance, "politie" to R.drawable.icon_politie,
        "traumaheli" to R.drawable.icon_traumaheli, "nlalert" to R.drawable.icon_nlalert, "burgernet" to R.drawable.icon_burgernet, "knmi" to R.drawable.icon_knmi)

    /** A push from the server (data message, see worker/src/fcm.js). */
    fun show(ctx: Context, data: Map<String, String>) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        val title = data["title"] ?: "A-Alerts"
        val body = data["body"].orEmpty()
        val guid = data["guid"]
        val waarschuwing = data["waarschuwing"]
        val bron = data["bron"]
        val soort = data["dienst"] ?: bron ?: data["thread"]
        val urgent = data["urgent"] == "1"
        val channel = when {
            bron == "nlalert" -> CH_NLALERT
            waarschuwing != null -> CH_WAARSCHUWINGEN
            guid != null && urgent -> CH_URGENT
            guid != null -> CH_MELDINGEN
            else -> CH_ALGEMEEN
        }
        val open = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            guid?.let { putExtra(MainActivity.EXTRA_GUID, it) }
            waarschuwing?.let { putExtra(MainActivity.EXTRA_WAARSCHUWING, it) }
        }
        val id = (guid ?: waarschuwing ?: title).hashCode()
        val pi = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val b = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor((DIENST_KLEUR[soort] ?: 0xFFCF0A1E).toInt())
            .setContentTitle(title)
            .setContentText(body.lineSequence().firstOrNull().orEmpty())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(if (urgent || bron == "nlalert") NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
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
