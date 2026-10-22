package com.horae.app.ui.orders

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.remote.dto.CreateOrderRequest
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.OrderRepository
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.testutil.Fixtures
import com.horae.app.testutil.Fixtures.location
import com.horae.app.testutil.Fixtures.recipe
import com.horae.app.testutil.MainDispatcherRule
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate

/** Comandă nouă: Livrare / Ridicare request payloads. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrderCreateViewModelTest {

    @get:Rule val main = MainDispatcherRule()

    private val orders = mockk<OrderRepository>()
    private val recipes = mockk<RecipeRepository>()
    private val locations = mockk<LocationRepository>()
    private val sent = slot<CreateOrderRequest>()

    private val tort = recipe("r1", "Tort fistic", unit = "KILOGRAME")
    private val macarons = recipe("r2", "Macarons", unit = "BUCATI")

    private fun TestScope.vm(): OrderCreateViewModel {
        coEvery { recipes.getRecipes(type = "FINAL", limit = 100) } returns Fixtures.page(
            listOf(tort, macarons, recipe("r3", "Arhivat", archived = true), recipe("r4", "Cremă", type = "SEMIPREPARAT")),
        )
        coEvery { locations.getLocations() } returns listOf(location("l1", "Laborator"), location("l2", "Vechi", active = false))
        coEvery { orders.createOrder(capture(sent)) } returns Fixtures.order("new")
        return OrderCreateViewModel(orders, recipes, locations).also { advanceUntilIdle() }
    }

    @Test fun `only active FINAL recipes, sorted, and only active locations`() = runTest(main.dispatcher) {
        val vm = vm()
        assertThat(vm.recipes.map { it.name }).containsExactly("Macarons", "Tort fistic").inOrder()
        assertThat(vm.locations.map { it.id }).containsExactly("l1")
    }

    @Test fun `delivery payload`() = runTest(main.dispatcher) {
        val vm = vm()
        vm.deliveryPoint = "  Cafenea Unirii "
        vm.deliveryAddress = " Str. Mare 3 "
        vm.notes = "  "
        vm.dueDay = LocalDate.of(2026, 10, 25)
        vm.addItem(tort)
        vm.setQuantity("r1", "1,5")
        vm.addItem(macarons)
        vm.setQuantity("r2", "12")
        assertThat(vm.canSubmit).isTrue()
        var done = false
        vm.submit { done = true }
        advanceUntilIdle()
        assertThat(done).isTrue()
        val r = sent.captured
        assertThat(r.deliveryPoint).isEqualTo("Cafenea Unirii")
        assertThat(r.fulfillmentType).isNull() // server default = DELIVERY
        assertThat(r.pickupLocationId).isNull()
        assertThat(r.deliveryAddress).isEqualTo("Str. Mare 3")
        assertThat(r.notes).isNull()
        assertThat(r.dueDate).isEqualTo("2026-10-25T00:00:00.000Z") // date-only
        assertThat(r.items.map { Triple(it.recipeId, it.quantity, it.unit) })
            .containsExactly(Triple("r1", 1.5, "KILOGRAME"), Triple("r2", 12.0, "BUCATI")).inOrder()
    }

    @Test fun `pickup payload uses the location and never sends an address`() = runTest(main.dispatcher) {
        val vm = vm()
        vm.mode = FulfillmentMode.PICKUP
        vm.deliveryAddress = "ignored"
        vm.addItem(macarons)
        assertThat(vm.canSubmit).isFalse() // needs a location
        vm.pickupLocationId = "l1"
        assertThat(vm.canSubmit).isTrue()
        vm.submit {}
        advanceUntilIdle()
        val r = sent.captured
        assertThat(r.fulfillmentType).isEqualTo("PICKUP")
        assertThat(r.pickupLocationId).isEqualTo("l1")
        assertThat(r.deliveryAddress).isNull()
        assertThat(r.deliveryPoint).isEqualTo("Laborator") // falls back to the location name
        assertThat(r.dueDate).isNull()
    }

    @Test fun `pickup keeps the customer name typed as point`() = runTest(main.dispatcher) {
        val vm = vm()
        vm.mode = FulfillmentMode.PICKUP
        vm.pickupLocationId = "l1"
        vm.deliveryPoint = "Maria Ionescu"
        vm.addItem(tort)
        vm.submit {}
        advanceUntilIdle()
        assertThat(sent.captured.deliveryPoint).isEqualTo("Maria Ionescu")
    }

    @Test fun `delivery needs a point and every line a positive quantity`() = runTest(main.dispatcher) {
        val vm = vm()
        vm.addItem(tort)
        assertThat(vm.canSubmit).isFalse() // no delivery point
        vm.deliveryPoint = "Cafenea"
        assertThat(vm.canSubmit).isTrue()
        vm.setQuantity("r1", "0")
        assertThat(vm.canSubmit).isFalse()
        vm.setQuantity("r1", "abc")
        assertThat(vm.items.single().quantityText).isEmpty() // sanitized
        assertThat(vm.canSubmit).isFalse()
        vm.setQuantity("r1", "2.5")
        assertThat(vm.items.single().quantity).isEqualTo(2.5)
    }

    @Test fun `adding the same product twice keeps one line`() = runTest(main.dispatcher) {
        val vm = vm()
        vm.addItem(tort)
        vm.addItem(tort)
        assertThat(vm.items).hasSize(1)
        vm.removeItem("r1")
        assertThat(vm.items).isEmpty()
        assertThat(vm.canSubmit).isFalse()
    }

    @Test fun `failed create shows a Romanian error and stays on screen`() = runTest(main.dispatcher) {
        val vm = vm()
        coEvery { orders.createOrder(any()) } throws java.io.IOException()
        vm.deliveryPoint = "Cafenea"
        vm.addItem(tort)
        var done = false
        vm.submit { done = true }
        advanceUntilIdle()
        assertThat(done).isFalse()
        assertThat(vm.error).isEqualTo("Nu există conexiune la internet. Încearcă din nou.")
        assertThat(vm.isSubmitting).isFalse()
    }

    @Test fun `dirty when anything was entered`() = runTest(main.dispatcher) {
        val vm = vm()
        assertThat(vm.isDirty).isFalse()
        vm.mode = FulfillmentMode.PICKUP
        assertThat(vm.isDirty).isTrue()
    }
}
