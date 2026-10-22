package com.horae.app.ui.stock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RecipeStockResponse
import com.horae.app.data.remote.dto.CarouselCategoryDto
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.data.repository.StockRepository
import com.horae.app.ui.common.CategoryKindStyle
import com.horae.app.ui.common.CategoryPillHeader
import com.horae.app.domain.model.RecipeType
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeFilterChip
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.sales.canWriteSales
import com.horae.app.ui.sales.rememberSalesFeatureEnabled

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

data class ProductListUiState(
    val items: List<RecipeStockResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val selectedCategory: String? = null,
    val hasNextPage: Boolean = false,
    val page: Int = 1,
    /** Every product category with its parent (admin order) — for the group order. */
    val dialCategories: List<CarouselCategoryDto> = emptyList(),
    /** Category groups the user folded (tap on the pill header). */
    val collapsedGroups: Set<String> = emptySet(),
    /** Categories that hold at least one product (chips with 0 are hidden). */
    val categoriesWithItems: Set<String> = emptySet(),
) {
    /** Loaded items grouped by category (admin order, Misc last). */
    val groupedItems: List<CategoryGroup>
        get() {
            val rank = dialCategories.mapIndexed { i, c -> c.name to i }.toMap()
            return items
                .groupBy { it.category?.takeIf { c -> c.isNotBlank() } ?: "Fără categorie" }
                .entries
                .sortedWith(compareBy({ it.key == "Fără categorie" }, { rank[it.key] ?: Int.MAX_VALUE }))
                .map { (cat, list) -> CategoryGroup(cat, list.first().type, list) }
        }
}

data class CategoryGroup(val category: String, val kind: String, val items: List<RecipeStockResponse>)

@HiltViewModel
class ProductListViewModel @Inject constructor(
    private val repository: StockRepository,
    private val recipeRepository: RecipeRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProductListUiState())
    val uiState: StateFlow<ProductListUiState> = _uiState.asStateFlow()

    init {
        loadInitial()
        loadCategories()
    }

    private fun loadCategories() {
        viewModelScope.launch {
            try {
                // Products = finished goods (and semipreparate); raw-material categories don't belong here.
                val rows = recipeRepository.getCategoryCarousel().filter { it.kind != "MATERIE_PRIMA" }
                // One wide fetch (no chip filter) → which categories actually hold products.
                val all = repository.getRecipeStock(page = 1, limit = 500, type = RecipeType.FINAL.name).data
                val present = all.mapNotNull { it.category?.takeIf { c -> c.isNotBlank() } }.toSet()
                val withItems = rows.filter { r -> r.name in present || rows.any { it.parentName == r.name && it.name in present } }.map { it.name }.toSet()
                _uiState.update { it.copy(dialCategories = rows, categoriesWithItems = withItems) }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
            }
        }
    }

    fun loadInitial() {
        _uiState.update { it.copy(page = 1) }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val result = repository.getRecipeStock(
                    page = 1,
                    type = RecipeType.FINAL.name,
                    search = _uiState.value.search.takeIf { it.isNotBlank() },
                    category = _uiState.value.selectedCategory,
                )
                _uiState.update {
                    it.copy(
                        items = result.data,
                        hasNextPage = result.hasNextPage,
                        page = 1,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare necunoscuta")) }
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (!state.hasNextPage || state.isLoading) return
        val nextPage = state.page + 1
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val result = repository.getRecipeStock(
                    page = nextPage,
                    type = RecipeType.FINAL.name,
                    search = state.search.takeIf { it.isNotBlank() },
                    category = state.selectedCategory,
                )
                _uiState.update {
                    it.copy(
                        items = it.items + result.data,
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

    fun toggleGroup(category: String) {
        _uiState.update {
            it.copy(collapsedGroups = if (category in it.collapsedGroups) it.collapsedGroups - category else it.collapsedGroups + category)
        }
    }

    fun onCategorySelected(category: String?) {
        _uiState.update { it.copy(selectedCategory = category) }
        loadInitial()
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@Composable
fun ProductListScreen(
    navController: NavController,
    role: UserRole = UserRole.AJUTOR_COFETAR,
    outOfStockOnly: Boolean = false,
    viewModel: ProductListViewModel = hiltViewModel(),
) {
    // "Scade vânzări" — same gate as web's recipe-stock page (feature on + create StockMovement).
    val salesEnabled = rememberSalesFeatureEnabled()
    val canDeductSales = salesEnabled && canWriteSales(role)
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisibleIndex >= state.items.size - 3 && state.hasNextPage && !state.isLoading
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
        modifier = Modifier.fillMaxSize().tutorialAnchor("stock.finishedGoods.overview"),
        header = {
            if (canDeductSales) {
                OutlinedButton(
                    onClick = { navController.navigate(Screen.SalesDeductionList.route) },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, end = 16.dp, top = 8.dp),
                ) {
                    Icon(Icons.AutoMirrored.Filled.ReceiptLong, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Scade vânzări")
                }
            }
            com.horae.app.ui.common.HSearchField(
                value = state.search,
                onValueChange = viewModel::onSearchChange,
                placeholder = "Caută produse",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        },
        pinned = {
            // Category carousel (finished-goods categories), as before: a chip filters,
            // tapping the active chip clears. No "Toate".
            val chips = state.dialCategories.filter { it.kind == "PRODUS_FINIT" && it.name in state.categoriesWithItems }
            if (chips.isNotEmpty()) {
                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(chips, key = { it.name }) { c ->
                        HoraeFilterChip(
                            label = c.name,
                            selected = state.selectedCategory == c.name,
                            onClick = { viewModel.onCategorySelected(if (state.selectedCategory == c.name) null else c.name) },
                            tint = CategoryKindStyle.color(c.kind),
                        )
                    }
                }
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            if (state.isLoading && state.items.isEmpty()) {
                LoadingOverlay()
            } else if (state.items.isEmpty() || (outOfStockOnly && state.items.none { it.stockCount <= 0.0 })) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (outOfStockOnly) "Niciun produs epuizat" else "Niciun produs",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                HoraeCard(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                ) {
                    // Produsele grupate pe categorie: categoria ca pill in capul grupului
                    // (designul aprobat), fara strip de chips.
                    // "Epuizate": only products at 0; groups left empty are hidden.
                    val groups = if (!outOfStockOnly) state.groupedItems else state.groupedItems
                        .map { g -> g.copy(items = g.items.filter { it.stockCount <= 0.0 }) }
                        .filter { it.items.isNotEmpty() }
                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                        groups.forEachIndexed { gIndex, group ->
                            val folded = group.category in state.collapsedGroups
                            item(key = "h-${group.category}") {
                                if (gIndex > 0) StockRowDivider()
                                CategoryPillHeader(
                                    name = group.category,
                                    kind = group.kind,
                                    count = group.items.size,
                                    collapsed = folded,
                                    onToggle = { viewModel.toggleGroup(group.category) },
                                )
                            }
                            itemsIndexed(if (folded) emptyList() else group.items, key = { _, it -> it.id }) { index, item ->
                                if (index > 0) StockRowDivider()
                                RecipeStockRow(
                                    item = item,
                                    onClick = {
                                        navController.navigate(Screen.RecipeStockDetail.createRoute(item.id))
                                    },
                                )
                            }
                        }
                        if (state.isLoading && state.items.isNotEmpty()) {
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
        }
    }
}
