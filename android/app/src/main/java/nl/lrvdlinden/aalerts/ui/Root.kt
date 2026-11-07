package nl.lrvdlinden.aalerts.ui

import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ViewList
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import nl.lrvdlinden.aalerts.Bestemming
import nl.lrvdlinden.aalerts.MainActivity
import nl.lrvdlinden.aalerts.R
import nl.lrvdlinden.aalerts.data.Settings
import nl.lrvdlinden.aalerts.data.Store
import nl.lrvdlinden.aalerts.tr
import java.net.URLDecoder
import java.net.URLEncoder

fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")
fun dec(s: String): String = URLDecoder.decode(s, "UTF-8")

enum class Tab { PAGER, KAART, STATISTIEKEN, INSTELLINGEN }

/** Shared navigation for all screens. */
class Nav(val nav: NavHostController) {
    var tab by mutableStateOf(Tab.PAGER)
    var kaartFocus by mutableStateOf<String?>(null)
    fun melding(guid: String) = nav.navigate("melding/${enc(guid)}")
    fun waarschuwing(id: String) = nav.navigate("waarschuwing/${enc(id)}")
    fun open(route: String) = nav.navigate(route)
    fun back() { nav.popBackStack() }
    fun toonOpKaart(guid: String) { kaartFocus = guid; tab = Tab.KAART; nav.popBackStack("main", false) }
    /** Map tab, following a helicopter ("h:<id>"). */
    fun toonHeli(id: String) { kaartFocus = "h:$id"; tab = Tab.KAART; nav.popBackStack("main", false) }
}

@Composable
fun AAlertsRoot(activity: MainActivity) {
    AAlertsTheme {
        val navController = rememberNavController()
        val nav = remember { Nav(navController) }
        var onboarding by rememberSaveable { mutableStateOf(!Settings.onboardingDone) }
        LaunchedEffect(activity.startTab) {
            when (activity.startTab) { "kaart" -> nav.tab = Tab.KAART; "statistieken" -> nav.tab = Tab.STATISTIEKEN; "instellingen" -> nav.tab = Tab.INSTELLINGEN; "pager" -> nav.tab = Tab.PAGER }
            if (activity.startTab == "waarschuwingen") nav.open("waarschuwingen")
        }

        // Refresh alerts and warnings every 15 seconds while the app is open.
        LaunchedEffect(Unit) {
            while (true) { Store.refresh(); delay(15_000) }
        }

        // Push, widget or share link → the right screen.
        val dest = activity.bestemming
        LaunchedEffect(dest, onboarding, activity.locked) {
            if (dest == null || onboarding || activity.locked) return@LaunchedEffect
            when (dest) {
                is Bestemming.Melding -> if (dest.kaart) nav.toonOpKaart(dest.guid) else nav.melding(dest.guid)
                is Bestemming.Waarschuwing -> nav.waarschuwing(dest.id)
            }
            activity.bestemming = null
        }

        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            if (onboarding) {
                Onboarding(onDone = { Settings.onboardingDone = true; onboarding = false })
            } else {
                NavHost(navController, startDestination = "main",
                    enterTransition = { slideInHorizontally { it / 3 } + fadeIn() }, exitTransition = { fadeOut() },
                    popEnterTransition = { fadeIn() }, popExitTransition = { slideOutHorizontally { it / 3 } + fadeOut() }) {
                    composable("main") { MainTabs(nav) }
                    composable("melding/{guid}") { MeldingDetail(dec(it.arguments?.getString("guid") ?: ""), nav) }
                    composable("waarschuwing/{id}") { WaarschuwingDetail(dec(it.arguments?.getString("id") ?: ""), nav) }
                    composable("waarschuwingen") { WaarschuwingenScreen(nav) }
                    composable("bewaard") { BewaardScreen(nav) }
                    composable("profiel/{id}") { ProfielScreen(dec(it.arguments?.getString("id") ?: ""), nav) }
                    composable("content/{name}") { ContentScreen(it.arguments?.getString("name") ?: "privacy", nav) }
                    composable("changelog") { ChangelogScreen(nav) }
                    composable("status") { StatusScreen(nav) }
                    composable("buurt") { RadiusScreen(nav) }
                }
                ReviewPrompt()
            }
            if (activity.locked) LockScreen { activity.unlock() }
        }
    }
}

@Composable
private fun MainTabs(nav: Nav) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                val items = listOf(
                    Triple(Tab.PAGER, tr("Pager", "Pager"), Icons.AutoMirrored.Filled.ViewList),
                    Triple(Tab.KAART, tr("Kaart", "Map"), Icons.Outlined.Map),
                    Triple(Tab.STATISTIEKEN, tr("Statistieken", "Statistics"), Icons.Outlined.BarChart),
                    Triple(Tab.INSTELLINGEN, tr("Instellingen", "Settings"), Icons.Outlined.Settings),
                )
                items.forEach { (t, label, icon) ->
                    NavigationBarItem(selected = nav.tab == t, onClick = { nav.tab = t }, icon = { Icon(icon, null) }, label = { Text(label, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = MaterialTheme.colorScheme.primary, selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)))
                }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (nav.tab) {
                Tab.PAGER -> PagerScreen(nav)
                Tab.KAART -> MapScreen(nav)
                Tab.STATISTIEKEN -> StatsScreen(nav)
                Tab.INSTELLINGEN -> SettingsScreen(nav)
            }
        }
    }
}

@Composable
private fun LockScreen(onUnlock: () -> Unit) {
    LaunchedEffect(Unit) { onUnlock() }
    Column(Modifier.fillMaxSize().background(Color(0xFFB00A1A)).systemBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Image(painterResource(R.drawable.app_icon), null, Modifier.size(96.dp))
        Spacer(Modifier.height(16.dp))
        Text("A-Alerts", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onUnlock, colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFFB00A1A))) {
            Icon(Icons.Filled.Lock, null); Spacer(Modifier.width(8.dp)); Text(tr("Ontgrendelen", "Unlock"))
        }
    }
}

/** Top bar used by the detail screens. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackBar(title: String, nav: Nav, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title, fontWeight = FontWeight.SemiBold, maxLines = 1) },
        navigationIcon = { IconButton(onClick = { nav.back() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("Terug", "Back")) } },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
    )
}
