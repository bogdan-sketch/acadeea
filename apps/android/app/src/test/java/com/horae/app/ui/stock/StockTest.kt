package com.horae.app.ui.stock

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import com.horae.app.data.remote.dto.CreateStockMovementRequest
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.StockMovementType
import com.horae.app.domain.model.UserRole
import com.horae.app.testutil.Fixtures.material
import com.horae.app.testutil.Fixtures.page
import com.horae.app.testutil.MainDispatcherRule
import com.horae.app.ui.common.formatQty
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class StockTest {

    @get:Rule val main = MainDispatcherRule()

    private val repo = mockk<StockRepository>(relaxed = true)

    // ── quick actions ────────────────────────────────────────────────────

    @Test fun `administrator sees every quick action in order`() {
        assertThat(stockQuickActions(UserRole.ADMINISTRATOR).map { it.label }).containsExactly(
            "Recepție", "Transfer", "Mișcare", "Teste", "Expirări", "Necesar", "Furnizori",
        ).inOrder()
    }

    @Test fun `magazioner moves stock and runs tests but cannot transfer`() {
        assertThat(stockQuickActions(UserRole.MAGAZIONER)).containsExactly(
            StockQuickAction.RECEPTIE, StockQuickAction.MISCARE, StockQuickAction.TESTE,
            StockQuickAction.EXPIRARI, StockQuickAction.NECESAR, StockQuickAction.FURNIZORI,
        ).inOrder()
    }

    @Test fun `read-only roles only get the views`() {
        listOf(UserRole.COFETAR, UserRole.PATISER, UserRole.AJUTOR_COFETAR, UserRole.SEF_LABORATOR).forEach { role ->
            assertThat(stockQuickActions(role)).containsExactly(
                StockQuickAction.EXPIRARI, StockQuickAction.NECESAR, StockQuickAction.FURNIZORI,
            ).inOrder()
        }
    }

    @Test fun `quick action routes`() {
        assertThat(StockQuickAction.RECEPTIE.route).isEqualTo("stock/receive")
        assertThat(StockQuickAction.MISCARE.route).isEqualTo("stock/movement-new")
        assertThat(StockQuickAction.TESTE.route).isEqualTo(StockRoutes.TEST_CONSUMPTION)
        assertThat(StockQuickAction.EXPIRARI.route).isEqualTo("stock/expiring")
        assertThat(StockQuickAction.entries.map { it.route }.toSet()).hasSize(StockQuickAction.entries.size)
    }

    @Test fun `route builders`() {
        assertThat(StockRoutes.receive("m1")).isEqualTo("stock/receive?materialId=m1")
        assertThat(StockRoutes.movementNew("AJUSTARE")).isEqualTo("stock/movement-new?type=AJUSTARE")
        assertThat(StockRoutes.movementNew("INTRARE", "m1")).isEqualTo("stock/movement-new?type=INTRARE&materialId=m1")
        assertThat(StockRoutes.movementNew(materialId = "m1")).isEqualTo("stock/movement-new?materialId=m1")
    }

    // ── stock state ──────────────────────────────────────────────────────

    @Test fun `stock kind`() {
        assertThat(stockKind(0.0, 5.0)).isEqualTo(StatusKind.DANGER)
        assertThat(stockKind(-1.0, 0.0)).isEqualTo(StatusKind.DANGER)
        assertThat(stockKind(5.0, 5.0)).isEqualTo(StatusKind.WARNING)
        assertThat(stockKind(5.1, 5.0)).isEqualTo(StatusKind.READY)
        assertThat(stockKind(1.0, 0.0)).isEqualTo(StatusKind.READY) // no minimum → never "sub minim"
    }

    @Test fun `material status labels`() {
        assertThat(materialStatusLabel("OUT_OF_STOCK")).isEqualTo("Fără stoc")
        assertThat(materialStatusLabel("LOW_STOCK")).isEqualTo("Scăzut")
        assertThat(materialStatusLabel("DISCONTINUED")).isEqualTo("Întrerupt")
        assertThat(materialStatusLabel("ALTCEVA")).isEqualTo("ALTCEVA")
    }

    @Test fun `quantities are in the material's unit, never its packaging`() {
        val albus = material("m", "Albus bezele", unit = "KILOGRAME", stock = 34.44, pieceType = "SAC")
        assertThat(formatQty(albus.stockCount, albus.unit)).isEqualTo("34,44 kg")
        assertThat(formatQty(albus.stockCount, albus.unit)).doesNotContain("buc")
        assertThat(formatQty(0.0, material("z", unit = "LITRI", stock = 0.0).unit)).isEqualTo("0 l")
        assertThat(formatQty(0.4, "KILOGRAME")).isEqualTo("400 g")
    }

    // ── Epuizate ─────────────────────────────────────────────────────────

    @Test fun `Epuizate asks raw materials with status OUT_OF_STOCK and back`() = runTest(main.dispatcher) {
        coEvery { repo.getRawMaterials(page = 1, search = null, status = null) } returns page(listOf(material("a"), material("b", stock = 0.0)))
        coEvery { repo.getRawMaterials(page = 1, search = null, status = "OUT_OF_STOCK") } returns page(listOf(material("b", stock = 0.0)))
        val vm = RawMaterialListViewModel(repo)
        advanceUntilIdle()
        assertThat(vm.uiState.value.materials.map { it.id }).containsExactly("a", "b")
        vm.setOutOfStockOnly(true)
        advanceUntilIdle()
        assertThat(vm.uiState.value.materials.map { it.id }).containsExactly("b")
        vm.setOutOfStockOnly(true) // same value → no reload
        advanceUntilIdle()
        coVerify(exactly = 1) { repo.getRawMaterials(page = 1, search = null, status = "OUT_OF_STOCK") }
        vm.setOutOfStockOnly(false)
        advanceUntilIdle()
        assertThat(vm.uiState.value.materials.map { it.id }).containsExactly("a", "b")
    }

    @Test fun `Epuizate on consumables uses the same filter`() = runTest(main.dispatcher) {
        coEvery { repo.getConsumables(page = 1, search = null, status = any()) } returns page(emptyList())
        val vm = ConsumableListViewModel(repo)
        advanceUntilIdle()
        vm.setOutOfStockOnly(true)
        advanceUntilIdle()
        assertThat(vm.uiState.value.outOfStockOnly).isTrue()
        coVerify { repo.getConsumables(page = 1, search = null, status = "OUT_OF_STOCK") }
    }

    // ── movement types ───────────────────────────────────────────────────

    @Test fun `only Intrare and Ajustare can be created manually`() {
        assertThat(MovementTypeOption.entries.map { it.apiValue }).containsExactly("INTRARE", "AJUSTARE").inOrder()
        assertThat(MovementTypeOption.entries.map { it.apiValue })
            .containsExactlyElementsIn(StockMovementType.manualTypes.map { it.name })
        assertThat(MovementTypeOption.entries.map { it.label }).containsExactly("Intrare", "Ajustare")
    }

    @Test fun `manual movement types match the API MANUAL_MOVEMENT_TYPES`() {
        val file = listOf("../../api/src/modules/stock/stock.service.ts", "../api/src/modules/stock/stock.service.ts")
            .map(::File).firstOrNull { it.exists() }
        assumeTrue(file != null)
        val block = Regex("""MANUAL_MOVEMENT_TYPES[^=]*=\s*\[([^\]]*)\]""").find(file!!.readText())!!.groupValues[1]
        val api = Regex("""StockMovementType\.(\w+)""").findAll(block).map { it.groupValues[1] }.toList()
        assertThat(MovementTypeOption.entries.map { it.apiValue }).containsExactlyElementsIn(api)
    }

    private fun TestScope.movementVm(type: String? = null, materialId: String? = null): StockMovementCreateViewModel {
        coEvery { repo.getRawMaterials(limit = 200) } returns page(listOf(material("m1", unit = "KILOGRAME")))
        coEvery { repo.getRawMaterial("m1") } returns material("m1", unit = "KILOGRAME")
        val handle = SavedStateHandle(mapOf(StockRoutes.ARG_TYPE to type, StockRoutes.ARG_MATERIAL_ID to materialId))
        return StockMovementCreateViewModel(handle, repo).also { advanceUntilIdle() }
    }

    @Test fun `route type preselects Ajustare, unknown falls back to Intrare`() = runTest(main.dispatcher) {
        assertThat(movementVm("AJUSTARE").uiState.value.movementType).isEqualTo(MovementTypeOption.AJUSTARE)
        assertThat(movementVm("IESIRE_VANZARE").uiState.value.movementType).isEqualTo(MovementTypeOption.INTRARE)
        assertThat(movementVm(materialId = "m1").uiState.value.selectedMaterial?.id).isEqualTo("m1")
    }

    @Test fun `Intrare needs a positive quantity, Ajustare allows zero`() = runTest(main.dispatcher) {
        val vm = movementVm(materialId = "m1")
        vm.onQuantityChange("0")
        assertThat(vm.uiState.value.canSave).isFalse()
        vm.onMovementTypeChange(MovementTypeOption.AJUSTARE)
        assertThat(vm.uiState.value.canSave).isTrue()
        vm.onQuantityChange("")
        assertThat(vm.uiState.value.canSave).isFalse()
    }

    @Test fun `Intrare payload is in the material unit with lot, expiry and price`() = runTest(main.dispatcher) {
        val sent = slot<CreateStockMovementRequest>()
        coEvery { repo.createMovement(capture(sent)) } returns mockk(relaxed = true)
        val vm = movementVm(materialId = "m1")
        vm.onQuantityChange("12,5")
        vm.onLotNumberChange(" L-42 ")
        vm.onExpiryDateChange(LocalDate.of(2026, 11, 2))
        vm.onPurchasePriceChange("41,329")
        vm.onNoteChange("  ")
        vm.createMovement()
        advanceUntilIdle()
        val r = sent.captured
        assertThat(r.movementType).isEqualTo("INTRARE")
        assertThat(r.rawMaterialId).isEqualTo("m1")
        assertThat(r.quantity).isEqualTo(12.5)
        assertThat(r.unit).isEqualTo("KILOGRAME")
        assertThat(r.lotNumber).isEqualTo("L-42")
        assertThat(r.expiryDate).isEqualTo("2026-11-02T00:00:00.000Z")
        assertThat(r.purchasePrice).isEqualTo(41.32) // price input keeps 2 decimals
        assertThat(r.referenceNote).isNull()
        assertThat(vm.uiState.value.saved).isTrue()
    }

    @Test fun `Ajustare payload never carries lot, expiry or price`() = runTest(main.dispatcher) {
        val sent = slot<CreateStockMovementRequest>()
        coEvery { repo.createMovement(capture(sent)) } returns mockk(relaxed = true)
        val vm = movementVm(type = "AJUSTARE", materialId = "m1")
        vm.onQuantityChange("3")
        vm.onLotNumberChange("L-1")
        vm.onExpiryDateChange(LocalDate.of(2026, 11, 2))
        vm.onPurchasePriceChange("10")
        vm.onNoteChange("inventar")
        vm.createMovement()
        advanceUntilIdle()
        val r = sent.captured
        assertThat(r.movementType).isEqualTo("AJUSTARE")
        assertThat(r.lotNumber).isNull()
        assertThat(r.expiryDate).isNull()
        assertThat(r.purchasePrice).isNull()
        assertThat(r.referenceNote).isEqualTo("inventar")
    }

    @Test fun `failed movement shows a Romanian error`() = runTest(main.dispatcher) {
        coEvery { repo.createMovement(any()) } throws java.io.IOException()
        val vm = movementVm(materialId = "m1")
        vm.onQuantityChange("1")
        vm.createMovement()
        advanceUntilIdle()
        assertThat(vm.uiState.value.error).isEqualTo("Nu există conexiune la internet. Încearcă din nou.")
        assertThat(vm.uiState.value.saved).isFalse()
        assertThat(vm.uiState.value.isSaving).isFalse()
    }
}
