package com.horae.app.ui.recipes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RecipeComponentDto
import com.horae.app.data.remote.dto.RecipeCostResponseDto
import com.horae.app.data.remote.dto.RecipeDetailResponse
import com.horae.app.data.remote.dto.RecipeIngredientDto
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.UnitType
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.HPrimaryButton
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.tasks.TasksRoutes
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.StatusPurple
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── Shared unit helper ──

internal fun unitAbbrev(unit: String): String =
    runCatching { UnitType.valueOf(unit).abbreviation }.getOrDefault(unit.lowercase())

/** "500 g", "1,2 kg", "0 kg" — the shared display rule (`ui/common/QuantityFormat`). */
internal fun formatQty(quantity: Double, unit: String): String =
    com.horae.app.ui.common.formatQty(quantity, unit)

/** "41,32 RON" — Romanian comma, two decimals. */
private fun ronFormatted(value: Double): String = com.horae.app.ui.common.RoFormat.ron(value)

// ── ViewModel ──

data class RecipeDetailUiState(
    val recipe: RecipeDetailResponse? = null,
    val cost: RecipeCostResponseDto? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class RecipeDetailViewModel @Inject constructor(
    private val repository: RecipeRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecipeDetailUiState())
    val uiState: StateFlow<RecipeDetailUiState> = _uiState.asStateFlow()

    fun load(recipeId: String) {
        if (recipeId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val recipe = repository.getRecipe(recipeId)
                _uiState.update { it.copy(recipe = recipe, isLoading = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea rețetei"))
                }
            }
            // Cost is best-effort (permission-gated on the backend) — a failure
            // must not blank the whole detail.
            try {
                val cost = repository.getRecipeCost(recipeId)
                _uiState.update { it.copy(cost = cost) }
            } catch (_: Exception) {
                // no-op: cost view stays hidden
            }
        }
    }
}

// ── Screen ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeDetailScreen(
    navController: NavController,
    recipeId: String,
    role: UserRole,
    viewModel: RecipeDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val canStart = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.TASK)

    LaunchedEffect(recipeId) { viewModel.load(recipeId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(state.recipe?.name ?: "Rețetă", fontWeight = FontWeight.Bold, maxLines = 1)
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                actions = {
                    if (state.recipe != null) {
                        IconButton(onClick = {
                            navController.navigate(Screen.RecipeYieldHistory.createRoute(recipeId))
                        }) {
                            Icon(Icons.Default.QueryStats, "Istoric randament")
                        }
                        IconButton(onClick = {
                            navController.navigate(Screen.RecipeEdit.createRoute(recipeId))
                        }) {
                            Icon(Icons.Default.Edit, "Editează")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        bottomBar = {
            // Task nou with this recipe preselected — the only place a recipe starts production.
            if (state.recipe != null && canStart) {
                HPrimaryButton(
                    text = "Pornește producția",
                    icon = Icons.Default.PlayArrow,
                    onClick = { navController.navigate(TasksRoutes.createFromRecipe(recipeId)) },
                    modifier = Modifier
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        val recipe = state.recipe
        when {
            state.isLoading && recipe == null -> Box(
                Modifier.fillMaxSize().padding(pad),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator() }

            recipe == null -> Box(
                Modifier.fillMaxSize().padding(pad),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    state.error ?: "Rețeta nu a fost găsită",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            else -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(pad)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                HeaderCard(recipe)
                InfoCard(recipe)
                recipe.components.forEach { ComponentCard(it) }
                state.cost?.let { CostCard(it) }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun HeaderCard(recipe: RecipeDetailResponse) {
    val isSemi = recipe.type == "SEMIPREPARAT"
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(recipe.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HoraeStatusBadge(
                    if (isSemi) "Semipreparat" else "Produs final",
                    if (isSemi) StatusPurple else Info,
                )
                if (recipe.isByproduct) HoraeStatusBadge("Subprodus", Warning)
                if (recipe.isDraft) HoraeStatusBadge("Schiță", Warning)
                if (recipe.isArchived) HoraeStatusBadge("Arhivată", MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                "Randament: " + formatQty(recipe.yieldQuantity, recipe.unit),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun InfoCard(recipe: RecipeDetailResponse) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            HoraeSectionHeader("Informații")
            Spacer(Modifier.height(6.dp))
            InfoRow("Tip", if (recipe.type == "SEMIPREPARAT") "Semipreparat" else "Produs final")
            InfoRow("Randament", formatQty(recipe.yieldQuantity, recipe.unit))
            InfoRow("Cantitate/bucată", formatQty(recipe.quantityPerPiece, recipe.unit))
            recipe.category?.let { InfoRow("Categorie", it) }
            InfoRow("Valabilitate", recipe.shelfLifeMonths?.let { "$it luni" } ?: "—")
            InfoRow("Pierderi estimate", com.horae.app.ui.common.RoFormat.percent(recipe.estimatedLossPercent))
            InfoRow("Stoc", formatQty(recipe.stockCount, recipe.unit))
            InfoRow("Rezervat", formatQty(recipe.reservedCount, recipe.unit))
            InfoRow("Versiune", recipe.version.toString())
        }
    }
}

@Composable
private fun ComponentCard(component: RecipeComponentDto) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            HoraeSectionHeader(component.name.ifBlank { "Componentă" })
            Spacer(Modifier.height(6.dp))
            if (component.ingredients.isEmpty()) {
                Text(
                    "Fără ingrediente",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                component.ingredients.forEach { IngredientRow(it) }
            }
        }
    }
}

@Composable
private fun IngredientRow(ing: RecipeIngredientDto) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(ing.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                if (ing.isSemipreparat) HoraeStatusBadge("SP", StatusPurple)
            }
            ing.prepMethod?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Stock hint for raw materials, in the material's own stock unit.
            if (ing.isRawMaterial && ing.rawMaterialStockCount != null) {
                val stockUnit = ing.rawMaterialUnit ?: ing.unit
                Text(
                    "Stoc: " + formatQty(ing.rawMaterialStockCount, stockUnit),
                    style = MaterialTheme.typography.bodySmall,
                    color = Success,
                )
            }
        }
        Text(
            formatQty(ing.quantity, ing.unit),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CostCard(cost: RecipeCostResponseDto) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            HoraeSectionHeader("Cost producție")
            Spacer(Modifier.height(6.dp))
            InfoRow("Cost total", cost.totalCost?.let { ronFormatted(it) } ?: "Necalculabil")
            cost.sellingPrice?.let { InfoRow("Preț vânzare", ronFormatted(it)) }
            cost.margin?.let { m ->
                InfoRow("Marjă", ronFormatted(m) + (cost.marginPercent?.let { " (${com.horae.app.ui.common.RoFormat.percent(it)})" } ?: ""))
            }
            if (cost.ingredients.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                cost.ingredients.forEach { ing ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(ing.name, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                            Text(
                                formatQty(ing.quantity, ing.unit),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            ing.totalCost?.let { ronFormatted(it) } ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}
