package com.horae.app.ui.tasks

import com.google.common.truth.Truth.assertThat
import com.horae.app.domain.model.TaskStatus
import com.horae.app.testutil.Fixtures.task
import com.horae.app.ui.common.RoDate
import org.junit.Test

/** Card texts, yield capture parsing and date-only deadlines. */
class TaskCardTest {

    @Test fun `quantity always carries its unit`() {
        assertThat(task("a", targetQuantity = 2.0, targetUnit = "BUCATI").quantityText).isEqualTo("2 buc")
        assertThat(task("a", targetQuantity = 1.5, targetUnit = "KILOGRAME").quantityText).isEqualTo("1,5 kg")
        assertThat(task("a", targetQuantity = 2500.0, targetUnit = "GRAME").quantityText).isEqualTo("2,5 kg")
    }

    @Test fun `badge is times-N for pieces and a measure otherwise`() {
        assertThat(task("a", targetQuantity = 6.0).quantityBadge).isEqualTo("×6")
        assertThat(task("a", targetQuantity = 2.5, targetUnit = "KILOGRAME").quantityBadge).isEqualTo("2,5 kg")
    }

    @Test fun `custom title wins over recipe name`() {
        assertThat(task("a", recipeName = "Aluat choux", title = "Choux pentru nuntă").name).isEqualTo("Choux pentru nuntă")
        assertThat(task("a", recipeName = "Aluat choux", title = "  ").name).isEqualTo("Aluat choux")
        assertThat(task("a", recipeName = "Ecler", targetQuantity = 12.0).displayName).isEqualTo("12 buc Ecler")
    }

    // ── deadlines ────────────────────────────────────────────────────────

    @Test fun `date-only deadline shows the day without a time`() {
        val today = RoDate.isoDay(RoDate.today())
        val line = taskTimeLine(task("a", dueDate = "${today}T00:00:00.000Z"), TaskStatus.DE_FACUT)
        assertThat(line).isEqualTo("azi")
        assertThat(line).doesNotContain(":")
    }

    @Test fun `timed deadline shows Bucharest time`() {
        val line = taskTimeLine(task("a", dueDate = "2020-03-02T09:30:00Z"), TaskStatus.DE_FACUT)
        assertThat(line).isEqualTo("2 mar. 2020, 11:30")
    }

    @Test fun `closed tasks show when they closed, in-progress since when`() {
        val done = task("a", completedAt = "2020-03-02T10:00:00Z", dueDate = "2020-03-01")
        assertThat(taskTimeLine(done, TaskStatus.FINALIZAT)).isEqualTo("2 mar. 2020, 12:00")
        val running = task("b", status = "IN_LUCRU").copy(startedAt = "2026-10-17T06:08:00Z")
        assertThat(taskTimeLine(running, TaskStatus.IN_LUCRU)).isEqualTo("din 09:08")
        assertThat(taskTimeLine(task("c"), TaskStatus.DE_FACUT)).isNull()
    }

    @Test fun `deadline picked in the form is encoded date-only and read back as the same day`() {
        val day = java.time.LocalDate.of(2026, 10, 25) // DST change day
        val encoded = RoDate.dateOnlyInstant(RoDate.fromPickerMillis(RoDate.toPickerMillis(day)))
        assertThat(encoded).isEqualTo("2026-10-25T00:00:00.000Z")
        assertThat(RoDate.calendarDay(encoded)?.let(RoDate::toPickerMillis)).isEqualTo(RoDate.toPickerMillis(day))
    }

    // ── yield capture ────────────────────────────────────────────────────

    @Test fun `yield accepts comma and dot`() {
        assertThat(yieldPreview("1,5", 2.0).actual).isEqualTo(1.5)
        assertThat(yieldPreview("1.5", 2.0).actual).isEqualTo(1.5)
        assertThat(yieldPreview("1 250,5", 1000.0).actual).isEqualTo(1250.5)
    }

    @Test fun `yield variance and bands`() {
        val p = yieldPreview("1,9", 2.0)
        assertThat(p.varianceAbsolute!!).isWithin(1e-9).of(-0.1)
        assertThat(p.variancePercent!!).isWithin(1e-9).of(-5.0)
        assertThat(p.band).isEqualTo(YieldBand.ON_TARGET)
        assertThat(yieldPreview("2,2", 2.0).band).isEqualTo(YieldBand.WARNING)
        assertThat(yieldPreview("1,7", 2.0).band).isEqualTo(YieldBand.WARNING) // exactly -15 %
        assertThat(yieldPreview("1,6", 2.0).band).isEqualTo(YieldBand.OFF)
        assertThat(yieldPreview("2,4", 2.0).band).isEqualTo(YieldBand.OFF)
    }

    @Test fun `invalid or non-positive yields cannot be confirmed`() {
        assertThat(yieldPreview("", 2.0).isValid).isFalse()
        assertThat(yieldPreview("abc", 2.0).isValid).isFalse()
        assertThat(yieldPreview("0", 2.0).isValid).isFalse()
        assertThat(yieldPreview("-1", 2.0).isValid).isFalse()
        assertThat(yieldPreview("", 2.0).band).isNull()
    }

    @Test fun `zero target gives no variance but a valid yield`() {
        val p = yieldPreview("3", 0.0)
        assertThat(p.isValid).isTrue()
        assertThat(p.variancePercent).isNull()
        assertThat(p.band).isNull()
    }
}
