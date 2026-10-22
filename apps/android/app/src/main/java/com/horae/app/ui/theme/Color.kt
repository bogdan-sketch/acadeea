package com.horae.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.horae.app.domain.model.MaterialStatus
import com.horae.app.domain.model.OrderStatus
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.TaskStatus
import com.horae.app.domain.model.TransferStatus
import android.graphics.Color as AndroidColor

// Legacy colour names, kept so existing screens compile. They now resolve to the
// redesign status palette of the CURRENT scheme (light/dark variant) — they are
// getters over snapshot state, so reading them in composition recomposes on a
// scheme change. New code: `HoraeTheme.status.fg(kind)` / `StatusPalette`.

val Success: Color get() = StatusPalette.fg(StatusKind.READY)
val Warning: Color get() = StatusPalette.fg(StatusKind.WARNING)
val Info: Color get() = StatusPalette.fg(StatusKind.IN_PROGRESS)
val Error: Color get() = StatusPalette.fg(StatusKind.DANGER)
/** Was a purple "ready" accent; the redesign has no purple status — maps to READY. */
val StatusPurple: Color get() = StatusPalette.fg(StatusKind.READY)
/** Was indigo "in transit"; maps to IN_PROGRESS. */
val StatusIndigo: Color get() = StatusPalette.fg(StatusKind.IN_PROGRESS)

/** Chart series 2 — accent hue +45° (same derivation as web/iOS). */
fun deriveBrandSecondary(accent: Color): Color = accent.rotateHue(45f)

/** Chart series 3 — accent hue −45°, slightly darker. */
fun deriveBrandTertiary(accent: Color): Color = accent.rotateHue(-45f, valueScale = 0.95f)

private fun Color.rotateHue(degrees: Float, valueScale: Float = 1f): Color {
    val hsv = FloatArray(3)
    AndroidColor.colorToHSV(toArgb(), hsv)
    hsv[0] = ((hsv[0] + degrees) % 360f + 360f) % 360f
    hsv[2] = (hsv[2] * valueScale).coerceIn(0f, 1f)
    return Color(AndroidColor.HSVToColor(hsv))
}

/**
 * Status → colour, resolved through each enum's single `.kind` mapping (Enums.kt)
 * and the fixed [StatusPalette]. Neutral statuses use the scheme's muted ink.
 */
object StatusColors {
    fun taskStatus(status: TaskStatus): Color = StatusPalette.color(status.kind)
    fun materialStatus(status: MaterialStatus): Color = StatusPalette.color(status.kind)
    fun orderStatus(status: OrderStatus): Color = StatusPalette.color(status.kind)
    fun transferStatus(status: TransferStatus): Color = StatusPalette.color(status.kind)
}
