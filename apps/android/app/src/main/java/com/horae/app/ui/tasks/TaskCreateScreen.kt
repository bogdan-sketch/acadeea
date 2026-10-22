package com.horae.app.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
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
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
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
import com.horae.app.data.remote.dto.CreateTaskRequest
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.remote.dto.UpdateTaskRequest
import com.horae.app.data.remote.dto.UserResponse
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.data.repository.TaskRepository
import com.horae.app.data.repository.UserRepository
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeFilterChip
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── ViewModel ──

data class TaskCreateUiState(
    val isEditing: Boolean = false,
    val recipes: List<RecipeListItemDto> = emptyList(),
    val recipeSearch: String = "",
    val selectedRecipe: RecipeListItemDto? = null,
    val quantity: String = "",
    val priority: Int? = null,
    val dueDateMillis: Long? = null,
    val notes: String = "",
    /** Nume custom (gol = numele rețetei). */
    val title: String = "",
    /** ASSIGNED (implicit) | EVERYONE | SELECTED — cine vede taskul în afara administratorilor. */
    val visibility: String = "ASSIGNED",
    val visibleToIds: Set<String> = emptySet(),
    /** Edit mode: the task already had a custom name / non-default visibility. */
    val hadTitle: Boolean = false,
    val hadVisibility: Boolean = false,
    /** Utilizatorii activi, pentru lista de persoane (încărcată la SELECTED). */
    val users: List<UserResponse> = emptyList(),
    val isLoadingRecipes: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saved: Boolean = false,
) {
    val canSave: Boolean
        get() = selectedRecipe != null &&
            (com.horae.app.ui.common.RoFormat.parseDecimal(quantity) ?: 0.0) > 0.0 &&
            !isSaving
}

@HiltViewModel
class TaskCreateViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
    private val recipeRepository: RecipeRepository,
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TaskCreateUiState())
    val uiState: StateFlow<TaskCreateUiState> = _uiState.asStateFlow()

    private var editingId: String? = null
    private var started = false

    /**
     * Called once from the screen; loads the recipe list and, when editing, the task.
     * [recipeId] preselects a recipe for a new task (opened from the recipe detail).
     */
    fun start(taskId: String?, recipeId: String? = null) {
        if (started) return
        started = true
        editingId = taskId?.takeIf { it.isNotBlank() }
        loadRecipes()
        editingId?.let { loadTask(it) }
        if (editingId == null) recipeId?.takeIf { it.isNotBlank() }?.let { preselectRecipe(it) }
    }

    private fun preselectRecipe(id: String) {
        viewModelScope.launch {
            try {
                val r = recipeRepository.getRecipe(id)
                _uiState.update {
                    if (it.selectedRecipe != null) it
                    else it.copy(
                        selectedRecipe = RecipeListItemDto(
                            id = r.id,
                            name = r.name,
                            unit = r.unit,
                            type = r.type,
                            category = r.category,
                            yieldQuantity = r.yieldQuantity,
                            stockCount = r.stockCount,
                        ),
                    )
                }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea rețetei")) }
            }
        }
    }

    private fun loadTask(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isEditing = true) }
            try {
                val t = taskRepository.getTask(id)
                // Picker millis are UTC midnight of the intended (Bucharest) day.
                val dueMillis = com.horae.app.ui.common.RoDate.calendarDay(t.dueDate)?.let(com.horae.app.ui.common.RoDate::toPickerMillis)
                _uiState.update {
                    it.copy(
                        // Synthesized so the picker row renders; save uses id + unit.
                        selectedRecipe = RecipeListItemDto(
                            id = t.recipeId,
                            name = t.recipeName,
                            unit = t.targetUnit,
                            type = "FINAL",
                        ),
                        quantity = com.horae.app.ui.common.RoFormat.inputText(t.targetQuantity),
                        priority = t.priority,
                        dueDateMillis = dueMillis,
                        notes = t.notes.orEmpty(),
                        title = t.title.orEmpty(),
                        visibility = t.visibility ?: "ASSIGNED",
                        visibleToIds = t.visibleToIds?.toSet() ?: emptySet(),
                        hadTitle = !t.title.isNullOrBlank(),
                        hadVisibility = (t.visibility ?: "ASSIGNED") != "ASSIGNED",
                    )
                }
                if (t.visibility == "SELECTED") loadUsers()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea task-ului")) }
            }
        }
    }

    fun loadRecipes() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingRecipes = true) }
            try {
                val result = recipeRepository.getRecipes(
                    search = _uiState.value.recipeSearch.takeIf { q -> q.isNotBlank() },
                )
                _uiState.update { it.copy(recipes = result.data, isLoadingRecipes = false) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingRecipes = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea rețetelor"))
                }
            }
        }
    }

    fun onRecipeSearchChange(q: String) {
        _uiState.update { it.copy(recipeSearch = q) }
        loadRecipes()
    }

    fun onRecipeSelected(recipe: RecipeListItemDto) {
        _uiState.update { it.copy(selectedRecipe = recipe) }
    }

    fun onQuantityChange(q: String) {
        _uiState.update { it.copy(quantity = q) }
    }

    fun onPriorityChange(priority: Int?) {
        _uiState.update { it.copy(priority = priority) }
    }

    fun onTitleChange(title: String) {
        _uiState.update { it.copy(title = title.take(120)) }
    }

    fun onVisibilityChange(visibility: String) {
        _uiState.update { it.copy(visibility = visibility) }
        if (visibility == "SELECTED") loadUsers()
    }

    fun toggleViewer(id: String) {
        _uiState.update {
            it.copy(visibleToIds = if (id in it.visibleToIds) it.visibleToIds - id else it.visibleToIds + id)
        }
    }

    private fun loadUsers() {
        if (_uiState.value.users.isNotEmpty()) return
        viewModelScope.launch {
            try {
                val users = userRepository.getUsers(limit = 100, isActive = true).data
                _uiState.update { it.copy(users = users) }
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea utilizatorilor")) }
            }
        }
    }

    fun onDueDateChange(millis: Long?) {
        _uiState.update { it.copy(dueDateMillis = millis) }
    }

    fun onNotesChange(notes: String) {
        _uiState.update { it.copy(notes = notes) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    fun save() {
        val s = _uiState.value
        val recipe = s.selectedRecipe ?: return
        val qty = com.horae.app.ui.common.RoFormat.parseDecimal(s.quantity) ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                // Date-only deadline (00:00 UTC of the picked day) — shown without a time.
                val dueDateIso = s.dueDateMillis?.let {
                    com.horae.app.ui.common.RoDate.dateOnlyInstant(com.horae.app.ui.common.RoDate.fromPickerMillis(it))
                }
                val id = editingId
                if (id != null) {
                    taskRepository.updateTask(
                        id,
                        UpdateTaskRequest(
                            recipeId = recipe.id,
                            targetQuantity = qty,
                            targetUnit = recipe.unit,
                            priority = s.priority,
                            dueDate = dueDateIso,
                            notes = s.notes.takeIf { it.isNotBlank() },
                            // "" clears a previous custom name; null = don't touch (and stays
                            // compatible with an API that doesn't know the field yet).
                            title = if (s.title.isBlank() && !s.hadTitle) null else s.title.trim(),
                            visibility = if (s.visibility == "ASSIGNED" && !s.hadVisibility) null else s.visibility,
                            visibleToIds = if (s.visibility == "SELECTED") s.visibleToIds.toList() else null,
                        ),
                    )
                } else {
                    taskRepository.createTask(
                        CreateTaskRequest(
                            recipeId = recipe.id,
                            targetQuantity = qty,
                            targetUnit = recipe.unit,
                            priority = s.priority,
                            dueDate = dueDateIso,
                            notes = s.notes.takeIf { it.isNotBlank() },
                            // Only when used: an API without these fields rejects unknown properties.
                            title = s.title.trim().takeIf { it.isNotBlank() },
                            visibility = s.visibility.takeIf { it != "ASSIGNED" },
                            visibleToIds = if (s.visibility == "SELECTED") s.visibleToIds.toList() else null,
                        ),
                    )
                }
                _uiState.update { it.copy(isSaving = false, saved = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSaving = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la salvarea task-ului"))
                }
            }
        }
    }
}

private fun unitAbbrev(unit: String): String =
    runCatching { UnitType.valueOf(unit).abbreviation }.getOrDefault(unit.lowercase())

// ── Screen ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskCreateScreen(
    navController: NavController,
    editTaskId: String? = null,
    recipeId: String? = null,
    viewModel: TaskCreateViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showRecipeSheet by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(editTaskId, recipeId) { viewModel.start(editTaskId, recipeId) }

    // Pop back once the task is saved.
    if (state.saved) {
        androidx.compose.runtime.LaunchedEffect(Unit) {
            navController.popBackStack()
        }
    }

    state.error?.let { msg ->
        ErrorDialog(message = msg, onDismiss = viewModel::dismissError)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                windowInsets = androidx.compose.foundation.layout.WindowInsets(0),
title = { Text(if (state.isEditing) "Editează task" else "Task nou", fontWeight = FontWeight.Bold) },
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                "Detalii producție — rețeta stabilește unitatea.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Recipe picker
            Column(
                modifier = Modifier.tutorialAnchor("tasks.create.selectRecipe"),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                HoraeSectionHeader("Rețetă *")
                HoraeCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showRecipeSheet = true }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            val recipe = state.selectedRecipe
                            if (recipe == null) {
                                Text(
                                    "Alege o rețetă",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            } else {
                                Text(recipe.name, fontWeight = FontWeight.SemiBold)
                                Text(
                                    (if (recipe.type == "SEMIPREPARAT") "Semipreparat" else "Produs final") +
                                        " · " + unitAbbrev(recipe.unit),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                        Icon(
                            Icons.Default.KeyboardArrowRight,
                            null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Quantity + unit
            Column(
                modifier = Modifier.tutorialAnchor("tasks.create.quantity"),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                HoraeSectionHeader("Cantitate *")
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedTextField(
                        value = state.quantity,
                        onValueChange = viewModel::onQuantityChange,
                        placeholder = { Text("0") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        state.selectedRecipe?.let { unitAbbrev(it.unit) } ?: "—",
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Nume custom (gol = numele rețetei)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HoraeSectionHeader("Nume task")
                OutlinedTextField(
                    value = state.title,
                    onValueChange = viewModel::onTitleChange,
                    placeholder = { Text("Opțional — gol = numele rețetei") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            // Priority
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HoraeSectionHeader("Prioritate")
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    (1..5).forEach { p ->
                        HoraeFilterChip(
                            "P$p",
                            selected = state.priority == p,
                            onClick = { viewModel.onPriorityChange(if (state.priority == p) null else p) },
                        )
                    }
                }
            }

            // Vizibilitate — cine vede taskul în afara administratorilor (ei văd tot).
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                HoraeSectionHeader("Vizibilitate")
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(
                        "ASSIGNED" to "Doar cine e asignat",
                        "EVERYONE" to "Toată lumea",
                        "SELECTED" to "Anumite persoane",
                    ).forEach { (key, label) ->
                        HoraeFilterChip(
                            label,
                            selected = state.visibility == key,
                            onClick = { viewModel.onVisibilityChange(key) },
                        )
                    }
                }
                Text(
                    "Administratorii văd toate taskurile indiferent de setare.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (state.visibility == "SELECTED") {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.users.forEach { u ->
                            HoraeFilterChip(
                                "${u.firstName} ${u.lastName}",
                                selected = u.id in state.visibleToIds,
                                onClick = { viewModel.toggleViewer(u.id) },
                            )
                        }
                    }
                }
            }

            // Due date
            Column(
                modifier = Modifier.tutorialAnchor("tasks.create.dates"),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                HoraeSectionHeader("Termen limită")
                HoraeCard(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showDatePicker = true }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            state.dueDateMillis?.let { formatDate(it) } ?: "Fără termen",
                            modifier = Modifier.weight(1f),
                            color = if (state.dueDateMillis == null) {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                        )
                        if (state.dueDateMillis != null) {
                            TextButton(onClick = { viewModel.onDueDateChange(null) }) { Text("Șterge") }
                        }
                        Icon(
                            Icons.Default.CalendarMonth,
                            null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Notes
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                HoraeSectionHeader("Note")
                OutlinedTextField(
                    value = state.notes,
                    onValueChange = viewModel::onNotesChange,
                    placeholder = { Text("Observații (opțional)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                )
            }

            Button(
                onClick = viewModel::save,
                enabled = state.canSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .tutorialAnchor("tasks.create.submit"),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(end = 8.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Default.Check, null, modifier = Modifier.padding(end = 8.dp))
                }
                Text(if (state.isEditing) "Salvează modificările" else "Creează task")
            }

            Spacer(Modifier.padding(8.dp))
        }
    }

    // Recipe picker bottom sheet
    if (showRecipeSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { showRecipeSheet = false },
            sheetState = sheetState,
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                Text(
                    "Alege rețeta",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
                OutlinedTextField(
                    value = state.recipeSearch,
                    onValueChange = viewModel::onRecipeSearchChange,
                    placeholder = { Text("Caută rețetă") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                )
                if (state.isLoadingRecipes && state.recipes.isEmpty()) {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                        items(state.recipes) { recipe ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        viewModel.onRecipeSelected(recipe)
                                        showRecipeSheet = false
                                    }
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(recipe.name, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        (if (recipe.type == "SEMIPREPARAT") "Semipreparat" else "Produs final") +
                                            " · " + unitAbbrev(recipe.unit),
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

    // Due date picker
    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(initialSelectedDateMillis = state.dueDateMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.onDueDateChange(datePickerState.selectedDateMillis)
                    showDatePicker = false
                }) { Text("Gata") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("Anulează") }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

private fun formatDate(millis: Long): String =
    com.horae.app.ui.common.RoDate.fullDate(com.horae.app.ui.common.RoDate.fromPickerMillis(millis))
