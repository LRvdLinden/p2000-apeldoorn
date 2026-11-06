package nl.lrvdlinden.aalerts.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import nl.lrvdlinden.aalerts.data.Settings

val Red = Color(0xFFCF0A1E)
val RedDark = Color(0xFFFF4D5E)
val LocalDark = staticCompositionLocalOf { false }

@Composable
fun AAlertsTheme(content: @Composable () -> Unit) {
    val dark = when (Settings.appearance) { "licht" -> false; "donker" -> true; else -> isSystemInDarkTheme() }
    val scheme = if (dark) darkColorScheme(
        primary = RedDark, onPrimary = Color.White, secondary = RedDark,
        background = Color(0xFF000000), surface = Color(0xFF1C1C1E), surfaceVariant = Color(0xFF2C2C2E),
        surfaceContainer = Color(0xFF1C1C1E), surfaceContainerHigh = Color(0xFF2C2C2E), surfaceContainerLow = Color(0xFF121212),
        onSurface = Color(0xFFF2F2F7), onSurfaceVariant = Color(0xFF9CA3AF), outlineVariant = Color(0xFF3A3A3C),
    ) else lightColorScheme(
        primary = Red, onPrimary = Color.White, secondary = Red,
        background = Color(0xFFF2F2F7), surface = Color.White, surfaceVariant = Color(0xFFEDEDF2),
        surfaceContainer = Color.White, surfaceContainerHigh = Color(0xFFF7F7FA), surfaceContainerLow = Color(0xFFF2F2F7),
        onSurface = Color(0xFF111111), onSurfaceVariant = Color(0xFF6B7280), outlineVariant = Color(0xFFE5E7EB),
    )
    // Default Android font (Roboto), slightly smaller sizes like the Apple apps.
    val t = Typography()
    val typography = t.copy(
        titleLarge = t.titleLarge.copy(fontSize = 20.sp),
        titleMedium = t.titleMedium.copy(fontSize = 16.sp),
        bodyLarge = t.bodyLarge.copy(fontSize = 15.sp),
        bodyMedium = t.bodyMedium.copy(fontSize = 14.sp),
        bodySmall = t.bodySmall.copy(fontSize = 12.sp),
    )
    CompositionLocalProvider(LocalDark provides dark) {
        MaterialTheme(colorScheme = scheme, typography = typography, content = content)
    }
}

val Muted: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
val small = TextStyle(fontSize = 12.sp)
