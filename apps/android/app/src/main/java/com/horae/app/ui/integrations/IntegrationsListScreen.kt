package com.horae.app.ui.integrations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.IntegrationResponseDto
import com.horae.app.data.repository.IntegrationRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.Error
import com.horae.app.ui.theme.Success
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class IntegrationsListUiState(
    val items: List<IntegrationResponseDto> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class IntegrationsListViewModel @Inject constructor(
    private val repository: IntegrationRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(IntegrationsListUiState())
    val uiState: StateFlow<IntegrationsListUiState> = _uiState.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                _uiState.update { it.copy(items = repository.getAll(), isLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcare")) }
            }
        }
    }

    fun create(provider: String) {
        viewModelScope.launch {
            try {
                repository.create(provider)
                load()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la creare")) }
            }
        }
    }

    fun dismissError() = _uiState.update { it.copy(error = null) }
}

fun integrationStatusColor(status: String): Color = when (status) {
    "ACTIVE" -> Success
    "ERROR" -> Error
    else -> Color(0xFF8E8E93)
}

fun integrationIcon(provider: String): ImageVector =
    if (provider == "EBRIZA") Icons.Default.Storefront else Icons.Default.ShoppingCart

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IntegrationsListScreen(
    navController: NavController,
    viewModel: IntegrationsListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showAdd by remember { mutableStateOf(false) }

    // Reload on resume so a delete from the detail screen reflects here.
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) viewModel.load()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Integrări", fontWeight = FontWeight.Bold) },
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
        floatingActionButton = {
            FloatingActionButton(onClick = { showAdd = true }) {
                Icon(Icons.Default.Add, "Integrare nouă")
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        when {
            state.isLoading && state.items.isEmpty() -> {
                Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            state.items.isEmpty() -> {
                Box(Modifier.fillMaxSize().padding(pad).padding(32.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Link, null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Fără integrări", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "Adaugă o integrare cu eBriza sau WooCommerce.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(pad),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.items, key = { it.id }) { it ->
                        IntegrationRow(it, onClick = {
                            navController.navigate(Screen.IntegrationDetail.createRoute(it.id))
                        })
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddIntegrationDialog(
            onDismiss = { showAdd = false },
            onConfirm = { provider ->
                viewModel.create(provider)
                showAdd = false
            },
        )
    }
}

@Composable
private fun IntegrationRow(item: IntegrationResponseDto, onClick: () -> Unit) {
    val color = integrationStatusColor(item.status)
    HoraeCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(integrationIcon(item.provider), null, tint = color, modifier = Modifier.size(26.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.providerDisplayName, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(
                    "${item.mappingsCount} mapări",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HoraeStatusBadge(label = item.statusDisplayName, color = color)
        }
    }
}

@Composable
private fun AddIntegrationDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var provider by remember { mutableStateOf("EBRIZA") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Integrare nouă") },
        text = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = provider == "EBRIZA", onClick = { provider = "EBRIZA" }, label = { Text("eBriza") })
                FilterChip(selected = provider == "WOOCOMMERCE", onClick = { provider = "WOOCOMMERCE" }, label = { Text("WooCommerce") })
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(provider) }) { Text("Adaugă") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Anulează") } },
    )
}
