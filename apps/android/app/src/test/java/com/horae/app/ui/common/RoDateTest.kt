package com.horae.app.ui.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate

/** RoDate: Europe/Bucharest, day before month, 24 h, weeks Monday → Sunday. */
class RoDateTest {

    // ── Parsing ──────────────────────────────────────────────────────────

    @Test fun `parse accepts Z instants, offsets, offset-less and date-only`() {
        assertThat(RoDate.parse("2026-10-17T09:08:00.000Z")).isEqualTo(Instant.parse("2026-10-17T09:08:00Z"))
        assertThat(RoDate.parse("2026-10-17T12:08:00+03:00")).isEqualTo(Instant.parse("2026-10-17T09:08:00Z"))
        // Offset-less = UTC (the API's storage zone).
        assertThat(RoDate.parse("2026-10-17T09:08:00")).isEqualTo(Instant.parse("2026-10-17T09:08:00Z"))
        assertThat(RoDate.parse("2026-10-17")).isEqualTo(Instant.parse("2026-10-17T00:00:00Z"))
    }

    @Test fun `parse returns null for blank and garbage`() {
        assertThat(RoDate.parse(null)).isNull()
        assertThat(RoDate.parse("")).isNull()
        assertThat(RoDate.parse("   ")).isNull()
        assertThat(RoDate.parse("mâine")).isNull()
        assertThat(RoDate.time("not a date")).isEmpty()
        assertThat(RoDate.shortDateTime(null)).isEmpty()
        assertThat(RoDate.stamp("")).isEmpty()
        assertThat(RoDate.deadline("x")).isEmpty()
    }

    // ── Bucharest zone incl. DST change days ─────────────────────────────

    @Test fun `summer time is UTC+3 and winter time UTC+2`() {
        assertThat(RoDate.time("2026-07-01T09:00:00Z")).isEqualTo("12:00")
        assertThat(RoDate.time("2026-01-15T09:00:00Z")).isEqualTo("11:00")
    }

    @Test fun `spring forward on 29 March 2026 skips 03 to 04`() {
        assertThat(RoDate.time("2026-03-29T00:30:00Z")).isEqualTo("02:30") // still EET
        assertThat(RoDate.time("2026-03-29T01:00:00Z")).isEqualTo("04:00") // EEST from here
        assertThat(RoDate.time("2026-03-29T01:30:00Z")).isEqualTo("04:30")
    }

    @Test fun `fall back on 25 October 2026 repeats 03 hour`() {
        assertThat(RoDate.time("2026-10-25T00:30:00Z")).isEqualTo("03:30") // EEST
        assertThat(RoDate.time("2026-10-25T01:30:00Z")).isEqualTo("03:30") // EET
    }

    @Test fun `start and end of a 23-hour DST day`() {
        val day = LocalDate.of(2026, 3, 29)
        assertThat(RoDate.startOfDayInstant(day)).isEqualTo("2026-03-28T22:00:00Z")
        assertThat(RoDate.endOfDayInstant(day)).isEqualTo("2026-03-29T20:59:59.999Z")
    }

    @Test fun `start and end of a 25-hour DST day`() {
        val day = LocalDate.of(2026, 10, 25)
        assertThat(RoDate.startOfDayInstant(day)).isEqualTo("2026-10-24T21:00:00Z")
        assertThat(RoDate.endOfDayInstant(day)).isEqualTo("2026-10-25T21:59:59.999Z")
    }

    @Test fun `24-hour clock, never AM or PM`() {
        val t = RoDate.time("2026-10-17T19:45:00Z")
        assertThat(t).isEqualTo("22:45")
        assertThat(t.uppercase()).doesNotContain("PM")
        assertThat(RoDate.time("2026-10-16T21:05:00Z")).isEqualTo("00:05")
    }

    // ── Date-only vs date-time ───────────────────────────────────────────

    @Test fun `date-only values are recognised`() {
        assertThat(RoDate.isDateOnly("2026-10-17")).isTrue()
        assertThat(RoDate.isDateOnly("2026-10-17T00:00:00.000Z")).isTrue() // 00:00 UTC
        assertThat(RoDate.isDateOnly("2026-10-16T21:00:00.000Z")).isTrue() // 00:00 Bucharest (summer)
        assertThat(RoDate.isDateOnly("2026-01-14T22:00:00.000Z")).isTrue() // 00:00 Bucharest (winter)
        assertThat(RoDate.isDateOnly("2026-10-17T08:30:00.000Z")).isFalse()
        assertThat(RoDate.isDateOnly(null)).isFalse()
        assertThat(RoDate.isDateOnly("garbage-value")).isFalse()
    }

    @Test fun `UTC-midnight date-only keeps its UTC day`() {
        assertThat(RoDate.calendarDay("2026-10-17T00:00:00.000Z")).isEqualTo(LocalDate.of(2026, 10, 17))
        assertThat(RoDate.calendarDay("2026-01-15T00:00:00.000Z")).isEqualTo(LocalDate.of(2026, 1, 15))
    }

    @Test fun `local-midnight date-only keeps its local day`() {
        assertThat(RoDate.calendarDay("2026-10-16T21:00:00.000Z")).isEqualTo(LocalDate.of(2026, 10, 17))
        assertThat(RoDate.calendarDay("2026-01-14T22:00:00.000Z")).isEqualTo(LocalDate.of(2026, 1, 15))
    }

    @Test fun `date-time late evening UTC is next day in Bucharest`() {
        assertThat(RoDate.calendarDay("2026-10-17T22:30:00Z")).isEqualTo(LocalDate.of(2026, 10, 18))
        assertThat(RoDate.shortDateTime("2026-10-17T22:30:00Z")).isEqualTo("18 oct. 2026, 01:30")
    }

    @Test fun `bare date and garbage calendar days`() {
        assertThat(RoDate.calendarDay("2026-02-28")).isEqualTo(LocalDate.of(2026, 2, 28))
        assertThat(RoDate.calendarDay("2026-02-30")).isNull()
        assertThat(RoDate.calendarDay(null)).isNull()
    }

    @Test fun `meaningful time is null for date-only`() {
        assertThat(RoDate.meaningfulTime(Instant.parse("2026-10-17T00:00:00Z"))).isNull()
        assertThat(RoDate.meaningfulTime(Instant.parse("2026-10-17T07:15:00Z"))).isEqualTo("10:15")
    }

    @Test fun `dateOnlyInstant encodes 00 00 UTC like web and iOS`() {
        val day = LocalDate.of(2026, 10, 25)
        val encoded = RoDate.dateOnlyInstant(day)
        assertThat(encoded).isEqualTo("2026-10-25T00:00:00.000Z")
        assertThat(RoDate.isDateOnly(encoded)).isTrue()
        assertThat(RoDate.calendarDay(encoded)).isEqualTo(day)
    }

    @Test fun `picker millis round-trip without device zone`() {
        val day = LocalDate.of(2026, 3, 29)
        assertThat(RoDate.fromPickerMillis(RoDate.toPickerMillis(day))).isEqualTo(day)
        assertThat(RoDate.toPickerMillis(LocalDate.of(1970, 1, 2))).isEqualTo(86_400_000L)
    }

    // ── Day-first output ─────────────────────────────────────────────────

    @Test fun `day before month everywhere`() {
        val d = LocalDate.of(2026, 10, 4)
        assertThat(RoDate.dayMonth(d)).isEqualTo("4 octombrie")
        assertThat(RoDate.dayMonthShort(d)).isEqualTo("4 oct.")
        assertThat(RoDate.shortDate(d)).isEqualTo("4 oct. 2026")
        assertThat(RoDate.fullDate(d)).isEqualTo("4 octombrie 2026")
        assertThat(RoDate.numericDate(d)).isEqualTo("04.10.2026")
        assertThat(RoDate.isoDay(d)).isEqualTo("2026-10-04")
    }

    @Test fun `weekday names are Romanian and capitalised`() {
        assertThat(RoDate.longDay(LocalDate.of(2026, 10, 4))).isEqualTo("Duminică, 4 octombrie")
        assertThat(RoDate.longDay(LocalDate.of(2026, 10, 5))).isEqualTo("Luni, 5 octombrie")
        assertThat(RoDate.monthYear(LocalDate.of(2026, 10, 5))).isEqualTo("Octombrie 2026")
    }

    @Test fun `stamp and fullDateTime drop the time for date-only`() {
        assertThat(RoDate.stamp("2026-10-17T05:40:00Z")).isEqualTo("Sâmbătă, 17 octombrie, 08:40")
        assertThat(RoDate.fullDateTime("2026-10-17T05:40:00Z")).isEqualTo("17 octombrie 2026, 08:40")
        assertThat(RoDate.fullDateTime("2026-10-17")).isEqualTo("17 octombrie 2026")
        assertThat(RoDate.shortDate("2026-10-17T00:00:00.000Z")).isEqualTo("17 oct. 2026")
    }

    // ── Relative days / deadlines ────────────────────────────────────────

    @Test fun `relativeDay azi maine ieri and other years`() {
        val today = LocalDate.of(2026, 10, 17)
        assertThat(RoDate.relativeDay(today, today)).isEqualTo("azi")
        assertThat(RoDate.relativeDay(today.plusDays(1), today)).isEqualTo("mâine")
        assertThat(RoDate.relativeDay(today.minusDays(1), today)).isEqualTo("ieri")
        assertThat(RoDate.relativeDay(LocalDate.of(2026, 10, 25), today)).isEqualTo("25 oct.")
        assertThat(RoDate.relativeDay(LocalDate.of(2025, 10, 25), today)).isEqualTo("25 oct. 2025")
    }

    @Test fun `deadline with and without time`() {
        val today = LocalDate.of(2026, 10, 17)
        assertThat(RoDate.deadline("2026-10-19T08:30:00Z", today)).isEqualTo("19 oct., 11:30")
        assertThat(RoDate.deadline("2026-10-19", today)).isEqualTo("19 oct.")
        assertThat(RoDate.deadline("2026-10-16T00:00:00.000Z", today)).isEqualTo("ieri")
    }

    @Test fun `date-only deadline is overdue only after its day ends in Bucharest`() {
        val raw = "2026-10-17T00:00:00.000Z"
        assertThat(RoDate.isPastDeadline(raw, Instant.parse("2026-10-17T20:59:00Z"))).isFalse() // 23:59 local
        assertThat(RoDate.isPastDeadline(raw, Instant.parse("2026-10-17T21:00:00Z"))).isTrue() // 00:00 next day
    }

    @Test fun `timed deadline is overdue right after its time`() {
        val raw = "2026-10-17T08:30:00Z"
        assertThat(RoDate.isPastDeadline(raw, Instant.parse("2026-10-17T08:29:59Z"))).isFalse()
        assertThat(RoDate.isPastDeadline(raw, Instant.parse("2026-10-17T08:30:01Z"))).isTrue()
        assertThat(RoDate.isPastDeadline(null)).isFalse()
    }

    @Test fun `relative stamps for notifications`() {
        val now = Instant.parse("2026-10-17T12:00:00Z")
        assertThat(RoDate.relative("2026-10-17T11:59:40Z", now)).isEqualTo("acum")
        assertThat(RoDate.relative("2026-10-17T11:55:00Z", now)).isEqualTo("acum 5 min")
        assertThat(RoDate.relative("2026-10-17T10:00:00Z", now)).isEqualTo("acum 2 h")
        assertThat(RoDate.relative(null, now)).isEmpty()
    }

    // ── Monday-first weeks ───────────────────────────────────────────────

    @Test fun `week starts Monday even when the day is Sunday`() {
        val sunday = LocalDate.of(2026, 10, 4)
        assertThat(sunday.dayOfWeek).isEqualTo(DayOfWeek.SUNDAY)
        assertThat(RoDate.startOfWeek(sunday)).isEqualTo(LocalDate.of(2026, 9, 28))
        assertThat(RoDate.startOfWeek(LocalDate.of(2026, 9, 28))).isEqualTo(LocalDate.of(2026, 9, 28))
        assertThat(RoDate.firstDayOfWeek).isEqualTo(DayOfWeek.MONDAY)
    }

    @Test fun `weekDays are Monday to Sunday`() {
        val days = RoDate.weekDays(LocalDate.of(2026, 10, 17))
        assertThat(days).hasSize(7)
        assertThat(days.first().dayOfWeek).isEqualTo(DayOfWeek.MONDAY)
        assertThat(days.last().dayOfWeek).isEqualTo(DayOfWeek.SUNDAY)
        assertThat(days.first()).isEqualTo(LocalDate.of(2026, 10, 12))
        assertThat(RoDate.weekdayInitials).containsExactly("LU", "MA", "MI", "JO", "VI", "SÂ", "DU").inOrder()
    }

    @Test fun `week range across months and years is day first`() {
        assertThat(RoDate.weekRange(RoDate.weekDays(LocalDate.of(2026, 10, 1)))).isEqualTo("28 sept. – 4 oct.")
        assertThat(RoDate.weekRange(RoDate.weekDays(LocalDate.of(2026, 12, 31)))).isEqualTo("28 dec. – 3 ian.")
        assertThat(RoDate.weekRange(emptyList())).isEmpty()
    }

    @Test fun `week across DST change still has seven days`() {
        val days = RoDate.weekDays(LocalDate.of(2026, 10, 25))
        assertThat(days.first()).isEqualTo(LocalDate.of(2026, 10, 19))
        assertThat(days.last()).isEqualTo(LocalDate.of(2026, 10, 25))
        assertThat(RoDate.weekRange(days)).isEqualTo("19 – 25 octombrie")
    }
}
