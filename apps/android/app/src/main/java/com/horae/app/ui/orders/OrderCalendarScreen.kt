package com.horae.app.ui.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.repository.OrderRepository
import com.horae.app.domain.model.OrderStatus
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.StatusColors
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

enum class CalendarViewMode(val label: String) { DAY("Zi"), WEEK("Săptămână"), MONTH("Lună") }

data class OrderCalendarUiState(
    val calendar: Map<String, List<OrderResponse>> = emptyMap(),
    /** "Azi" (Zi) by default (1.37.0). */
    val viewMode: CalendarViewMode = CalendarViewMode.DAY,
    /** Pregătiri (by delivery day, undated = today; default) | Intrări (by day placed) — shared with the list. */
    val view: OrderView = OrderView.PREGATIRI,
    /** Status filter shared with the list (default Nouă). */
    val statuses: Set<OrderStatus> = DEFAULT_ORDER_STATUSES,
    val deliveryFilter: DeliveryFilter = DeliveryFilter.All,
    val currentDate: LocalDate = com.horae.app.ui.common.RoDate.today(),
    val isLoading: Boolean = true,
    val error: String? = null,
) {
    val sortedDates: List<String> get() = calendar.keys.sorted()
    val totalOrders: Int get() = calendar.values.sumOf { it.size }

    val dateRange: Pair<LocalDate, LocalDate>
        get() = when (viewMode) {
            CalendarViewMode.DAY -> currentDate to currentDate
            CalendarViewMode.WEEK -> {
                val start = currentDate.with(DayOfWeek.MONDAY)
                start to start.plusDays(6)
            }
            CalendarViewMode.MONTH -> {
                val start = currentDate.withDayOfMonth(1)
                start to start.plusMonths(1).minusDays(1)
            }
        }

    val rangeLabel: String
        get() {
            val ro = Locale("ro")
            return when (viewMode) {
                CalendarViewMode.DAY ->
                    currentDate.format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", ro))
                        .replaceFirstChar { it.uppercase(ro) }
                CalendarViewMode.WEEK -> {
                    val (start, end) = dateRange
                    val s = start.format(DateTimeFormatter.ofPattern("d MMM", ro))
                    val e = end.format(DateTimeFormatter.ofPattern("d MMM yyyy", ro))
                    "$s — $e"
                }
                CalendarViewMode.MONTH ->
                    currentDate.format(DateTimeFormatter.ofPattern("MMMM yyyy", ro))
                        .replaceFirstChar { it.uppercase(ro) }
            }
        }
}

@HiltViewModel
class OrderCalendarViewModel @Inject constructor(
    private val repository: OrderRepository,
    private val filters: OrdersFilterStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        OrderCalendarUiState(view = filters.view.value, statuses = filters.statuses.value, deliveryFilter = filters.activeFilter),
    )
    val uiState: StateFlow<OrderCalendarUiState> = _uiState.asStateFlow()

    val deliveryMethods: StateFlow<List<com.horae.app.data.remote.dto.DeliveryMethodDto>> = filters.methods
    val wooDeliveryEnabled: Boolean get() = filters.wooDeliveryEnabled
    val methodLabels: Map<String, String> get() = filters.labels

    private var loadJob: kotlinx.coroutines.Job? = null

    init {
        load()
        viewModelScope.launch {
            kotlinx.coroutines.flow.combine(filters.view, filters.statuses, filters.filter) { v, st, _ -> Triple(v, st, filters.activeFilter) }
                .drop(1)
                .distinctUntilChanged()
                .collect { (v, st, m) ->
                    _uiState.update { it.copy(view = v, statuses = st, deliveryFilter = m) }
                    load()
                }
        }
    }

    fun setView(view: OrderView) = filters.setView(view)

    fun toggleStatus(status: OrderStatus) = filters.toggleStatus(status)

    fun toggleAllStatuses() = filters.toggleAllStatuses()

    /** Chip tap (tapping the selected chip again = Toate). */
    fun selectDeliveryFilter(filter: DeliveryFilter) = filters.select(filter)

    /** Screen re-appear: re-fetch the delivery methods. */
    fun refreshMethods() {
        viewModelScope.launch { filters.refreshMethods() }
    }

    fun load() {
        loadJob?.cancel()
        // Every (re)load re-fetches the methods too (renamed / re-kinded / gone → Toate).
        viewModelScope.launch { filters.refreshMethods() }
        loadJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val st = _uiState.value
            val (from, to) = st.dateRange
            val fmt = DateTimeFormatter.ISO_LOCAL_DATE
            try {
                val cal = repository.getCalendar(
                    from.format(fmt), to.format(fmt), st.statuses.apiValues(),
                    view = st.view.apiValue,
                    deliveryMethod = st.deliveryFilter.methodName, deliveryKind = st.deliveryFilter.kind,
                )
                _uiState.update { it.copy(calendar = cal, isLoading = false) }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcare")) }
            }
        }
    }

    fun setViewMode(mode: CalendarViewMode) {
        _uiState.update { it.copy(viewMode = mode) }
        load()
    }

    fun navigate(direction: Long) {
        _uiState.update {
            val next = when (it.viewMode) {
                CalendarViewMode.DAY -> it.currentDate.plusDays(direction)
                CalendarViewMode.WEEK -> it.currentDate.plusWeeks(direction)
                CalendarViewMode.MONTH -> it.currentDate.plusMonths(direction)
            }
            it.copy(currentDate = next)
        }
        load()
    }

    fun goToday() {
        _uiState.update { it.copy(currentDate = com.horae.app.ui.common.RoDate.today()) }
        load()
    }

    fun dismissError() = _uiState.update { it.copy(error = null) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderCalendarScreen(
    navController: NavController,
    role: com.horae.app.domain.model.UserRole = com.horae.app.domain.model.UserRole.ADMINISTRATOR,
    viewModel: OrderCalendarViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val methods by viewModel.deliveryMethods.collectAsState()
    val methodLabels = androidx.compose.runtime.remember(methods) { viewModel.methodLabels }

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }
    // Back on screen (e.g. from an order) → fresh delivery methods.
    androidx.lifecycle.compose.LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) { viewModel.refreshMethods() }

    Scaffold(
        topBar = {
            TopAppBar(
                windowInsets = androidx.compose.foundation.layout.WindowInsets(0),
                title = { Text("Calendar comenzi", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                actions = {
                    OrderStatusFilterButton(
                        selected = state.statuses,
                        onToggle = viewModel::toggleStatus,
                        onToggleAll = viewModel::toggleAllStatuses,
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        // Range controls + labels collapse on scroll down (back on scroll up); the Pregătiri |
        // Intrări switch + method chips (shared with the list) stay pinned (1.39.0).
        com.horae.app.ui.common.CollapsingHeaderLayout(
            modifier = Modifier.fillMaxSize().padding(pad),
            pinned = {
                OrdersTopControls(
                    view = state.view,
                    onView = viewModel::setView,
                    showMethods = viewModel.wooDeliveryEnabled,
                    methods = methods,
                    selectedFilter = state.deliveryFilter,
                    onSelectFilter = viewModel::selectDeliveryFilter,
                    canEditNames = role == com.horae.app.domain.model.UserRole.ADMINISTRATOR,
                    modifier = Modifier.padding(top = 4.dp),
                )
                OrderStatusHint(state.statuses, Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 4.dp))
            },
            header = {
                // Range: Azi (default) / Săptămână / Lună
                SingleChoiceSegmentedButtonRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .tutorialAnchor("calendar.myDay.calendar"),
                ) {
                    CalendarViewMode.entries.forEachIndexed { index, mode ->
                        SegmentedButton(
                            selected = state.viewMode == mode,
                            onClick = { viewModel.setViewMode(mode) },
                            shape = SegmentedButtonDefaults.itemShape(index, CalendarViewMode.entries.size),
                        ) { Text(mode.label, maxLines = 1, softWrap = false) }
                    }
                }

                // ‹ Azi ›
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { viewModel.navigate(-1) }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Înapoi")
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = viewModel::goToday) { Text("Azi") }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = { viewModel.navigate(1) }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Înainte")
                    }
                }

                Text(
                    state.rangeLabel,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                Text(
                    "${state.totalOrders} ${if (state.totalOrders == 1) "comandă" else "comenzi"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            },
        ) {
            when {
                state.isLoading -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }

                state.calendar.isEmpty() -> {
                    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                        Text(
                            if (state.view == OrderView.PREGATIRI) "Nicio comandă de pregătit în acest interval" else "Nicio comandă primită în acest interval",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                else -> androidx.compose.runtime.CompositionLocalProvider(LocalDeliveryMethodLabels provides methodLabels) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        state.sortedDates.forEach { date ->
                            val orders = state.calendar[date].orEmpty()
                            item(key = "hdr-$date") {
                                Text(
                                    formatDayHeader(date),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(top = 6.dp, bottom = 2.dp),
                                )
                            }
                            orders.forEach { order ->
                                item(key = order.id) {
                                    CalendarOrderRow(order) {
                                        navController.navigate(Screen.OrderDetail.createRoute(order.id))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Same lines as the Comenzi list: products, quantities, customer; status chip; no number, no time. */
@Composable
private fun CalendarOrderRow(order: OrderResponse, onClick: () -> Unit) {
    OrderListRow(order = order, onClick = onClick)
}

private fun formatDayHeader(isoDate: String): String =
    runCatching { com.horae.app.ui.common.RoDate.longDay(LocalDate.parse(isoDate)) }.getOrDefault(isoDate)
