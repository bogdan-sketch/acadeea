package com.horae.app.ui.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The six colour schemes of the redesign — the same tokens as the web app
 * (`globals.css` `:root[data-scheme=…]`) and iOS `AppScheme.swift`.
 * Three light (Atelier, Lapte, Miere), three dark (Cacao, Ardezie, Piper).
 *
 * Rule (decision 17.10.2026): ONLY these six designed schemes. No organisation
 * accent, font or token set overrides them. White text on every accent.
 *
 * Read the active one in composition with [HoraeTheme.scheme] (or
 * `LocalAppScheme.current`); change it with [SchemeStore.scheme].
 */
enum class AppScheme(
    /** Romanian display name ("Atelier"). */
    val label: String,
    val isDark: Boolean,
    /** Page background ("paper"). */
    val background: Color,
    /** Card / list / sheet surface. */
    val card: Color,
    /** Foreground text. */
    val ink: Color,
    /** Subtitles, metadata, placeholder text. */
    val muted: Color,
    /** 1dp borders on cards, chips, icon buttons and dividers. */
    val border: Color,
    /** The accent: buttons, selected chips, FAB. Always with [onPrimary] (white) on top. */
    val primary: Color,
    /** The accent AS TEXT (links, active labels) — ≥4.5:1 on card, page and tints. */
    val primaryText: Color,
    /** Bottom bar / navigation rail surface. */
    val tabBar: Color,
) {
    ATELIER(
        "Atelier", false,
        background = Color(0xFFF6F3EE), card = Color(0xFFFFFFFF), ink = Color(0xFF1C1719),
        muted = Color(0xFF6B6369), border = Color(0xFFE8E2DC), primary = Color(0xFFC2305B),
        primaryText = Color(0xFFAA1249), tabBar = Color(0xFFFBF9F6),
    ),
    LAPTE(
        "Lapte", false,
        background = Color(0xFFF7F7F9), card = Color(0xFFFFFFFF), ink = Color(0xFF15171C),
        muted = Color(0xFF666B78), border = Color(0xFFE3E5EB), primary = Color(0xFF2F5BD6),
        primaryText = Color(0xFF264FC9), tabBar = Color(0xFFFFFFFF),
    ),
    MIERE(
        "Miere", false,
        background = Color(0xFFFBF4E6), card = Color(0xFFFFFCF5), ink = Color(0xFF241B10),
        muted = Color(0xFF74674F), border = Color(0xFFE7DCC3), primary = Color(0xFFA8580D),
        primaryText = Color(0xFF934500), tabBar = Color(0xFFFFFCF5),
    ),
    CACAO(
        "Cacao", true,
        background = Color(0xFF1A1416), card = Color(0xFF241C1F), ink = Color(0xFFF3ECEE),
        muted = Color(0xFFA79BA1), border = Color.White.copy(alpha = 0.08f), primary = Color(0xFFC9386A),
        primaryText = Color(0xFFFF7EA9), tabBar = Color(0xFF1F181B),
    ),
    ARDEZIE(
        "Ardezie", true,
        background = Color(0xFF121619), card = Color(0xFF1A2024), ink = Color(0xFFE9EEF2),
        muted = Color(0xFFA3AFB8), border = Color.White.copy(alpha = 0.08f), primary = Color(0xFF3568DE),
        primaryText = Color(0xFF77B2FF), tabBar = Color(0xFF161B1F),
    ),
    PIPER(
        "Piper", true,
        background = Color(0xFF0F0F10), card = Color(0xFF19191B), ink = Color(0xFFF2EFEA),
        muted = Color(0xFFA9A49C), border = Color.White.copy(alpha = 0.09f), primary = Color(0xFF9C6A0B),
        primaryText = Color(0xFFE2AD5D), tabBar = Color(0xFF141415),
    );

    /** Text / icon colour on a [primary] fill — white on all six schemes. */
    val onPrimary: Color get() = Color.White

    /** "Luminos" / "Întunecat". */
    val kindLabel: String get() = if (isDark) "Întunecat" else "Luminos"

    /** Storage value (`horae-scheme`), same strings as web localStorage and iOS UserDefaults. */
    val key: String get() = name.lowercase()

    companion object {
        val DEFAULT = ATELIER

        fun fromKey(key: String?): AppScheme? = entries.firstOrNull { it.key == key?.trim()?.lowercase() }
    }
}

/**
 * The device's chosen scheme, persisted in SharedPreferences (`horae_prefs`) under
 * `horae-scheme` — the same key as web localStorage / iOS UserDefaults. Per DEVICE,
 * not per user or org: it survives logout.
 *
 * Backed by snapshot state, so anything that reads [scheme] during composition
 * (directly or through [HoraeTheme] / the legacy colour getters in Color.kt)
 * recomposes live when the user picks another tile in [SchemePickerGrid].
 *
 * [init] is called once from `AcadeeaApp.onCreate`; before that the default is used.
 */
object SchemeStore {
    const val STORAGE_KEY = "horae-scheme"
    private const val PREFS_FILE = "horae_prefs"

    private var prefs: SharedPreferences? = null
    private var current by mutableStateOf(AppScheme.DEFAULT)

    var scheme: AppScheme
        get() = current
        set(value) {
            current = value
            prefs?.edit()?.putString(STORAGE_KEY, value.key)?.apply()
        }

    fun init(context: Context) {
        val p = context.applicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        prefs = p
        current = AppScheme.fromKey(p.getString(STORAGE_KEY, null)) ?: AppScheme.DEFAULT
    }
}

/** Active scheme for the subtree; provided by [HoraeTheme]. */
val LocalAppScheme = staticCompositionLocalOf { AppScheme.DEFAULT }

/**
 * Entry point for redesign tokens inside composables:
 * `HoraeTheme.scheme.primary`, `HoraeTheme.scheme.isDark`, `HoraeTheme.status.fg(kind)`.
 */
object HoraeTheme {
    val scheme: AppScheme
        @Composable @ReadOnlyComposable get() = LocalAppScheme.current

    val status: StatusPalette.Resolved
        @Composable @ReadOnlyComposable get() = StatusPalette.resolved(LocalAppScheme.current.isDark)
}
