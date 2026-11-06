package nl.lrvdlinden.aalerts.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.*
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.layout.*
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.work.*
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.MainActivity
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.data.Api
import nl.lrvdlinden.aalerts.data.Melding
import nl.lrvdlinden.aalerts.data.Settings
import nl.lrvdlinden.aalerts.data.Werkgebied
import nl.lrvdlinden.aalerts.tr
import java.util.concurrent.TimeUnit

/** Home screen widget: the latest alerts (with the list filters of the app). */
class MeldingenWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        Settings.init(context.applicationContext)
        Werkgebied.load(context.applicationContext)
        val list = runCatching { Api.meldingen(80) }.getOrDefault(emptyList())
            .filter { Settings.matchesList(it) && !it.isBesteld }
            .sortedByDescending { it.millis }
        provideContent { Content(list) }
    }

    @Composable
    private fun Content(list: List<Melding>) {
        val size = LocalSize.current
        val rows = when { size.height < 140.dp -> 1; size.height < 240.dp -> 3; else -> 6 }
        val bg = ColorProvider(R.color.widget_bg)
        val fg = ColorProvider(R.color.widget_fg)
        val sub = ColorProvider(R.color.widget_sub)
        Column(
            modifier = GlanceModifier.fillMaxSize().background(bg).cornerRadius(20.dp).padding(12.dp)
                .clickable(actionStartActivity<MainActivity>()),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(ImageProvider(R.drawable.app_icon), contentDescription = null, modifier = GlanceModifier.size(18.dp))
                Spacer(GlanceModifier.width(6.dp))
                Text("A-Alerts", style = TextStyle(color = fg, fontWeight = FontWeight.Bold, fontSize = 13.sp))
            }
            Spacer(GlanceModifier.height(6.dp))
            if (list.isEmpty()) Text(tr("Geen meldingen", "No alerts"), style = TextStyle(color = sub, fontSize = 13.sp))
            list.take(rows).forEach { m ->
                val open = Intent().setClassName("nl.lrvdlinden.aalerts", "nl.lrvdlinden.aalerts.MainActivity")
                    .putExtra(MainActivity.EXTRA_GUID, m.guid).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp).clickable(actionStartActivity(open)),
                ) {
                    m.soort.icon?.let { Image(ImageProvider(it), contentDescription = null, modifier = GlanceModifier.size(26.dp)) }
                    Spacer(GlanceModifier.width(8.dp))
                    Column(GlanceModifier.defaultWeight()) {
                        Text(m.title, maxLines = 1, style = TextStyle(color = fg, fontWeight = FontWeight.Medium, fontSize = 13.sp))
                        Text("${m.plaatsText} · ${Fmt.dayTime(m.datum)}", maxLines = 1, style = TextStyle(color = sub, fontSize = 11.sp))
                    }
                }
            }
        }
    }
}

class MeldingenWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MeldingenWidget()
    override fun onEnabled(context: Context) { super.onEnabled(context); WidgetUpdater.schedule(context) }
}

/** Keeps the widget fresh: every 15 minutes, and right after a push. */
class WidgetWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        runCatching { MeldingenWidget().updateAll(applicationContext) }
        return Result.success()
    }
}

object WidgetUpdater {
    fun schedule(ctx: Context) {
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("widget", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<WidgetWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())
    }
    fun refreshSoon(ctx: Context) {
        WorkManager.getInstance(ctx).enqueueUniqueWork("widget-now", ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<WidgetWorker>().setInitialDelay(5, TimeUnit.SECONDS).build())
    }
}
