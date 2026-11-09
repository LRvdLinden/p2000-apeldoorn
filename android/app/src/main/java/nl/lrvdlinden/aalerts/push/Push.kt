package nl.lrvdlinden.aalerts.push

import android.content.Context
import nl.lrvdlinden.aalerts.isDutch
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.*
import kotlinx.coroutines.tasks.await
import nl.lrvdlinden.aalerts.BuildConfig
import nl.lrvdlinden.aalerts.data.Api
import nl.lrvdlinden.aalerts.data.Settings

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

    /** Last error from registering at the server (shown with the test button). */
    var lastError: String? = null
        private set

    private fun body(token: String) = mapOf(
        "token" to token,
        "platform" to "android",
        "environment" to "fcm",
        "language" to if (isDutch) "nl" else "en",
        "app_version" to "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
        "install_id" to nl.lrvdlinden.aalerts.data.InstallPing.id(app),
        "settings" to Settings.serverSettings(),
    )

    /** Sends this device's settings to the server (debounced). Notifications off → the device is removed there. */
    fun sync(immediately: Boolean = false) {
        if (!::app.isInitialized) return
        syncJob?.cancel()
        syncJob = scope.launch {
            if (!immediately) delay(1500)
            val token = token() ?: return@launch
            if (!Settings.notificationsEnabled) { runCatching { Api.unregisterDevice(token) }; return@launch }
            lastError = runCatching { Api.registerDevice(body(token)) }.exceptionOrNull()?.let {
                Log.w("Push", "Registratie mislukt", it); it.message ?: it.toString()
            }
        }
    }

    /** "Stuur een testmelding": null when the server sent it, otherwise what went wrong. */
    suspend fun sendTest(): String? {
        val nl = isDutch
        if (!BuildConfig.HAS_FIREBASE) return if (nl) "Deze versie is gebouwd zonder Firebase en kan geen pushmeldingen ontvangen." else "This build has no Firebase and cannot receive push notifications."
        if (!available) return if (nl) "Firebase is niet gestart op dit toestel." else "Firebase did not start on this device."
        if (!systemAllowed) return if (nl) "Meldingen staan uit voor A-Alerts in de Android-instellingen." else "Notifications are off for A-Alerts in Android settings."
        val fcm = runCatching { FirebaseMessaging.getInstance().token.await() }
        val token = fcm.getOrNull()?.also { cachedToken = it } ?: cachedToken
            ?: return (if (nl) "Geen pushtoken van Firebase: " else "No push token from Firebase: ") + (fcm.exceptionOrNull()?.message ?: "?")
        syncJob?.cancel()
        runCatching { Api.registerDevice(body(token)) }.exceptionOrNull()?.let {
            lastError = it.message
            return (if (nl) "Aanmelden bij de server mislukt: " else "Registering with the server failed: ") + (it.message ?: it.toString())
        }
        lastError = null
        return runCatching { Api.testPush(token) }.exceptionOrNull()?.let { (if (nl) "Server: " else "Server: ") + (it.message ?: it.toString()) }
    }

    val needsPermission: Boolean get() = Build.VERSION.SDK_INT >= 33
}
