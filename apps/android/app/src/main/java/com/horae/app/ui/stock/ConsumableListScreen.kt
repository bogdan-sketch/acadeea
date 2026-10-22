package com.horae.app.ui.stock

import androidx.compose.ui.draw.clipToBounds
import com.horae.app.ui.common.BulkActionCatalog
import com.horae.app.ui.common.BulkOutcome
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import timber.log.Timber
import com.horae.app.ui.common.rememberBulkSelectionState
import com.horae.app.ui.common.BulkSelectionState
import com.horae.app.ui.common.BulkSelectInlineHeader
import com.horae.app.ui.common.BulkSelectTopBar
import com.horae.app.ui.common.BulkSelectCheckbox
import com.horae.app.ui.common.BulkSelectBottomBar
import com.horae.app.ui.common.BulkSelectAction
import com.horae.app.ui.common.BulkDeleteWarnings
import com.horae.app.ui.common.BulkDeleteResultDialog
import com.horae.app.domain.model.UserRole
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.CASLAction
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.ConsumableResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.navigation.Screen
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

data class ConsumableListUiState(
    val consumables: List<ConsumableResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val search: String = "",
    /** "Epuizate" chip on the Stoc screen: only consumables at 0. */
    val outOfStockOnly: Boolean = false,
    val isRefreshing: Boolean = false,
    val hasNextPage: Boolean = false,
    val page: Int = 1,
    /** Select & delete (bulk) — in flight / last result. */
    val isPreviewing: Boolean = false,
    val bulkPreview: BulkDeletePreviewDto? = null,
    val isDeleting: Boolean = false,
    val isActing: Boolean = false,
    val bulkResult: BulkOutcome? = null,
)

@HiltViewModel
class ConsumableListViewModel @Inject constructor(
    private val repository: StockRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConsumableListUiState())
    val uiState: StateFlow<ConsumableListUiState> = _uiState.asStateFlow()

    private val gate = com.horae.app.ui.common.RequestGate()

    init {
        loadInitial()
    }

    /** First page for the current search / filter. [refresh] = pull-to-refresh (keeps rows on failure). */
    fun loadInitial(refresh: Boolean = false) {
        val token = gate.next()
        viewModelScope.launch {
            _uiState.update { if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true, error = null) }
            val s = _uiState.value
            val result = com.horae.app.ui.common.runRefresh(
                onError = { e ->
                    if (gate.isCurrent(token) && !refresh) {
                        _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut încărca consumabilele")) }
                    }
                },
            ) {
                repository.getConsumables(
                    page = 1,
                    search = s.search.takeIf { it.isNotBlank() },
                    status = if (s.outOfStockOnly) "OUT_OF_STOCK" else null,
                )
            }
            if (!gate.isCurrent(token)) return@launch
            _uiState.update {
                if (result == null) {
                    it.copy(isLoading = false, isRefreshing = false)
                } else {
                    it.copy(
                        consumables = result.data,
                        hasNextPage = result.hasNextPage,
                        page = 1,
                        isLoading = false,
                        isRefreshing = false,
                    )
                }
            }
        }
    }

    fun setOutOfStockOnly(value: Boolean) {
        if (_uiState.value.outOfStockOnly == value) return
        _uiState.update { it.copy(outOfStockOnly = value) }
        loadInitial()
    }

    fun loadMore() {
        val state = _uiState.value
        if (!state.hasNextPage || state.isLoading) return
        val nextPage = state.page + 1
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val result = repository.getConsumables(
                    page = nextPage,
                    search = state.search.takeIf { it.isNotBlank() },
                    status = if (state.outOfStockOnly) "OUT_OF_STOCK" else null,
                )
                _uiState.update {
                    it.copy(
                        consumables = it.consumables + result.data,
                        hasNextPage = result.hasNextPage,
                        page = nextPage,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun onSearchChange(query: String) {
        _uiState.update { it.copy(search = query) }
        loadInitial()
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    /** Bulk delete the selected rows, then reload. */
    fun bulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true) }
            // Keep the confirm dialog up (spinner) until the result arrives.
            try {
                val result = repository.bulkDeleteConsumables(ids)
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, bulkResult = BulkOutcome.ofDelete(result)) }
                loadInitial()
            } catch (e: Exception) {
                Timber.e(e, "ConsumableListViewModel: bulkDelete failed")
                _uiState.update {
                    it.copy(isDeleting = false, bulkPreview = null, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la ștergere"))
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
                val preview = repository.bulkDeletePreviewConsumables(ids)
                _uiState.update { it.copy(isPreviewing = false, bulkPreview = preview) }
            } catch (e: Exception) {
                Timber.e(e, "ConsumableListViewModel: previewBulkDelete failed")
                _uiState.update { it.copy(isPreviewing = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut verifica ce se șterge")) }
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
                val result = repository.bulkActionConsumables(ids, action, params)
                _uiState.update { it.copy(isActing = false, bulkResult = BulkOutcome.ofAction(result)) }
                loadInitial()
            } catch (e: Exception) {
                Timber.e(e, "ConsumableListViewModel: bulkAction failed")
                _uiState.update { it.copy(isActing = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la aplicarea acțiunii")) }
            }
        }
    }

    fun clearBulkResult() {
        _uiState.update { it.copy(bulkResult = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@Composable
fun ConsumableListScreen(
    navController: NavController,
    // Least privilege by default: callers pass the signed-in role (bulk delete is admin-only).
    role: UserRole = UserRole.AJUTOR_COFETAR,
    outOfStockOnly: Boolean = false,
    viewModel: ConsumableListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    LaunchedEffect(outOfStockOnly) { viewModel.setOutOfStockOnly(outOfStockOnly) }
    val listState = rememberLazyListState()
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.CONSUMABLE)
    val canAct = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.CONSUMABLE)
    val canSelect = canDelete || canAct
    val bulk = rememberBulkSelectionState()

    BulkDeleteResultDialog(
        result = state.bulkResult,
        onDismiss = {
            viewModel.clearBulkResult()
            bulk.exit()
        },
    )

    // Infinite scroll detection
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisibleIndex >= state.consumables.size - 3 && state.hasNextPage && !state.isLoading
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMore()
    }

    state.error?.let { msg ->
        ErrorDialog(message = msg, onDismiss = viewModel::dismissError)
    }

    // Search hides on scroll down / returns on scroll up (1.39.0); pinned rows stay.
    com.horae.app.ui.common.CollapsingHeaderLayout(
        modifier = Modifier.fillMaxSize(),
        header = {
            com.horae.app.ui.common.HSearchField(
                value = state.search,
                onValueChange = viewModel::onSearchChange,
                placeholder = "Caută consumabile",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        },
        pinned = {
            if (canSelect && state.consumables.isNotEmpty()) {
                BulkSelectInlineHeader(state = bulk, allIds = state.consumables.map { it.id })
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            if (state.isLoading && state.consumables.isEmpty()) {
                LoadingOverlay()
            } else if (state.consumables.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (state.outOfStockOnly) "Niciun consumabil epuizat" else "Nu există consumabile",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                com.horae.app.ui.common.HoraeRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = { viewModel.loadInitial(refresh = true) },
                    modifier = Modifier.clipToBounds().fillMaxWidth().weight(1f),
                ) {
                HoraeCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                ) {
                    LazyColumn(state = listState, modifier = Modifier.fillMaxWidth()) {
                        itemsIndexed(state.consumables, key = { _, c -> c.id }) { index, consumable ->
                            if (index > 0) StockRowDivider()
                            ConsumableRow(
                                consumable = consumable,
                                selection = bulk.takeIf { canSelect },
                                onClick = {
                                    navController.navigate(Screen.ConsumableDetail.createRoute(consumable.id))
                                },
                            )
                        }
                        if (state.isLoading && state.consumables.isNotEmpty()) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator()
                                }
                            }
                        }
                    }
                }
                }
                if (bulk.isActive) {
                    BulkSelectBottomBar(
                        state = bulk,
                        warning = BulkDeleteWarnings.CONSUMABLES,
                        preview = state.bulkPreview,
                        isPreviewing = state.isPreviewing,
                        isDeleting = state.isDeleting,
                        onRequestPreview = viewModel::previewBulkDelete,
                        onDismissPreview = viewModel::clearBulkPreview,
                        onConfirmDelete = viewModel::bulkDelete,
                        canDelete = canDelete,
                        actions = BulkActionCatalog.consumables,
                        canAct = canAct,
                        isActing = state.isActing,
                        onRunAction = viewModel::bulkAction,
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Row item
// ---------------------------------------------------------------------------

@Composable
private fun ConsumableRow(
    consumable: ConsumableResponse,
    onClick: () -> Unit,
    selection: BulkSelectionState? = null,
) {
    // Consumables are counted in pieces (the API has no other unit for them).
    val isBelowMinimum = consumable.stockCount <= consumable.minimumStock && consumable.minimumStock > 0
    val subtitle = buildList {
        add(consumable.category?.takeIf { it.isNotBlank() } ?: "Fără categorie")
        when {
            isBelowMinimum && consumable.stockCount > 0 ->
                add("sub minim (${com.horae.app.ui.common.formatQty(consumable.minimumStock, "BUCATI")})")
            consumable.reservedCount > 0 ->
                add("${com.horae.app.ui.common.formatQty(consumable.reservedCount, "BUCATI")} rezervate")
        }
    }.joinToString(" · ")
    StockItemRow(
        title = consumable.title,
        subtitle = subtitle,
        quantity = com.horae.app.ui.common.formatQty(consumable.stockCount, "BUCATI"),
        kind = stockKind(consumable.stockCount, consumable.minimumStock),
        onClick = { if (selection?.isActive == true) selection.toggle(consumable.id) else onClick() },
        onLongClick = selection?.let { s -> { if (!s.isActive) { s.enter(); s.toggle(consumable.id) } } },
        leading = if (selection?.isActive == true) {
            { BulkSelectCheckbox(state = selection, id = consumable.id) }
        } else {
            null
        },
    )
}
