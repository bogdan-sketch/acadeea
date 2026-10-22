package com.horae.app.ui.common

import com.google.common.truth.Truth.assertThat
import com.horae.app.domain.model.UnitType
import org.junit.Test

/** formatQty: metric auto-scaling, zero stays in its own unit, pieces/legacy unscaled. */
class QuantityFormatTest {

    @Test fun `zero stays in the item's own unit for every unit type`() {
        UnitType.entries.forEach { u ->
            assertThat(formatQty(0.0, u)).isEqualTo("0 ${u.abbreviation}")
            assertThat(formatQty(-0.0, u)).isEqualTo("0 ${u.abbreviation}")
            assertThat(formatQty(1e-12, u)).isEqualTo("0 ${u.abbreviation}") // float residue
        }
    }

    @Test fun `every unit type formats a whole value with its abbreviation`() {
        val expected = mapOf(
            UnitType.MILIGRAME to "5 mg", UnitType.GRAME to "5 g", UnitType.KILOGRAME to "5 kg",
            UnitType.MILILITRI to "5 ml", UnitType.LITRI to "5 l", UnitType.BUCATI to "5 buc",
            UnitType.LINGURITE to "5 linguriță", UnitType.LINGURI to "5 lingură", UnitType.CANI to "5 cană",
            UnitType.OUNCES to "5 oz", UnitType.POUNDS to "5 lbs",
        )
        assertThat(expected.keys).containsExactlyElementsIn(UnitType.entries)
        expected.forEach { (u, text) -> assertThat(formatQty(5.0, u)).isEqualTo(text) }
    }

    @Test fun `mass scales up mg to g to kg at 1000`() {
        assertThat(formatQty(999.0, UnitType.MILIGRAME)).isEqualTo("999 mg")
        assertThat(formatQty(1000.0, UnitType.MILIGRAME)).isEqualTo("1 g")
        assertThat(formatQty(1_500_000.0, UnitType.MILIGRAME)).isEqualTo("1,5 kg")
        assertThat(formatQty(999.0, UnitType.GRAME)).isEqualTo("999 g")
        assertThat(formatQty(1000.0, UnitType.GRAME)).isEqualTo("1 kg")
        assertThat(formatQty(1200.0, UnitType.GRAME)).isEqualTo("1,2 kg")
    }

    @Test fun `mass scales down kg to g to mg below 1`() {
        assertThat(formatQty(0.25, UnitType.KILOGRAME)).isEqualTo("250 g")
        assertThat(formatQty(0.0037, UnitType.KILOGRAME)).isEqualTo("3,7 g")
        assertThat(formatQty(0.0005, UnitType.KILOGRAME)).isEqualTo("500 mg")
        assertThat(formatQty(0.5, UnitType.GRAME)).isEqualTo("500 mg")
        assertThat(formatQty(34.44, UnitType.KILOGRAME)).isEqualTo("34,44 kg")
    }

    @Test fun `volume scales ml to l and back`() {
        assertThat(formatQty(999.0, UnitType.MILILITRI)).isEqualTo("999 ml")
        assertThat(formatQty(1500.0, UnitType.MILILITRI)).isEqualTo("1,5 l")
        assertThat(formatQty(0.33, UnitType.LITRI)).isEqualTo("330 ml")
        assertThat(formatQty(2.0, UnitType.LITRI)).isEqualTo("2 l")
    }

    @Test fun `smallest unit is the floor, never below mg or ml`() {
        assertThat(formatQty(0.5, UnitType.MILIGRAME)).isEqualTo("0,5 mg")
        assertThat(formatQty(0.25, UnitType.MILILITRI)).isEqualTo("0,25 ml")
    }

    @Test fun `negative quantities scale by magnitude`() {
        assertThat(formatQty(-0.25, UnitType.KILOGRAME)).isEqualTo("-250 g")
        assertThat(formatQty(-1500.0, UnitType.GRAME)).isEqualTo("-1,5 kg")
    }

    @Test fun `pieces and legacy units are never scaled`() {
        assertThat(formatQty(1500.0, UnitType.BUCATI)).isEqualTo("1500 buc")
        assertThat(formatQty(0.5, UnitType.BUCATI)).isEqualTo("0,5 buc")
        assertThat(formatQty(2000.0, UnitType.OUNCES)).isEqualTo("2000 oz")
        assertThat(formatQty(0.25, UnitType.POUNDS)).isEqualTo("0,25 lbs")
        assertThat(formatQty(1.5, UnitType.CANI)).isEqualTo("1,5 cană")
        assertThat(formatQty(0.5, UnitType.LINGURI)).isEqualTo("0,5 lingură")
    }

    @Test fun `raw enum names and abbreviations as strings`() {
        assertThat(formatQty(34.44, "KILOGRAME")).isEqualTo("34,44 kg")
        assertThat(formatQty(1200.0, "g")).isEqualTo("1,2 kg")
        assertThat(formatQty(2.0, "BUCATI")).isEqualTo("2 buc")
    }

    @Test fun `unknown or blank units pass through unscaled`() {
        assertThat(formatQty(1500.0, "TAVI")).isEqualTo("1500 TAVI")
        assertThat(formatQty(2.5, null as String?)).isEqualTo("2,5")
        assertThat(formatQty(2.5, "")).isEqualTo("2,5")
    }

    @Test fun `stock in kg never shows as buc (Albus bezele bug)`() {
        // The material's unit drives the display; pieceType ("Sac") is packaging.
        assertThat(formatQty(34.44, "KILOGRAME")).doesNotContain("buc")
    }

    @Test fun `qtyFormatted keeps tiny real values and trims zeros`() {
        assertThat(2.0.qtyFormatted()).isEqualTo("2")
        assertThat(1.50.qtyFormatted()).isEqualTo("1,5")
        assertThat(1.234.qtyFormatted()).isEqualTo("1,23")
        assertThat(0.004.qtyFormatted()).isEqualTo("0,004")
        assertThat((-0.0).qtyFormatted()).isEqualTo("0")
        assertThat(Double.NaN.qtyFormatted()).isEqualTo("0")
    }

    @Test fun `humanized returns the chosen unit`() {
        assertThat(UnitType.GRAME.humanized(2500.0)).isEqualTo(2.5 to UnitType.KILOGRAME)
        assertThat(UnitType.KILOGRAME.humanized(0.0)).isEqualTo(0.0 to UnitType.KILOGRAME)
        assertThat(UnitType.BUCATI.humanized(3.0)).isEqualTo(3.0 to UnitType.BUCATI)
    }

    @Test fun `legacy aliases and extension agree with formatQty`() {
        assertThat(formatUnitQty(1500.0, UnitType.GRAME)).isEqualTo(formatQty(1500.0, UnitType.GRAME))
        assertThat(formatUnitQty(1500.0, "GRAME")).isEqualTo("1,5 kg")
        assertThat(UnitType.KILOGRAME.formatQty(1.5)).isEqualTo("1,5 kg")
    }
}
