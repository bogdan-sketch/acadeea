package com.horae.app.ui.recipes

import com.horae.app.ui.common.BulkActionCatalog
import com.horae.app.ui.common.BulkOutcome
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import androidx.compose.foundation.layout.width
import com.horae.app.ui.common.ErrorDialog
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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BakeryDining
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeFilterChip
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.common.accentGradientBackground
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.StatusPurple
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── ViewModel ──

data class RecipeListUiState(
    val recipes: List<RecipeListItemDto> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val type: String? = null, // FINAL | SEMIPREPARAT | null = toate
    /** Select & delete (bulk) — in flight / last result. */
    val isPreviewing: Boolean = false,
    val bulkPreview: BulkDeletePreviewDto? = null,
    val isDeleting: Boolean = false,
    val isActing: Boolean = false,
    val bulkResult: BulkOutcome? = null,
)

@HiltViewModel
class RecipeListViewModel @Inject constructor(
    private val repository: RecipeRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecipeListUiState())
    val uiState: StateFlow<RecipeListUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val s = _uiState.value
                val result = repository.getRecipes(
                    type = s.type,
                    search = s.search.takeIf { q -> q.isNotBlank() },
                )
                _uiState.update { it.copy(recipes = result.data, isLoading = false) }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut încărca rețetele")) }
            }
        }
    }

    fun onSearchChange(q: String) {
        _uiState.update { it.copy(search = q) }
        load()
    }

    fun onTypeChange(type: String?) {
        _uiState.update { it.copy(type = type) }
        load()
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /** Bulk delete the selected rows, then reload. */
    fun bulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true) }
            // Keep the confirm dialog up (spinner) until the result arrives.
            try {
                val result = repository.bulkDelete(ids)
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, bulkResult = BulkOutcome.ofDelete(result)) }
                load()
            } catch (e: Exception) {
                Timber.e(e, "RecipeListViewModel: bulkDelete failed")
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
                val preview = repository.bulkDeletePreview(ids)
                _uiState.update { it.copy(isPreviewing = false, bulkPreview = preview) }
            } catch (e: Exception) {
                Timber.e(e, "RecipeListViewModel: previewBulkDelete failed")
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
                val result = repository.bulkAction(ids, action, params)
                _uiState.update { it.copy(isActing = false, bulkResult = BulkOutcome.ofAction(result)) }
                load()
            } catch (e: Exception) {
                Timber.e(e, "RecipeListViewModel: bulkAction failed")
                _uiState.update { it.copy(isActing = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la aplicarea acțiunii")) }
            }
        }
    }

    fun clearBulkResult() {
        _uiState.update { it.copy(bulkResult = null) }
    }
}

// ── Screen ──

@OptIn(ExperimentalMaterial3Api::class)
/**
 * Rețete — Stoc-like rows (no photos while [RECIPE_PHOTOS_ENABLED] is false), grouped
 * by category: dot · name · "1 kg / șarjă · 145,00 RON" · stock in the recipe's unit.
 */
@Composable
fun RecipeListScreen(
    navController: NavController,
    role: UserRole = UserRole.AJUTOR_COFETAR,
    viewModel: RecipeListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.RECIPE)
    val canAct = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.RECIPE)
    val canCreate = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.RECIPE)
    val canSelect = canDelete || canAct
    val bulk = rememberBulkSelectionState()
    val sch = com.horae.app.ui.theme.HoraeTheme.scheme

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::clearError) }

    BulkDeleteResultDialog(
        result = state.bulkResult,
        onDismiss = {
            viewModel.clearBulkResult()
            bulk.exit()
        },
    )

    Scaffold(
        topBar = {
            if (bulk.isActive) {
                BulkSelectTopBar(state = bulk, allIds = state.recipes.map { it.id })
            }
        },
        bottomBar = {
            if (bulk.isActive) {
                BulkSelectBottomBar(
                    state = bulk,
                    warning = BulkDeleteWarnings.RECIPES,
                    preview = state.bulkPreview,
                    isPreviewing = state.isPreviewing,
                    isDeleting = state.isDeleting,
                    onRequestPreview = viewModel::previewBulkDelete,
                    onDismissPreview = viewModel::clearBulkPreview,
                    onConfirmDelete = viewModel::bulkDelete,
                    canDelete = canDelete,
                    actions = BulkActionCatalog.recipes,
                    canAct = canAct,
                    isActing = state.isActing,
                    onRunAction = viewModel::bulkAction,
                )
            }
        },
        floatingActionButton = {
            if (!bulk.isActive && canCreate) {
                com.horae.app.ui.common.HFab("Rețetă nouă", { navController.navigate(Screen.RecipeCreate.route) })
            }
        },
        containerColor = androidx.compose.ui.graphics.Color.Transparent,
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0),
        modifier = Modifier.accentGradientBackground(),
    ) { pad ->
        // Head (title, search) hides on scroll down / back on scroll up; the type pills stay
        // pinned (1.39.0).
        com.horae.app.ui.common.CollapsingHeaderLayout(
            modifier = Modifier.fillMaxSize().padding(pad),
            header = {
                if (!bulk.isActive) {
                    com.horae.app.ui.common.HScreenTitle(
                        title = "Rețete",
                        modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp),
                        trailing = { if (canSelect && state.recipes.isNotEmpty()) BulkSelectAction(bulk) },
                    )
                }
                com.horae.app.ui.common.HSearchField(
                    value = state.search,
                    onValueChange = viewModel::onSearchChange,
                    placeholder = "Caută rețetă",
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp),
                )
            },
            pinned = {
                // Type filter chips (no "Toate" — tap the active chip again to clear).
                com.horae.app.ui.common.ChoiceChips(
                    options = listOf("FINAL", "SEMIPREPARAT"),
                    selected = state.type,
                    onSelect = { t -> viewModel.onTypeChange(if (state.type == t) null else t) },
                    label = { if (it == "FINAL") "Produs final" else "Semipreparat" },
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
                    modifier = Modifier.padding(top = 8.dp),
                )
            },
        ) {
            if (state.isLoading && state.recipes.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = sch.primary)
                }
            } else if (state.recipes.isEmpty()) {
                com.horae.app.ui.stock.StockEmptyText(if (state.search.isBlank()) "Nicio rețetă" else "Niciun rezultat")
            } else {
                val groups = state.recipes
                    .groupBy { it.category?.takeIf { c -> c.isNotBlank() } ?: "Fără categorie" }
                    .entries
                    .sortedWith(compareBy({ it.key == "Fără categorie" }, { com.horae.app.ui.common.searchKey(it.key) }))
                LazyColumn(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    groups.forEach { (category, list) ->
                        item(key = "h-$category") {
                            com.horae.app.ui.common.HSectionHeader(
                                "$category · ${list.size}",
                                modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                        item(key = "g-$category") {
                            com.horae.app.ui.common.HCard(padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                list.forEachIndexed { i, r ->
                                    if (i > 0) com.horae.app.ui.stock.StockDivider()
                                    RecipeRow(
                                        r,
                                        selection = bulk.takeIf { canSelect },
                                        onClick = { navController.navigate(Screen.RecipeDetail.createRoute(r.id)) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RecipeRow(
    recipe: RecipeListItemDto,
    onClick: () -> Unit,
    selection: BulkSelectionState? = null,
) {
    val meta = buildList {
        recipe.yieldQuantity?.takeIf { it > 0 }?.let { add("${com.horae.app.ui.common.formatQty(it, recipe.unit)} / șarjă") }
        recipe.sellingPrice?.let { add(com.horae.app.ui.common.RoFormat.ron(it)) }
        if (recipe.type == "SEMIPREPARAT") add("semipreparat")
        if (recipe.isDraft) add("schiță")
        if (recipe.isArchived) add("arhivată")
    }.joinToString(" · ")
    val stock = recipe.stockCount
    com.horae.app.ui.stock.StockItemRow(
        title = recipe.name,
        subtitle = meta.ifBlank { null },
        quantity = stock?.let { com.horae.app.ui.common.formatQty(it, recipe.unit) } ?: "—",
        kind = if ((stock ?: 1.0) <= 0.0) com.horae.app.domain.model.StatusKind.DANGER else com.horae.app.domain.model.StatusKind.READY,
        onClick = { if (selection?.isActive == true) selection.toggle(recipe.id) else onClick() },
        onLongClick = selection?.let { s -> { if (!s.isActive) { s.enter(); s.toggle(recipe.id) } } },
        leading = if (selection?.isActive == true) {
            { BulkSelectCheckbox(state = selection, id = recipe.id) }
        } else {
            null
        },
    )
}
