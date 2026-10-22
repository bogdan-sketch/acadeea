package com.horae.app.ui.stock

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
import com.horae.app.data.remote.dto.RecipeStockResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.RecipeType
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.common.formatUnitQty
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

data class SemipreparateListUiState(
    val items: List<RecipeStockResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val hasNextPage: Boolean = false,
    val page: Int = 1,
)

@HiltViewModel
class SemipreparateListViewModel @Inject constructor(
    private val repository: StockRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SemipreparateListUiState())
    val uiState: StateFlow<SemipreparateListUiState> = _uiState.asStateFlow()

    init {
        loadInitial()
    }

    fun loadInitial() {
        _uiState.update { it.copy(page = 1) }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val result = repository.getRecipeStock(
                    page = 1,
                    type = RecipeType.SEMIPREPARAT.name,
                    search = _uiState.value.search.takeIf { it.isNotBlank() },
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
                    type = RecipeType.SEMIPREPARAT.name,
                    search = state.search.takeIf { it.isNotBlank() },
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

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@Composable
fun SemipreparateListScreen(
    navController: NavController,
    outOfStockOnly: Boolean = false,
    viewModel: SemipreparateListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    // "Epuizate": only what is at 0 (client-side over the loaded rows).
    val visible = if (outOfStockOnly) state.items.filter { it.stockCount <= 0.0 } else state.items
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
        modifier = Modifier.fillMaxSize(),
        header = {
            com.horae.app.ui.common.HSearchField(
                value = state.search,
                onValueChange = viewModel::onSearchChange,
                placeholder = "Caută semipreparate",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            if (state.isLoading && state.items.isEmpty()) {
                LoadingOverlay()
            } else if (visible.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (outOfStockOnly) "Niciun semipreparat epuizat" else "Niciun semipreparat",
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
                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                        itemsIndexed(visible, key = { _, it -> it.id }) { index, item ->
                            if (index > 0) StockRowDivider()
                            RecipeStockRow(
                                item = item,
                                onClick = {
                                    navController.navigate(Screen.RecipeStockDetail.createRoute(item.id))
                                },
                            )
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

// ---------------------------------------------------------------------------
// Shared recipe stock row
// ---------------------------------------------------------------------------

@Composable
internal fun RecipeStockRow(
    item: RecipeStockResponse,
    onClick: () -> Unit,
) {
    val expiry = item.expiryDate?.let(::parseExpiryDate)
    val subtitle = buildList {
        item.category?.takeIf { it.isNotBlank() }?.let { add(it) }
        item.flavors.take(2).forEach { add(it) }
        if (item.reservedCount > 0) add("${formatQty(item.reservedCount, item.unit)} rezervat")
        expiry?.let { add("exp ${com.horae.app.ui.common.RoDate.dayMonthShort(it)}") }
    }.joinToString(" · ")
    StockItemRow(
        title = item.name,
        subtitle = subtitle.ifBlank { null },
        subtitleKind = if (expiry != null && isExpiringSoon(expiry)) com.horae.app.domain.model.StatusKind.DANGER else null,
        quantity = formatQty(item.stockCount, item.unit),
        kind = stockKind(item.stockCount, 0.0),
        onClick = onClick,
    )
}

// ---------------------------------------------------------------------------
// Expiry helpers (shared by recipe stock list rows + detail screen)
// ---------------------------------------------------------------------------

/** Defensively parses an ISO-8601 instant ("2026-07-10T...") into the device-timezone date. */
internal fun parseExpiryDate(iso: String): LocalDate? {
    return try {
        // Calendar day in Europe/Bucharest (date-only values keep their UTC day).
        com.horae.app.ui.common.RoDate.calendarDay(iso)
    } catch (e: Exception) {
        null
    }
}

/** Formats as dd.MM.yyyy. */
internal fun formatExpiryDate(date: LocalDate): String = com.horae.app.ui.common.RoDate.numericDate(date)

/** True when the expiry date is within 7 days from today (or already past). */
internal fun isExpiringSoon(date: LocalDate): Boolean {
    return !date.isAfter(com.horae.app.ui.common.RoDate.today().plusDays(7))
}
