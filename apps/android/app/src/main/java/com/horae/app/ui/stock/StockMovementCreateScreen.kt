package com.horae.app.ui.stock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.CreateStockMovementRequest
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.ChoiceListSheet
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HPickerField
import com.horae.app.ui.common.HPrimaryButton
import com.horae.app.ui.common.HSectionHeader
import com.horae.app.ui.common.HSegmentedControl
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.RoFormat
import com.horae.app.ui.common.accentGradientBackground
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── ViewModel ──

/**
 * Manual stock movement types. The API accepts ONLY these two for manual entry
 * (`stock.service.ts` MANUAL_MOVEMENT_TYPES); production/sales/test exits come from
 * their own flows (tasks, Vânzări → stoc, Teste).
 */
enum class MovementTypeOption(val apiValue: String, val label: String) {
    INTRARE("INTRARE", "Intrare"),
    AJUSTARE("AJUSTARE", "Ajustare"),
}

data class StockMovementCreateUiState(
    val materials: List<RawMaterialResponse> = emptyList(),
    val selectedMaterial: RawMaterialResponse? = null,
    val movementType: MovementTypeOption = MovementTypeOption.INTRARE,
    val quantity: String = "",
    val note: String = "",
    // INTRARE only — lot + expiry + price recorded on the intake (StockLot).
    val lotNumber: String = "",
    val expiryDate: LocalDate? = null,
    val purchasePrice: String = "",
    val isLoadingMaterials: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
) {
    val parsedQuantity: Double? get() = RoFormat.parseDecimal(quantity)

    val canSave: Boolean
        get() {
            val q = parsedQuantity ?: return false
            // AJUSTARE sets the absolute stock, so 0 is valid (zero the stock).
            val qtyOk = if (movementType == MovementTypeOption.INTRARE) q > 0.0 else q >= 0.0
            return selectedMaterial != null && qtyOk && !isSaving
        }
}

@HiltViewModel
class StockMovementCreateViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val stockRepository: StockRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        StockMovementCreateUiState(
            movementType = MovementTypeOption.entries
                .firstOrNull { it.apiValue == savedStateHandle.get<String>(StockRoutes.ARG_TYPE) }
                ?: MovementTypeOption.INTRARE,
        ),
    )
    val uiState: StateFlow<StockMovementCreateUiState> = _uiState.asStateFlow()

    init {
        loadMaterials()
        savedStateHandle.get<String>(StockRoutes.ARG_MATERIAL_ID)?.takeIf { it.isNotBlank() }?.let(::preselect)
    }

    private fun loadMaterials() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMaterials = true) }
            try {
                val result = stockRepository.getRawMaterials(limit = 200)
                _uiState.update { it.copy(materials = result.data, isLoadingMaterials = false) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(isLoadingMaterials = false, error = ApiErrors.userMessage(e, "Nu am putut încărca materiile prime"))
                }
            }
        }
    }

    private fun preselect(id: String) {
        viewModelScope.launch {
            runCatching { stockRepository.getRawMaterial(id) }
                .onSuccess { m -> _uiState.update { it.copy(selectedMaterial = m) } }
        }
    }

    fun onMaterialSelected(material: RawMaterialResponse?) = _uiState.update { it.copy(selectedMaterial = material) }
    fun onMovementTypeChange(type: MovementTypeOption) = _uiState.update { it.copy(movementType = type) }
    fun onQuantityChange(q: String) = _uiState.update { it.copy(quantity = RoFormat.sanitizeDecimalInput(q)) }
    fun onNoteChange(note: String) = _uiState.update { it.copy(note = note) }
    fun onLotNumberChange(v: String) = _uiState.update { it.copy(lotNumber = v) }
    fun onExpiryDateChange(v: LocalDate?) = _uiState.update { it.copy(expiryDate = v) }
    fun onPurchasePriceChange(v: String) = _uiState.update { it.copy(purchasePrice = RoFormat.sanitizeDecimalInput(v, maxDecimals = 2)) }
    fun dismissError() = _uiState.update { it.copy(error = null) }

    fun createMovement() {
        val s = _uiState.value
        if (!s.canSave) return
        val material = s.selectedMaterial ?: return
        val qty = s.parsedQuantity ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                val isIntrare = s.movementType == MovementTypeOption.INTRARE
                stockRepository.createMovement(
                    CreateStockMovementRequest(
                        rawMaterialId = material.id,
                        movementType = s.movementType.apiValue,
                        quantity = qty,
                        // Always the material's own stock unit — the quantity is typed in it.
                        unit = material.unit,
                        referenceNote = s.note.trim().takeIf { it.isNotBlank() },
                        lotNumber = s.lotNumber.trim().takeIf { isIntrare && it.isNotBlank() },
                        expiryDate = s.expiryDate?.takeIf { isIntrare }?.let(RoDate::dateOnlyInstant),
                        purchasePrice = RoFormat.parseDecimal(s.purchasePrice)?.takeIf { isIntrare },
                    ),
                )
                _uiState.update { it.copy(isSaving = false, saved = true) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(isSaving = false, error = ApiErrors.userMessage(e, "Nu am putut salva mișcarea"))
                }
            }
        }
    }
}

private fun unitAbbrev(unit: String?): String = UnitType.fromString(unit)?.abbreviation ?: unit.orEmpty().lowercase()

// ── Screen ──

/**
 * Recepție ([receiveMode] = INTRARE only, with lot / expiry / price) or Mișcare
 * (Intrare | Ajustare). Quantities are typed and sent in the material's own unit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockMovementCreateScreen(
    navController: NavController,
    receiveMode: Boolean = false,
    viewModel: StockMovementCreateViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showMaterialSheet by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    val s = HoraeTheme.scheme
    val type = if (receiveMode) MovementTypeOption.INTRARE else state.movementType

    LaunchedEffect(receiveMode) { if (receiveMode) viewModel.onMovementTypeChange(MovementTypeOption.INTRARE) }
    LaunchedEffect(state.saved) { if (state.saved) navController.popBackStack() }

    state.error?.let { msg -> ErrorDialog(message = msg, onDismiss = viewModel::dismissError) }

    Column(Modifier.fillMaxSize().accentGradientBackground()) {
        StockTopBar(onBack = { navController.popBackStack() })
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column {
                Text(
                    if (receiveMode) "Recepție marfă" else "Mișcare de stoc",
                    style = AppFont.title(28f),
                    color = s.ink,
                )
                Text(
                    if (receiveMode) "Intrare în stoc cu lot, expirare și preț" else "Intrare sau ajustare manuală",
                    style = AppFont.body(13f),
                    color = s.muted,
                )
            }

            if (!receiveMode) {
                HSegmentedControl(
                    options = MovementTypeOption.entries.toList(),
                    selected = state.movementType,
                    onSelect = viewModel::onMovementTypeChange,
                    label = { it.label },
                )
            }

            Column(Modifier.tutorialAnchor("stock.receive.addRow")) {
                val m = state.selectedMaterial
                HPickerField(
                    label = "Materie primă",
                    value = m?.title,
                    placeholder = if (state.isLoadingMaterials) "Se încarcă…" else "Alege materia primă",
                    onClick = { showMaterialSheet = true },
                )
                if (m != null) {
                    Text(
                        "În stoc: ${formatQty(m.stockCount, m.unit)}",
                        style = AppFont.body(12f),
                        color = s.muted,
                        modifier = Modifier.padding(start = 4.dp, top = 4.dp),
                    )
                }
            }

            Column {
                HSectionHeader(if (type == MovementTypeOption.AJUSTARE) "Stoc nou (valoare reală)" else "Cantitate")
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = state.quantity,
                        onValueChange = viewModel::onQuantityChange,
                        placeholder = { Text("0") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        state.selectedMaterial?.let { unitAbbrev(it.unit) } ?: "—",
                        style = AppFont.body(15f, FontWeight.SemiBold),
                        color = s.muted,
                    )
                }
                if (type == MovementTypeOption.AJUSTARE) {
                    Text(
                        "Stocul materialului devine exact această valoare.",
                        style = AppFont.body(12f),
                        color = s.muted,
                        modifier = Modifier.padding(start = 4.dp, top = 4.dp),
                    )
                }
            }

            if (type == MovementTypeOption.INTRARE) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HSectionHeader("Lot, expirare și preț")
                    OutlinedTextField(
                        value = state.lotNumber,
                        onValueChange = viewModel::onLotNumberChange,
                        placeholder = { Text("Nr. lot (opțional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    HPickerField(
                        label = null,
                        value = state.expiryDate?.let(RoDate::fullDate),
                        placeholder = "Data expirării (opțional)",
                        onClick = { showDatePicker = true },
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = state.purchasePrice,
                            onValueChange = viewModel::onPurchasePriceChange,
                            placeholder = { Text("Preț achiziție (opțional)") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "RON/${state.selectedMaterial?.let { unitAbbrev(it.unit) } ?: "unit."}",
                            style = AppFont.body(14f, FontWeight.SemiBold),
                            color = s.muted,
                        )
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HSectionHeader("Notă / referință")
                OutlinedTextField(
                    value = state.note,
                    onValueChange = viewModel::onNoteChange,
                    placeholder = { Text("Ex. factură, motiv ajustare (opțional)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
            }

            HPrimaryButton(
                text = if (receiveMode) "Înregistrează recepția" else "Salvează mișcarea",
                onClick = viewModel::createMovement,
                enabled = state.canSave,
                loading = state.isSaving,
                icon = Icons.Filled.Check,
                modifier = Modifier.tutorialAnchor("stock.receive.submit"),
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    if (showMaterialSheet) {
        ChoiceListSheet(
            title = "Alege materia primă",
            items = state.materials,
            selected = state.selectedMaterial,
            itemLabel = { it.title },
            itemSubtitle = { "În stoc: ${formatQty(it.stockCount, it.unit)}" },
            itemKey = { it.id },
            searchable = true,
            searchPlaceholder = "Caută materia primă",
            onSelect = viewModel::onMaterialSelected,
            onDismiss = { showMaterialSheet = false },
        )
    }

    if (showDatePicker) {
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = state.expiryDate?.let(RoDate::toPickerMillis),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.onExpiryDateChange(pickerState.selectedDateMillis?.let(RoDate::fromPickerMillis))
                    showDatePicker = false
                }) { Text("Alege") }
            },
            dismissButton = {
                TextButton(onClick = {
                    viewModel.onExpiryDateChange(null)
                    showDatePicker = false
                }) { Text("Fără dată") }
            },
        ) { DatePicker(state = pickerState) }
    }
}
