package nl.lrvdlinden.aalerts

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nl.lrvdlinden.aalerts.data.InstallPing
import nl.lrvdlinden.aalerts.data.Settings
import nl.lrvdlinden.aalerts.push.Push
import nl.lrvdlinden.aalerts.ui.AAlertsRoot
import nl.lrvdlinden.aalerts.widget.WidgetUpdater

/** Where the app should go after a push, a widget tap or a share link. */
sealed interface Bestemming {
    data class Melding(val guid: String, val kaart: Boolean = false) : Bestemming
    data class Waarschuwing(val id: String) : Bestemming
    data class Nieuws(val id: String) : Bestemming
}

class MainActivity : FragmentActivity() {
    var bestemming by mutableStateOf<Bestemming?>(null)
    var locked by mutableStateOf(false)
    /** Screenshots and smoke test (adb): "-e tab kaart" opens a tab, "--ez skipWelkom true" skips the welcome screen. */
    var startTab by mutableStateOf<String?>(null)
    private var lastBackground = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        locked = Settings.appLock
        handle(intent)
        setContent { AAlertsRoot(this) }
        lifecycleScope.launch { InstallPing.send(applicationContext) }
        WidgetUpdater.schedule(this)
        Push.sync(immediately = true)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onStop() {
        super.onStop()
        lastBackground = System.currentTimeMillis()
    }

    override fun onStart() {
        super.onStart()
        // Lock again after 30 seconds in the background.
        if (Settings.appLock && lastBackground > 0 && System.currentTimeMillis() - lastBackground > 30_000) locked = true
    }

    private fun handle(intent: Intent?) {
        intent ?: return
        if (intent.getBooleanExtra("skipWelkom", false)) Settings.onboardingDone = true
        intent.getStringExtra("tab")?.let { startTab = it }
        intent.getStringExtra(EXTRA_GUID)?.let { bestemming = Bestemming.Melding(it, intent.getBooleanExtra(EXTRA_KAART, false)) }
        intent.getStringExtra(EXTRA_WAARSCHUWING)?.let { bestemming = Bestemming.Waarschuwing(it) }
        intent.getStringExtra(EXTRA_NIEUWS)?.let { bestemming = Bestemming.Nieuws(it) }
        intent.data?.let { uri ->
            val segs = uri.pathSegments
            when {
                // a-alerts.nl/melding/<guid> and /melding/<dienst>/<guid> (the guid is always the last part)
                uri.host == "a-alerts.nl" && segs.size >= 2 && segs[0] == "melding" -> bestemming = Bestemming.Melding(segs.last())
                uri.host == "a-alerts.nl" && segs.size >= 2 && segs[0] == "nieuws" -> bestemming = Bestemming.Nieuws(segs.last())
                uri.scheme == "aalerts" && uri.host == "nieuws" && segs.isNotEmpty() -> bestemming = Bestemming.Nieuws(segs.last())
                uri.host == "a-alerts.nl" && segs.size >= 2 && segs[0] == "waarschuwing" -> bestemming = Bestemming.Waarschuwing(segs.drop(1).joinToString("/"))
                // a-alerts.nl/pager/?melding=… and ?waarschuwing=…
                uri.host == "a-alerts.nl" && uri.getQueryParameter("melding") != null -> bestemming = Bestemming.Melding(uri.getQueryParameter("melding")!!)
                uri.host == "a-alerts.nl" && uri.getQueryParameter("waarschuwing") != null -> bestemming = Bestemming.Waarschuwing(uri.getQueryParameter("waarschuwing")!!)
                uri.scheme == "aalerts" && uri.host == "melding" && segs.isNotEmpty() -> bestemming = Bestemming.Melding(segs[0])
                uri.scheme == "aalerts" && uri.host == "waarschuwing" && segs.isNotEmpty() -> bestemming = Bestemming.Waarschuwing(segs.joinToString("/"))
            }
        }
        intent.removeExtra(EXTRA_GUID); intent.removeExtra(EXTRA_WAARSCHUWING); intent.removeExtra(EXTRA_NIEUWS)
    }

    val canLock: Boolean get() = BiometricManager.from(this).canAuthenticate(
        BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS

    fun unlock() {
        if (!canLock) { locked = false; return }
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { locked = false }
        })
        prompt.authenticate(BiometricPrompt.PromptInfo.Builder()
            .setTitle(tr("A-Alerts ontgrendelen", "Unlock A-Alerts"))
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build())
    }

    companion object {
        const val EXTRA_GUID = "guid"
        const val EXTRA_WAARSCHUWING = "waarschuwing"
        const val EXTRA_NIEUWS = "nieuws"
        const val EXTRA_KAART = "kaart"
    }
}
