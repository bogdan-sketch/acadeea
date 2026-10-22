package com.horae.app.data.repository

import com.horae.app.data.remote.api.DashboardApi
import com.horae.app.data.remote.api.TaskApi
import com.horae.app.data.remote.dto.DashboardExpiringDto
import com.horae.app.data.remote.dto.DashboardOrderDto
import com.horae.app.data.remote.dto.DashboardRecentTaskDto
import com.horae.app.data.remote.dto.DashboardStatsResponse
import com.horae.app.ui.common.RoDate
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import javax.inject.Inject
import javax.inject.Singleton

/** Panou (home) data: stats, today's orders and lots expiring soon. */
@Singleton
class DashboardRepository @Inject constructor(
    private val api: DashboardApi,
    private val taskApi: TaskApi,
) {
    suspend fun stats(locationId: String?): DashboardStatsResponse = api.getStats(locationId)

    /** Lots expiring in the next [days] days, soonest first (already-expired ones left out). */
    suspend fun expiringSoon(days: Int = 3): List<DashboardExpiringDto> =
        api.getExpiring(days)
            .filter { it.daysUntilExpiry >= 0 }
            .sortedBy { it.expiryDate }

    /** Today's orders without the cancelled ones, newest first (createdAt → number → id). */
    suspend fun todayOrders(): List<DashboardOrderDto> {
        val today = RoDate.isoDay(RoDate.today())
        return api.getCalendar(today, today).values.flatten()
            .filter { it.status != "ANULATA" }
            .distinctBy { it.id }
            .sortedWith(
                compareByDescending<DashboardOrderDto> { RoDate.parse(it.createdAt) }
                    .thenByDescending { it.orderNumber.filter(Char::isDigit).take(18).toLongOrNull() ?: 0L }
                    .thenByDescending { it.id },
            )
    }

    /**
     * "Producție acum": the active tasks (În lucru, then Blocat, then De făcut), not the
     * stats' last-5-recent list (which mixes in closed tasks). The tasks API filters by one
     * status at a time, so the three are fetched in parallel and merged.
     */
    suspend fun activeTasks(limit: Int = 6): List<DashboardRecentTaskDto> = coroutineScope {
        ACTIVE_ORDER.map { status ->
            async { taskApi.getTasks(mapOf("page" to "1", "limit" to limit.toString(), "status" to status)).data }
        }.awaitAll()
            .flatten()
            .distinctBy { it.id }
            .take(limit)
            .map { t ->
                DashboardRecentTaskDto(
                    id = t.id,
                    recipeName = t.recipeName,
                    displayName = t.title?.takeIf { it.isNotBlank() },
                    status = t.status,
                    targetQuantity = t.targetQuantity,
                    targetUnit = t.targetUnit,
                    assignedToName = t.assignedTo?.fullName,
                    createdAt = t.createdAt,
                )
            }
    }

    private companion object {
        val ACTIVE_ORDER = listOf("IN_LUCRU", "BLOCAT", "DE_FACUT")
    }
}
