package com.horae.app.ui.stock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RecipeStockResponse
import com.horae.app.data.remote.dto.StockMovementResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.RecipeType
import com.horae.app.domain.model.StockMovementType
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.formatUnitQty
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

data class RecipeStockDetailUiState(
    val recipe: RecipeStockResponse? = null,
    val movements: List<StockMovementResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class RecipeStockDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: StockRepository,
) : ViewModel() {

    private val recipeStockId: String = checkNotNull(savedStateHandle["recipeStockId"])

    private val _uiState = MutableStateFlow(RecipeStockDetailUiState())
    val uiState: StateFlow<RecipeStockDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                // Fetch all recipe stock and movements in parallel.
                // Since there is no single-item endpoint for recipe stock,
                // we search all and pick the matching one by id.
                val recipesDeferred = async {
                    repository.getRecipeStock(page = 1, limit = 100)
                }
                val movementsDeferred = async {
                    repository.getMovements(recipeId = recipeStockId).data
                }

                val recipes = recipesDeferred.await()
                val recipe = recipes.data.firstOrNull { it.id == recipeStockId }
                val movements = movementsDeferred.await()

                _uiState.update {
                    it.copy(
                        recipe = recipe,
                        movements = movements,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut încărca datele")) }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RecipeStockDetailScreen(
    navController: NavController,
    viewModel: RecipeStockDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    state.error?.let { msg ->
        ErrorDialog(message = msg, onDismiss = viewModel::dismissError)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.recipe?.name ?: "Detalii stoc") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Inapoi")
                    }
                },
            )
        },
    ) { innerPadding ->
        if (state.isLoading && state.recipe == null) {
            LoadingOverlay(modifier = Modifier.padding(innerPadding))
        } else if (state.recipe != null) {
            val r = state.recipe!!
            val typeLabel = RecipeType.entries
                .firstOrNull { it.name == r.type }?.displayName ?: r.type

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // ---- Stock info ----
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Stoc", style = MaterialTheme.typography.titleMedium)
                        Spacer(modifier = Modifier.height(12.dp))
                        DetailRow(
                            "Stoc",
                            formatUnitQty(r.stockCount, r.unit),
                            valueColor = if (r.stockCount > 0) MaterialTheme.colorScheme.onSurface else Color(0xFFF44336),
                        )
                        DetailRow("Rezervat", formatUnitQty(r.reservedCount, r.unit))
                        DetailRow("Disponibil", formatUnitQty(r.stockCount - r.reservedCount, r.unit))
                        DetailRow("Tip", typeLabel)
                        r.category?.let { DetailRow("Categorie", it) }
                        r.expiryDate?.let { iso ->
                            parseExpiryDate(iso)?.let { date ->
                                DetailRow(
                                    "Expira",
                                    formatExpiryDate(date),
                                    valueColor = if (isExpiringSoon(date)) {
                                        MaterialTheme.colorScheme.error
                                    } else {
                                        MaterialTheme.colorScheme.onSurface
                                    },
                                )
                            }
                        }

                        if (r.flavors.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Arome", style = MaterialTheme.typography.bodyMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                r.flavors.forEach { flavor ->
                                    AssistChip(
                                        onClick = {},
                                        label = {
                                            Text(
                                                text = flavor,
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                        },
                                    )
                                }
                            }
                        }
                    }
                }

                // ---- Recent movements ----
                if (state.movements.isNotEmpty()) {
                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("Miscari recente", style = MaterialTheme.typography.titleMedium)
                            Spacer(modifier = Modifier.height(12.dp))
                            state.movements.forEachIndexed { index, mov ->
                                val movTypeLabel = StockMovementType.entries
                                    .firstOrNull { it.name == mov.movementType }?.displayName
                                    ?: mov.movementType
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column {
                                        Text(movTypeLabel, style = MaterialTheme.typography.bodyMedium)
                                        Text(
                                            text = formatDateShort(mov.createdAt),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Text(
                                        text = formatUnitQty(mov.quantity, mov.unit),
                                        style = MaterialTheme.typography.titleSmall,
                                    )
                                }
                                if (index < state.movements.lastIndex) {
                                    HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                                }
                            }
                        }
                    }
                }
            }
        } else {
            // Not found state
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = "Negasit",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
