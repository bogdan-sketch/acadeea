package com.horae.app.domain.model

import com.google.common.truth.Truth.assertThat
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/** Every status has a Romanian label (with diacritics where Romanian needs them) and one StatusKind. */
class EnumsTest {

    /** Romanian words that MUST carry diacritics (catches "In lucru", "Livrata", …). */
    private val mustHaveDiacritics = mapOf(
        "In " to "În ", "Noua" to "Nouă", "Pregatita" to "Pregătită", "pregatire" to "pregătire",
        "Livrata" to "Livrată", "Anulata" to "Anulată", "tranzit" to "tranzit", "asteptare" to "așteptare",
        "De facut" to "De făcut",
    )

    private fun assertRomanian(label: String) {
        assertThat(label).isNotEmpty()
        assertThat(label.first().isUpperCase()).isTrue()
        mustHaveDiacritics.filter { (plain, ro) -> plain != ro }.keys.forEach { plain ->
            assertThat(label).doesNotContain(plain)
        }
    }

    // ── TaskStatus ───────────────────────────────────────────────────────

    @Test fun `task statuses have Romanian labels`() {
        assertThat(TaskStatus.entries.associate { it.name to it.displayName }).containsExactly(
            "DE_FACUT", "De făcut", "BLOCAT", "Blocat", "IN_LUCRU", "În lucru",
            "FINALIZAT", "Finalizat", "ANULAT", "Anulat",
        )
        TaskStatus.entries.forEach { assertRomanian(it.displayName) }
    }

    @Test fun `task status kinds`() {
        assertThat(TaskStatus.DE_FACUT.kind).isNull() // neutral
        assertThat(TaskStatus.BLOCAT.kind).isEqualTo(StatusKind.WARNING)
        assertThat(TaskStatus.IN_LUCRU.kind).isEqualTo(StatusKind.IN_PROGRESS)
        assertThat(TaskStatus.FINALIZAT.kind).isEqualTo(StatusKind.READY)
        assertThat(TaskStatus.ANULAT.kind).isEqualTo(StatusKind.DANGER)
    }

    @Test fun `task closed statuses have no transitions`() {
        TaskStatus.entries.forEach { s ->
            assertThat(s.isClosed).isEqualTo(s == TaskStatus.FINALIZAT || s == TaskStatus.ANULAT)
            if (s.isClosed) assertThat(s.allowedTransitions).isEmpty()
        }
    }

    @Test fun `BLOCAT can restart, go back to De facut or be cancelled but never finish`() {
        assertThat(TaskStatus.BLOCAT.allowedTransitions)
            .containsExactly(TaskStatus.IN_LUCRU, TaskStatus.DE_FACUT, TaskStatus.ANULAT).inOrder()
        assertThat(TaskStatus.BLOCAT.allowedTransitions).doesNotContain(TaskStatus.FINALIZAT)
        // Nothing moves INTO Blocat manually — only the API does on missing stock.
        TaskStatus.entries.forEach { assertThat(it.allowedTransitions).doesNotContain(TaskStatus.BLOCAT) }
    }

    /** Parses `VALID_TRANSITIONS` out of the API source so the two can never drift. */
    @Test fun `task transitions match the API VALID_TRANSITIONS`() {
        val file = listOf(
            "../../api/src/modules/tasks/tasks.service.ts",
            "../api/src/modules/tasks/tasks.service.ts",
            "apps/api/src/modules/tasks/tasks.service.ts",
        ).map(::File).firstOrNull { it.exists() }
        assumeTrue("API source not found next to the Android app", file != null)
        val src = file!!.readText()
        val block = Regex("""VALID_TRANSITIONS[^{]*\{([^;]*)\};""").find(src)!!.groupValues[1]
        val api = Regex("""(\w+):\s*\[([^\]]*)\]""").findAll(block).associate { m ->
            m.groupValues[1] to Regex("""TaskStatus\.(\w+)""").findAll(m.groupValues[2]).map { it.groupValues[1] }.toList()
        }
        assertThat(api.keys).containsExactlyElementsIn(TaskStatus.entries.map { it.name })
        TaskStatus.entries.forEach { s ->
            assertThat(s.allowedTransitions.map { it.name }).containsExactlyElementsIn(api.getValue(s.name)).inOrder()
        }
    }

    @Test fun `task fromString is strict and null-safe`() {
        assertThat(TaskStatus.fromString("IN_LUCRU")).isEqualTo(TaskStatus.IN_LUCRU)
        assertThat(TaskStatus.fromString("in_lucru")).isNull()
        assertThat(TaskStatus.fromString(null)).isNull()
        assertThat(TaskStatus.fromString("NOU_STATUS")).isNull()
    }

    // ── OrderStatus ──────────────────────────────────────────────────────

    @Test fun `order statuses have Romanian labels`() {
        assertThat(OrderStatus.entries.associate { it.name to it.displayName }).containsExactly(
            "NOUA", "Nouă", "IN_PREGATIRE", "În pregătire", "PREGATITA", "Pregătită",
            "IN_TRANZIT", "În tranzit", "LIVRATA", "Livrată", "ANULATA", "Anulată",
        )
        OrderStatus.entries.forEach { assertRomanian(it.displayName) }
    }

    @Test fun `order status kinds`() {
        assertThat(OrderStatus.NOUA.kind).isEqualTo(StatusKind.NEW)
        assertThat(OrderStatus.IN_PREGATIRE.kind).isEqualTo(StatusKind.IN_PROGRESS)
        assertThat(OrderStatus.IN_TRANZIT.kind).isEqualTo(StatusKind.IN_PROGRESS)
        assertThat(OrderStatus.PREGATITA.kind).isEqualTo(StatusKind.READY)
        assertThat(OrderStatus.LIVRATA.kind).isEqualTo(StatusKind.READY)
        assertThat(OrderStatus.ANULATA.kind).isEqualTo(StatusKind.DANGER)
    }

    @Test fun `order lifecycle goes forward only`() {
        assertThat(OrderStatus.NOUA.allowedTransitions).containsExactly(OrderStatus.IN_PREGATIRE, OrderStatus.ANULATA)
        assertThat(OrderStatus.IN_TRANZIT.allowedTransitions).containsExactly(OrderStatus.LIVRATA)
        assertThat(OrderStatus.LIVRATA.allowedTransitions).isEmpty()
        assertThat(OrderStatus.ANULATA.allowedTransitions).isEmpty()
        OrderStatus.entries.forEach { s ->
            assertThat(s.isOpen).isEqualTo(s.allowedTransitions.isNotEmpty())
            assertThat(s.allowedTransitions).doesNotContain(s)
        }
    }

    @Test fun `order item statuses`() {
        assertThat(OrderItemStatus.entries.map { it.displayName })
            .containsExactly("În pregătire", "Gata", "În tranzit", "Livrat").inOrder()
        OrderItemStatus.entries.forEach { assertThat(it.kind).isNotNull() }
        assertThat(OrderItemStatus.fromString("GATA")).isEqualTo(OrderItemStatus.GATA)
        assertThat(OrderItemStatus.fromString("X")).isNull()
    }

    @Test fun `fulfillment types are Livrare and Ridicare`() {
        assertThat(FulfillmentType.fromString("DELIVERY")!!.displayName).isEqualTo("Livrare")
        assertThat(FulfillmentType.fromString("PICKUP")!!.displayName).isEqualTo("Ridicare")
        assertThat(FulfillmentType.fromString(null)).isNull()
    }

    // ── TransferStatus ───────────────────────────────────────────────────

    @Test fun `transfer statuses have Romanian labels and kinds`() {
        assertThat(TransferStatus.entries.associate { it.name to it.displayName }).containsExactly(
            "IN_ASTEPTARE", "În așteptare", "IN_TRANZIT", "În tranzit", "FINALIZAT", "Finalizat", "ANULAT", "Anulat",
        )
        TransferStatus.entries.forEach { assertRomanian(it.displayName) }
        assertThat(TransferStatus.IN_ASTEPTARE.kind).isEqualTo(StatusKind.WARNING)
        assertThat(TransferStatus.IN_TRANZIT.kind).isEqualTo(StatusKind.IN_PROGRESS)
        assertThat(TransferStatus.FINALIZAT.kind).isEqualTo(StatusKind.READY)
        assertThat(TransferStatus.ANULAT.kind).isEqualTo(StatusKind.DANGER)
    }

    @Test fun `transfer transitions`() {
        assertThat(TransferStatus.IN_ASTEPTARE.allowedTransitions).containsExactly(TransferStatus.IN_TRANZIT, TransferStatus.ANULAT)
        assertThat(TransferStatus.IN_TRANZIT.allowedTransitions).containsExactly(TransferStatus.FINALIZAT, TransferStatus.ANULAT)
        assertThat(TransferStatus.FINALIZAT.allowedTransitions).isEmpty()
        assertThat(TransferStatus.ANULAT.allowedTransitions).isEmpty()
    }

    @Test fun `transfer approval statuses`() {
        assertThat(TransferApprovalStatus.entries.map { it.displayName })
            .containsExactly("În așteptare", "Aprobat", "Respins").inOrder()
        assertThat(TransferApprovalStatus.REJECTED.kind).isEqualTo(StatusKind.DANGER)
        assertThat(TransferApproval.APPROVED).isEqualTo(TransferApprovalStatus.APPROVED.name)
        assertThat(TransferApproval.REJECTED).isEqualTo(TransferApprovalStatus.REJECTED.name)
    }

    // ── Other enums ──────────────────────────────────────────────────────

    @Test fun `every enum parses its own names and rejects unknown values`() {
        assertThat(MaterialStatus.entries.all { MaterialStatus.fromString(it.name) == it }).isTrue()
        assertThat(EquipmentStatus.entries.all { EquipmentStatus.fromString(it.name) == it }).isTrue()
        assertThat(LocationType.entries.all { LocationType.fromString(it.name) == it }).isTrue()
        assertThat(SalesDeductionStatus.entries.all { SalesDeductionStatus.fromString(it.name) == it }).isTrue()
        assertThat(MaterialStatus.fromString("NEW")).isNull()
        assertThat(EquipmentStatus.fromString(null)).isNull()
    }

    @Test fun `material and equipment labels`() {
        assertThat(MaterialStatus.OUT_OF_STOCK.displayName).isEqualTo("Fără stoc")
        assertThat(MaterialStatus.LOW_STOCK.displayName).isEqualTo("Stoc scăzut")
        assertThat(MaterialStatus.OUT_OF_STOCK.kind).isEqualTo(StatusKind.DANGER)
        assertThat(EquipmentStatus.IN_MENTENANTA.displayName).isEqualTo("În mentenanță")
        assertThat(LocationType.PUNCT_LUCRU.displayName).isEqualTo("Punct de lucru")
    }

    @Test fun `sales deduction decision falls back to ACCEPT`() {
        assertThat(SalesDeductionDecision.fromString("DECLINE")).isEqualTo(SalesDeductionDecision.DECLINE)
        assertThat(SalesDeductionDecision.fromString("???")).isEqualTo(SalesDeductionDecision.ACCEPT)
        assertThat(SalesDeductionDecision.fromString(null)).isEqualTo(SalesDeductionDecision.ACCEPT)
        assertThat(SalesDeductionStatus.DRAFT.displayName).isEqualTo("Neconfirmată")
    }

    @Test fun `user roles map legacy names and tenant slugs`() {
        assertThat(UserRole.fromString("ADMINISTRATOR")).isEqualTo(UserRole.ADMINISTRATOR)
        assertThat(UserRole.fromString("administrator")).isEqualTo(UserRole.ADMINISTRATOR)
        assertThat(UserRole.fromString("sef-cofetar")).isEqualTo(UserRole.SEF_LABORATOR)
        assertThat(UserRole.fromString("gestionar")).isEqualTo(UserRole.MAGAZIONER)
        assertThat(UserRole.fromString("ceva-nou")).isEqualTo(UserRole.AJUTOR_COFETAR) // least privileged
        assertThat(UserRole.SEF_LABORATOR.displayName).isEqualTo("Șef laborator")
    }

    @Test fun `stock movement labels and manual types`() {
        assertThat(StockMovementType.label("IESIRE_PRODUCTIE")).isEqualTo("Ieșire producție")
        assertThat(StockMovementType.label("IESIRE_VANZARE")).isEqualTo("Vânzare")
        assertThat(StockMovementType.label("NECUNOSCUT")).isEqualTo("NECUNOSCUT")
        assertThat(StockMovementType.label(null)).isEmpty()
        assertThat(StockMovementType.manualTypes).containsExactly(StockMovementType.INTRARE, StockMovementType.AJUSTARE)
    }

    @Test fun `metric input units exclude legacy units`() {
        assertThat(UnitType.metricInputUnits)
            .containsExactly(UnitType.GRAME, UnitType.KILOGRAME, UnitType.MILILITRI, UnitType.LITRI, UnitType.BUCATI)
        assertThat(UnitType.metricInputUnits.none { it.isLegacy }).isTrue()
        assertThat(UnitType.entries.filter { it.isLegacy }).containsExactly(
            UnitType.LINGURITE, UnitType.LINGURI, UnitType.CANI, UnitType.OUNCES, UnitType.POUNDS,
        )
        assertThat(UnitType.fromString("kg")).isNull() // abbreviations are not enum names
    }

    @Test fun `allergen labels`() {
        assertThat(Allergen.entries).hasSize(14) // EU Reg. 1169/2011
        assertThat(Allergen.OUA.displayName).isEqualTo("Ouă")
        assertThat(Allergen.TELINA.displayName).isEqualTo("Țelină")
    }
}
