package com.horae.app.ui.orders

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.DeliveryMethodDto
import com.horae.app.data.remote.dto.OrderItemResponseDto
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.remote.dto.OrderUserDto
import com.horae.app.data.repository.OrderRepository
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.OrderStatus
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.AccentGradientBackground
import com.horae.app.ui.common.CollapsingHeaderLayout
import com.horae.app.ui.common.BulkActionCatalog
import com.horae.app.ui.common.BulkDeleteResultDialog
import com.horae.app.ui.common.BulkDeleteWarnings
import com.horae.app.ui.common.BulkOutcome
import com.horae.app.ui.common.BulkSelectBottomBar
import com.horae.app.ui.common.BulkSelectCheckbox
import com.horae.app.ui.common.BulkSelectInlineHeader
import com.horae.app.ui.common.BulkSelectionState
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HFab
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HScreenTitle
import com.horae.app.ui.common.HSearchField
import com.horae.app.ui.common.HStatusChip
import com.horae.app.ui.common.HoraeRefreshBox
import com.horae.app.ui.common.RequestGate
import com.horae.app.ui.common.rememberBulkSelectionState
import com.horae.app.ui.common.runRefresh
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

data class OrderListUiState(
    /** Always unique by id, sorted for [view] ([sortedFor]: Intrări newest first, Pregătiri by delivery day). */
    val orders: List<OrderResponse> = emptyList(),
    /** Pregătiri | Intrări (shared with the calendar via [OrdersFilterStore]). */
    val view: OrderView = OrderView.PREGATIRI,
    /** Status filter (default Nouă; shared with the calendar via [OrdersFilterStore]). */
    val statuses: Set<OrderStatus> = DEFAULT_ORDER_STATUSES,
    /** Selected delivery-method chip (Toate / Livrare / one method). */
    val deliveryFilter: DeliveryFilter = DeliveryFilter.All,
    /** Bumped when a first load / view or filter switch lands: the list scrolls "Azi" to the top. */
    val focusToken: Int = 0,
    /** First load with nothing on screen yet. */
    val isLoading: Boolean = false,
    /** Pull-to-refresh / search reload — rows stay on screen. */
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val hasLoaded: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val statusCounts: Map<String, Int> = emptyMap(),
    val hasNextPage: Boolean = false,
    val page: Int = 1,
    /** Select & delete (bulk) — in flight / last result. */
    val isPreviewing: Boolean = false,
    val bulkPreview: BulkDeletePreviewDto? = null,
    val isDeleting: Boolean = false,
    val isActing: Boolean = false,
    val bulkResult: BulkOutcome? = null,
) {
    /** Eyebrow: "38 active · 3 ies azi". */
    val summary: String?
        get() {
            val parts = mutableListOf<String>()
            if (statusCounts.isNotEmpty()) {
                val active = OrderStatus.entries.filter { it.isOpen }.sumOf { statusCounts[it.name] ?: 0 }
                parts += "$active active"
            }
            if (search.isBlank() && hasLoaded) {
                val today = com.horae.app.ui.common.RoDate.today()
                val leaving = orders.count {
                    it.statusEnum.isOpen && com.horae.app.ui.common.RoDate.calendarDay(it.dueDate) == today
                }
                parts += "$leaving ies azi"
            }
            return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
        }
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@OptIn(FlowPreview::class)
@HiltViewModel
class OrderListViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val filters: OrdersFilterStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        OrderListUiState(view = filters.view.value, statuses = filters.statuses.value, deliveryFilter = filters.activeFilter),
    )
    val uiState: StateFlow<OrderListUiState> = _uiState.asStateFlow()

    private val searchQuery = MutableStateFlow("")

    /**
     * Every list request takes a token; only the latest one may write. A load-more still in
     * flight when the user pulls to refresh or types a search is dropped instead of being
     * appended to the new list (iOS `generation`).
     */
    private val gate = RequestGate()

    /** Shop delivery methods (chips) — shared with the calendar. */
    val deliveryMethods: StateFlow<List<DeliveryMethodDto>> = filters.methods

    val wooDeliveryEnabled: Boolean get() = filters.wooDeliveryEnabled

    /** name → short label for the rows (empty while the feature is off). */
    val methodLabels: Map<String, String> get() = filters.labels

    init {
        reload(initial = true, focus = true)
        loadStatusCounts()
        viewModelScope.launch {
            searchQuery.drop(1).debounce(350).distinctUntilChanged().collectLatest { reload() }
        }
        // View / statuses / method changed here or in the calendar → reload and focus "Azi".
        viewModelScope.launch {
            combine(filters.view, filters.statuses, filters.filter) { v, st, _ -> Triple(v, st, filters.activeFilter) }
                .drop(1)
                .distinctUntilChanged()
                .collectLatest { (v, st, m) ->
                    _uiState.update { it.copy(view = v, statuses = st, deliveryFilter = m) }
                    reload(focus = true)
                }
        }
    }

    fun setView(view: OrderView) = filters.setView(view)

    /** Status menu: toggle one status (never empty — the last one off = back to Nouă). */
    fun toggleStatus(status: OrderStatus) = filters.toggleStatus(status)

    /** Status menu "Toate" (again = back to the default). */
    fun toggleAllStatuses() = filters.toggleAllStatuses()

    /** Chip tap (tapping the selected chip again = Toate). */
    fun selectDeliveryFilter(filter: DeliveryFilter) = filters.select(filter)

    /** Screen re-appear: re-fetch the delivery methods (labels / kinds may have changed). */
    fun refreshMethods() {
        viewModelScope.launch { filters.refreshMethods() }
    }

    private suspend fun fetchPage(page: Int, search: String?) = _uiState.value.let { st ->
        orderRepository.getOrders(page = page, search = search, view = st.view.apiValue,
            deliveryMethod = st.deliveryFilter.methodName, deliveryKind = st.deliveryFilter.kind,
            statuses = st.statuses.apiValues())
    }

    private fun loadStatusCounts() {
        viewModelScope.launch {
            runCatching { orderRepository.getStatusCounts() }
                .onSuccess { counts -> _uiState.update { it.copy(statusCounts = counts) } }
        }
    }

    /** Pull-to-refresh: rows stay, counts refresh too. */
    fun refresh() {
        reload()
        loadStatusCounts()
    }

    /**
     * Page 1 again; the current rows stay on screen until the answer arrives (R9). With
     * [focus], Pregătiri keeps loading pages until "Azi" (or older) is in the list, then bumps
     * [OrderListUiState.focusToken] so the screen scrolls there.
     */
    fun reload(initial: Boolean = false, focus: Boolean = false) {
        val token = gate.next()
        // Every (re)load re-fetches the methods too (renamed / re-kinded / gone → Toate).
        viewModelScope.launch { filters.refreshMethods() }
        viewModelScope.launch {
            _uiState.update {
                if (initial || it.orders.isEmpty()) it.copy(isLoading = true, isLoadingMore = false)
                else it.copy(isRefreshing = true, isLoadingMore = false)
            }
            val response = runRefresh(onError = { e ->
                Timber.e(e, "OrderListViewModel: reload failed")
                if (gate.isCurrent(token)) {
                    _uiState.update { it.copy(error = ApiErrors.userMessage(e, "Nu am putut încărca comenzile.")) }
                }
            }) {
                fetchPage(1, _uiState.value.search.takeIf { it.isNotBlank() })
            }
            if (!gate.isCurrent(token)) return@launch
            _uiState.update { state ->
                if (response == null) {
                    state.copy(isLoading = false, isRefreshing = false, hasLoaded = true)
                } else {
                    state.copy(
                        orders = response.data.uniqueById().sortedFor(state.view),
                        isLoading = false,
                        isRefreshing = false,
                        hasLoaded = true,
                        hasNextPage = response.hasNextPage,
                        page = 1,
                    )
                }
            }
            if (focus && response != null) {
                loadUntilToday(token)
                if (gate.isCurrent(token)) _uiState.update { it.copy(focusToken = it.focusToken + 1) }
            }
        }
    }

    /** Pregătiri starts with the furthest future: fetch more pages until today's section exists. */
    private suspend fun loadUntilToday(token: Long) {
        val today = com.horae.app.ui.common.RoDate.today()
        repeat(MAX_FOCUS_PAGES) {
            val st = _uiState.value
            if (st.view != OrderView.PREGATIRI || !st.hasNextPage) return
            if (st.orders.any { !it.deliveryDay(today).isAfter(today) }) return
            val next = st.page + 1
            val response = runRefresh(onError = { e -> Timber.e(e, "OrderListViewModel: focus page failed") }) {
                fetchPage(next, st.search.takeIf { it.isNotBlank() })
            } ?: return
            if (!gate.isCurrent(token)) return
            _uiState.update { s ->
                s.copy(
                    orders = (s.orders + response.data).uniqueById().sortedFor(s.view),
                    hasNextPage = response.hasNextPage,
                    page = next,
                )
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoading || state.isRefreshing || state.isLoadingMore || !state.hasNextPage) return
        val token = gate.next()
        val nextPage = state.page + 1
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMore = true) }
            val response = runRefresh(onError = { e ->
                Timber.e(e, "OrderListViewModel: loadMore failed")
                if (gate.isCurrent(token)) {
                    _uiState.update { it.copy(error = ApiErrors.userMessage(e, "Nu am putut încărca mai multe comenzi.")) }
                }
            }) {
                fetchPage(nextPage, state.search.takeIf { it.isNotBlank() })
            }
            if (!gate.isCurrent(token)) return@launch
            _uiState.update { s ->
                if (response == null) s.copy(isLoadingMore = false)
                else s.copy(
                    orders = (s.orders + response.data).uniqueById().sortedFor(s.view),
                    isLoadingMore = false,
                    hasNextPage = response.hasNextPage,
                    page = nextPage,
                )
            }
        }
    }

    fun onSearchChange(query: String) {
        _uiState.update { it.copy(search = query) }
        searchQuery.value = query
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /** Bulk delete the selected orders, then reload page 1 + status counts. */
    fun bulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true) }
            try {
                val result = orderRepository.bulkDelete(ids)
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, bulkResult = BulkOutcome.ofDelete(result)) }
                refresh()
            } catch (e: Exception) {
                Timber.e(e, "OrderListViewModel: bulkDelete failed")
                _uiState.update {
                    it.copy(isDeleting = false, bulkPreview = null, error = ApiErrors.userMessage(e, "Eroare la ștergere"))
                }
            }
        }
    }

    /** Step 1 of bulk delete: ask the API what else the selection would touch; the screen then confirms. */
    fun previewBulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isPreviewing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isPreviewing = true) }
            try {
                val preview = orderRepository.bulkDeletePreview(ids)
                _uiState.update { it.copy(isPreviewing = false, bulkPreview = preview) }
            } catch (e: Exception) {
                Timber.e(e, "OrderListViewModel: previewBulkDelete failed")
                _uiState.update { it.copy(isPreviewing = false, error = ApiErrors.userMessage(e, "Nu am putut verifica ce se șterge")) }
            }
        }
    }

    fun clearBulkPreview() {
        _uiState.update { it.copy(bulkPreview = null) }
    }

    /** Apply a bulk action (status / assign / …) to the selected rows, then reload. */
    fun bulkAction(ids: List<String>, action: String, params: Map<String, Any?>?) {
        if (ids.isEmpty() || _uiState.value.isActing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isActing = true) }
            try {
                val result = orderRepository.bulkAction(ids, action, params)
                _uiState.update { it.copy(isActing = false, bulkResult = BulkOutcome.ofAction(result)) }
                refresh()
            } catch (e: Exception) {
                Timber.e(e, "OrderListViewModel: bulkAction failed")
                _uiState.update { it.copy(isActing = false, error = ApiErrors.userMessage(e, "Eroare la aplicarea acțiunii")) }
            }
        }
    }

    fun clearBulkResult() {
        _uiState.update { it.copy(bulkResult = null) }
    }

    private companion object {
        const val MAX_FOCUS_PAGES = 10
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/** Set on the list's back-stack entry by [OrderCreateScreen] after a successful create. */
internal const val ORDERS_REFRESH_KEY = "orders.refresh"

/**
 * Comenzi: eyebrow + Fraunces title (status filter · calendar · stats · select), search, then the
 * pinned Pregătiri | Intrări switch + method chips + status hint, a day-grouped list, FAB for a new
 * order. Status filter = icon + sheet (default Nouă), never chips. Rows: products, quantities,
 * customer; never the order number, never the delivery time.
 */
@Composable
fun OrderListScreen(
    navController: NavController,
    role: UserRole = UserRole.ADMINISTRATOR,
    viewModel: OrderListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val methods by viewModel.deliveryMethods.collectAsState()
    val canCreate = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.ORDER)
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.ORDER)
    val canAct = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.ORDER)
    val canSelect = canDelete || canAct
    val bulk = rememberBulkSelectionState()

    // Back on screen (e.g. from an order / settings) → fresh delivery methods.
    androidx.lifecycle.compose.LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) { viewModel.refreshMethods() }

    // Back from "Comandă nouă": reload so the new order is on top.
    val entry = navController.currentBackStackEntry
    LaunchedEffect(entry) {
        entry?.savedStateHandle?.getStateFlow(ORDERS_REFRESH_KEY, false)?.collect { refresh ->
            if (refresh) {
                entry.savedStateHandle[ORDERS_REFRESH_KEY] = false
                viewModel.refresh()
            }
        }
    }

    BulkDeleteResultDialog(
        result = uiState.bulkResult,
        onDismiss = {
            viewModel.clearBulkResult()
            bulk.exit()
        },
    )

    Scaffold(
        // The app shell already pads for the system bars (B17: no second inset).
        contentWindowInsets = WindowInsets(0),
        containerColor = HoraeTheme.scheme.background,
        floatingActionButton = {
            if (canCreate && !bulk.isActive) {
                HFab(
                    contentDescription = "Comandă nouă",
                    onClick = { navController.navigate(OrdersRoutes.CREATE) },
                    modifier = Modifier.tutorialAnchor("orders.create.open"),
                )
            }
        },
        bottomBar = {
            if (bulk.isActive) {
                BulkSelectBottomBar(
                    state = bulk,
                    warning = BulkDeleteWarnings.ORDERS,
                    preview = uiState.bulkPreview,
                    isPreviewing = uiState.isPreviewing,
                    isDeleting = uiState.isDeleting,
                    onRequestPreview = viewModel::previewBulkDelete,
                    onDismissPreview = viewModel::clearBulkPreview,
                    onConfirmDelete = viewModel::bulkDelete,
                    canDelete = canDelete,
                    actions = BulkActionCatalog.orders,
                    canAct = canAct,
                    isActing = uiState.isActing,
                    onRunAction = viewModel::bulkAction,
                )
            }
        },
    ) { innerPadding ->
        AccentGradientBackground(Modifier.padding(innerPadding), showGradient = false) {
            // Head (title + actions, search) slides away on scroll down and is back on scroll up;
            // the Pregătiri | Intrări switch, the method chips and the status hint stay pinned,
            // outside the pull-to-refresh (1.39.0).
            CollapsingHeaderLayout(
                modifier = Modifier.fillMaxSize(),
                header = {
                    if (bulk.isActive) {
                        BulkSelectInlineHeader(state = bulk, allIds = uiState.orders.map { it.id }, modifier = Modifier.padding(top = 8.dp))
                    } else {
                        HScreenTitle(
                            title = "Comenzi",
                            eyebrow = uiState.summary,
                            modifier = Modifier.padding(start = 20.dp, end = 12.dp, top = 12.dp),
                            trailing = {
                                OrderStatusFilterButton(
                                    selected = uiState.statuses,
                                    onToggle = viewModel::toggleStatus,
                                    onToggleAll = viewModel::toggleAllStatuses,
                                )
                                HIconButton(Icons.Filled.CalendarMonth, "Calendar comenzi", { navController.navigate(OrdersRoutes.CALENDAR) })
                                HIconButton(Icons.Filled.BarChart, "Statistici comenzi", { navController.navigate(OrdersRoutes.STATS) })
                                if (canSelect) HIconButton(Icons.Filled.Checklist, "Selectează comenzi", { bulk.enter() })
                            },
                        )
                    }
                    HSearchField(
                        value = uiState.search,
                        onValueChange = viewModel::onSearchChange,
                        placeholder = "Caută produs, client sau număr",
                        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp),
                    )
                },
                pinned = {
                    OrdersTopControls(
                        view = uiState.view,
                        onView = viewModel::setView,
                        showMethods = viewModel.wooDeliveryEnabled,
                        methods = methods,
                        selectedFilter = uiState.deliveryFilter,
                        onSelectFilter = viewModel::selectDeliveryFilter,
                        canEditNames = role == UserRole.ADMINISTRATOR,
                        modifier = Modifier.background(HoraeTheme.scheme.background).padding(top = 10.dp),
                    )
                    OrderStatusHint(
                        uiState.statuses,
                        Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 4.dp),
                    )
                },
            ) {
                HoraeRefreshBox(
                    isRefreshing = uiState.isRefreshing,
                    onRefresh = viewModel::refresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    when {
                        uiState.orders.isEmpty() && (uiState.isLoading || !uiState.hasLoaded) ->
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = HoraeTheme.scheme.primary)
                            }
                        uiState.orders.isEmpty() -> EmptyOrderState(
                            searching = uiState.search.isNotBlank(),
                            filtered = uiState.statuses.size < OrderStatus.entries.size,
                        )
                        else -> CompositionLocalProvider(
                            LocalDeliveryMethodLabels provides remember(methods, viewModel.wooDeliveryEnabled) { viewModel.methodLabels },
                        ) { OrderList(
                            orders = uiState.orders,
                            view = uiState.view,
                            focusToken = uiState.focusToken,
                            isLoadingMore = uiState.isLoadingMore,
                            hasNextPage = uiState.hasNextPage,
                            onLoadMore = viewModel::loadMore,
                            selection = bulk.takeIf { canSelect },
                            onOrderClick = { order -> navController.navigate(OrdersRoutes.detail(order.id)) },
                        ) }
                    }
                }
            }
        }
    }

    uiState.error?.let { ErrorDialog(message = it, onDismiss = viewModel::clearError) }
}

// ---------------------------------------------------------------------------
// List with infinite scroll
// ---------------------------------------------------------------------------

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun OrderList(
    orders: List<OrderResponse>,
    view: OrderView,
    focusToken: Int,
    isLoadingMore: Boolean,
    hasNextPage: Boolean,
    onLoadMore: () -> Unit,
    onOrderClick: (OrderResponse) -> Unit,
    selection: BulkSelectionState? = null,
) {
    val listState = rememberLazyListState()
    val shouldLoadMore by remember(hasNextPage, isLoadingMore) {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val total = listState.layoutInfo.totalItemsCount
            total > 0 && lastVisible >= total - 3 && hasNextPage && !isLoadingMore
        }
    }
    val today = com.horae.app.ui.common.RoDate.today()
    val groups = remember(orders, view, today) { groupOrdersByDay(orders, view, today) }
    // Intrări: a new order lands on top — when the user is at the top, keep showing the top
    // (LazyColumn would otherwise stay anchored on the previous first row).
    val firstId = orders.firstOrNull()?.id
    LaunchedEffect(firstId) {
        if (view == OrderView.INTRARI && listState.firstVisibleItemIndex <= 1) listState.scrollToItem(0)
    }
    // First load / view or filter switch: "Azi" (else the nearest older section) at the top.
    LaunchedEffect(focusToken) {
        if (focusToken > 0) listState.scrollToItem(todayHeaderIndex(groups, today) ?: 0)
    }
    LaunchedEffect(listState, hasNextPage, isLoadingMore) {
        snapshotFlow { shouldLoadMore }.collectLatest { if (it) onLoadMore() }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 2.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        groups.forEach { group ->
            stickyHeader(key = "hdr-${group.key}", contentType = "dayHeader") {
                OrderDayHeader(group.title, count = group.orders.size)
            }
            items(items = group.orders, key = { it.id }, contentType = { "order" }) { order ->
                OrderListRow(order = order, selection = selection, onClick = { onOrderClick(order) })
            }
        }
        if (isLoadingMore) {
            item(key = "__more__") {
                Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = HoraeTheme.scheme.primary)
                }
            }
        }
    }
}

/** Sticky day header ("Azi", "Mâine", "luni, 19 oct", "Mai vechi") on the screen background. */
@Composable
private fun OrderDayHeader(title: String, count: Int) {
    val s = HoraeTheme.scheme
    Row(
        Modifier
            .fillMaxWidth()
            .background(s.background)
            .padding(start = 4.dp, end = 4.dp, top = 6.dp, bottom = 2.dp)
            .semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = AppFont.body(13f, FontWeight.Bold), color = s.ink, modifier = Modifier.weight(1f))
        Text("$count", style = AppFont.body(12f, FontWeight.SemiBold), color = s.muted)
    }
}

// ---------------------------------------------------------------------------
// Row — products · quantities · customer + status chip (no number, no time)
// ---------------------------------------------------------------------------

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun OrderListRow(
    order: OrderResponse,
    onClick: () -> Unit,
    selection: BulkSelectionState? = null,
) {
    val selecting = selection?.isActive == true
    HCard(
        padding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .combinedClickable(
                onClickLabel = "Deschide comanda",
                onClick = { if (selecting) selection!!.toggle(order.id) else onClick() },
                onLongClick = selection?.let { s -> { if (!s.isActive) { s.enter(); s.toggle(order.id) } } },
            )
            .semantics(mergeDescendants = true) { contentDescription = order.rowAccessibilityText },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (selecting) {
                BulkSelectCheckbox(state = selection!!, id = order.id)
                Spacer(Modifier.size(12.dp))
            }
            OrderRowLines(order, Modifier.weight(1f))
            Spacer(Modifier.size(12.dp))
            HStatusChip(order.statusEnum)
        }
    }
}

/** The text lines of an order row (shared with the calendar). */
@Composable
internal fun OrderRowLines(order: OrderResponse, modifier: Modifier = Modifier) {
    val s = HoraeTheme.scheme
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            order.productNamesLine,
            style = AppFont.body(15f, FontWeight.Bold),
            color = s.ink,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        order.quantitiesLine?.let {
            Text(it, style = AppFont.body(12f, FontWeight.SemiBold), color = s.primaryText, maxLines = 1)
        }
        order.rowCustomer?.let {
            Text(it, style = AppFont.body(12f), color = s.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(order.rowMethodLine(LocalDeliveryMethodLabels.current), style = AppFont.body(12f), color = s.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

@Composable
private fun EmptyOrderState(searching: Boolean, filtered: Boolean) {
    val s = HoraeTheme.scheme
    // Scrollable so pull-to-refresh still works on an empty list.
    LazyColumn(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        item {
            Spacer(Modifier.height(120.dp))
            Icon(Icons.Filled.LocalShipping, contentDescription = null, modifier = Modifier.size(56.dp), tint = s.muted)
            Spacer(Modifier.height(12.dp))
            Text(
                when {
                    searching -> "Niciun rezultat"
                    filtered -> "Nicio comandă cu statusul ales"
                    else -> "Nu există comenzi"
                },
                style = AppFont.body(16f, FontWeight.SemiBold),
                color = s.muted,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

internal object OrderPreviewData {
    private val user = OrderUserDto("u1", "Ana", "Pop")
    private fun item(id: String, name: String, qty: Double, unit: String) =
        OrderItemResponseDto(id, "r$id", name, null, qty, unit, "IN_PREGATIRE", null)

    val orders = listOf(
        OrderResponse(
            id = "o2", orderNumber = "WOO-11644", status = "NOUA", fulfillmentType = "PICKUP",
            deliveryPoint = "WooCommerce", deliveryAddress = null, customerName = "Maria Ionescu", deliveryMethod = "Ridicare Napoca 15",
            notes = null, dueDate = "2026-10-18T00:00:00.000Z", createdById = "u1", assignedToId = null,
            createdAt = "2026-10-17T09:30:00.000Z", updatedAt = "2026-10-17T09:30:00.000Z", completedAt = null,
            createdBy = user, assignedTo = null,
            items = listOf(item("1", "Tort vis de fistic", 1.5, "KILOGRAME"), item("2", "Macarons", 12.0, "BUCATI"), item("3", "Eclair", 6.0, "BUCATI")),
            deliveryNote = null, itemCount = 3,
        ),
        OrderResponse(
            id = "o1", orderNumber = "CMD-0412", status = "IN_PREGATIRE",
            deliveryPoint = "Hotel Marriott", deliveryAddress = "Str. Lungă 5", notes = null,
            dueDate = "2026-10-17T11:30:00.000Z", createdById = "u1", assignedToId = null,
            createdAt = "2026-10-16T08:00:00.000Z", updatedAt = "2026-10-16T08:00:00.000Z", completedAt = null,
            createdBy = user, assignedTo = null,
            items = listOf(item("4", "Choux cu vanilie", 40.0, "BUCATI")),
            deliveryNote = null, itemCount = 1,
        ),
    )
}

@Preview(showBackground = true)
@Composable
private fun OrderListRowPreview() {
    com.horae.app.ui.theme.HoraeTheme {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OrderPreviewData.orders.forEach { OrderListRow(order = it, onClick = {}) }
        }
    }
}
