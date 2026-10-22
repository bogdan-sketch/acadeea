package com.horae.app.ui.transfers

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
import androidx.compose.foundation.layout.size
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
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import com.horae.app.data.remote.dto.CreateTransferRequest
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.remote.dto.TransferItemRequest
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.repository.StockRepository
import com.horae.app.data.repository.TransferRepository
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UI State + ViewModel
// ---------------------------------------------------------------------------

/** A raw-material line being added to the transfer, with a free-text quantity. */
data class TransferItemDraft(
    val materialId: String,
    val title: String,
    val unit: String,
    val quantity: String = "",
) {
    val qtyValue: Double get() = quantity.replace(',', '.').toDoubleOrNull() ?: 0.0
}

data class TransferCreateUiState(
    val locations: List<LocationResponse> = emptyList(),
    val materials: List<RawMaterialResponse> = emptyList(),
    val materialSearch: String = "",
    val fromLocationId: String? = null,
    val toLocationId: String? = null,
    val items: List<TransferItemDraft> = emptyList(),
    val notes: String = "",
    val isLoading: Boolean = false,
    val isLoadingMaterials: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
) {
    val fromLocation: LocationResponse? get() = locations.firstOrNull { it.id == fromLocationId }
    val toLocation: LocationResponse? get() = locations.firstOrNull { it.id == toLocationId }

    val canSave: Boolean
        get() = fromLocationId != null &&
            toLocationId != null &&
            fromLocationId != toLocationId &&
            items.any { it.qtyValue > 0.0 } &&
            !isSaving
}

@HiltViewModel
class TransferCreateViewModel @Inject constructor(
    private val transferRepository: TransferRepository,
    private val stockRepository: StockRepository,
    private val brandingManager: BrandingManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TransferCreateUiState())
    val uiState: StateFlow<TransferCreateUiState> = _uiState.asStateFlow()

    init {
        loadLocations()
        loadMaterials()
    }

    private fun loadLocations() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val locations = transferRepository.getLocations().filter { it.isActive }
                // Sursa implicită = locația implicită a organizației (Stoc › Locații), dacă există.
                val preferred = brandingManager.defaultLocationId?.takeIf { d -> locations.any { l -> l.id == d } }
                _uiState.update { it.copy(locations = locations, isLoading = false, fromLocationId = it.fromLocationId ?: preferred) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea locațiilor"))
                }
            }
        }
    }

    fun loadMaterials() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMaterials = true) }
            try {
                val result = stockRepository.getRawMaterials(
                    limit = 100,
                    search = _uiState.value.materialSearch.takeIf { q -> q.isNotBlank() },
                )
                _uiState.update { it.copy(materials = result.data, isLoadingMaterials = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingMaterials = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea materiilor prime"))
                }
            }
        }
    }

    fun onMaterialSearchChange(q: String) {
        _uiState.update { it.copy(materialSearch = q) }
        loadMaterials()
    }

    fun onFromSelected(id: String) {
        _uiState.update {
            it.copy(fromLocationId = id, toLocationId = it.toLocationId.takeIf { d -> d != id })
        }
    }

    fun onToSelected(id: String) {
        _uiState.update { it.copy(toLocationId = id) }
    }

    fun addMaterial(material: RawMaterialResponse) {
        _uiState.update {
            if (it.items.any { d -> d.materialId == material.id }) return@update it
            it.copy(
                items = it.items + TransferItemDraft(
                    materialId = material.id,
                    title = material.title,
                    unit = material.unit,
                ),
            )
        }
    }

    fun removeItem(materialId: String) {
        _uiState.update { it.copy(items = it.items.filterNot { d -> d.materialId == materialId }) }
    }

    fun onItemQuantityChange(materialId: String, quantity: String) {
        _uiState.update {
            it.copy(
                items = it.items.map { d ->
                    if (d.materialId == materialId) d.copy(quantity = quantity) else d
                },
            )
        }
    }

    fun onNotesChange(notes: String) {
        _uiState.update { it.copy(notes = notes) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    fun createTransfer() {
        val s = _uiState.value
        val fromId = s.fromLocationId ?: return
        val toId = s.toLocationId ?: return
        val items = s.items
            .filter { it.qtyValue > 0.0 }
            .map { TransferItemRequest(rawMaterialId = it.materialId, quantity = it.qtyValue, unit = it.unit) }
        if (items.isEmpty()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                transferRepository.createTransfer(
                    CreateTransferRequest(
                        fromLocationId = fromId,
                        toLocationId = toId,
                        notes = s.notes.takeIf { it.isNotBlank() },
                        items = items,
                    ),
                )
                _uiState.update { it.copy(isSaving = false, saved = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSaving = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la crearea transferului"))
                }
            }
        }
    }
}

private fun unitAbbrev(unit: String): String =
    runCatching { UnitType.valueOf(unit).abbreviation }.getOrDefault(unit.lowercase())

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

private enum class PickerTarget { SOURCE, DEST, ITEM }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransferCreateScreen(
    navController: NavController,
    viewModel: TransferCreateViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var picker by remember { mutableStateOf<PickerTarget?>(null) }

    if (state.saved) {
        LaunchedEffect(Unit) {
            navController.previousBackStackEntry?.savedStateHandle?.set("transfer_created", true)
            navController.popBackStack()
        }
    }

    state.error?.let { msg -> ErrorDialog(message = msg, onDismiss = viewModel::dismissError) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Transfer nou", fontWeight = FontWeight.Bold) },
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
    ) { pad ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Source location
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HoraeSectionHeader("De la (locație sursă) *")
                PickerCard(
                    placeholder = "Alege locația sursă",
                    value = state.fromLocation?.name,
                    onClick = { picker = PickerTarget.SOURCE },
                )
            }

            // Destination location
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HoraeSectionHeader("Către (destinație) *")
                PickerCard(
                    placeholder = "Alege destinația",
                    value = state.toLocation?.name,
                    onClick = { picker = PickerTarget.DEST },
                )
            }

            // Items
            Column(
                modifier = Modifier.tutorialAnchor("stock.transfers.items"),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                HoraeSectionHeader("Ce transferi? *")
                if (state.items.isEmpty()) {
                    Text(
                        "Niciun produs adăugat.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                state.items.forEach { item ->
                    HoraeCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                item.title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = item.quantity,
                                onValueChange = { viewModel.onItemQuantityChange(item.materialId, it) },
                                placeholder = { Text("0") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.size(width = 96.dp, height = 56.dp),
                            )
                            Text(
                                unitAbbrev(item.unit),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            IconButton(onClick = { viewModel.removeItem(item.materialId) }) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "Elimină",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                TextButton(onClick = { picker = PickerTarget.ITEM }) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(6.dp))
                    Text("Adaugă produs")
                }
            }

            // Notes
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HoraeSectionHeader("Note")
                OutlinedTextField(
                    value = state.notes,
                    onValueChange = viewModel::onNotesChange,
                    placeholder = { Text("Note transfer (opțional)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
            }

            Button(
                onClick = viewModel::createTransfer,
                enabled = state.canSave,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.Check, null, modifier = Modifier.padding(end = 8.dp))
                }
                Text("Creează")
            }

            Spacer(Modifier.padding(8.dp))
        }
    }

    // Pickers
    when (picker) {
        PickerTarget.SOURCE, PickerTarget.DEST -> {
            val isSource = picker == PickerTarget.SOURCE
            val choices = state.locations.filter { if (isSource) true else it.id != state.fromLocationId }
            LocationPickerSheet(
                title = if (isSource) "Locație sursă" else "Destinație",
                locations = choices,
                onSelect = { id ->
                    if (isSource) viewModel.onFromSelected(id) else viewModel.onToSelected(id)
                    picker = null
                },
                onDismiss = { picker = null },
            )
        }
        PickerTarget.ITEM -> MaterialPickerSheet(
            materials = state.materials,
            search = state.materialSearch,
            isLoading = state.isLoadingMaterials,
            addedIds = state.items.map { it.materialId }.toSet(),
            onSearchChange = viewModel::onMaterialSearchChange,
            onSelect = { material ->
                viewModel.addMaterial(material)
                picker = null
            },
            onDismiss = { picker = null },
        )
        null -> Unit
    }
}

// ---------------------------------------------------------------------------
// Reusable picker card + sheets
// ---------------------------------------------------------------------------

@Composable
private fun PickerCard(placeholder: String, value: String?, onClick: () -> Unit) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = value ?: placeholder,
                color = if (value == null) MaterialTheme.colorScheme.onSurfaceVariant
                else MaterialTheme.colorScheme.onSurface,
                fontWeight = if (value == null) FontWeight.Normal else FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Icon(
                Icons.Default.KeyboardArrowRight,
                null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LocationPickerSheet(
    title: String,
    locations: List<LocationResponse>,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            if (locations.isEmpty()) {
                Text(
                    "Nicio locație disponibilă.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp),
                )
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                    items(locations, key = { it.id }) { location ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelect(location.id) }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(location.name, fontWeight = FontWeight.SemiBold)
                                if (location.address.isNotBlank()) {
                                    Text(
                                        location.address,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MaterialPickerSheet(
    materials: List<RawMaterialResponse>,
    search: String,
    isLoading: Boolean,
    addedIds: Set<String>,
    onSearchChange: (String) -> Unit,
    onSelect: (RawMaterialResponse) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Text(
                "Adaugă produs",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            OutlinedTextField(
                value = search,
                onValueChange = onSearchChange,
                placeholder = { Text("Caută material") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            if (isLoading && materials.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                    items(materials, key = { it.id }) { material ->
                        val added = material.id in addedIds
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !added) { onSelect(material) }
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(material.title, fontWeight = FontWeight.SemiBold)
                                Text(
                                    "${com.horae.app.ui.common.formatQty(material.stockCount, material.unit)} în stoc",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (added) {
                                Icon(
                                    Icons.Default.Check,
                                    contentDescription = "Adăugat",
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
