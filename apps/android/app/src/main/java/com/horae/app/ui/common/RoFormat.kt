package com.horae.app.ui.common

import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToLong

/**
 * Romanian number formatting shared by every screen (mirrors iOS `RoFormat` and web
 * `Intl.NumberFormat('ro-RO')`): comma decimal, thousands dot from 10.000 up, a space
 * before "%", never "-0".
 *
 * Quantities with a unit go through `formatQty(value, unit)` (QuantityFormat.kt), not here.
 * Parsing user input: [parseDecimal] (accepts "1,5" and "1.5").
 */
object RoFormat {

    private val symbols = DecimalFormatSymbols(RoLocale.locale).apply {
        decimalSeparator = ','
        groupingSeparator = '.'
        minusSign = '-'
    }

    /** "1,5", "0,95", "1.250,75" (ro groups from 10.000; "1250" stays ungrouped), "0" never "-0". */
    fun number(value: Double, fractionDigits: Int = 2, minFractionDigits: Int = 0): String {
        if (!value.isFinite()) return "–"
        val factor = 10.0.pow(fractionDigits)
        var rounded = (value * factor).roundToLong() / factor
        if (rounded == 0.0) rounded = 0.0 // -0 → 0
        val df = DecimalFormat().apply {
            decimalFormatSymbols = symbols
            maximumFractionDigits = fractionDigits
            minimumFractionDigits = minFractionDigits.coerceAtMost(fractionDigits)
            isGroupingUsed = abs(rounded) >= 10_000
            groupingSize = 3
            roundingMode = RoundingMode.HALF_UP
        }
        return df.format(rounded)
    }

    /** Whole number with ro grouping: "1.250" → only from 10.000 ("12.500"). */
    fun integer(value: Long): String = number(value.toDouble(), 0)

    /** "12,5 %", "30 %", "-4,2 %". [fractionDigits] = max decimals (trailing zeros dropped). */
    fun percent(value: Double, fractionDigits: Int = 1): String = "${number(value, fractionDigits)} %"

    /** "+12,5 %" / "-4 %" / "0 %" — variance style. */
    fun signedPercent(value: Double, fractionDigits: Int = 1): String {
        val text = percent(value, fractionDigits)
        return if (value > 0 && !text.startsWith("0 ")) "+$text" else text
    }

    /** Price in RON, always two decimals: "24,50 RON", "1.250,00 RON" only from 10.000. */
    fun ron(value: Double): String = "${number(value, 2, minFractionDigits = 2)} RON"

    /**
     * Unit price: "41,32 RON/kg", "3,50 RON/buc". [unit] is a raw API unit ("KILOGRAME")
     * or an abbreviation ("kg").
     */
    fun ronPer(value: Double, unit: String?): String {
        val abbr = com.horae.app.domain.model.UnitType.fromString(unit)?.abbreviation ?: unit.orEmpty()
        return if (abbr.isBlank()) ron(value) else "${ron(value)}/$abbr"
    }

    /**
     * Parse a number typed by a Romanian user: "1,5", "1.5", " 2 ", "1.250,5", "-0,25".
     * A lone '.' or ',' is the decimal separator; when both appear, the LAST one is the
     * decimal separator and the other is grouping. Returns null for blank / invalid text
     * (including exponents and type suffixes such as "1e5" or "2f").
     */
    fun parseDecimal(text: String?): Double? {
        if (text == null) return null
        val s = text.trim().replace(" ", "").replace(' '.toString(), "")
        if (s.isEmpty()) return null
        val lastComma = s.lastIndexOf(',')
        val lastDot = s.lastIndexOf('.')
        val normalized = when {
            lastComma >= 0 && lastDot >= 0 -> {
                if (lastComma > lastDot) s.replace(".", "").replace(',', '.')
                else s.replace(",", "")
            }
            lastComma >= 0 -> if (s.count { it == ',' } > 1) return null else s.replace(',', '.')
            else -> if (s.count { it == '.' } > 1) return null else s
        }
        // Plain decimals only: Kotlin's toDouble also takes "1e5", "2f", "3d", "NaN"…
        if (!PLAIN_DECIMAL.matches(normalized)) return null
        return normalized.toDoubleOrNull()?.takeIf { it.isFinite() }
    }

    private val PLAIN_DECIMAL = Regex("""[+-]?(\d+\.?\d*|\.\d+)""")

    /**
     * Input filter for numeric text fields: keeps digits, ONE decimal separator (',' or '.',
     * shown as typed) and an optional leading '-' when [allowNegative]. Use as
     * `onValueChange = { text = RoFormat.sanitizeDecimalInput(it) }`, parse with [parseDecimal].
     */
    fun sanitizeDecimalInput(text: String, allowNegative: Boolean = false, maxDecimals: Int = 3): String {
        val out = StringBuilder()
        var seenSep = false
        var decimals = 0
        text.forEachIndexed { i, c ->
            when {
                c.isDigit() -> {
                    if (seenSep) {
                        if (decimals < maxDecimals) { out.append(c); decimals++ }
                    } else out.append(c)
                }
                (c == ',' || c == '.') && !seenSep -> { seenSep = true; out.append(c) }
                c == '-' && allowNegative && i == 0 -> out.append(c)
            }
        }
        return out.toString()
    }

    /** Value → text for an editable numeric field ("1,5", "2"); empty for null. */
    fun inputText(value: Double?, fractionDigits: Int = 3): String =
        value?.let { number(it, fractionDigits).replace(".", "") } ?: ""
}

/** Shorthand: `12.5.percentFormatted()` → "12,5 %". */
fun Double.percentFormatted(fractionDigits: Int = 1): String = RoFormat.percent(this, fractionDigits)

/** Shorthand: `24.5.ronFormatted()` → "24,50 RON". */
fun Double.ronFormatted(): String = RoFormat.ron(this)
