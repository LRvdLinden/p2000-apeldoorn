package nl.lrvdlinden.aalerts.data

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import nl.lrvdlinden.aalerts.R
import java.time.Instant

/** Alarm sound in the app for a new alert while the app is open, with the same rules as iOS (filters, quiet hours, 30 min). */
object InAppAlarm {
    private var app: Context? = null
    private var gezien: Set<String>? = null
    private var laatste = 0L
    private var player: MediaPlayer? = null

    fun init(ctx: Context) { app = ctx.applicationContext }

    /** After each refresh: play once for alerts that are new since the last refresh (not on the first load). */
    fun handle(list: List<Melding>) {
        val vorige = gezien
        gezien = list.map { it.guid }.toSet()
        if (vorige == null || !Settings.alarmSound) return
        val nu = Instant.now().toEpochMilli()
        val nieuw = list.filter { m ->
            m.guid !in vorige && Settings.matchesList(m) && (!Settings.alarmOnlyUrgent || m.isUrgent) &&
                !(Settings.isQuiet() && !(Settings.criticalAlerts && m.isUrgent)) && nu - m.millis < 30 * 60_000
        }
        if (nieuw.isNotEmpty()) speel(nieuw.any { it.isUrgent })
    }

    /** Test button in Settings. */
    fun test(urgent: Boolean = false) = speel(urgent, force = true)

    private fun speel(urgent: Boolean, force: Boolean = false) {
        val ctx = app ?: return
        val nu = System.currentTimeMillis()
        if (!force && nu - laatste < 10_000) return
        laatste = nu
        runCatching {
            player?.release()
            player = MediaPlayer.create(ctx, if (urgent) R.raw.p2000_alarm_spoed else R.raw.p2000_alarm,
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(), 0)
                ?.apply { setOnCompletionListener { it.release(); if (player === it) player = null }; start() }
        }
    }
}
