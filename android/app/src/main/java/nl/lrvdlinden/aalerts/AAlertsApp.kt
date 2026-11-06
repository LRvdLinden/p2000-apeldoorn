package nl.lrvdlinden.aalerts

import android.app.Application
import nl.lrvdlinden.aalerts.data.Settings
import nl.lrvdlinden.aalerts.data.Werkgebied
import nl.lrvdlinden.aalerts.push.Notifier
import nl.lrvdlinden.aalerts.push.Push
import org.maplibre.android.MapLibre

class AAlertsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Settings.init(this)
        if (Settings.firstUse == 0L) Settings.firstUse = System.currentTimeMillis()
        Werkgebied.load(this)
        Push.init(this)
        Notifier.createChannels(this)
        MapLibre.getInstance(this)
    }
}
