package com.horae.app.ui.theme

import androidx.compose.ui.graphics.Color
import com.horae.app.domain.model.StatusKind

/**
 * Status colours of the redesign — FIXED hues, never themed by the scheme accent,
 * with a light and a dark variant (web `--st-*`, iOS `AppTheme.Status`).
 * `fg` = text / dot, `bg` = chip wash: a pastel on light schemes, the fg at 20 %
 * on dark ones.
 *
 * Map a domain status to a kind with its `.kind` property (Enums.kt — ONE mapping
 * per enum), then resolve it here. A null kind is "neutral" → the scheme's muted ink.
 */
object StatusPalette {

    fun fg(kind: StatusKind, dark: Boolean = SchemeStore.scheme.isDark): Color =
        if (dark) darkFg(kind) else lightFg(kind)

    fun bg(kind: StatusKind, dark: Boolean = SchemeStore.scheme.isDark): Color =
        if (dark) darkFg(kind).copy(alpha = 0.20f) else lightBg(kind)

    /** fg for a kind, the muted ink of the current scheme for a neutral (null) one. */
    fun color(kind: StatusKind?, scheme: AppScheme = SchemeStore.scheme): Color =
        kind?.let { fg(it, scheme.isDark) } ?: scheme.muted

    /** Wash for a kind; neutral = muted ink at 12 %. */
    fun wash(kind: StatusKind?, scheme: AppScheme = SchemeStore.scheme): Color =
        kind?.let { bg(it, scheme.isDark) } ?: scheme.muted.copy(alpha = 0.12f)

    /** Margin health: ≥30 % ready, ≥15 % warning, else danger. */
    fun marginKind(percent: Double): StatusKind = when {
        percent >= 30 -> StatusKind.READY
        percent >= 15 -> StatusKind.WARNING
        else -> StatusKind.DANGER
    }

    /** Palette bound to one light/dark mode — see [HoraeTheme.status]. */
    class Resolved internal constructor(private val dark: Boolean) {
        fun fg(kind: StatusKind): Color = StatusPalette.fg(kind, dark)
        fun bg(kind: StatusKind): Color = StatusPalette.bg(kind, dark)
    }

    private val lightResolved = Resolved(false)
    private val darkResolved = Resolved(true)
    internal fun resolved(dark: Boolean): Resolved = if (dark) darkResolved else lightResolved

    private fun lightFg(kind: StatusKind): Color = when (kind) {
        StatusKind.NEW -> Color(0xFFC2305B)
        StatusKind.IN_PROGRESS -> Color(0xFF2456B0)
        StatusKind.READY -> Color(0xFF1F6B48)
        StatusKind.WARNING -> Color(0xFF8A5411)
        StatusKind.DANGER -> Color(0xFFB42323)
    }

    private fun lightBg(kind: StatusKind): Color = when (kind) {
        StatusKind.NEW -> Color(0xFFFBE9EF)
        StatusKind.IN_PROGRESS -> Color(0xFFE7EFFB)
        StatusKind.READY -> Color(0xFFE3F2EA)
        StatusKind.WARNING -> Color(0xFFFBEEDC)
        StatusKind.DANGER -> Color(0xFFFDE8E8)
    }

    private fun darkFg(kind: StatusKind): Color = when (kind) {
        StatusKind.NEW -> Color(0xFFF27CA0)
        StatusKind.IN_PROGRESS -> Color(0xFF7BB0E0)
        StatusKind.READY -> Color(0xFF46C266)
        StatusKind.WARNING -> Color(0xFFFF9F0A)
        StatusKind.DANGER -> Color(0xFFFF7A7F)
    }
}
