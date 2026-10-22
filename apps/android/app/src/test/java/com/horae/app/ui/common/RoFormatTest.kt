package com.horae.app.ui.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** RoFormat: comma decimal, dot thousands from 10.000, space before %, never "-0". */
class RoFormatTest {

    private fun parse(s: String?) = RoFormat.parseDecimal(s)

    // ── number ───────────────────────────────────────────────────────────

    @Test fun `number uses comma decimal and trims zeros`() {
        assertThat(RoFormat.number(1.5)).isEqualTo("1,5")
        assertThat(RoFormat.number(0.95)).isEqualTo("0,95")
        assertThat(RoFormat.number(2.0)).isEqualTo("2")
        assertThat(RoFormat.number(2.005)).isEqualTo("2,01") // half-up
    }

    @Test fun `grouping only from ten thousand`() {
        assertThat(RoFormat.number(9999.5)).isEqualTo("9999,5")
        assertThat(RoFormat.number(10_000.0)).isEqualTo("10.000")
        assertThat(RoFormat.number(1_234_567.891)).isEqualTo("1.234.567,89")
        assertThat(RoFormat.integer(12_500)).isEqualTo("12.500")
        assertThat(RoFormat.integer(1_250)).isEqualTo("1250")
    }

    @Test fun `never minus zero and non-finite is a dash`() {
        assertThat(RoFormat.number(-0.0)).isEqualTo("0")
        assertThat(RoFormat.number(-0.001)).isEqualTo("0")
        assertThat(RoFormat.number(Double.NaN)).isEqualTo("–")
        assertThat(RoFormat.number(Double.POSITIVE_INFINITY)).isEqualTo("–")
        assertThat(RoFormat.number(-12.5)).isEqualTo("-12,5")
    }

    @Test fun `min fraction digits pads`() {
        assertThat(RoFormat.number(3.0, 2, minFractionDigits = 2)).isEqualTo("3,00")
        assertThat(RoFormat.number(3.0, 1, minFractionDigits = 5)).isEqualTo("3,0")
    }

    // ── money ────────────────────────────────────────────────────────────

    @Test fun `ron always has two decimals`() {
        assertThat(RoFormat.ron(24.5)).isEqualTo("24,50 RON")
        assertThat(RoFormat.ron(0.0)).isEqualTo("0,00 RON")
        assertThat(RoFormat.ron(1250.0)).isEqualTo("1250,00 RON")
        assertThat(RoFormat.ron(12_500.0)).isEqualTo("12.500,00 RON")
        assertThat(RoFormat.ron(-0.004)).isEqualTo("0,00 RON")
        assertThat(24.5.ronFormatted()).isEqualTo("24,50 RON")
    }

    @Test fun `ronPer accepts raw enum names and abbreviations`() {
        assertThat(RoFormat.ronPer(41.32, "KILOGRAME")).isEqualTo("41,32 RON/kg")
        assertThat(RoFormat.ronPer(3.5, "BUCATI")).isEqualTo("3,50 RON/buc")
        assertThat(RoFormat.ronPer(0.9, "LITRI")).isEqualTo("0,90 RON/l")
        assertThat(RoFormat.ronPer(2.0, "kg")).isEqualTo("2,00 RON/kg")
        assertThat(RoFormat.ronPer(2.0, null)).isEqualTo("2,00 RON")
        assertThat(RoFormat.ronPer(2.0, " ")).isEqualTo("2,00 RON")
    }

    // ── percent ──────────────────────────────────────────────────────────

    @Test fun `percent has comma and a space before the sign`() {
        assertThat(RoFormat.percent(12.5)).isEqualTo("12,5 %")
        assertThat(RoFormat.percent(12.56)).isEqualTo("12,6 %")
        assertThat(RoFormat.percent(12.56, 2)).isEqualTo("12,56 %")
        assertThat(RoFormat.percent(100.0)).isEqualTo("100 %")
        assertThat(RoFormat.percent(-4.2)).isEqualTo("-4,2 %")
        assertThat(7.25.percentFormatted(2)).isEqualTo("7,25 %")
    }

    @Test fun `signed percent`() {
        assertThat(RoFormat.signedPercent(4.2)).isEqualTo("+4,2 %")
        assertThat(RoFormat.signedPercent(-4.0)).isEqualTo("-4 %")
        assertThat(RoFormat.signedPercent(0.0)).isEqualTo("0 %")
        assertThat(RoFormat.signedPercent(0.01)).isEqualTo("0 %") // rounds to zero, no "+0"
    }

    // ── parseDecimal ─────────────────────────────────────────────────────

    @Test fun `comma and dot are both decimal separators`() {
        assertThat(parse("1,5")).isEqualTo(1.5)
        assertThat(parse("1.5")).isEqualTo(1.5)
        assertThat(parse("0,25")).isEqualTo(0.25)
        assertThat(parse("2")).isEqualTo(2.0)
        assertThat(parse(" 2 ")).isEqualTo(2.0)
    }

    @Test fun `grouped input with spaces or dots`() {
        assertThat(parse("1 234,5")).isEqualTo(1234.5)
        assertThat(parse("1 234,5")).isEqualTo(1234.5) // no-break space
        assertThat(parse("1.234,5")).isEqualTo(1234.5)
        assertThat(parse("1.234.567,5")).isEqualTo(1_234_567.5)
        assertThat(parse("1,234.5")).isEqualTo(1234.5) // en-style: last separator wins
    }

    @Test fun `negative values`() {
        assertThat(parse("-0,25")).isEqualTo(-0.25)
        assertThat(parse("-3")).isEqualTo(-3.0)
    }

    @Test fun `garbage is null`() {
        assertThat(parse(null)).isNull()
        assertThat(parse("")).isNull()
        assertThat(parse("   ")).isNull()
        assertThat(parse("abc")).isNull()
        assertThat(parse("1,2,3")).isNull()
        assertThat(parse("1.2.3")).isNull()
        assertThat(parse("12a")).isNull()
        assertThat(parse(",")).isNull()
        assertThat(parse("-")).isNull()
        assertThat(parse("NaN")).isNull()
        assertThat(parse("Infinity")).isNull()
    }

    @Test fun `exponent and type suffixes are not numbers a user typed`() {
        assertThat(parse("1e5")).isNull()
        assertThat(parse("2f")).isNull()
        assertThat(parse("3d")).isNull()
        assertThat(parse("0x10")).isNull()
    }

    // ── input helpers ────────────────────────────────────────────────────

    @Test fun `sanitize keeps digits and one separator`() {
        assertThat(RoFormat.sanitizeDecimalInput("1,5a")).isEqualTo("1,5")
        assertThat(RoFormat.sanitizeDecimalInput("1.2.5")).isEqualTo("1.25")
        assertThat(RoFormat.sanitizeDecimalInput("1,23456")).isEqualTo("1,234")
        assertThat(RoFormat.sanitizeDecimalInput("12,345", maxDecimals = 2)).isEqualTo("12,34")
    }

    @Test fun `sanitize minus only when allowed and leading`() {
        assertThat(RoFormat.sanitizeDecimalInput("-5")).isEqualTo("5")
        assertThat(RoFormat.sanitizeDecimalInput("-5", allowNegative = true)).isEqualTo("-5")
        assertThat(RoFormat.sanitizeDecimalInput("5-", allowNegative = true)).isEqualTo("5")
    }

    @Test fun `inputText round-trips through parseDecimal`() {
        assertThat(RoFormat.inputText(1.5)).isEqualTo("1,5")
        assertThat(RoFormat.inputText(12_500.25)).isEqualTo("12500,25")
        assertThat(RoFormat.inputText(null)).isEmpty()
        listOf(0.5, 2.0, 1234.5, 12_500.25).forEach { v ->
            assertThat(parse(RoFormat.inputText(v))).isEqualTo(v)
        }
    }
}
