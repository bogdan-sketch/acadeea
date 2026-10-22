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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.TestConsumptionItemDto
import com.horae.app.data.remote.dto.TestConsumptionRequest
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.ChoiceChips
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
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Preferred location: the organisation default when listed, else the one named
 * "laborator" (production happens there), else the first. Same rule as iOS/web.
 */
internal fun List<LocationResponse>.preferredDefault(defaultId: String?): LocationResponse? =
    firstOrNull { it.id == defaultId }
        ?: firstOrNull { searchKey(it.name).contains("laborator") }
        ?: firstOrNull()

/** A raw material or consumable that can be consumed; [unit] is its stock unit. */
data class StockPick(
    val id: String,
    val title: String,
    val unit: String,
    val stockCount: Double,
    val isConsumable: Boolean,
)

data class TestRow(
    val key: String = UUID.randomUUID().toString(),
    val item: StockPick? = null,
    val quantity: String = "",
) {
    val parsed: Double? get() = RoFormat.parseDecimal(quantity)
    val isValid: Boolean get() = item != null && (parsed ?: 0.0) > 0.0
}

data class TestConsumptionUiState(
    val locations: List<LocationResponse> = emptyList(),
    val locationId: String? = null,
    val picks: List<StockPick> = emptyList(),
    val rows: List<TestRow> = listOf(TestRow()),
    val notes: String = "",
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
) {
    val canSave: Boolean get() = locationId != null && rows.any { it.isValid } && !isSaving
}

@HiltViewModel
class TestConsumptionViewModel @Inject constructor(
    private val stockRepository: StockRepository,
    private val locationRepository: LocationRepository,
    private val brandingManager: BrandingManager,
) : ViewModel() {

    private val _state = MutableStateFlow(TestConsumptionUiState())
    val state: StateFlow<TestConsumptionUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                val locs = async {
                    runCatching { locationRepository.getMyLocations() }.getOrDefault(emptyList())
                        .ifEmpty { locationRepository.getLocations().filter { it.isActive } }
                }
                val raws = async { stockRepository.getRawMaterials(limit = 200).data }
                val cons = async { runCatching { stockRepository.getConsumables(limit = 200).data }.getOrDefault(emptyList()) }
                val locations = locs.await()
                val picks = raws.await().map { StockPick(it.id, it.title, it.unit, it.stockCount, false) } +
                    cons.await().map { StockPick(it.id, it.title, UnitType.BUCATI.name, it.stockCount, true) }
                _state.update {
                    it.copy(
                        locations = locations,
                        locationId = it.locationId ?: locations.preferredDefault(brandingManager.defaultLocationId)?.id,
                        picks = picks.sortedBy { p -> searchKey(p.title) },
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.update { it.copy(isLoading = false, error = ApiErrors.userMessage(e, "Nu am putut încărca articolele")) }
            }
        }
    }

    fun setLocation(id: String) = _state.update { it.copy(locationId = id) }
    fun setNotes(v: String) = _state.update { it.copy(notes = v) }
    fun addRow() = _state.update { it.copy(rows = it.rows + TestRow()) }
    fun removeRow(key: String) = _state.update {
        val left = it.rows.filterNot { r -> r.key == key }
        it.copy(rows = left.ifEmpty { listOf(TestRow()) })
    }
    fun setItem(key: String, item: StockPick?) = updateRow(key) { it.copy(item = item) }
    fun setQuantity(key: String, v: String) = updateRow(key) { it.copy(quantity = RoFormat.sanitizeDecimalInput(v)) }
    fun dismissError() = _state.update { it.copy(error = null) }

    private fun updateRow(key: String, f: (TestRow) -> TestRow) =
        _state.update { s -> s.copy(rows = s.rows.map { if (it.key == key) f(it) else it }) }

    fun submit() {
        val s = _state.value
        val locationId = s.locationId ?: return
        val items = s.rows.filter { it.isValid }.map { r ->
            val item = r.item!!
            TestConsumptionItemDto(
                rawMaterialId = item.id.takeUnless { item.isConsumable },
                consumableId = item.id.takeIf { item.isConsumable },
                quantity = r.parsed!!,
                // Typed in the item's own stock unit — sent in that same unit.
                unit = item.unit,
            )
        }
        if (items.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, error = null) }
            try {
                stockRepository.testConsumption(
                    TestConsumptionRequest(locationId, items, s.notes.trim().takeIf { it.isNotBlank() }),
                )
                _state.update { it.copy(isSaving = false, saved = true) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _state.update { it.copy(isSaving = false, error = ApiErrors.userMessage(e, "Nu am putut înregistra consumul")) }
            }
        }
    }
}

/**
 * "Consum teste" — takes raw materials / consumables used for tests and R&D out of
 * stock at one location (FIFO on lots, like production; no task, no product).
 */
@Composable
fun TestConsumptionScreen(
    navController: NavController,
    viewModel: TestConsumptionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var pickerRow by remember { mutableStateOf<String?>(null) }
    val sch = HoraeTheme.scheme

    LaunchedEffect(state.saved) { if (state.saved) navController.popBackStack() }
    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

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
                Text("Consum teste", style = AppFont.title(28f), color = sch.ink)
                Text(
                    "Scoate din stoc ce ai folosit la teste și R&D",
                    style = AppFont.body(13f),
                    color = sch.muted,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HSectionHeader("Locație")
                if (state.locations.isEmpty() && !state.isLoading) {
                    Text("Nu ai nicio locație activă.", style = AppFont.body(13f), color = sch.muted)
                }
                ChoiceChips(
                    options = state.locations,
                    selected = state.locations.firstOrNull { it.id == state.locationId },
                    onSelect = { viewModel.setLocation(it.id) },
                    label = { it.name },
                    wrap = true,
                )
                Text(
                    "Stocul se scade din această locație, FIFO pe loturi — la fel ca la producție.",
                    style = AppFont.body(12f),
                    color = sch.muted,
                )
            }

            state.rows.forEachIndexed { index, row ->
                HCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Articol ${index + 1}",
                            style = AppFont.body(14f, FontWeight.Bold),
                            color = sch.ink,
                            modifier = Modifier.weight(1f),
                        )
                        if (state.rows.size > 1) {
                            HIconButton(
                                Icons.Outlined.Delete, "Șterge articolul ${index + 1}",
                                { viewModel.removeRow(row.key) },
                                variant = HIconButtonVariant.DESTRUCTIVE,
                            )
                        }
                    }
                    HPickerField(
                        label = null,
                        value = row.item?.title,
                        placeholder = "Alege articolul",
                        onClick = { pickerRow = row.key },
                    )
                    row.item?.let {
                        Text(
                            "În stoc (total): ${formatQty(it.stockCount, it.unit)}",
                            style = AppFont.body(12f),
                            color = sch.muted,
                            modifier = Modifier.padding(start = 4.dp, top = 4.dp),
                        )
                    }
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
                        Text(
                            row.item?.let { UnitType.fromString(it.unit)?.abbreviation ?: it.unit } ?: "—",
                            style = AppFont.body(15f, FontWeight.SemiBold),
                            color = sch.muted,
                        )
                    }
                }
            }

            HSecondaryButton(text = "Adaugă articol", onClick = viewModel::addRow, icon = Icons.Filled.Add, accentText = true)

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HSectionHeader("Notă")
                OutlinedTextField(
                    value = state.notes,
                    onValueChange = viewModel::setNotes,
                    placeholder = { Text("Opțional — ex. teste rețetă nouă") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
                Text("Nota apare pe fiecare mișcare de stoc generată.", style = AppFont.body(12f), color = sch.muted)
            }

            HPrimaryButton(
                text = "Înregistrează consumul",
                onClick = viewModel::submit,
                enabled = state.canSave,
                loading = state.isSaving,
                icon = Icons.Filled.Check,
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    pickerRow?.let { key ->
        val current = state.rows.firstOrNull { it.key == key }?.item
        ChoiceListSheet(
            title = "Alege articolul",
            items = state.picks,
            selected = current,
            itemLabel = { it.title },
            itemSubtitle = { (if (it.isConsumable) "Consumabil" else "Materie primă") + " · " + formatQty(it.stockCount, it.unit) },
            itemKey = { (if (it.isConsumable) "c-" else "r-") + it.id },
            searchable = true,
            searchPlaceholder = "Caută materie primă sau consumabil",
            onSelect = { viewModel.setItem(key, it) },
            onDismiss = { pickerRow = null },
        )
    }
}
