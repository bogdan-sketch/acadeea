package com.horae.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.horae.app.R

/*
 * Redesign typography (same faces as web + iOS):
 * - Fraunces (serif, 600) for screen titles and big numbers;
 * - DM Sans for body and UI text (400/500/600/700).
 *
 * Both ship as static OFL instances cut from the iOS variable TTFs (`res/font/`,
 * licences in `assets/licenses/`): DM Sans opsz 14, Fraunces opsz 32. Compose's
 * `variationSettings` on a resource font did not apply the `wght` axis on device
 * (bold rendered as regular; Fraunces' variable default is 900), so each weight is its
 * own file. Re-cut with `fonttools varLib.instancer <font> wght=<w> opsz=<o> --static`.
 */

private fun dmSans(weight: Int, res: Int) = Font(res, weight = FontWeight(weight))
private fun fraunces(weight: Int, res: Int) = Font(res, weight = FontWeight(weight))

/** DM Sans 400/500/600/700 — pick a weight with `fontWeight`. */
val DmSans: FontFamily = FontFamily(
    dmSans(400, R.font.dm_sans_400),
    dmSans(500, R.font.dm_sans_500),
    dmSans(600, R.font.dm_sans_600),
    dmSans(700, R.font.dm_sans_700),
)

/** Fraunces 500/600/700 — titles and big numbers use 600. */
val Fraunces: FontFamily = FontFamily(
    fraunces(500, R.font.fraunces_500),
    fraunces(600, R.font.fraunces_600),
    fraunces(700, R.font.fraunces_700),
)

/**
 * Redesign text styles, mirroring iOS `AppFont`:
 * - `AppFont.title(28)` — screen / section titles (Fraunces 600, slight negative tracking);
 * - `AppFont.display(32)` — big numbers in stat cards / totals (Fraunces 600);
 * - `AppFont.body(15, FontWeight.SemiBold)` — everything else (DM Sans).
 * They return [TextStyle]; colour comes from the caller / LocalContentColor.
 */
object AppFont {
    fun title(size: Float, tracking: TextUnit = (-0.01).em): TextStyle = TextStyle(
        fontFamily = Fraunces,
        fontWeight = FontWeight.SemiBold,
        fontSize = size.sp,
        lineHeight = (size * 1.2f).sp,
        letterSpacing = tracking,
    )

    fun display(size: Float): TextStyle = TextStyle(
        fontFamily = Fraunces,
        fontWeight = FontWeight.SemiBold,
        fontSize = size.sp,
        lineHeight = (size * 1.15f).sp,
    )

    fun body(size: Float = 15f, weight: FontWeight = FontWeight.Normal): TextStyle = TextStyle(
        fontFamily = DmSans,
        fontWeight = weight,
        fontSize = size.sp,
        lineHeight = (size * 1.35f).sp,
    )
}

private fun sans(size: Float, line: Float, weight: FontWeight, tracking: Float = 0f) = TextStyle(
    fontFamily = DmSans, fontWeight = weight, fontSize = size.sp, lineHeight = line.sp, letterSpacing = tracking.sp,
)

private fun serif(size: Float, line: Float) = TextStyle(
    fontFamily = Fraunces, fontWeight = FontWeight.SemiBold, fontSize = size.sp, lineHeight = line.sp,
    letterSpacing = (-0.01).em,
)

/**
 * Material 3 typography on the redesign faces, so untouched M3 components pick
 * them up: display/headline + `titleLarge` (TopAppBar titles) in Fraunces, the
 * rest in DM Sans.
 */
val HoraeTypography = Typography(
    displayLarge = serif(48f, 54f),
    displayMedium = serif(40f, 46f),
    displaySmall = serif(32f, 38f),
    headlineLarge = serif(30f, 36f),
    headlineMedium = serif(26f, 32f),
    headlineSmall = serif(22f, 28f),
    titleLarge = serif(22f, 28f),
    titleMedium = sans(16f, 22f, FontWeight.SemiBold),
    titleSmall = sans(14f, 20f, FontWeight.SemiBold),
    bodyLarge = sans(16f, 23f, FontWeight.Normal),
    bodyMedium = sans(14f, 20f, FontWeight.Normal),
    bodySmall = sans(12f, 16f, FontWeight.Normal),
    labelLarge = sans(14f, 20f, FontWeight.SemiBold),
    labelMedium = sans(12f, 16f, FontWeight.SemiBold),
    labelSmall = sans(11f, 16f, FontWeight.SemiBold, 0.2f),
)

/** Legacy name — the M3 typography. */
val Typography: Typography get() = HoraeTypography
