package nl.lrvdlinden.aalerts.push

import android.content.Context
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import nl.lrvdlinden.aalerts.BuildConfig
import nl.lrvdlinden.aalerts.data.Api
import nl.lrvdlinden.aalerts.data.Settings
import nl.lrvdlinden.aalerts.isDutch

/**
 * Push via Firebase Cloud Messaging. The device registers its FCM token with its notification settings at the
 * A-Alerts server (same as the iPhone with APNs); the server matches every alert and only pushes what fits.
 */
object Push {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var syncJob: Job? = null
    private lateinit var app: Context

    fun init(ctx: Context) {
        app = ctx.applicationContext
        Settings.onPushSettingsChanged = { sync() }
    }

    /** Firebase is only there when the APK was built with google-services.json. */
    val available: Boolean get() = BuildConfig.HAS_FIREBASE && runCatching { FirebaseApp.getApps(app).isNotEmpty() }.getOrDefault(false)

    val systemAllowed: Boolean get() = NotificationManagerCompat.from(app).areNotificationsEnabled()

    private var cachedToken: String?
        get() = app.getSharedPreferences("push", Context.MODE_PRIVATE).getString("token", null)
        set(v) { app.getSharedPreferences("push", Context.MODE_PRIVATE).edit().putString("token", v).apply() }

    suspend fun token(): String? {
        if (!available) return null
        return runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()?.also { cachedToken = it } ?: cachedToken
    }

    fun onNewToken(token: String) { cachedToken = token; sync(immediately = true) }

    /** Sends this device's settings to the server (debounced). Notifications off → the device is removed there. */
    fun sync(immediately: Boolean = false) {
        if (!::app.isInitialized) return
        syncJob?.cancel()
        syncJob = scope.launch {
            if (!immediately) delay(1500)
            val token = token() ?: return@launch
            if (!Settings.notificationsEnabled) { runCatching { Api.unregisterDevice(token) }; return@launch }
            runCatching {
                Api.registerDevice(mapOf(
                    "token" to token,
                    "platform" to "android",
                    "environment" to "fcm",
                    "language" to if (isDutch) "nl" else "en",
                    "app_version" to "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                    "settings" to Settings.serverSettings(),
                ))
            }
        }
    }

    suspend fun sendTest(): Boolean {
        val token = token() ?: return false
        sync(immediately = true)
        delay(1200)
        return runCatching { Api.testPush(token) }.isSuccess
    }

    val needsPermission: Boolean get() = Build.VERSION.SDK_INT >= 33
}
