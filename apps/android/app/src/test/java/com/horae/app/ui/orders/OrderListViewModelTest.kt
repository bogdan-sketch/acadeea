package com.horae.app.ui.orders

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.dto.DeliveryMethodDto
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.repository.OrderRepository
import com.horae.app.domain.model.OrderStatus
import com.horae.app.testutil.Fixtures.order
import com.horae.app.testutil.Fixtures.page
import com.horae.app.testutil.MainDispatcherRule
import com.horae.app.ui.common.RoDate
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class OrderListViewModelTest {

    private companion object {
        val NOUA_ONLY = listOf("NOUA")
    }

    @get:Rule val main = MainDispatcherRule()

    private val repo = mockk<OrderRepository>(relaxed = true)
    private val branding = mockk<BrandingManager>(relaxed = true)
    // Most cases exercise the Intrări ordering; the default (Pregătiri) has its own test.
    private val store = OrdersFilterStore(repo, branding).apply { setView(OrderView.INTRARI) }

    private fun stubPage(pageNo: Int, orders: List<OrderResponse>, totalPages: Int = 1, search: String? = null) {
        coEvery { repo.getOrders(page = pageNo, search = search, view = "intrari", statuses = NOUA_ONLY) } returns page(orders, pageNo, totalPages)
    }

    @Test fun `first load is deduped and sorted newest first`() = runTest(main.dispatcher) {
        coEvery { repo.getStatusCounts() } returns mapOf("NOUA" to 2)
        stubPage(1, listOf(
            order("a", createdAt = "2026-10-15T08:00:00Z"),
            order("b", createdAt = "2026-10-17T08:00:00Z"),
            order("a", createdAt = "2026-10-15T08:00:00Z"),
        ))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        val s = vm.uiState.value
        assertThat(s.orders.map { it.id }).containsExactly("b", "a").inOrder()
        assertThat(s.isLoading).isFalse()
        assertThat(s.hasLoaded).isTrue()
        assertThat(s.statusCounts).containsExactly("NOUA", 2)
    }

    @Test fun `load more appends, dedupes overlap and keeps newest first`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("c", createdAt = "2026-10-17T10:00:00Z"), order("b", createdAt = "2026-10-17T09:00:00Z")), totalPages = 2)
        stubPage(2, listOf(order("b", createdAt = "2026-10-17T09:00:00Z"), order("a", createdAt = "2026-10-17T08:00:00Z")), totalPages = 2)
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        assertThat(vm.uiState.value.hasNextPage).isTrue()
        vm.loadMore()
        advanceUntilIdle()
        val s = vm.uiState.value
        assertThat(s.orders.map { it.id }).containsExactly("c", "b", "a").inOrder()
        assertThat(s.page).isEqualTo(2)
        assertThat(s.hasNextPage).isFalse()
        vm.loadMore() // no next page → no call
        advanceUntilIdle()
        coVerify(exactly = 1) { repo.getOrders(page = 2, search = null, view = "intrari", statuses = NOUA_ONLY) }
    }

    @Test fun `a load more answered after a refresh is dropped`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("p1")), totalPages = 3)
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()

        val slowPage2 = CompletableDeferred<PaginatedResponse<OrderResponse>>()
        coEvery { repo.getOrders(page = 2, search = null, view = "intrari", statuses = NOUA_ONLY) } coAnswers { slowPage2.await() }
        vm.loadMore()
        advanceUntilIdle() // page 2 in flight

        stubPage(1, listOf(order("fresh")), totalPages = 3)
        vm.refresh()
        advanceUntilIdle()
        slowPage2.complete(page(listOf(order("stale")), 2, 3))
        advanceUntilIdle()

        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("fresh")
        assertThat(vm.uiState.value.page).isEqualTo(1)
    }

    @Test fun `an older reload answering late does not overwrite a newer one`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("first")))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()

        val slow = CompletableDeferred<PaginatedResponse<OrderResponse>>()
        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = NOUA_ONLY) } coAnswers { slow.await() }
        vm.reload()
        advanceUntilIdle()
        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = NOUA_ONLY) } returns page(listOf(order("newest")))
        vm.reload()
        advanceUntilIdle()
        slow.complete(page(listOf(order("old"))))
        advanceUntilIdle()
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("newest")
    }

    @Test fun `failed refresh keeps rows and shows a Romanian error`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("a")))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = NOUA_ONLY) } throws IOException("Unable to resolve host")
        vm.refresh()
        advanceUntilIdle()
        val s = vm.uiState.value
        assertThat(s.orders.map { it.id }).containsExactly("a")
        assertThat(s.error).isEqualTo("Nu există conexiune la internet. Încearcă din nou.")
        assertThat(s.isRefreshing).isFalse()
        vm.clearError()
        assertThat(vm.uiState.value.error).isNull()
    }

    @Test fun `search reloads page one with the query after the debounce`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("a"), order("b")))
        stubPage(1, listOf(order("b")), search = "fistic")
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        vm.onSearchChange("fistic")
        advanceTimeBy(100)
        coVerify(exactly = 0) { repo.getOrders(page = 1, search = "fistic", view = "intrari", statuses = NOUA_ONLY) }
        advanceUntilIdle()
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("b")
        assertThat(vm.uiState.value.search).isEqualTo("fistic")
    }

    @Test fun `summary counts open statuses and today's open departures`() {
        val today = RoDate.isoDay(RoDate.today())
        val s = OrderListUiState(
            orders = listOf(
                order("a", dueDate = today),
                order("b", dueDate = today, status = "LIVRATA"),
                order("c", dueDate = "2020-01-01"),
            ),
            hasLoaded = true,
            statusCounts = mapOf("NOUA" to 3, "IN_PREGATIRE" to 2, "LIVRATA" to 9, "ANULATA" to 1),
        )
        assertThat(s.summary).isEqualTo("5 active · 1 ies azi")
        assertThat(s.copy(search = "x").summary).isEqualTo("5 active")
        assertThat(OrderListUiState().summary).isNull()
    }

    @Test fun `switching to Livrari reloads with the view and sorts by delivery day`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("a")))
        val today = RoDate.today()
        coEvery { repo.getOrders(page = 1, search = null, view = "livrari", statuses = NOUA_ONLY) } returns page(listOf(
            order("past", dueDate = RoDate.isoDay(today.minusDays(3))),
            order("undated"),
            order("future", dueDate = RoDate.isoDay(today.plusDays(2))),
        ))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        val firstFocus = vm.uiState.value.focusToken
        vm.setView(OrderView.PREGATIRI)
        advanceUntilIdle()
        val s = vm.uiState.value
        assertThat(s.view).isEqualTo(OrderView.PREGATIRI)
        assertThat(s.orders.map { it.id }).containsExactly("future", "undated", "past").inOrder()
        assertThat(s.focusToken).isGreaterThan(firstFocus)
        store.setView(OrderView.INTRARI)
    }

    @Test fun `delivery method filter is sent only with the shop feature on`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("a")))
        io.mockk.every { branding.wooDeliveryEnabled } returns true
        coEvery { repo.getDeliveryMethods() } returns listOf(DeliveryMethodDto(name = "Ridicare Napoca 15", count = 1))
        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = NOUA_ONLY, deliveryMethod = "Ridicare Napoca 15") } returns
            page(listOf(order("napoca")))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        vm.selectDeliveryFilter(DeliveryFilter.Method("Ridicare Napoca 15"))
        advanceUntilIdle()
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("napoca")
        store.setFilter(DeliveryFilter.All)
    }

    @Test fun `Livrare sends deliveryKind DELIVERY and tapping it again goes back to Toate`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("a")))
        io.mockk.every { branding.wooDeliveryEnabled } returns true
        coEvery { repo.getDeliveryMethods() } returns listOf(
            DeliveryMethodDto(name = "Livrare în Cluj-Napoca", kind = "DELIVERY", count = 2),
        )
        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = NOUA_ONLY, deliveryMethod = null, deliveryKind = "DELIVERY") } returns
            page(listOf(order("livrare")))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        vm.selectDeliveryFilter(DeliveryFilter.Delivery)
        advanceUntilIdle()
        assertThat(vm.uiState.value.deliveryFilter).isEqualTo(DeliveryFilter.Delivery)
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("livrare")
        vm.selectDeliveryFilter(DeliveryFilter.Delivery)
        advanceUntilIdle()
        assertThat(vm.uiState.value.deliveryFilter).isEqualTo(DeliveryFilter.All)
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("a")
    }

    @Test fun `refresh re-fetches methods and a vanished method falls back to Toate`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("a")))
        io.mockk.every { branding.wooDeliveryEnabled } returns true
        coEvery { repo.getDeliveryMethods() } returns listOf(DeliveryMethodDto(name = "Ridicare Napoca 15", count = 1))
        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = NOUA_ONLY, deliveryMethod = "Ridicare Napoca 15") } returns
            page(listOf(order("napoca")))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        vm.selectDeliveryFilter(DeliveryFilter.Method("Ridicare Napoca 15"))
        advanceUntilIdle()
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("napoca")

        coEvery { repo.getDeliveryMethods() } returns listOf(DeliveryMethodDto(name = "Ridicare Altundeva", count = 1))
        vm.refresh()
        advanceUntilIdle()
        assertThat(store.methods.value.map { it.name }).containsExactly("Ridicare Altundeva")
        assertThat(vm.uiState.value.deliveryFilter).isEqualTo(DeliveryFilter.All)
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("a")
        coVerify(atLeast = 2) { repo.getDeliveryMethods() }
    }

    @Test fun `defaults - Pregatiri view and only Noua, sent as view=livrari and statuses=NOUA`() = runTest(main.dispatcher) {
        val fresh = OrdersFilterStore(repo, branding)
        assertThat(fresh.view.value).isEqualTo(OrderView.PREGATIRI)
        assertThat(fresh.statuses.value).containsExactly(OrderStatus.NOUA)
        assertThat(fresh.statusesCustomized).isFalse()
        coEvery { repo.getOrders(page = 1, search = null, view = "livrari", statuses = NOUA_ONLY) } returns page(listOf(order("n")))
        val vm = OrderListViewModel(repo, fresh)
        advanceUntilIdle()
        assertThat(vm.uiState.value.view).isEqualTo(OrderView.PREGATIRI)
        assertThat(vm.uiState.value.statuses).containsExactly(OrderStatus.NOUA)
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("n")
        coVerify { repo.getOrders(page = 1, search = null, view = "livrari", statuses = NOUA_ONLY) }
    }

    @Test fun `status menu - adding a status reloads with the comma list, Toate sends all`() = runTest(main.dispatcher) {
        stubPage(1, listOf(order("a")))
        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = listOf("NOUA", "PREGATITA")) } returns
            page(listOf(order("a"), order("p", status = "PREGATITA")))
        val vm = OrderListViewModel(repo, store)
        advanceUntilIdle()
        vm.toggleStatus(OrderStatus.PREGATITA)
        advanceUntilIdle()
        assertThat(vm.uiState.value.statuses).containsExactly(OrderStatus.NOUA, OrderStatus.PREGATITA)
        assertThat(vm.uiState.value.orders.map { it.id }).containsExactly("a", "p")
        assertThat(store.statusesCustomized).isTrue()

        coEvery { repo.getOrders(page = 1, search = null, view = "intrari", statuses = OrderStatus.entries.map { it.name }) } returns
            page(listOf(order("a")))
        vm.toggleAllStatuses()
        advanceUntilIdle()
        coVerify { repo.getOrders(page = 1, search = null, view = "intrari", statuses = OrderStatus.entries.map { it.name }) }
        vm.toggleAllStatuses() // again = back to the default
        assertThat(store.statuses.value).containsExactly(OrderStatus.NOUA)
    }
}
