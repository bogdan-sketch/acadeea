package com.horae.app.ui.roles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import com.horae.app.ui.common.ChoiceChips
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.PermissionRule
import com.horae.app.data.repository.RoleRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.StatusBadge
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

data class RoleEditorUiState(
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val name: String = "",
    val description: String = "",
    val isSystem: Boolean = false,
    val subjects: List<String> = emptyList(),
    /** subject → set of granted actions ('manage' already expanded to all four). */
    val perms: Map<String, Set<String>> = emptyMap(),
    val advanced: Boolean = false,
    val saved: Boolean = false,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class RoleEditorViewModel @Inject constructor(
    private val roleRepository: RoleRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    /** Null when creating a new role. */
    private val roleId: String? = savedStateHandle["roleId"]

    val isCreate: Boolean get() = roleId == null

    private val _uiState = MutableStateFlow(RoleEditorUiState())
    val uiState: StateFlow<RoleEditorUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    // -- Public actions ------------------------------------------------------

    fun onNameChange(value: String) {
        _uiState.update { it.copy(name = value) }
    }

    fun onDescriptionChange(value: String) {
        _uiState.update { it.copy(description = value) }
    }

    fun onAdvancedChange(value: Boolean) {
        _uiState.update { it.copy(advanced = value) }
    }

    /** Replace the whole action set of a subject (preset dropdown). */
    fun setSubjectActions(subject: String, actions: Set<String>) {
        _uiState.update { it.copy(perms = it.perms + (subject to actions)) }
    }

    /** Toggle a single action of a subject (advanced mode). */
    fun toggleAction(subject: String, action: String, on: Boolean) {
        _uiState.update { state ->
            val current = state.perms[subject].orEmpty().toMutableSet()
            if (on) current.add(action) else current.remove(action)
            state.copy(perms = state.perms + (subject to current))
        }
    }

    fun save() {
        val state = _uiState.value
        if (state.name.isBlank()) {
            _uiState.update { it.copy(error = "Numele rolului este obligatoriu") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                val description = state.description.trim().ifBlank { null }
                val id = if (roleId == null) {
                    roleRepository.createRole(name = state.name.trim(), description = description).id
                } else {
                    roleRepository.updateRole(
                        id = roleId,
                        name = state.name.trim(),
                        description = description,
                    ).id
                }

                // Expand each subject's actions; collapse a full set to a single 'manage'.
                val rules = mutableListOf<PermissionRule>()
                for (subject in state.subjects) {
                    val actions = state.perms[subject].orEmpty()
                    if (actions.isEmpty()) continue
                    if (AccessPreset.of(actions) == AccessPreset.FULL) {
                        rules.add(PermissionRule(action = "manage", subject = subject))
                    } else {
                        ACTION_ORDER.filter { it in actions }.forEach { action ->
                            rules.add(PermissionRule(action = action, subject = subject))
                        }
                    }
                }
                roleRepository.setPermissions(id, rules)

                _uiState.update { it.copy(isSaving = false, saved = true) }
            } catch (e: Exception) {
                Timber.e(e, "RoleEditorViewModel: failed to save role")
                _uiState.update {
                    it.copy(isSaving = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la salvare"))
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    // -- Private helpers -----------------------------------------------------

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val subjects = roleRepository.getSubjects().subjects

                var name = ""
                var description = ""
                var isSystem = false
                val perms = mutableMapOf<String, Set<String>>()

                if (roleId != null) {
                    val role = roleRepository.getRole(roleId)
                    name = role.name
                    description = role.description.orEmpty()
                    isSystem = role.isSystem
                    for (perm in role.permissions) {
                        // 'manage' is shorthand for every action.
                        if (perm.action == "manage") {
                            perms[perm.subject] = ACTION_ORDER.toSet()
                        } else {
                            perms[perm.subject] = perms[perm.subject].orEmpty() + perm.action
                        }
                    }
                }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        subjects = subjects,
                        name = name,
                        description = description,
                        isSystem = isSystem,
                        perms = perms,
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "RoleEditorViewModel: failed to load role data")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea rolului"),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Screen Composable
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoleEditorScreen(
    navController: NavController,
    viewModel: RoleEditorViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // Pop back once the save round-trip has finished.
    LaunchedEffect(uiState.saved) {
        if (uiState.saved) navController.popBackStack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (viewModel.isCreate) "Rol nou" else "Editează rol") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Înapoi",
                        )
                    }
                },
                actions = {
                    if (uiState.isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .padding(end = 16.dp)
                                .size(22.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        IconButton(
                            onClick = viewModel::save,
                            enabled = uiState.name.isNotBlank() && !uiState.isLoading,
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = if (viewModel.isCreate) {
                                    "Creează rolul"
                                } else {
                                    "Salvează rolul"
                                },
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { innerPadding ->
        if (uiState.isLoading) {
            LoadingOverlay(modifier = Modifier.padding(innerPadding))
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    text = "Pentru fiecare secțiune alegi un nivel de acces. " +
                        "Activează „Mod avansat” pentru control fin pe acțiuni.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                // -- Nume ---------------------------------------------------------
                OutlinedTextField(
                    value = uiState.name,
                    onValueChange = viewModel::onNameChange,
                    label = { Text("Nume") },
                    placeholder = { Text("ex: Cofetar") },
                    singleLine = true,
                    enabled = !uiState.isSystem,
                    supportingText = if (uiState.isSystem) {
                        {
                            Text("Rol de sistem — numele nu poate fi schimbat, dar permisiunile da.")
                        }
                    } else {
                        null
                    },
                    modifier = Modifier.fillMaxWidth(),
                )

                // -- Descriere ----------------------------------------------------
                OutlinedTextField(
                    value = uiState.description,
                    onValueChange = viewModel::onDescriptionChange,
                    label = { Text("Descriere") },
                    placeholder = { Text("Opțional") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                // -- Permisiuni header + Mod avansat ------------------------------
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Permisiuni",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "Mod avansat",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = uiState.advanced,
                            onCheckedChange = viewModel::onAdvancedChange,
                        )
                    }
                }

                // -- Per-subject rows ---------------------------------------------
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                    ),
                ) {
                    Column(modifier = Modifier.padding(vertical = 4.dp)) {
                        uiState.subjects.forEachIndexed { index, subject ->
                            SubjectPermissionRow(
                                subject = subject,
                                actions = uiState.perms[subject].orEmpty(),
                                advanced = uiState.advanced,
                                onPresetSelected = { preset ->
                                    preset.actions?.let { viewModel.setSubjectActions(subject, it) }
                                },
                                onToggleAction = { action, on ->
                                    viewModel.toggleAction(subject, action, on)
                                },
                            )
                            if (index < uiState.subjects.lastIndex) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 12.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                                )
                            }
                        }
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
}

// ---------------------------------------------------------------------------
// Per-subject row: preset dropdown (normal) or action checkboxes (advanced)
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun SubjectPermissionRow(
    subject: String,
    actions: Set<String>,
    advanced: Boolean,
    onPresetSelected: (AccessPreset) -> Unit,
    onToggleAction: (action: String, on: Boolean) -> Unit,
) {
    val preset = AccessPreset.of(actions)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = SUBJECT_LABELS[subject] ?: subject,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            if (advanced || preset == AccessPreset.CUSTOM) {
                StatusBadge(
                    label = preset.label,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }

        if (!advanced) {
            // Access level as chips, never a dropdown. "Personalizat" is derived, not offered.
            Spacer(modifier = Modifier.height(6.dp))
            ChoiceChips(
                options = AccessPreset.presets,
                selected = preset.takeIf { it != AccessPreset.CUSTOM },
                onSelect = onPresetSelected,
                label = { it.label },
                wrap = true,
            )
        }

        if (advanced) {
            Spacer(modifier = Modifier.height(4.dp))
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ACTION_ORDER.forEach { action ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = action in actions,
                            onCheckedChange = { on -> onToggleAction(action, on) },
                        )
                        Text(
                            text = ACTION_LABELS[action] ?: action,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

