package com.horae.app.ui.recipes

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.horae.app.data.remote.dto.CreateRecipeComponentRequest
import com.horae.app.data.remote.dto.CreateRecipeIngredientRequest
import com.horae.app.data.remote.dto.CreateRecipeRequest
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.RoFormat
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.theme.StatusPurple
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── Measure families (mirror iOS UnitType.measure) ──

internal enum class Measure { SOLID, LIQUID, COUNT }

internal fun UnitType.measure(): Measure = when (this) {
    UnitType.MILIGRAME, UnitType.GRAME, UnitType.KILOGRAME, UnitType.OUNCES, UnitType.POUNDS -> Measure.SOLID
    UnitType.MILILITRI, UnitType.LITRI -> Measure.LIQUID
    else -> Measure.COUNT
}

internal fun unitsInFamily(unit: UnitType): List<UnitType> {
    val m = unit.measure()
    return UnitType.entries.filter { it.measure() == m }
}

/** Recipes are written in small units — default solids to grams, liquids to ml. */
internal fun defaultRecipeUnit(materialUnit: UnitType): UnitType = when (materialUnit.measure()) {
    Measure.SOLID -> UnitType.GRAME
    Measure.LIQUID -> UnitType.MILILITRI
    Measure.COUNT -> materialUnit
}

/**
 * Units the unit sheet lists: [choices] without legacy units (oz, lbs, cană, linguriță…),
 * except [current] when it is the stored value; metric input units when nothing is left.
 */
internal fun selectableUnits(choices: List<UnitType>, current: UnitType): List<UnitType> {
    val base = choices.filter { !it.isLegacy }.ifEmpty { UnitType.metricInputUnits }
    // The yield sheet passes metricInputUnits, which never holds the stored legacy unit.
    return if (current.isLegacy) base + current else base
}

/**
 * Stored quantity → editable text: Romanian comma, up to 6 decimals, never scientific
 * notation (Double.toString gave "1.0E-4" for 0,1 g of vanilla in kg, which then failed
 * to parse on save).
 */
internal fun recipeQtyText(value: Double): String = RoFormat.inputText(value, fractionDigits = 6)

internal fun unitOrNull(raw: String): UnitType? = runCatching { UnitType.valueOf(raw) }.getOrNull()

// ── Form data (UI-local, mutable via immutable state copies) ──

data class IngredientForm(
    val id: String = UUID.randomUUID().toString(),
    val rawMaterialId: String? = null,
    val semipreparatRecipeId: String? = null,
    val name: String = "",
    val quantityText: String = "",
    val unit: UnitType = UnitType.GRAME,
    // Unit choices allowed for this ingredient (raw material's measure family).
    // Empty ⇒ semipreparat (unit is fixed to its yield unit, not editable).
    val unitChoices: List<UnitType> = emptyList(),
    val prepMethod: String = "",
) {
    val isSemipreparat: Boolean get() = semipreparatRecipeId != null
    val hasSource: Boolean get() = rawMaterialId != null || semipreparatRecipeId != null
}

data class ComponentForm(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val ingredients: List<IngredientForm> = listOf(IngredientForm()),
)

data class PendingByproduct(
    val name: String,
    val quantityText: String,
    val unit: UnitType,
)

data class RecipeFormUiState(
    val isEditing: Boolean = false,
    val name: String = "",
    val type: String = "FINAL", // FINAL | SEMIPREPARAT
    val yieldQuantityText: String = "",
    val unit: UnitType = UnitType.BUCATI,
    val category: String? = null,
    val availableCategories: List<String> = emptyList(),
    val components: List<ComponentForm> = listOf(ComponentForm(name = "")),
    val pendingByproduct: PendingByproduct? = null,
    val existingByproductNames: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
) {
    val canSave: Boolean
        get() = name.isNotBlank() &&
            (RoFormat.parseDecimal(yieldQuantityText) ?: 0.0) > 0.0 &&
            components.any { c -> c.ingredients.any { it.hasSource } } &&
            !isSaving
}

@HiltViewModel
class RecipeFormViewModel @Inject constructor(
    private val recipeRepository: RecipeRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecipeFormUiState())
    val uiState: StateFlow<RecipeFormUiState> = _uiState.asStateFlow()

    private var editingId: String? = null

    fun start(recipeId: String?) {
        editingId = recipeId
        if (recipeId.isNullOrBlank()) {
            loadCategories("FINAL")
        } else {
            loadRecipe(recipeId)
        }
    }

    private fun loadRecipe(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, isEditing = true, error = null) }
            try {
                val r = recipeRepository.getRecipe(id)
                val comps = if (r.components.isEmpty()) {
                    listOf(ComponentForm(name = ""))
                } else {
                    r.components.sortedBy { it.sortOrder }.map { comp ->
                        ComponentForm(
                            name = comp.name,
                            ingredients = comp.ingredients.sortedBy { it.sortOrder }.map { ing ->
                                val unit = unitOrNull(ing.unit) ?: UnitType.GRAME
                                IngredientForm(
                                    rawMaterialId = ing.rawMaterialId,
                                    semipreparatRecipeId = ing.semipreparatRecipeId,
                                    name = ing.name,
                                    quantityText = recipeQtyText(ing.quantity),
                                    unit = unit,
                                    unitChoices = if (ing.semipreparatRecipeId != null) emptyList() else unitsInFamily(unit),
                                    prepMethod = ing.prepMethod.orEmpty(),
                                )
                            }.ifEmpty { listOf(IngredientForm()) },
                        )
                    }
                }
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        name = r.name,
                        type = r.type,
                        yieldQuantityText = recipeQtyText(r.yieldQuantity),
                        unit = unitOrNull(r.unit) ?: UnitType.BUCATI,
                        category = r.category,
                        components = comps,
                        existingByproductNames = r.byproducts.map { b -> b.name },
                    )
                }
                loadCategories(r.type)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea rețetei"))
                }
            }
        }
    }

    private fun loadCategories(type: String) {
        val kind = if (type == "SEMIPREPARAT") "SEMIPREPARAT" else "PRODUS_FINIT"
        viewModelScope.launch {
            try {
                val cats = recipeRepository.getCategories(kind)
                _uiState.update { it.copy(availableCategories = cats) }
            } catch (_: Exception) {
                // categories are optional — leave the picker empty on failure
            }
        }
    }

    // ── Field mutations ──

    fun onNameChange(v: String) = _uiState.update { it.copy(name = v) }

    fun onTypeChange(v: String) {
        _uiState.update { it.copy(type = v, category = null) }
        loadCategories(v)
    }

    fun onYieldChange(v: String) = _uiState.update { it.copy(yieldQuantityText = v) }
    fun onUnitChange(u: UnitType) = _uiState.update { it.copy(unit = u) }
    fun onCategoryChange(c: String?) = _uiState.update { it.copy(category = c) }

    // ── Component / ingredient mutations ──

    fun addComponent() = _uiState.update { it.copy(components = it.components + ComponentForm(name = "")) }

    fun removeComponent(id: String) = _uiState.update { st ->
        val next = st.components.filterNot { it.id == id }
        st.copy(components = next.ifEmpty { listOf(ComponentForm(name = "")) })
    }

    fun onComponentNameChange(id: String, name: String) = _uiState.update { st ->
        st.copy(components = st.components.map { if (it.id == id) it.copy(name = name) else it })
    }

    fun addIngredient(componentId: String) = _uiState.update { st ->
        st.copy(components = st.components.map {
            if (it.id == componentId) it.copy(ingredients = it.ingredients + IngredientForm()) else it
        })
    }

    fun removeIngredient(componentId: String, ingredientId: String) = _uiState.update { st ->
        st.copy(components = st.components.map { c ->
            if (c.id != componentId) return@map c
            val next = c.ingredients.filterNot { it.id == ingredientId }
            c.copy(ingredients = next.ifEmpty { listOf(IngredientForm()) })
        })
    }

    private fun updateIngredient(componentId: String, ingredientId: String, transform: (IngredientForm) -> IngredientForm) =
        _uiState.update { st ->
            st.copy(components = st.components.map { c ->
                if (c.id != componentId) return@map c
                c.copy(ingredients = c.ingredients.map { if (it.id == ingredientId) transform(it) else it })
            })
        }

    fun onIngredientQuantityChange(componentId: String, ingredientId: String, q: String) =
        updateIngredient(componentId, ingredientId) { it.copy(quantityText = q) }

    fun onIngredientUnitChange(componentId: String, ingredientId: String, u: UnitType) =
        updateIngredient(componentId, ingredientId) { it.copy(unit = u) }

    fun onIngredientPrepChange(componentId: String, ingredientId: String, p: String) =
        updateIngredient(componentId, ingredientId) { it.copy(prepMethod = p) }

    fun selectRawMaterial(componentId: String, ingredientId: String, m: RawMaterialResponse) {
        val stockUnit = unitOrNull(m.unit) ?: UnitType.GRAME
        updateIngredient(componentId, ingredientId) {
            it.copy(
                rawMaterialId = m.id,
                semipreparatRecipeId = null,
                name = m.title,
                unit = defaultRecipeUnit(stockUnit),
                unitChoices = unitsInFamily(stockUnit),
            )
        }
    }

    fun selectSemipreparat(componentId: String, ingredientId: String, r: RecipeListItemDto) {
        val yieldUnit = unitOrNull(r.unit) ?: UnitType.GRAME
        updateIngredient(componentId, ingredientId) {
            it.copy(
                semipreparatRecipeId = r.id,
                rawMaterialId = null,
                name = r.name,
                unit = yieldUnit,
                unitChoices = emptyList(), // fixed to the sub-recipe's yield unit
            )
        }
    }

    // ── Byproduct ──

    fun setPendingByproduct(bp: PendingByproduct?) = _uiState.update { it.copy(pendingByproduct = bp) }

    fun dismissError() = _uiState.update { it.copy(error = null) }

    // ── Save ──

    fun save() {
        val s = _uiState.value
        if (!s.canSave) return
        val yieldQty = RoFormat.parseDecimal(s.yieldQuantityText) ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                val components = s.components.mapNotNull { comp ->
                    val real = comp.ingredients.filter { it.hasSource }
                    if (real.isEmpty()) null else comp to real
                }.mapIndexed { ci, (comp, ings) ->
                    CreateRecipeComponentRequest(
                        name = comp.name.ifBlank { "Ingrediente" },
                        sortOrder = ci,
                        ingredients = ings.mapIndexed { ii, ing ->
                            CreateRecipeIngredientRequest(
                                rawMaterialId = ing.rawMaterialId,
                                semipreparatRecipeId = ing.semipreparatRecipeId,
                                name = ing.name,
                                quantity = RoFormat.parseDecimal(ing.quantityText) ?: 0.0,
                                unit = ing.unit.name,
                                prepMethod = ing.prepMethod.takeIf { it.isNotBlank() },
                                sortOrder = ii,
                            )
                        },
                    )
                }

                val body = CreateRecipeRequest(
                    // quantityPerPiece omitted: create defaults it to 1 server-side,
                    // update keeps the existing value (the form has no such field).
                    name = s.name.trim(),
                    unit = s.unit.name,
                    yieldQuantity = yieldQty,
                    type = s.type,
                    category = s.category,
                    components = components.ifEmpty { null },
                )

                val savedId = editingId?.let { id ->
                    recipeRepository.updateRecipe(id, body).id
                } ?: recipeRepository.createRecipe(body).id

                // Create the collected byproduct as a linked SEMIPREPARAT after save.
                s.pendingByproduct?.let { bp ->
                    val qty = RoFormat.parseDecimal(bp.quantityText) ?: 0.0
                    if (bp.name.isNotBlank() && qty > 0) {
                        recipeRepository.createRecipe(
                            CreateRecipeRequest(
                                name = bp.name.trim(),
                                unit = bp.unit.name,
                                yieldQuantity = qty,
                                type = "SEMIPREPARAT",
                                isByproduct = true,
                                sourceRecipeId = savedId,
                            ),
                        )
                    }
                }

                _uiState.update { it.copy(isSaving = false, saved = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSaving = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la salvarea rețetei"))
                }
            }
        }
    }
}

// ── Screen ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeFormScreen(
    navController: NavController,
    recipeId: String? = null,
    viewModel: RecipeFormViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(recipeId) { viewModel.start(recipeId) }

    if (state.saved) {
        LaunchedEffect(Unit) { navController.popBackStack() }
    }

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    // Ingredient picker sheet target (componentId + ingredientId), null = closed.
    var pickerTarget by remember { mutableStateOf<Pair<String, String>?>(null) }
    var showByproductSheet by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (state.isEditing) "Editează rețeta" else "Rețetă nouă",
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        if (state.isLoading) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Info
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HoraeSectionHeader("Nume *")
                OutlinedTextField(
                    value = state.name,
                    onValueChange = viewModel::onNameChange,
                    placeholder = { Text("ex: Tort Zmeură") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .tutorialAnchor("recipes.create.open"),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HoraeSectionHeader("Tip preparat")
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = state.type == "FINAL",
                        onClick = { viewModel.onTypeChange("FINAL") },
                        shape = SegmentedButtonDefaults.itemShape(0, 2),
                    ) { Text("Produs final") }
                    SegmentedButton(
                        selected = state.type == "SEMIPREPARAT",
                        onClick = { viewModel.onTypeChange("SEMIPREPARAT") },
                        shape = SegmentedButtonDefaults.itemShape(1, 2),
                    ) { Text("Semipreparat") }
                }
            }

            // Yield qty + unit
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HoraeSectionHeader("Cantitate rezultată *")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = state.yieldQuantityText,
                        onValueChange = viewModel::onYieldChange,
                        placeholder = { Text("0") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    UnitDropdown(
                        unit = state.unit,
                        choices = UnitType.metricInputUnits,
                        onSelect = viewModel::onUnitChange,
                    )
                }
            }

            // Category
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HoraeSectionHeader("Categorie")
                CategoryDropdown(
                    category = state.category,
                    options = state.availableCategories,
                    onSelect = viewModel::onCategoryChange,
                )
            }

            // Components
            Column(
                modifier = Modifier.tutorialAnchor("recipes.create.ingredients"),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                HoraeSectionHeader("Componente & Ingrediente")
                state.components.forEach { comp ->
                    ComponentEditor(
                        component = comp,
                        onNameChange = { viewModel.onComponentNameChange(comp.id, it) },
                        onRemove = { viewModel.removeComponent(comp.id) },
                        onAddIngredient = { viewModel.addIngredient(comp.id) },
                        onRemoveIngredient = { viewModel.removeIngredient(comp.id, it) },
                        onPickIngredient = { ingId -> pickerTarget = comp.id to ingId },
                        onQuantityChange = { ingId, q -> viewModel.onIngredientQuantityChange(comp.id, ingId, q) },
                        onUnitChange = { ingId, u -> viewModel.onIngredientUnitChange(comp.id, ingId, u) },
                        onPrepChange = { ingId, p -> viewModel.onIngredientPrepChange(comp.id, ingId, p) },
                    )
                }
                OutlinedButton(onClick = viewModel::addComponent, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Add, null, modifier = Modifier.padding(end = 8.dp))
                    Text("Adaugă componentă")
                }
            }

            // Byproduct
            Column(
                modifier = Modifier.tutorialAnchor("recipes.create.byproduct"),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                HoraeSectionHeader("Subprodus")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val hasBp = state.pendingByproduct != null || state.existingByproductNames.isNotEmpty()
                    Checkbox(
                        checked = hasBp,
                        onCheckedChange = { on ->
                            if (on) {
                                if (state.pendingByproduct == null) showByproductSheet = true
                            } else {
                                viewModel.setPendingByproduct(null)
                            }
                        },
                        enabled = state.existingByproductNames.isEmpty(),
                    )
                    Text(
                        "Rețeta lasă un subprodus",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                }
                state.existingByproductNames.forEach { n ->
                    Text("• $n (existent)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                state.pendingByproduct?.let { bp ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { showByproductSheet = true }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(bp.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Text(
                            formatQty(RoFormat.parseDecimal(bp.quantityText) ?: 0.0, bp.unit.name),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    "Ce rămâne după această rețetă (ex: resturi de blat). Se salvează ca semipreparat marcat ca subprodus.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Button(
                onClick = viewModel::save,
                enabled = state.canSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .tutorialAnchor("recipes.create.save"),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.Check, null, modifier = Modifier.padding(end = 8.dp))
                }
                Text(if (state.isEditing) "Salvează modificările" else "Creează rețeta")
            }

            Spacer(Modifier.padding(8.dp))
        }
    }

    // Ingredient picker
    pickerTarget?.let { (compId, ingId) ->
        IngredientPickerSheet(
            onDismiss = { pickerTarget = null },
            onSelectMaterial = { m ->
                viewModel.selectRawMaterial(compId, ingId, m)
                pickerTarget = null
            },
            onSelectRecipe = { r ->
                viewModel.selectSemipreparat(compId, ingId, r)
                pickerTarget = null
            },
        )
    }

    if (showByproductSheet) {
        ByproductSheet(
            initial = state.pendingByproduct,
            onDismiss = { showByproductSheet = false },
            onConfirm = {
                viewModel.setPendingByproduct(it)
                showByproductSheet = false
            },
        )
    }
}

@Composable
private fun ComponentEditor(
    component: ComponentForm,
    onNameChange: (String) -> Unit,
    onRemove: () -> Unit,
    onAddIngredient: () -> Unit,
    onRemoveIngredient: (String) -> Unit,
    onPickIngredient: (String) -> Unit,
    onQuantityChange: (String, String) -> Unit,
    onUnitChange: (String, UnitType) -> Unit,
    onPrepChange: (String, String) -> Unit,
) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = component.name,
                    onValueChange = onNameChange,
                    placeholder = { Text("Nume componentă (ex: Blat, Cremă)") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onRemove) {
                    Icon(Icons.Default.Delete, "Șterge componenta", tint = MaterialTheme.colorScheme.error)
                }
            }

            component.ingredients.forEach { ing ->
                IngredientEditor(
                    ingredient = ing,
                    onPick = { onPickIngredient(ing.id) },
                    onQuantityChange = { onQuantityChange(ing.id, it) },
                    onUnitChange = { onUnitChange(ing.id, it) },
                    onPrepChange = { onPrepChange(ing.id, it) },
                    onRemove = { onRemoveIngredient(ing.id) },
                )
            }

            TextButton(
                onClick = onAddIngredient,
                enabled = component.ingredients.all { it.hasSource },
            ) {
                Icon(Icons.Default.Add, null, modifier = Modifier.padding(end = 6.dp))
                Text("Adaugă ingredient")
            }
        }
    }
}

@Composable
private fun IngredientEditor(
    ingredient: IngredientForm,
    onPick: () -> Unit,
    onQuantityChange: (String) -> Unit,
    onUnitChange: (UnitType) -> Unit,
    onPrepChange: (String) -> Unit,
    onRemove: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // Source button
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onPick)
                    .padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (ingredient.isSemipreparat) HoraeStatusBadge("SP", StatusPurple)
                Text(
                    ingredient.name.ifBlank { "Selectează ingredient" },
                    color = if (ingredient.name.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                Icon(Icons.Default.KeyboardArrowDown, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = onRemove) {
                Icon(Icons.Default.Close, "Șterge ingredient", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (ingredient.hasSource) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = ingredient.quantityText,
                    onValueChange = onQuantityChange,
                    placeholder = { Text("Cant.") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                if (ingredient.isSemipreparat) {
                    // Fixed to the sub-recipe's yield unit.
                    Text(
                        ingredient.unit.abbreviation,
                        modifier = Modifier.width(70.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                    )
                } else {
                    UnitDropdown(
                        unit = ingredient.unit,
                        choices = ingredient.unitChoices.ifEmpty { unitsInFamily(ingredient.unit) },
                        onSelect = onUnitChange,
                    )
                }
            }
            OutlinedTextField(
                value = ingredient.prepMethod,
                onValueChange = onPrepChange,
                placeholder = { Text("Preparare (opțional, ex: cernut)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * Unit choice: a compact button that opens a list sheet (no dropdown). New input is
 * metric-only (g, kg, ml, l, buc); a stored legacy unit (oz, lb, cană…) stays listed
 * only while it is the current value, so old recipes still display correctly.
 */
@Composable
private fun UnitDropdown(
    unit: UnitType,
    choices: List<UnitType>,
    onSelect: (UnitType) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val options = selectableUnits(choices, unit)
    OutlinedButton(onClick = { open = true }) {
        Text(unit.abbreviation)
        Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Alege unitatea")
    }
    if (open) {
        com.horae.app.ui.common.ChoiceListSheet(
            title = "Unitate",
            items = options,
            selected = unit,
            itemLabel = { "${it.displayName} (${it.abbreviation})" },
            searchable = false,
            onSelect = { u -> if (u != null) onSelect(u) },
            onDismiss = { open = false },
        )
    }
}

@Composable
private fun CategoryDropdown(
    category: String?,
    options: List<String>,
    onSelect: (String?) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    com.horae.app.ui.common.HPickerField(
        label = null,
        value = category,
        placeholder = "Fără categorie",
        onClick = { open = true },
    )
    if (open) {
        com.horae.app.ui.common.ChoiceListSheet(
            title = "Categorie",
            items = options,
            selected = category,
            itemLabel = { it },
            noneLabel = "Fără categorie",
            searchPlaceholder = "Caută categoria",
            onSelect = onSelect,
            onDismiss = { open = false },
        )
    }
}

// ── Ingredient picker bottom sheet (raw materials + semipreparate) ──

@HiltViewModel
class IngredientPickerViewModel @Inject constructor(
    private val stockRepository: StockRepository,
    private val recipeRepository: RecipeRepository,
) : ViewModel() {

    data class State(
        val search: String = "",
        val materials: List<RawMaterialResponse> = emptyList(),
        val recipes: List<RecipeListItemDto> = emptyList(),
        val isLoading: Boolean = false,
    ) {
        val semipreparate: List<RecipeListItemDto> get() = recipes.filter { !it.isArchived }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init { search() }

    fun onSearchChange(q: String) {
        _state.update { it.copy(search = q) }
        search()
    }

    private fun search() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val q = _state.value.search.takeIf { it.isNotBlank() }
            val materialsDeferred = async {
                runCatching {
                    stockRepository.getRawMaterials(limit = 200, search = q).data
                        .filter { it.status != "DISCONTINUED" }
                }.getOrDefault(emptyList())
            }
            val recipesDeferred = async {
                runCatching {
                    recipeRepository.getRecipes(limit = 200, type = "SEMIPREPARAT", search = q).data
                }.getOrDefault(emptyList())
            }
            _state.update {
                it.copy(materials = materialsDeferred.await(), recipes = recipesDeferred.await(), isLoading = false)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IngredientPickerSheet(
    onDismiss: () -> Unit,
    onSelectMaterial: (RawMaterialResponse) -> Unit,
    onSelectRecipe: (RecipeListItemDto) -> Unit,
    viewModel: IngredientPickerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Text(
                "Alege ingredient",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            OutlinedTextField(
                value = state.search,
                onValueChange = viewModel::onSearchChange,
                placeholder = { Text("Caută ingredient") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            if (state.isLoading && state.materials.isEmpty() && state.recipes.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 460.dp)) {
                    if (state.materials.isNotEmpty()) {
                        item { SectionLabel("Materii prime") }
                        items(state.materials) { m ->
                            PickerRow(title = m.title, subtitle = unitAbbrev(m.unit)) { onSelectMaterial(m) }
                        }
                    }
                    if (state.semipreparate.isNotEmpty()) {
                        item { SectionLabel("Semipreparate") }
                        items(state.semipreparate) { r ->
                            PickerRow(title = r.name, subtitle = unitAbbrev(r.unit), badge = "SP") { onSelectRecipe(r) }
                        }
                    }
                    if (!state.isLoading && state.materials.isEmpty() && state.semipreparate.isEmpty()) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                                Text("Niciun ingredient găsit", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun PickerRow(title: String, subtitle: String, badge: String? = null, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (badge != null) HoraeStatusBadge(badge, StatusPurple)
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// ── Byproduct mini-sheet ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ByproductSheet(
    initial: PendingByproduct?,
    onDismiss: () -> Unit,
    onConfirm: (PendingByproduct) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var qty by remember { mutableStateOf(initial?.quantityText ?: "") }
    var unit by remember { mutableStateOf(initial?.unit ?: UnitType.GRAME) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Subprodus nou", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                placeholder = { Text("ex: Resturi de blat") },
                label = { Text("Nume *") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = qty,
                    onValueChange = { qty = it },
                    placeholder = { Text("0") },
                    label = { Text("Cantitate *") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.weight(1f),
                )
                UnitDropdown(unit = unit, choices = UnitType.metricInputUnits, onSelect = { unit = it })
            }
            Button(
                onClick = { onConfirm(PendingByproduct(name.trim(), qty, unit)) },
                enabled = name.isNotBlank() && (RoFormat.parseDecimal(qty) ?: 0.0) > 0.0,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Salvează subprodusul") }
        }
    }
}
