package com.horae.app.ui.users

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.UserResponse
import com.horae.app.data.repository.UserRepository
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.theme.Error
import com.horae.app.ui.theme.Success
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

data class UserDetailUiState(
    val user: UserResponse? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class UserDetailViewModel @Inject constructor(
    private val userRepository: UserRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String = checkNotNull(savedStateHandle["userId"])

    private val _uiState = MutableStateFlow(UserDetailUiState())
    val uiState: StateFlow<UserDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    // -- Public actions ------------------------------------------------------

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val user = userRepository.getUser(userId)
                _uiState.update { it.copy(user = user, isLoading = false) }
            } catch (e: Exception) {
                Timber.e(e, "UserDetailViewModel: failed to load user $userId")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea utilizatorului"),
                    )
                }
            }
        }
    }

    fun changeRole(role: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val updated = userRepository.changeRole(userId, role)
                _uiState.update { it.copy(user = updated, isLoading = false) }
            } catch (e: Exception) {
                Timber.e(e, "UserDetailViewModel: failed to change role")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la schimbarea rolului"),
                    )
                }
            }
        }
    }

    fun deactivate() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val updated = userRepository.deactivateUser(userId)
                _uiState.update { it.copy(user = updated, isLoading = false) }
            } catch (e: Exception) {
                Timber.e(e, "UserDetailViewModel: failed to deactivate user")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la dezactivarea utilizatorului"),
                    )
                }
            }
        }
    }

    fun reactivate() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val updated = userRepository.reactivateUser(userId)
                _uiState.update { it.copy(user = updated, isLoading = false) }
            } catch (e: Exception) {
                Timber.e(e, "UserDetailViewModel: failed to reactivate user")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la reactivarea utilizatorului"),
                    )
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
fun UserDetailScreen(
    navController: NavController,
    viewModel: UserDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var showRoleDialog by remember { mutableStateOf(false) }
    var showDeactivateDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(uiState.user?.fullName ?: "Utilizator")
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Înapoi",
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
            uiState.isLoading && uiState.user == null -> {
                LoadingOverlay(modifier = Modifier.padding(innerPadding))
            }

            uiState.user == null && !uiState.isLoading -> {
                EmptyUserDetailState(modifier = Modifier.padding(innerPadding))
            }

            else -> {
                val user = uiState.user!!
                UserDetailContent(
                    user = user,
                    isLoading = uiState.isLoading,
                    onChangeRole = { showRoleDialog = true },
                    onDeactivate = { showDeactivateDialog = true },
                    onReactivate = viewModel::reactivate,
                    modifier = Modifier.padding(innerPadding),
                )
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

    // Role picker dialog
    if (showRoleDialog) {
        val currentRole = uiState.user?.role?.slug?.let { UserRole.fromString(it) }
        RolePickerDialog(
            currentRole = currentRole,
            onSelect = { role ->
                showRoleDialog = false
                viewModel.changeRole(role.name)
            },
            onDismiss = { showRoleDialog = false },
        )
    }

    // Deactivate confirmation dialog
    if (showDeactivateDialog) {
        DeactivateConfirmationDialog(
            onConfirm = {
                showDeactivateDialog = false
                viewModel.deactivate()
            },
            onDismiss = { showDeactivateDialog = false },
        )
    }
}

// ---------------------------------------------------------------------------
// Detail content
// ---------------------------------------------------------------------------

@Composable
private fun UserDetailContent(
    user: UserResponse,
    isLoading: Boolean,
    onChangeRole: () -> Unit,
    onDeactivate: () -> Unit,
    onReactivate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val roleLabel = user.role?.name?.takeIf { it.isNotBlank() }
        ?: UserRole.fromString(user.role?.slug ?: "").displayName

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // -- Header: big avatar, name, email, role badge ----------------------
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(CircleShape)
                    .background(
                        if (user.isActive) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.surfaceVariant,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = userInitials(user.firstName, user.lastName),
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (user.isActive) MaterialTheme.colorScheme.onPrimary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = user.fullName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = user.email,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            HoraeStatusBadge(
                label = if (user.isActive) roleLabel else "Inactiv",
                color = if (user.isActive) MaterialTheme.colorScheme.primary else Error,
            )
        }

        // -- Detalii ----------------------------------------------------------
        HoraeSectionHeader(title = "Detalii")
        HoraeCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(vertical = 4.dp)) {
                RoleRow(label = "Rol", value = roleLabel, onClick = onChangeRole)
                DetailDivider()
                KeyValueRow(label = "Email", value = user.email)
                DetailDivider()
                KeyBadgeRow(label = "Status") {
                    HoraeStatusBadge(
                        label = if (user.isActive) "Activ" else "Inactiv",
                        color = if (user.isActive) Success else Error,
                    )
                }
                DetailDivider()
                KeyValueRow(label = "Creat la", value = formatDate(user.createdAt))
            }
        }

        // -- Acțiuni ----------------------------------------------------------
        HoraeSectionHeader(title = "Acțiuni")
        OutlinedButton(
            onClick = onChangeRole,
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text("Schimbă rol")
        }
        if (user.isActive) {
            Button(
                onClick = onDeactivate,
                enabled = !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .tutorialAnchor("users.roles.deactivate"),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) {
                Text("Dezactivează contul")
            }
            Text(
                text = "Utilizatorul nu se va mai putea autentifica. Un administrator îl poate reactiva oricând.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Button(
                onClick = onReactivate,
                enabled = !isLoading,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Success,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) {
                Text("Reactivează contul")
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

@Composable
private fun KeyValueRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun KeyBadgeRow(label: String, trailing: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        trailing()
    }
}

@Composable
private fun RoleRow(label: String, value: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
            )
            Icon(
                Icons.Default.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun DetailDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = 16.dp),
        color = MaterialTheme.colorScheme.outlineVariant,
    )
}

private fun userInitials(firstName: String, lastName: String): String = buildString {
    firstName.firstOrNull()?.let { append(it.uppercaseChar()) }
    lastName.firstOrNull()?.let { append(it.uppercaseChar()) }
}.ifBlank { "?" }

// ---------------------------------------------------------------------------
// Role picker dialog
// ---------------------------------------------------------------------------

@Composable
private fun RolePickerDialog(
    currentRole: UserRole?,
    onSelect: (UserRole) -> Unit,
    onDismiss: () -> Unit,
) {
    var selected by remember { mutableStateOf(currentRole ?: UserRole.COFETAR) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Schimbă rol") },
        text = {
            Column {
                UserRole.entries.forEach { role ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = selected == role,
                            onClick = { selected = role },
                        )
                        Text(
                            text = role.displayName,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSelect(selected) },
                enabled = selected != currentRole,
            ) {
                Text("Salvează")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Renunță")
            }
        },
    )
}

// ---------------------------------------------------------------------------
// Deactivate confirmation dialog
// ---------------------------------------------------------------------------

@Composable
private fun DeactivateConfirmationDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Dezactivează utilizator?") },
        text = {
            Text("Utilizatorul nu va mai putea să se autentifice.")
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    text = "Dezactivează",
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Renunță")
            }
        },
    )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

@Composable
private fun EmptyUserDetailState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.PersonOff,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Utilizator negăsit",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ---------------------------------------------------------------------------
// Date formatting helper
// ---------------------------------------------------------------------------

private fun formatDate(isoString: String): String {
    return try {
        val parsed = LocalDateTime.parse(
            isoString.replace("Z", ""),
            DateTimeFormatter.ISO_LOCAL_DATE_TIME,
        )
        parsed.format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
    } catch (e: DateTimeParseException) {
        isoString
    }
}
