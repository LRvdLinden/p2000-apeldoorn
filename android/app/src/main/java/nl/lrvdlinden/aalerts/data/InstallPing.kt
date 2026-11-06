package nl.lrvdlinden.aalerts.data

import android.content.Context
import android.os.Build
import nl.lrvdlinden.aalerts.BuildConfig
import nl.lrvdlinden.aalerts.isDutch
import java.util.UUID

/** Anonymous usage ping for the beheer statistics: random install id, platform, model, versions, push on/off. */
object InstallPing {
    suspend fun send(ctx: Context, force: Boolean = false) {
        val p = ctx.getSharedPreferences("install", Context.MODE_PRIVATE)
        val id = p.getString("id", null) ?: UUID.randomUUID().toString().lowercase().also { p.edit().putString("id", it).apply() }
        val push = Settings.notificationsEnabled
        val state = "${BuildConfig.VERSION_NAME}|${BuildConfig.VERSION_CODE}|$push"
        val last = p.getLong("last", 0)
        if (!force && p.getString("state", null) == state && System.currentTimeMillis() - last < 6 * 3600_000) return
        runCatching {
            Api.recordInstall(mapOf(
                "id" to id, "platform" to "android", "model" to "${Build.MANUFACTURER} ${Build.MODEL}".take(40),
                "os" to Build.VERSION.RELEASE, "app_version" to BuildConfig.VERSION_NAME, "build" to BuildConfig.VERSION_CODE.toString(),
                "apple_login" to false, "push" to push, "language" to if (isDutch) "nl" else "en",
            ))
            p.edit().putLong("last", System.currentTimeMillis()).putString("state", state).apply()
        }
    }
}
