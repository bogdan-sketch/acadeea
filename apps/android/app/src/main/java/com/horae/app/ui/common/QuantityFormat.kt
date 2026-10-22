package com.horae.app.ui.common

import com.horae.app.domain.model.UnitType
import kotlin.math.abs

/*
 * Quantities for DISPLAY (mirrors iOS `UnitType.humanized` / web `formatQuantity`).
 *
 * THE entry point for other screens:  formatQty(value, unit)
 *   - `unit` is the item's STOCK unit — the `unit` field of the DTO ("KILOGRAME") or a UnitType.
 *     NEVER pass `pieceType` (Sac/Cutie/Bucată is packaging, not the stock unit — showing it was
 *     the "Albus bezele 34,44 buc" bug for a kg material).
 *   - metric mass/volume auto-scale to the most readable unit (1000 g → "1 kg", 0,0037 kg → "3,7 g");
 *   - zero (and float residue below 1e-9) stays in the item's own unit: "0 kg", never "0 mg";
 *   - buc / legacy units pass through unscaled; Romanian comma, trailing zeros trimmed.
 * Display only — inputs and API payloads stay in the stock unit.
 */

/** Below this a computed quantity is float residue (e.g. 1e-12 kg after deductions) → 0. */
private const val QTY_EPSILON = 1e-9

private fun Double.snapped(): Double = if (!isFinite() || abs(this) < QTY_EPSILON) 0.0 else this

/**
 * Quantity number: whole numbers without decimals ("2"), fractional values with a
 * Romanian comma and up to two decimals ("1,5", "0,95"); tiny real values keep more
 * precision instead of rounding to "0". Never "-0".
 */
fun Double.qtyFormatted(): String {
    val v = snapped()
    var r = Math.round(v * 100.0) / 100.0
    if (r == 0.0 && v != 0.0) {
        // Small-but-real quantities (0,004 kg = 4 g) must not display as "0".
        r = Math.round(v * 1_000_000.0) / 1_000_000.0
    }
    if (r == 0.0) r = 0.0 // normalize -0
    val s = String.format(java.util.Locale.ROOT, "%.6f", r)
        .trimEnd('0')
        .trimEnd('.')
    return s.replace('.', ',')
}

/** Value of 1 of this unit in its family's metric base (g / ml); null = never auto-scaled. */
private val UnitType.metricFactor: Double?
    get() = when (this) {
        UnitType.MILIGRAME -> 0.001
        UnitType.GRAME -> 1.0
        UnitType.KILOGRAME -> 1000.0
        UnitType.MILILITRI -> 1.0
        UnitType.LITRI -> 1000.0
        else -> null
    }

/** Metric units of a family, smallest → largest (imperial excluded on purpose). */
private val UnitType.displayLadder: List<UnitType>?
    get() = when (this) {
        UnitType.MILIGRAME, UnitType.GRAME, UnitType.KILOGRAME ->
            listOf(UnitType.MILIGRAME, UnitType.GRAME, UnitType.KILOGRAME)
        UnitType.MILILITRI, UnitType.LITRI ->
            listOf(UnitType.MILILITRI, UnitType.LITRI)
        else -> null
    }

/**
 * Most readable (value, unit) for [value] expressed in `this`: the LARGEST metric unit of
 * the family where the value stays ≥ 1 (200 g stays "200 g", 1200 g → "1,2 kg").
 * Zero / residue stays in `this` ("0 kg"); count and legacy units pass through.
 */
fun UnitType.humanized(value: Double): Pair<Double, UnitType> {
    val v = value.snapped()
    if (v == 0.0) return 0.0 to this
    val ladder = displayLadder ?: return v to this
    val base = metricFactor ?: return v to this
    val baseValue = v * base
    var chosen = ladder.first()
    for (u in ladder) {
        val f = u.metricFactor ?: continue
        if (abs(baseValue) >= f) chosen = u
    }
    val factor = chosen.metricFactor ?: base
    return (baseValue / factor) to chosen
}

/** "1,2 kg", "200 g", "0 kg", "2 buc". See the file header for the rules. */
fun formatQty(value: Double, unit: UnitType): String {
    val (v, u) = unit.humanized(value)
    return "${v.qtyFormatted()} ${u.abbreviation}"
}

/**
 * [formatQty] for the raw enum name carried by DTOs ("GRAME"). An abbreviation ("kg") is
 * accepted too. Unknown / blank units: the number plus the raw label, unscaled.
 */
fun formatQty(value: Double, unit: String?): String {
    val u = UnitType.fromString(unit)
        ?: UnitType.entries.firstOrNull { it.abbreviation == unit?.trim() }
        ?: return "${value.qtyFormatted()} ${unit.orEmpty()}".trim()
    return formatQty(value, u)
}

/** Legacy name of [formatQty]. */
fun formatUnitQty(value: Double, unit: UnitType): String = formatQty(value, unit)

/** Legacy name of [formatQty]. */
fun formatUnitQty(value: Double, unit: String?): String = formatQty(value, unit)

/** `UnitType.KILOGRAME.formatQty(1.5)` → "1,5 kg". */
fun UnitType.formatQty(quantity: Double): String = formatQty(quantity, this)
