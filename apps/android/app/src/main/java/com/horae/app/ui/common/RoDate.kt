package com.horae.app.ui.common

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

/**
 * Dates for display — Romanian, day before month, 24 h, weeks Monday → Sunday, in
 * Europe/Bucharest (mirrors iOS `RoDate`). The API sends instants in UTC
 * ("2026-10-17T09:08:00.000Z"): ALWAYS parse with [parse] and format through these
 * helpers — never slice the ISO string or format an OffsetDateTime that still carries Z
 * (that was the "3 h behind" bug).
 *
 * Date-only values (deadlines picked as a day: "2026-10-17" or 00:00 UTC / 00:00 local)
 * have no meaningful time — [isDateOnly] — and render without "00:00"/"03:00"
 * ([stamp], [deadline], [meaningfulTime]).
 */
object RoDate {
    val zone: ZoneId = ZoneId.of("Europe/Bucharest")
    val firstDayOfWeek: DayOfWeek = DayOfWeek.MONDAY

    /** Two-letter weekday labels, Monday first. */
    val weekdayInitials = listOf("LU", "MA", "MI", "JO", "VI", "SÂ", "DU")

    private fun fmt(pattern: String) = DateTimeFormatter.ofPattern(pattern, RoLocale.locale).withZone(zone)

    private val timeF = fmt("HH:mm")
    private val longDayF = fmt("EEEE, d MMMM")
    private val shortDayF = fmt("EEEE, d MMM")
    private val dayMonthF = fmt("d MMMM")
    private val dayMonthShortF = fmt("d MMM")
    private val shortDateF = fmt("d MMM yyyy")
    private val fullDateF = fmt("d MMMM yyyy")
    private val numericDateF = fmt("dd.MM.yyyy")
    private val monthYearF = fmt("LLLL yyyy")
    private val isoDayF = DateTimeFormatter.ISO_LOCAL_DATE

    // ── Parsing ──────────────────────────────────────────────────────────

    /**
     * API value → Instant. Accepts "…Z" / "+02:00" instants, offset-less date-times
     * (taken as UTC, the API's storage zone) and date-only "yyyy-MM-dd" (00:00 UTC).
     * Null for blank / unparseable input.
     */
    fun parse(raw: String?): Instant? {
        val s = raw?.trim().takeUnless { it.isNullOrEmpty() } ?: return null
        return runCatching { Instant.parse(s) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(s).toInstant() }.getOrNull()
            ?: runCatching { LocalDateTime.parse(s).toInstant(ZoneOffset.UTC) }.getOrNull()
            ?: runCatching { LocalDate.parse(s.take(10)).atStartOfDay(ZoneOffset.UTC).toInstant() }.getOrNull()
    }

    /** Instant in the app zone. */
    fun local(instant: Instant): ZonedDateTime = instant.atZone(zone)

    /** True for date-only values: a bare "yyyy-MM-dd", or 00:00:00 UTC, or 00:00:00 local. */
    fun isDateOnly(raw: String?): Boolean {
        val s = raw?.trim() ?: return false
        if (s.length == 10) return true
        return parse(s)?.let(::isDateOnly) ?: false
    }

    fun isDateOnly(instant: Instant): Boolean {
        val l = instant.atZone(zone)
        if (l.hour == 0 && l.minute == 0 && l.second == 0) return true
        val u = instant.atOffset(ZoneOffset.UTC)
        return u.hour == 0 && u.minute == 0 && u.second == 0
    }

    /**
     * The intended calendar day. A UTC-midnight date-only value keeps its UTC day
     * (it must not slip to the previous/next day in another zone).
     */
    fun calendarDay(instant: Instant): LocalDate {
        val l = instant.atZone(zone)
        val localMidnight = l.hour == 0 && l.minute == 0 && l.second == 0
        return if (!localMidnight && isDateOnly(instant)) instant.atOffset(ZoneOffset.UTC).toLocalDate() else l.toLocalDate()
    }

    fun calendarDay(raw: String?): LocalDate? {
        val s = raw?.trim() ?: return null
        if (s.length == 10) return runCatching { LocalDate.parse(s) }.getOrNull()
        return parse(s)?.let(::calendarDay)
    }

    // ── Formatting (all take the raw API string or an Instant / LocalDate) ──

    /** "08:40". */
    fun time(instant: Instant): String = timeF.format(instant)
    fun time(raw: String?): String = parse(raw)?.let(::time).orEmpty()

    /** "08:40", or null for date-only values. */
    fun meaningfulTime(instant: Instant): String? = if (isDateOnly(instant)) null else time(instant)

    /** "Vineri, 17 octombrie". */
    fun longDay(day: LocalDate): String = capitalizedFirst(longDayF.format(day))
    /** "Vineri, 17 oct.". */
    fun shortDay(day: LocalDate): String = capitalizedFirst(shortDayF.format(day))
    /** "17 octombrie". */
    fun dayMonth(day: LocalDate): String = dayMonthF.format(day)
    /** "17 oct.". */
    fun dayMonthShort(day: LocalDate): String = dayMonthShortF.format(day)
    /** "17 oct. 2026". */
    fun shortDate(day: LocalDate): String = shortDateF.format(day)
    /** "17 octombrie 2026" — printed documents. */
    fun fullDate(day: LocalDate): String = fullDateF.format(day)
    /** "17.10.2026". */
    fun numericDate(day: LocalDate): String = numericDateF.format(day)
    /** "Octombrie 2026". */
    fun monthYear(day: LocalDate): String = capitalizedFirst(monthYearF.format(day))

    /** "17 oct. 2026" for an API value (its calendar day), "" when missing. */
    fun shortDate(raw: String?): String = calendarDay(raw)?.let(::shortDate).orEmpty()

    /** "17 oct. 2026, 12:08" — history rows, created/updated stamps; date only when date-only. */
    fun shortDateTime(raw: String?): String {
        val i = parse(raw) ?: return ""
        val day = shortDate(calendarDay(i))
        return meaningfulTime(i)?.let { "$day, $it" } ?: day
    }

    /** "17 octombrie 2026, 12:08" — printed documents; date only when date-only. */
    fun fullDateTime(raw: String?): String {
        val i = parse(raw) ?: return ""
        val day = fullDate(calendarDay(i))
        return meaningfulTime(i)?.let { "$day, $it" } ?: day
    }

    /** "Vineri, 17 octombrie, 08:40", or "Vineri, 17 octombrie" for date-only values. */
    fun stamp(raw: String?): String {
        val i = parse(raw) ?: return ""
        val day = longDay(calendarDay(i))
        return meaningfulTime(i)?.let { "$day, $it" } ?: day
    }

    /**
     * Deadline: "azi", "mâine", "ieri", else "17 oct."; plus ", 11:30" when it has a time.
     * Year added when not the current year ("17 oct. 2025").
     */
    fun deadline(raw: String?, today: LocalDate = today()): String {
        val i = parse(raw) ?: return ""
        val day = calendarDay(i)
        val dayText = relativeDay(day, today)
        return meaningfulTime(i)?.let { "$dayText, $it" } ?: dayText
    }

    /** "azi" / "mâine" / "ieri" / "17 oct." / "17 oct. 2025". */
    fun relativeDay(day: LocalDate, today: LocalDate = today()): String = when (day) {
        today -> "azi"
        today.plusDays(1) -> "mâine"
        today.minusDays(1) -> "ieri"
        else -> if (day.year == today.year) dayMonthShort(day) else shortDate(day)
    }

    /** "acum 5 min", "acum 2 h", "ieri, 14:10", "12 oct., 09:30" — notification rows. */
    fun relative(raw: String?, now: Instant = Instant.now()): String {
        val i = parse(raw) ?: return ""
        val minutes = java.time.Duration.between(i, now).toMinutes()
        return when {
            minutes < 1 -> "acum"
            minutes < 60 -> "acum $minutes min"
            minutes < 6 * 60 -> "acum ${minutes / 60} h"
            else -> "${relativeDay(local(i).toLocalDate())}, ${time(i)}"
        }
    }

    /** A deadline is overdue after its time, or — date-only — after its day ends. */
    fun isPastDeadline(raw: String?, now: Instant = Instant.now()): Boolean {
        val i = parse(raw) ?: return false
        if (!isDateOnly(i)) return i.isBefore(now)
        val end = calendarDay(i).plusDays(1).atStartOfDay(zone).toInstant()
        return !end.isAfter(now)
    }

    // ── Calendar helpers ─────────────────────────────────────────────────

    fun today(): LocalDate = LocalDate.now(zone)

    /** Monday of the week containing [day]. */
    fun startOfWeek(day: LocalDate): LocalDate = day.with(TemporalAdjusters.previousOrSame(firstDayOfWeek))

    /** The seven days, Monday → Sunday, of the week containing [day]. */
    fun weekDays(containing: LocalDate): List<LocalDate> = startOfWeek(containing).let { s -> (0L..6L).map { s.plusDays(it) } }

    /** "13 – 19 octombrie", or "29 sept. – 5 oct." across months. */
    fun weekRange(days: List<LocalDate>): String {
        val first = days.firstOrNull() ?: return ""
        val last = days.last()
        return if (first.month == last.month && first.year == last.year) "${first.dayOfMonth} – ${dayMonth(last)}"
        else "${dayMonthShort(first)} – ${dayMonthShort(last)}"
    }

    /** API day key "2026-10-17". */
    fun isoDay(day: LocalDate): String = isoDayF.format(day)

    /** Start of [day] in the app zone as an ISO instant ("2026-10-16T21:00:00Z") — API range filters. */
    fun startOfDayInstant(day: LocalDate): String = day.atStartOfDay(zone).toInstant().toString()

    /** End of [day] (last millisecond) in the app zone as an ISO instant. */
    fun endOfDayInstant(day: LocalDate): String =
        day.plusDays(1).atStartOfDay(zone).toInstant().minusMillis(1).toString()

    /**
     * A day picked as a date-only value, encoded like web/iOS do: 00:00 UTC of that day
     * ("2026-10-17T00:00:00.000Z"), so every client reads it back as date-only.
     */
    fun dateOnlyInstant(day: LocalDate): String = "${isoDay(day)}T00:00:00.000Z"

    /**
     * Material 3 DatePicker millis (00:00 UTC of the picked day) → LocalDate, and back.
     * Use these instead of converting the millis through the device zone.
     */
    fun fromPickerMillis(millis: Long): LocalDate = Instant.ofEpochMilli(millis).atOffset(ZoneOffset.UTC).toLocalDate()
    fun toPickerMillis(day: LocalDate): Long = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

    fun capitalizedFirst(text: String): String = text.replaceFirstChar { if (it.isLowerCase()) it.titlecase(RoLocale.locale) else it.toString() }
}
