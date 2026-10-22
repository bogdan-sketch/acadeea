package com.horae.app.ui.dashboard

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.api.DashboardApi
import com.horae.app.data.remote.api.TaskApi
import com.horae.app.data.remote.dto.DashboardExpiringDto
import com.horae.app.data.remote.dto.DashboardOrderDto
import com.horae.app.data.remote.dto.DashboardRecentTaskDto
import com.horae.app.data.remote.dto.DashboardStatsResponse
import com.horae.app.data.remote.dto.LowStockMaterialDto
import com.horae.app.data.repository.DashboardRepository
import com.horae.app.data.repository.LocationRepository
import com.horae.app.testutil.Fixtures.location
import com.horae.app.testutil.Fixtures.page
import com.horae.app.testutil.Fixtures.task
import com.horae.app.testutil.MainDispatcherRule
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import java.io.IOException

/** Panou: active tasks only, Comenzi azi count, best-effort extras that never blank the screen. */
@OptIn(ExperimentalCoroutinesApi::class)
class DashboardTest {

    @get:Rule val main = MainDispatcherRule()

    private fun recent(id: String, status: String) =
        DashboardRecentTaskDto(id = id, recipeName = "R$id", status = status, targetQuantity = 1.0, targetUnit = "BUCATI", createdAt = "2026-10-17T06:00:00Z")

    private fun stats(
        recentTasks: List<DashboardRecentTaskDto> = emptyList(),
        todayOrdersDue: Int = 4,
        low: List<LowStockMaterialDto> = emptyList(),
        lowCount: Int? = null,
        outCount: Int? = null,
    ) = DashboardStatsResponse(
        taskCounts = mapOf("IN_LUCRU" to 2), orderCounts = emptyMap(), lowStockMaterials = low,
        recentTasks = recentTasks, todayTasksDue = 3, todayOrdersDue = todayOrdersDue,
        lowStockCount = lowCount, outOfStockCount = outCount, todayDeliveries = 3, todayPickups = 1,
    )

    // ── view model ───────────────────────────────────────────────────────

    private val repo = mockk<DashboardRepository>()
    private val locations = mockk<LocationRepository>()

    private fun TestScope.started(canSeeOrders: Boolean = true, canSeeStock: Boolean = true): DashboardViewModel {
        coEvery { locations.getLocations() } returns listOf(location("l1"), location("l2", active = false))
        return DashboardViewModel(repo, locations, mockk<BrandingManager>(relaxed = true)).also {
            it.start(canSeeOrders, canSeeStock)
            advanceUntilIdle()
        }
    }

    private fun stubAll() {
        coEvery { repo.stats(any()) } returns stats(recentTasks = listOf(recent("old", "FINALIZAT")))
        coEvery { repo.activeTasks() } returns listOf(recent("t1", "IN_LUCRU"), recent("t2", "DE_FACUT"))
        coEvery { repo.todayOrders() } returns listOf(DashboardOrderDto(id = "o1", status = "NOUA"))
        coEvery { repo.expiringSoon(3) } returns listOf(DashboardExpiringDto("lot1", "Smântână", 1.0, "2026-10-19", 2))
    }

    @Test fun `Producție acum shows only the active tasks`() = runTest(main.dispatcher) {
        stubAll()
        val vm = started()
        assertThat(vm.activeTasks.map { it.id }).containsExactly("t1", "t2").inOrder()
        assertThat(vm.activeTasks.map { it.status }).doesNotContain("FINALIZAT")
    }

    @Test fun `when tasks fail, falls back to the active ones among recent tasks`() = runTest(main.dispatcher) {
        stubAll()
        coEvery { repo.stats(any()) } returns stats(recentTasks = listOf(
            recent("a", "FINALIZAT"), recent("b", "BLOCAT"), recent("c", "ANULAT"), recent("d", "DE_FACUT"), recent("e", "IN_LUCRU"),
        ))
        coEvery { repo.activeTasks() } throws IOException()
        val vm = started()
        assertThat(vm.activeTasks.map { it.id }).containsExactly("b", "d", "e").inOrder()
    }

    @Test fun `Comenzi azi count comes from the stats`() = runTest(main.dispatcher) {
        stubAll()
        coEvery { repo.stats(any()) } returns stats(todayOrdersDue = 7)
        val vm = started()
        assertThat(vm.stats!!.todayOrdersDue).isEqualTo(7)
        assertThat(vm.stats!!.todayPickups).isEqualTo(1)
        assertThat(vm.stats!!.todayDeliveries).isEqualTo(3)
        assertThat(vm.todayOrders.map { it.id }).containsExactly("o1")
        assertThat(vm.expiringSoon.map { it.materialTitle }).containsExactly("Smântână")
        assertThat(vm.locations.map { it.id }).containsExactly("l1") // active only
        assertThat(vm.isRefreshing).isFalse()
    }

    @Test fun `roles without orders or stock never ask for them`() = runTest(main.dispatcher) {
        stubAll()
        val vm = started(canSeeOrders = false, canSeeStock = false)
        assertThat(vm.todayOrders).isEmpty()
        assertThat(vm.expiringSoon).isEmpty()
        coVerify(exactly = 0) { repo.todayOrders() }
        coVerify(exactly = 0) { repo.expiringSoon(any()) }
    }

    @Test fun `stock alert totals prefer the uncapped API counts`() = runTest(main.dispatcher) {
        stubAll()
        val capped = List(3) { LowStockMaterialDto("m$it", "M", "OUT_OF_STOCK", 0.0, 1.0) } +
            LowStockMaterialDto("x", "X", "LOW_STOCK", 1.0, 2.0)
        coEvery { repo.stats(any()) } returns stats(low = capped, lowCount = 12, outCount = 30)
        val vm = started()
        assertThat(vm.outOfStockCount).isEqualTo(30)
        assertThat(vm.lowStockCount).isEqualTo(12)
        coEvery { repo.stats(any()) } returns stats(low = capped)
        vm.refresh()
        advanceUntilIdle()
        assertThat(vm.outOfStockCount).isEqualTo(3)
        assertThat(vm.lowStockCount).isEqualTo(1)
    }

    @Test fun `a failed refresh keeps what was shown and reports in Romanian`() = runTest(main.dispatcher) {
        stubAll()
        val vm = started()
        coEvery { repo.stats(any()) } throws IOException()
        coEvery { repo.todayOrders() } throws IOException()
        vm.refresh()
        advanceUntilIdle()
        assertThat(vm.stats).isNotNull()
        assertThat(vm.todayOrders.map { it.id }).containsExactly("o1")
        assertThat(vm.error).isEqualTo("Nu există conexiune la internet. Încearcă din nou.")
        vm.dismissError()
        assertThat(vm.error).isNull()
    }

    @Test fun `choosing a location reloads stats for it once`() = runTest(main.dispatcher) {
        stubAll()
        val vm = started()
        vm.selectLocation("l1")
        advanceUntilIdle()
        vm.selectLocation("l1")
        advanceUntilIdle()
        coVerify(exactly = 1) { repo.stats("l1") }
        assertThat(vm.selectedLocationId).isEqualTo("l1")
    }

    // ── repository ───────────────────────────────────────────────────────

    private val api = mockk<DashboardApi>()
    private val taskApi = mockk<TaskApi>()
    private val realRepo = DashboardRepository(api, taskApi)

    @Test fun `active tasks merge În lucru, Blocat, De făcut in that order`() = runTest {
        coEvery { taskApi.getTasks(match { it["status"] == "IN_LUCRU" }) } returns page(listOf(task("w", "IN_LUCRU")))
        coEvery { taskApi.getTasks(match { it["status"] == "BLOCAT" }) } returns page(listOf(task("b", "BLOCAT"), task("w", "IN_LUCRU")))
        coEvery { taskApi.getTasks(match { it["status"] == "DE_FACUT" }) } returns page((1..10).map { task("d$it") })
        val list = realRepo.activeTasks(limit = 4)
        assertThat(list.map { it.id }).containsExactly("w", "b", "d1", "d2").inOrder()
        assertThat(list.map { it.status }).containsNoneOf("FINALIZAT", "ANULAT")
        coVerify(exactly = 0) { taskApi.getTasks(match { it["status"] == "FINALIZAT" }) }
    }

    @Test fun `active task rows carry the custom name`() = runTest {
        coEvery { taskApi.getTasks(any()) } returns page(emptyList())
        coEvery { taskApi.getTasks(match { it["status"] == "IN_LUCRU" }) } returns page(listOf(task("w", "IN_LUCRU", title = "Choux nuntă")))
        assertThat(realRepo.activeTasks().single().displayName).isEqualTo("Choux nuntă")
    }

    @Test fun `today's orders drop cancelled, dedupe and sort newest first`() = runTest {
        coEvery { api.getCalendar(any(), any()) } returns mapOf(
            "d" to listOf(
                DashboardOrderDto(id = "a", orderNumber = "WOO-9", status = "NOUA", createdAt = "2026-10-17T08:00:00Z"),
                DashboardOrderDto(id = "x", status = "ANULATA", createdAt = "2026-10-17T09:00:00Z"),
                DashboardOrderDto(id = "b", orderNumber = "WOO-10", status = "NOUA", createdAt = "2026-10-17T08:00:00Z"),
                DashboardOrderDto(id = "c", status = "PREGATITA", createdAt = "2026-10-17T10:00:00Z"),
                DashboardOrderDto(id = "a", orderNumber = "WOO-9", status = "NOUA", createdAt = "2026-10-17T08:00:00Z"),
            ),
        )
        assertThat(realRepo.todayOrders().map { it.id }).containsExactly("c", "b", "a").inOrder()
    }

    @Test fun `expiring soon drops already-expired lots and sorts by date`() = runTest {
        coEvery { api.getExpiring(3) } returns listOf(
            DashboardExpiringDto("1", "Lapte", 1.0, "2026-10-19", 2),
            DashboardExpiringDto("2", "Ouă", 1.0, "2026-10-16", -1),
            DashboardExpiringDto("3", "Unt", 1.0, "2026-10-17", 0),
        )
        assertThat(realRepo.expiringSoon().map { it.materialTitle }).containsExactly("Unt", "Lapte").inOrder()
    }
}
