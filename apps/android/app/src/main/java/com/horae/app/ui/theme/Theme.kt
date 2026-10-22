package com.horae.app.ui.theme

import android.app.Activity
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.horae.app.domain.model.StatusKind

/**
 * Material 3 colour roles derived from one [AppScheme] — so every stock M3
 * component (TopAppBar, NavigationBar, dialogs, sheets, text fields, chips)
 * already looks right before a screen is restyled.
 *
 * Map: primary = accent (white on it) · background = paper · surface + all
 * surfaceContainer* = card (NavigationBar = tabBar) · onSurface = ink ·
 * onSurfaceVariant = muted · outline/outlineVariant = border · secondaryContainer
 * (selected FilterChip / NavigationBar pill) = accent wash · error = status danger.
 */
fun AppScheme.toColorScheme(): ColorScheme {
    val accentWash = primary.copy(alpha = if (isDark) 0.24f else 0.12f).compositeOver(card)
    val danger = StatusPalette.fg(StatusKind.DANGER, isDark)
    val dangerWash = StatusPalette.bg(StatusKind.DANGER, isDark).compositeOver(card)
    val inset = if (isDark) Color.White.copy(alpha = 0.05f).compositeOver(card) else background
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = primary,
        onPrimary = onPrimary,
        primaryContainer = accentWash,
        onPrimaryContainer = primaryText,
        inversePrimary = primaryText,
        secondary = primaryText,
        onSecondary = onPrimary,
        secondaryContainer = accentWash,
        onSecondaryContainer = primaryText,
        tertiary = deriveBrandTertiary(primary),
        onTertiary = Color.White,
        tertiaryContainer = deriveBrandTertiary(primary).copy(alpha = 0.16f).compositeOver(card),
        onTertiaryContainer = ink,
        error = danger,
        onError = Color.White,
        errorContainer = dangerWash,
        onErrorContainer = danger,
        background = background,
        onBackground = ink,
        surface = card,
        onSurface = ink,
        surfaceVariant = inset,
        onSurfaceVariant = muted,
        // Tonal elevation overlays surfaceTint on surface; tinting with the card itself keeps
        // elevated surfaces (dialogs, menus) flat. Never Transparent: that is black at alpha.
        surfaceTint = card,
        inverseSurface = ink,
        inverseOnSurface = card,
        outline = border,
        outlineVariant = border,
        scrim = Color.Black.copy(alpha = 0.45f),
        surfaceBright = card,
        surfaceDim = background,
        surfaceContainerLowest = card,
        surfaceContainerLow = card,
        surfaceContainer = tabBar,
        surfaceContainerHigh = card,
        surfaceContainerHighest = inset,
    )
}

/**
 * App theme: the device's [AppScheme] (from [SchemeStore]) → Material colours,
 * DM Sans / Fraunces typography, [LocalAppScheme] for redesign tokens and the
 * system bar icon colour. No tenant colours or fonts — ever.
 */
@Composable
fun HoraeTheme(
    scheme: AppScheme = SchemeStore.scheme,
    content: @Composable () -> Unit,
) {
    val colorScheme = remember(scheme) { scheme.toColorScheme() }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !scheme.isDark
            controller.isAppearanceLightNavigationBars = !scheme.isDark
        }
    }

    CompositionLocalProvider(LocalAppScheme provides scheme) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = HoraeTypography,
            content = content,
        )
    }
}

/** Legacy name; every argument but [content] is ignored (no tenant theming any more). */
@Deprecated("Use HoraeTheme", ReplaceWith("HoraeTheme(content = content)"))
@Composable
fun AcadeeaTheme(content: @Composable () -> Unit) = HoraeTheme(content = content)
