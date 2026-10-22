package com.horae.app.ui.common

import com.horae.app.domain.model.TaskStatus
import com.horae.app.domain.model.UnitType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate

class RoFormattingTest {

    @Test fun quantities() {
        assertEquals("34,44 kg", formatQty(34.44, "KILOGRAME"))
        assertEquals("0 kg", formatQty(0.0, UnitType.KILOGRAME))
        assertEquals("0 kg", formatQty(1e-12, UnitType.KILOGRAME)) // residue, never "0 mg"
        assertEquals("1,2 kg", formatQty(1200.0, UnitType.GRAME))
        assertEquals("200 g", formatQty(200.0, UnitType.GRAME))
        assertEquals("3,7 g", formatQty(0.0037, UnitType.KILOGRAME))
        assertEquals("1,5 l", formatQty(1500.0, "MILILITRI"))
        assertEquals("2 buc", formatQty(2.0, "BUCATI"))
        assertEquals("-250 g", formatQty(-0.25, UnitType.KILOGRAME))
    }

    @Test fun numbers() {
        assertEquals("41,32 RON/kg", RoFormat.ronPer(41.32, "KILOGRAME"))
        assertEquals("24,50 RON", RoFormat.ron(24.5))
        assertEquals("12,5 %", RoFormat.percent(12.5))
        assertEquals("30 %", RoFormat.percent(30.0))
        assertEquals("0 %", RoFormat.percent(-0.01))
        assertEquals("+4,2 %", RoFormat.signedPercent(4.2))
        assertEquals("1250,75", RoFormat.number(1250.75))
        assertEquals("12.500", RoFormat.number(12500.0))
    }

    @Test fun parsing() {
        assertEquals(1.5, RoFormat.parseDecimal("1,5")!!, 0.0)
        assertEquals(1.5, RoFormat.parseDecimal("1.5")!!, 0.0)
        assertEquals(1250.5, RoFormat.parseDecimal("1.250,5")!!, 0.0)
        assertEquals(-0.25, RoFormat.parseDecimal(" -0,25 ")!!, 0.0)
        assertNull(RoFormat.parseDecimal(""))
        assertNull(RoFormat.parseDecimal("1,2,3"))
        assertEquals("1,5", RoFormat.sanitizeDecimalInput("1,5a"))
        assertEquals("1,25", RoFormat.sanitizeDecimalInput("1,2,5"))
    }

    @Test fun dates() {
        // 09:08 UTC = 12:08 in Bucharest (EEST) — the old "3 h behind" bug.
        assertEquals("12:08", RoDate.time("2026-10-17T09:08:00.000Z"))
        assertEquals("17 oct. 2026, 12:08", RoDate.shortDateTime("2026-10-17T09:08:00.000Z"))
        // Date-only deadlines show no time.
        assertTrue(RoDate.isDateOnly("2026-10-17T00:00:00.000Z"))
        assertEquals("17 oct. 2026", RoDate.shortDateTime("2026-10-17T00:00:00.000Z"))
        assertEquals("17 oct. 2026", RoDate.shortDateTime("2026-10-17"))
        assertFalse(RoDate.isDateOnly("2026-10-17T08:30:00.000Z"))
        assertEquals("Sâmbătă, 17 octombrie", RoDate.stamp("2026-10-17T00:00:00.000Z"))
        val today = LocalDate.of(2026, 10, 17)
        assertEquals("azi, 14:30", RoDate.deadline("2026-10-17T11:30:00Z", today))
        assertEquals("mâine", RoDate.deadline("2026-10-18T00:00:00.000Z", today))
        assertEquals(DayOfWeek.MONDAY, RoDate.startOfWeek(today).dayOfWeek)
        assertEquals("12 – 18 octombrie", RoDate.weekRange(RoDate.weekDays(today)))
    }

    @Test fun enums() {
        assertEquals("Blocat", TaskStatus.fromString("BLOCAT")!!.displayName)
        assertEquals(listOf(TaskStatus.IN_LUCRU, TaskStatus.DE_FACUT, TaskStatus.ANULAT), TaskStatus.BLOCAT.allowedTransitions)
        assertEquals("paine", searchKey("Pâine"))
    }
}
