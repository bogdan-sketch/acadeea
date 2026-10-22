package com.horae.app.ui.integrations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.CreateProductMappingRequest
import com.horae.app.data.remote.dto.ExternalOrderResponseDto
import com.horae.app.data.remote.dto.IntegrationResponseDto
import com.horae.app.data.remote.dto.ProductMappingResponseDto
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.remote.dto.SyncResultDto
import com.horae.app.data.repository.IntegrationRepository
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatusBadge
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class IntegrationDetailUiState(
    val integration: IntegrationResponseDto? = null,
    val mappings: List<ProductMappingResponseDto> = emptyList(),
    val externalOrders: List<ExternalOrderResponseDto> = emptyList(),
    val recipes: List<RecipeListItemDto> = emptyList(),
    val syncResult: SyncResultDto? = null,
    val isLoading: Boolean = true,
    val isBusy: Boolean = false,
    val deleted: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class IntegrationDetailViewModel @Inject constructor(
    private val repository: IntegrationRepository,
    private val recipeRepository: RecipeRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val id: String = checkNotNull(savedStateHandle["integrationId"])

    private val _uiState = MutableStateFlow(IntegrationDetailUiState())
    val uiState: StateFlow<IntegrationDetailUiState> = _uiState.asStateFlow()

    init {
        load()
        loadRecipes()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val integration = repository.getById(id)
                val mappings = runCatching { repository.getMappings(id) }.getOrDefault(emptyList())
                val orders = runCatching { repository.getExternalOrders(id) }.getOrDefault(emptyList())
                _uiState.update {
                    it.copy(integration = integration, mappings = mappings, externalOrders = orders, isLoading = false)
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcare")) }
            }
        }
    }

    private fun loadRecipes() {
        viewModelScope.launch {
            runCatching { recipeRepository.getRecipes(limit = 200, type = "FINAL").data }
                .onSuccess { list -> _uiState.update { it.copy(recipes = list) } }
        }
    }

    fun toggleStatus() {
        val cur = _uiState.value.integration ?: return
        val next = if (cur.status == "ACTIVE") "INACTIVE" else "ACTIVE"
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true) }
            try {
                val updated = repository.setStatus(id, next)
                _uiState.update { it.copy(integration = updated, isBusy = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isBusy = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la actualizare")) }
            }
        }
    }

    fun sync() {
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, syncResult = null) }
            try {
                val res = repository.triggerSync(id)
                _uiState.update { it.copy(syncResult = res, isBusy = false) }
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(isBusy = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la sincronizare")) }
            }
        }
    }

    fun deleteIntegration() {
        viewModelScope.launch {
            try {
                repository.delete(id)
                _uiState.update { it.copy(deleted = true) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la ștergere")) }
            }
        }
    }

    fun addMapping(externalId: String, externalName: String, recipe: RecipeListItemDto) {
        viewModelScope.launch {
            try {
                repository.createMapping(
                    id,
                    CreateProductMappingRequest(
                        externalProductId = externalId,
                        externalProductName = externalName,
                        recipeId = recipe.id,
                    ),
                )
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la mapare")) }
            }
        }
    }

    fun deleteMapping(mappingId: String) {
        viewModelScope.launch {
            runCatching { repository.deleteMapping(id, mappingId) }
                .onSuccess { load() }
                .onFailure { e -> _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare")) } }
        }
    }

    fun dismissError() = _uiState.update { it.copy(error = null) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegrationDetailScreen(
    navController: NavController,
    viewModel: IntegrationDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showMappingSheet by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    if (state.deleted) {
        LaunchedEffect(Unit) { navController.popBackStack() }
    }

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.integration?.providerDisplayName ?: "Integrare", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                actions = {
                    if (state.integration != null) {
                        IconButton(onClick = { showDeleteConfirm = true }) {
                            Icon(Icons.Default.Delete, "Șterge", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        val integration = state.integration
        if (state.isLoading && integration == null) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        if (integration == null) return@Scaffold

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Status card
            HoraeCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Stare", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            HoraeStatusBadge(label = integration.statusDisplayName, color = integrationStatusColor(integration.status))
                        }
                        Switch(
                            checked = integration.isActive,
                            onCheckedChange = { viewModel.toggleStatus() },
                            enabled = !state.isBusy,
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text("Mapări produse", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Text("${integration.mappingsCount}", fontWeight = FontWeight.SemiBold)
                    }
                    state.syncResult?.let { r ->
                        Text(
                            "${r.synced} sincronizate · ${r.failed} eșuate",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Button(onClick = viewModel::sync, enabled = !state.isBusy, modifier = Modifier.fillMaxWidth()) {
                        if (state.isBusy) {
                            CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Sync, null, modifier = Modifier.padding(end = 8.dp))
                        }
                        Text("Sincronizează")
                    }
                }
            }

            // Mappings
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HoraeSectionHeader("Mapări produse", modifier = Modifier.weight(1f))
                    TextButton(onClick = { showMappingSheet = true }) {
                        Icon(Icons.Default.Add, null, modifier = Modifier.padding(end = 4.dp))
                        Text("Adaugă")
                    }
                }
                if (state.mappings.isEmpty()) {
                    Text("Nicio mapare.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    state.mappings.forEach { m ->
                        HoraeCard(modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(m.externalProductName.ifBlank { m.externalProductId }, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                                    Text("→ ${m.recipeName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                IconButton(onClick = { viewModel.deleteMapping(m.id) }) {
                                    Icon(Icons.Default.Delete, "Șterge maparea", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }

            // External orders
            if (state.externalOrders.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    HoraeSectionHeader("Comenzi externe")
                    state.externalOrders.take(20).forEach { o ->
                        HoraeCard(modifier = Modifier.fillMaxWidth()) {
                            Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(o.externalId.ifBlank { o.id }, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                                HoraeStatusBadge(label = o.syncStatusDisplayName, color = syncStatusColor(o.syncStatus))
                            }
                        }
                    }
                }
            }
        }
    }

    if (showMappingSheet) {
        AddMappingSheet(
            recipes = state.recipes,
            onDismiss = { showMappingSheet = false },
            onConfirm = { extId, extName, recipe ->
                viewModel.addMapping(extId, extName, recipe)
                showMappingSheet = false
            },
        )
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Șterge integrarea?") },
            text = { Text("Se șterg și mapările asociate.") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteConfirm = false
                    viewModel.deleteIntegration()
                }) { Text("Șterge", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Anulează") } },
        )
    }
}

private fun syncStatusColor(status: String) = when (status) {
    "SYNCED" -> com.horae.app.ui.theme.Success
    "FAILED" -> com.horae.app.ui.theme.Error
    "SKIPPED" -> androidx.compose.ui.graphics.Color(0xFF8E8E93)
    else -> com.horae.app.ui.theme.Warning
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddMappingSheet(
    recipes: List<RecipeListItemDto>,
    onDismiss: () -> Unit,
    onConfirm: (String, String, RecipeListItemDto) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var extId by remember { mutableStateOf("") }
    var extName by remember { mutableStateOf("") }
    var selectedRecipe by remember { mutableStateOf<RecipeListItemDto?>(null) }
    var recipeSearch by remember { mutableStateOf("") }
    var showRecipePicker by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Mapare nouă", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = extId, onValueChange = { extId = it },
                label = { Text("ID produs extern *") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = extName, onValueChange = { extName = it },
                label = { Text("Nume produs extern") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            )
            OutlinedButton(onClick = { showRecipePicker = !showRecipePicker }, modifier = Modifier.fillMaxWidth()) {
                Text(selectedRecipe?.name ?: "Alege rețeta internă *")
            }
            if (showRecipePicker) {
                OutlinedTextField(
                    value = recipeSearch, onValueChange = { recipeSearch = it },
                    placeholder = { Text("Caută rețetă") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                LazyColumn(modifier = Modifier.heightIn(max = 240.dp)) {
                    items(
                        recipes.filter { it.name.contains(recipeSearch, ignoreCase = true) },
                        key = { it.id },
                    ) { r ->
                        Text(
                            r.name,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedRecipe = r; showRecipePicker = false }
                                .padding(vertical = 12.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            }
            Button(
                onClick = { selectedRecipe?.let { onConfirm(extId.trim(), extName.trim(), it) } },
                enabled = extId.isNotBlank() && selectedRecipe != null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Salvează maparea") }
        }
    }
}
