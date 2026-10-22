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
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.MaterialStatus
import com.horae.app.domain.model.PieceType
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.StatusColors
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

data class RawMaterialListUiState(
    val materials: List<RawMaterialResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val search: String = "",
    /** "Epuizate" chip on the Stoc screen: only materials at 0 (API status OUT_OF_STOCK). */
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
class RawMaterialListViewModel @Inject constructor(
    private val repository: StockRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RawMaterialListUiState())
    val uiState: StateFlow<RawMaterialListUiState> = _uiState.asStateFlow()

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
                        _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut încărca materiile prime")) }
                    }
                },
            ) {
                repository.getRawMaterials(
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
                        materials = result.data,
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
                val result = repository.getRawMaterials(
                    page = nextPage,
                    search = state.search.takeIf { it.isNotBlank() },
                    status = if (state.outOfStockOnly) "OUT_OF_STOCK" else null,
                )
                _uiState.update {
                    it.copy(
                        materials = it.materials + result.data,
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
                val result = repository.bulkDeleteRawMaterials(ids)
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, bulkResult = BulkOutcome.ofDelete(result)) }
                loadInitial()
            } catch (e: Exception) {
                Timber.e(e, "RawMaterialListViewModel: bulkDelete failed")
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
                val preview = repository.bulkDeletePreviewRawMaterials(ids)
                _uiState.update { it.copy(isPreviewing = false, bulkPreview = preview) }
            } catch (e: Exception) {
                Timber.e(e, "RawMaterialListViewModel: previewBulkDelete failed")
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
                val result = repository.bulkActionRawMaterials(ids, action, params)
                _uiState.update { it.copy(isActing = false, bulkResult = BulkOutcome.ofAction(result)) }
                loadInitial()
            } catch (e: Exception) {
                Timber.e(e, "RawMaterialListViewModel: bulkAction failed")
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
fun RawMaterialListScreen(
    navController: NavController,
    // Least privilege by default: callers pass the signed-in role (bulk delete is admin-only).
    role: UserRole = UserRole.AJUTOR_COFETAR,
    outOfStockOnly: Boolean = false,
    viewModel: RawMaterialListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    LaunchedEffect(outOfStockOnly) { viewModel.setOutOfStockOnly(outOfStockOnly) }
    val listState = rememberLazyListState()
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.RAW_MATERIAL)
    val canAct = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.RAW_MATERIAL)
    val canSelect = canDelete || canAct
    val bulk = rememberBulkSelectionState()

    BulkDeleteResultDialog(
        result = state.bulkResult,
        onDismiss = {
            viewModel.clearBulkResult()
            bulk.exit()
        },
    )

    // Reload when coming back from a detail screen that deleted a material.
    LaunchedEffect(Unit) {
        val handle = navController.currentBackStackEntry?.savedStateHandle
        if (handle?.get<Boolean>(RAW_MATERIAL_LIST_REFRESH_KEY) == true) {
            handle.remove<Boolean>(RAW_MATERIAL_LIST_REFRESH_KEY)
            viewModel.loadInitial()
        }
    }

    // Infinite scroll detection
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisibleIndex >= state.materials.size - 3 && state.hasNextPage && !state.isLoading
        }
    }
    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) viewModel.loadMore()
    }

    // Error dialog
    state.error?.let { msg ->
        ErrorDialog(message = msg, onDismiss = viewModel::dismissError)
    }

    // Search hides on scroll down / returns on scroll up (1.39.0); pinned rows stay.
    com.horae.app.ui.common.CollapsingHeaderLayout(
        modifier = Modifier.fillMaxSize(),
        header = {
            // Search bar
            com.horae.app.ui.common.HSearchField(
                value = state.search,
                onValueChange = viewModel::onSearchChange,
                placeholder = "Caută materii prime",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        },
        pinned = {
            if (canSelect && state.materials.isNotEmpty()) {
                BulkSelectInlineHeader(state = bulk, allIds = state.materials.map { it.id })
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            if (state.isLoading && state.materials.isEmpty()) {
                LoadingOverlay()
            } else if (state.materials.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (state.outOfStockOnly) "Nicio materie primă epuizată" else "Nu există materii prime",
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
                        itemsIndexed(state.materials, key = { _, m -> m.id }) { index, material ->
                            if (index > 0) StockRowDivider()
                            RawMaterialRow(
                                material = material,
                                selection = bulk.takeIf { canSelect },
                                onClick = {
                                    navController.navigate(Screen.RawMaterialDetail.createRoute(material.id))
                                },
                            )
                        }
                        // Loading indicator at bottom
                        if (state.isLoading && state.materials.isNotEmpty()) {
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
                        warning = BulkDeleteWarnings.RAW_MATERIALS,
                        preview = state.bulkPreview,
                        isPreviewing = state.isPreviewing,
                        isDeleting = state.isDeleting,
                        onRequestPreview = viewModel::previewBulkDelete,
                        onDismissPreview = viewModel::clearBulkPreview,
                        onConfirmDelete = viewModel::bulkDelete,
                        canDelete = canDelete,
                        actions = BulkActionCatalog.rawMaterials,
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
private fun RawMaterialRow(
    material: RawMaterialResponse,
    onClick: () -> Unit,
    selection: BulkSelectionState? = null,
) {
    // The stock count is in the material's own unit (kg, l, buc…) — never its packaging
    // (pieceType "Sac"/"Cutie"), which was the "Albus bezele 34,44 buc" bug.
    val subtitle = listOfNotNull(
        material.category?.takeIf { it.isNotBlank() } ?: "Fără categorie",
        material.supplierName?.takeIf { it.isNotBlank() } ?: material.producer?.takeIf { it.isNotBlank() },
        material.minimumStock.takeIf { it > 0 }?.let { "min ${formatQty(it, material.unit)}" },
    ).joinToString(" · ")
    StockItemRow(
        title = material.title,
        subtitle = subtitle,
        quantity = formatQty(material.stockCount, material.unit),
        kind = stockKind(material.stockCount, material.minimumStock),
        onClick = { if (selection?.isActive == true) selection.toggle(material.id) else onClick() },
        onLongClick = selection?.let { s -> { if (!s.isActive) { s.enter(); s.toggle(material.id) } } },
        leading = if (selection?.isActive == true) {
            { BulkSelectCheckbox(state = selection, id = material.id) }
        } else {
            null
        },
    )
}

// ---------------------------------------------------------------------------
// Shared stock helpers (reused across stock list/detail screens)
// ---------------------------------------------------------------------------

/** Thin warm hairline between grouped rows inside a [HoraeCard]. */
@Composable
internal fun StockRowDivider() {
    StockDivider()
}

/** Romanian status label with diacritics for the material-status badge. */
internal fun materialStatusLabel(status: String): String = when (status) {
    "ACTIVE" -> "Activ"
    "LOW_STOCK" -> "Scăzut"
    "OUT_OF_STOCK" -> "Fără stoc"
    "DISCONTINUED" -> "Întrerupt"
    else -> MaterialStatus.entries.firstOrNull { it.name == status }?.displayName ?: status
}

/** Semantic (never tenant-themed) color for a material-status string. */
internal fun materialStatusColor(status: String): Color =
    MaterialStatus.entries.firstOrNull { it.name == status }
        ?.let { StatusColors.materialStatus(it) }
        ?: Color(0xFF8E8E93)
