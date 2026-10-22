package com.horae.app.ui.dashboard

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.DashboardExpiringDto
import com.horae.app.data.remote.dto.DashboardOrderDto
import com.horae.app.data.remote.dto.DashboardRecentTaskDto
import com.horae.app.data.remote.dto.DashboardStatsResponse
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.repository.DashboardRepository
import com.horae.app.data.repository.LocationRepository
import com.horae.app.ui.common.RequestGate
import com.horae.app.ui.common.runRefresh
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Fallback filter for "Producție acum" when /tasks fails (stats.recentTasks has closed ones too). */
private val ACTIVE_TASK_STATUSES = setOf("DE_FACUT", "IN_LUCRU", "BLOCAT")

/**
 * Panou (Acasă), like iOS `DashboardViewModel`: stats for the chosen location, today's
 * orders and lots expiring in 3 days. A reload never blanks what is on screen.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val repository: DashboardRepository,
    private val locationRepository: LocationRepository,
    /** Org name + logos for the Panou wordmark. */
    val brandingManager: BrandingManager,
) : ViewModel() {

    /** Uncapped totals from the API, else counted from the (capped) alert list. */
    val outOfStockCount: Int
        get() = stats?.let { it.outOfStockCount ?: it.lowStockMaterials.count { m -> m.status == "OUT_OF_STOCK" } } ?: 0
    val lowStockCount: Int
        get() = stats?.let { it.lowStockCount ?: it.lowStockMaterials.count { m -> m.status == "LOW_STOCK" } } ?: 0

    var stats by mutableStateOf<DashboardStatsResponse?>(null)
        private set
    /** "Producție acum": active tasks only. */
    var activeTasks by mutableStateOf<List<DashboardRecentTaskDto>>(emptyList())
        private set
    var todayOrders by mutableStateOf<List<DashboardOrderDto>>(emptyList())
        private set
    var expiringSoon by mutableStateOf<List<DashboardExpiringDto>>(emptyList())
        private set
    var locations by mutableStateOf<List<LocationResponse>>(emptyList())
        private set
    /** null = "Toate". */
    var selectedLocationId by mutableStateOf<String?>(null)
        private set
    var isRefreshing by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    private var canSeeOrders = true
    private var canSeeStock = true
    private var started = false
    private val gate = RequestGate()

    /** Called once by the screen with what the role may read. */
    fun start(canSeeOrders: Boolean, canSeeStock: Boolean) {
        this.canSeeOrders = canSeeOrders
        this.canSeeStock = canSeeStock
        if (started) return
        started = true
        viewModelScope.launch {
            runRefresh(onError = {}) { locations = locationRepository.getLocations().filter { it.isActive } }
        }
        refresh()
    }

    fun selectLocation(id: String?) {
        if (id == selectedLocationId) return
        selectedLocationId = id
        refresh()
    }

    fun dismissError() {
        error = null
    }

    fun refresh() {
        viewModelScope.launch {
            val token = gate.next()
            isRefreshing = true
            val locationId = selectedLocationId
            val ordersJob = async {
                if (canSeeOrders) runRefresh(onError = {}) { repository.todayOrders() } else emptyList()
            }
            val tasksJob = async { runRefresh(onError = {}) { repository.activeTasks() } }
            val expiringJob = async {
                if (canSeeStock) runRefresh(onError = {}) { repository.expiringSoon(3) } else emptyList()
            }
            val fresh = runRefresh(onError = { e -> if (gate.isCurrent(token)) error = ApiErrors.userMessage(e) }) {
                repository.stats(locationId)
            }
            val orders = ordersJob.await()
            val expiring = expiringJob.await()
            val active = tasksJob.await()
            if (gate.isCurrent(token)) {
                if (fresh != null) stats = fresh
                // Active tasks come from /tasks; if that fails, fall back to the active ones
                // among the stats' recent tasks.
                when {
                    active != null -> activeTasks = active
                    fresh != null -> activeTasks = fresh.recentTasks.filter { it.status in ACTIVE_TASK_STATUSES }
                }
                // Best-effort extras: a failure keeps what was shown.
                orders?.let { todayOrders = it }
                expiring?.let { expiringSoon = it }
                isRefreshing = false
            }
        }
    }
}
