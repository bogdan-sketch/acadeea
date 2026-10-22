package com.horae.app.ui.stock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.remote.dto.RequirementsPlanItemDto
import com.horae.app.data.remote.dto.RequirementsPlanResponse
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.RecipeType
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.ChoiceListSheet
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HIconButtonVariant
import com.horae.app.ui.common.HPickerField
import com.horae.app.ui.common.HPrimaryButton
import com.horae.app.ui.common.HSecondaryButton
import com.horae.app.ui.common.HSectionHeader
import com.horae.app.ui.common.RoFormat
import com.horae.app.ui.common.accentGradientBackground
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.searchKey
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PlanRow(
    val key: String = UUID.randomUUID().toString(),
    val recipe: RecipeListItemDto? = null,
    val quantity: String = "",
) {
    val parsed: Double? get() = RoFormat.parseDecimal(quantity)
    val isValid: Boolean get() = recipe != null && (parsed ?: 0.0) > 0.0
}

data class RequirementsPlanUiState(
    val recipes: List<RecipeListItemDto> = emptyList(),
    val rows: List<PlanRow> = listOf(PlanRow()),
    val result: RequirementsPlanResponse? = null,
    val isComputing: Boolean = false,
    val error: String? = null,
) {
    val canCompute: Boolean get() = rows.any { it.isValid } && !isComputing
}

@HiltViewModel
class RequirementsPlanViewModel @Inject constructor(
    private val stockRepository: StockRepository,
    private val recipeRepository: RecipeRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(RequirementsPlanUiState())
    val state: StateFlow<RequirementsPlanUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                val list = recipeRepository.getRecipes(limit = 200).data
                    .filter { it.type != "MATERIE_PRIMA" }
                    .sortedBy { searchKey(it.name) }
                _state.update { it.copy(recipes = list) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.update { it.copy(error = ApiErrors.userMessage(e, "Nu am putut încărca rețetele")) }
            }
        }
    }

    fun addRow() = _state.update { it.copy(rows = it.rows + PlanRow()) }
    fun removeRow(key: String) = _state.update {
        it.copy(rows = it.rows.filterNot { r -> r.key == key }.ifEmpty { listOf(PlanRow()) }, result = null)
    }
    fun setRecipe(key: String, r: RecipeListItemDto?) = updateRow(key) { it.copy(recipe = r) }
    fun setQuantity(key: String, v: String) = updateRow(key) { it.copy(quantity = RoFormat.sanitizeDecimalInput(v)) }
    fun dismissError() = _state.update { it.copy(error = null) }

    private fun updateRow(key: String, f: (PlanRow) -> PlanRow) =
        _state.update { s -> s.copy(rows = s.rows.map { if (it.key == key) f(it) else it }, result = null) }

    fun compute() {
        val items = _state.value.rows.filter { it.isValid }.map { RequirementsPlanItemDto(it.recipe!!.id, it.parsed!!) }
        if (items.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(isComputing = true, error = null) }
            try {
                val res = stockRepository.requirementsPlan(items)
                _state.update { it.copy(isComputing = false, result = res) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.update { it.copy(isComputing = false, error = ApiErrors.userMessage(e, "Nu am putut calcula necesarul")) }
            }
        }
    }
}

private fun unitAbbr(unit: String?): String = UnitType.fromString(unit)?.abbreviation ?: unit.orEmpty()

/**
 * "Necesar" — raw materials needed for a production plan (recipe × quantity), with
 * what is in stock and what must be bought. Every quantity is in the material's unit.
 */
@Composable
fun RequirementsPlanScreen(
    navController: NavController,
    viewModel: RequirementsPlanViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var pickerRow by remember { mutableStateOf<String?>(null) }
    val sch = HoraeTheme.scheme
    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Column(Modifier.fillMaxSize().accentGradientBackground()) {
        StockTopBar(onBack = { navController.popBackStack() })
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Column {
                Text("Necesar materii prime", style = AppFont.title(28f), color = sch.ink)
                Text("Ce trebuie cumpărat pentru ce vrei să produci", style = AppFont.body(13f), color = sch.muted)
            }
            HSectionHeader("Ce produci")
            state.rows.forEachIndexed { index, row ->
                HCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Produs ${index + 1}", style = AppFont.body(14f, FontWeight.Bold), color = sch.ink, modifier = Modifier.weight(1f))
                        if (state.rows.size > 1) {
                            HIconButton(
                                Icons.Outlined.Delete, "Șterge produsul ${index + 1}",
                                { viewModel.removeRow(row.key) },
                                variant = HIconButtonVariant.DESTRUCTIVE,
                            )
                        }
                    }
                    HPickerField(label = null, value = row.recipe?.name, placeholder = "Alege rețeta", onClick = { pickerRow = row.key })
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = row.quantity,
                            onValueChange = { viewModel.setQuantity(row.key, it) },
                            placeholder = { Text("Cantitate") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                        Text(row.recipe?.let { unitAbbr(it.unit) } ?: "—", style = AppFont.body(15f, FontWeight.SemiBold), color = sch.muted)
                    }
                }
            }
            HSecondaryButton(text = "Adaugă produs", onClick = viewModel::addRow, icon = Icons.Filled.Add, accentText = true)
            HPrimaryButton(
                text = "Calculează necesarul",
                onClick = viewModel::compute,
                enabled = state.canCompute,
                loading = state.isComputing,
                icon = Icons.Outlined.Calculate,
            )

            state.result?.let { res ->
                val toBuy = res.requirements.count { it.deficit > 0 }
                HSectionHeader(if (toBuy > 0) "De cumpărat: $toBuy din ${res.requirements.size}" else "Materii prime")
                if (res.requirements.isEmpty()) {
                    StockEmptyText("Rețetele alese nu au materii prime.")
                } else {
                    HCard(padding = PaddingValues(0.dp)) {
                        res.requirements
                            .sortedWith(compareByDescending<com.horae.app.data.remote.dto.PlanRequirementDto> { it.deficit > 0 }.thenBy { searchKey(it.title) })
                            .forEachIndexed { i, r ->
                                if (i > 0) StockDivider()
                                val short = r.deficit > 0
                                StockItemRow(
                                    title = r.title,
                                    subtitle = listOfNotNull(
                                        "necesar ${formatQty(r.needed, r.unit)}",
                                        "disponibil ${formatQty(r.available, r.unit)}",
                                        r.supplierName,
                                    ).joinToString(" · "),
                                    quantity = if (short) "lipsă ${formatQty(r.deficit, r.unit)}" else "ok",
                                    kind = if (short) StatusKind.DANGER else StatusKind.READY,
                                    onClick = { navController.navigate(com.horae.app.ui.navigation.Screen.RawMaterialDetail.createRoute(r.rawMaterialId)) },
                                )
                            }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    pickerRow?.let { key ->
        ChoiceListSheet(
            title = "Alege rețeta",
            items = state.recipes,
            selected = state.rows.firstOrNull { it.key == key }?.recipe,
            itemLabel = { it.name },
            itemSubtitle = { r ->
                listOfNotNull(
                    RecipeType.entries.firstOrNull { it.name == r.type }?.displayName,
                    r.category,
                ).joinToString(" · ")
            },
            itemKey = { it.id },
            searchable = true,
            searchPlaceholder = "Caută rețeta",
            onSelect = { viewModel.setRecipe(key, it) },
            onDismiss = { pickerRow = null },
        )
    }
}
