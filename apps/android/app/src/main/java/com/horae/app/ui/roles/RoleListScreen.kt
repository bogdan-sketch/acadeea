package com.horae.app.ui.roles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RoleResponse
import com.horae.app.data.repository.RoleRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.StatusBadge
import com.horae.app.ui.navigation.Screen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

data class RoleListUiState(
    val roles: List<RoleResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class RoleListViewModel @Inject constructor(
    private val roleRepository: RoleRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RoleListUiState())
    val uiState: StateFlow<RoleListUiState> = _uiState.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val roles = roleRepository.getRoles()
                _uiState.update { it.copy(roles = roles, isLoading = false) }
            } catch (e: Exception) {
                Timber.e(e, "RoleListViewModel: failed to load roles")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea rolurilor"),
                    )
                }
            }
        }
    }

    fun deleteRole(role: RoleResponse) {
        viewModelScope.launch {
            try {
                roleRepository.deleteRole(role.id)
                _uiState.update { state ->
                    state.copy(roles = state.roles.filterNot { it.id == role.id })
                }
            } catch (e: Exception) {
                Timber.e(e, "RoleListViewModel: failed to delete role ${role.id}")
                _uiState.update {
                    it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu se poate șterge rolul"))
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen Composable
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoleListScreen(
    navController: NavController,
    viewModel: RoleListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var roleToDelete by remember { mutableStateOf<RoleResponse?>(null) }

    // Reload every time the screen (re-)enters composition, so edits made in
    // the editor screen are reflected on return.
    LaunchedEffect(Unit) {
        viewModel.load()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Roluri") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Înapoi",
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { navController.navigate(Screen.RoleCreate.route) }) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Rol nou",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { innerPadding ->
        when {
            uiState.isLoading && uiState.roles.isEmpty() -> {
                LoadingOverlay(modifier = Modifier.padding(innerPadding))
            }

            !uiState.isLoading && uiState.roles.isEmpty() -> {
                EmptyRoleState(modifier = Modifier.padding(innerPadding))
            }

            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(items = uiState.roles, key = { it.id }) { role ->
                        RoleListItem(
                            role = role,
                            onEdit = {
                                navController.navigate(Screen.RoleEdit.createRoute(role.id))
                            },
                            onDelete = { roleToDelete = role },
                        )
                    }
                }
            }
        }
    }

    // Error dialog
    uiState.error?.let { errorMessage ->
        ErrorDialog(
            message = errorMessage,
            onDismiss = viewModel::clearError,
        )
    }

    // Delete confirmation dialog (only reachable for non-system roles without users)
    roleToDelete?.let { role ->
        AlertDialog(
            onDismissRequest = { roleToDelete = null },
            title = { Text("Ștergi rolul „${role.name}”?") },
            text = { Text("Rolul va fi șters definitiv.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        roleToDelete = null
                        viewModel.deleteRole(role)
                    },
                ) {
                    Text(
                        text = "Șterge",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { roleToDelete = null }) {
                    Text("Renunță")
                }
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Single role card
// ---------------------------------------------------------------------------

@Composable
private fun RoleListItem(
    role: RoleResponse,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = role.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (role.isSystem) {
                        Spacer(modifier = Modifier.width(8.dp))
                        StatusBadge(
                            label = "Sistem",
                            color = MaterialTheme.colorScheme.secondary,
                        )
                    }
                }
                if (!role.description.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = role.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${role.userCount} utilizatori",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            IconButton(onClick = onEdit) {
                Icon(
                    imageVector = Icons.Default.Edit,
                    contentDescription = "Editează rolul",
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
            if (!role.isSystem) {
                IconButton(
                    onClick = onDelete,
                    enabled = role.userCount == 0,
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = if (role.userCount > 0) {
                            "Rolul are utilizatori asignați"
                        } else {
                            "Șterge rolul"
                        },
                        modifier = Modifier.size(20.dp),
                        tint = if (role.userCount == 0) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                        },
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

@Composable
private fun EmptyRoleState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Badge,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Niciun rol",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
