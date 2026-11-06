package nl.lrvdlinden.aalerts.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import nl.lrvdlinden.aalerts.MainActivity
import nl.lrvdlinden.aalerts.data.Settings
import nl.lrvdlinden.aalerts.widget.WidgetUpdater

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Settings.init(applicationContext)
        Push.init(applicationContext)
        Push.onNewToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Settings.init(applicationContext)
        val data = message.data.toMutableMap()
        message.notification?.let { n -> data.putIfAbsent("title", n.title ?: "A-Alerts"); data.putIfAbsent("body", n.body ?: "") }
        Notifier.show(applicationContext, data)
        if (data["guid"] != null) WidgetUpdater.refreshSoon(applicationContext)
    }
}

/** "Bewaar" button on a notification. */
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != ACTION_BEWAAR) return
        Settings.init(ctx.applicationContext)
        val guid = intent.getStringExtra(MainActivity.EXTRA_GUID) ?: return
        if (guid !in Settings.bewaard) Settings.toggleBewaard(guid)
        NotificationManagerCompat.from(ctx).cancel(intent.getIntExtra("nid", 0))
    }
    companion object { const val ACTION_BEWAAR = "nl.lrvdlinden.aalerts.BEWAAR" }
}
