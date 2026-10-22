package com.horae.app.ui.tasks

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.TaskResponse
import com.horae.app.data.remote.dto.TransitionTaskRequest
import com.horae.app.data.repository.TaskRepository
import com.horae.app.domain.model.TaskStatus
import com.horae.app.ui.navigation.Screen
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.PriorityBadge
import com.horae.app.ui.common.formatUnitQty
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.theme.StatusColors
import com.horae.app.ui.tutorial.tutorialAnchor
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import kotlin.math.abs

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

data class TaskDetailUiState(
    val task: TaskResponse? = null,
    val isLoading: Boolean = false,
    val isTransitioning: Boolean = false,
    val error: String? = null,
    val showYieldDialog: Boolean = false,
    val showCancelDialog: Boolean = false,
    /** Info after a transition the server changed (start → BLOCAT for lack of stock). */
    val notice: String? = null,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class TaskDetailViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val taskId: String = checkNotNull(savedStateHandle["taskId"])

    private val _uiState = MutableStateFlow(TaskDetailUiState())
    val uiState: StateFlow<TaskDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val task = taskRepository.getTask(taskId)
                _uiState.update { it.copy(task = task, isLoading = false) }
            } catch (e: Exception) {
                Timber.e(e, "TaskDetailViewModel: load failed")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea taskului"),
                    )
                }
            }
        }
    }

    fun transition(status: String, reason: String? = null, actualYield: Double? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isTransitioning = true, error = null) }
            try {
                val body = TransitionTaskRequest(
                    status = status,
                    reason = reason,
                    actualYield = actualYield,
                )
                val updated = taskRepository.transitionTask(taskId, body)
                val blocked = status == TaskStatus.IN_LUCRU.name && updated.status == TaskStatus.BLOCAT.name
                _uiState.update {
                    it.copy(
                        task = updated,
                        isTransitioning = false,
                        showYieldDialog = false,
                        showCancelDialog = false,
                        notice = if (blocked) BLOCKED_NOTICE else null,
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "TaskDetailViewModel: transition failed")
                _uiState.update {
                    it.copy(
                        isTransitioning = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la tranzitia task-ului"),
                    )
                }
            }
        }
    }

    fun showYieldDialog() {
        _uiState.update { it.copy(showYieldDialog = true) }
    }

    fun dismissYieldDialog() {
        _uiState.update { it.copy(showYieldDialog = false) }
    }

    fun showCancelDialog() {
        _uiState.update { it.copy(showCancelDialog = true) }
    }

    fun dismissCancelDialog() {
        _uiState.update { it.copy(showCancelDialog = false) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun clearNotice() {
        _uiState.update { it.copy(notice = null) }
    }
}

private const val BLOCKED_NOTICE =
    "Nu e destul stoc pentru rețetă, așa că taskul a trecut în Blocat. Reîncearcă pornirea după recepție, mută-l înapoi la De făcut sau anulează-l."

// ---------------------------------------------------------------------------
// Screen Composable
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskDetailScreen(
    navController: NavController,
    viewModel: TaskDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    // Error dialog
    if (state.error != null) {
        ErrorDialog(
            message = state.error!!,
            onDismiss = viewModel::clearError,
        )
    }

    state.notice?.let {
        ErrorDialog(title = "Task blocat", message = it, onDismiss = viewModel::clearNotice)
    }

    // Yield capture dialog
    if (state.showYieldDialog && state.task != null) {
        val task = state.task!!
        val unitAbbreviation = UnitType.entries
            .firstOrNull { it.name == task.targetUnit }?.abbreviation ?: task.targetUnit

        YieldCaptureDialog(
            targetQuantity = task.targetQuantity,
            targetUnit = unitAbbreviation,
            onConfirm = { actualYield ->
                viewModel.transition(
                    status = TaskStatus.FINALIZAT.name,
                    actualYield = actualYield,
                )
            },
            onDismiss = viewModel::dismissYieldDialog,
        )
    }

    // Cancel reason dialog
    if (state.showCancelDialog) {
        CancelReasonDialog(
            onConfirm = { reason ->
                viewModel.transition(
                    status = TaskStatus.ANULAT.name,
                    reason = reason,
                )
            },
            onDismiss = viewModel::dismissCancelDialog,
        )
    }

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            TopAppBar(
                windowInsets = androidx.compose.foundation.layout.WindowInsets(0),
title = {
                    Text(
                        text = state.task?.displayName ?: "Detalii task",
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Înapoi",
                        )
                    }
                },
                actions = {
                    // Editabil doar înainte de start (ca pe iOS) — după aceea se
                    // folosesc tranzițiile de status.
                    val editable = state.task?.status == TaskStatus.DE_FACUT.name
                    if (editable) {
                        IconButton(onClick = {
                            state.task?.let { navController.navigate(Screen.TaskEdit.createRoute(it.id)) }
                        }) {
                            Icon(Icons.Default.Edit, contentDescription = "Editează")
                        }
                    }
                },
                scrollBehavior = scrollBehavior,
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when {
                state.isLoading && state.task == null -> {
                    LoadingOverlay()
                }

                state.task != null -> {
                    TaskDetailContent(
                        task = state.task!!,
                        isTransitioning = state.isTransitioning,
                        onTransition = { targetStatus ->
                            when (targetStatus) {
                                TaskStatus.FINALIZAT -> viewModel.showYieldDialog()
                                TaskStatus.ANULAT -> viewModel.showCancelDialog()
                                else -> viewModel.transition(targetStatus.name)
                            }
                        },
                    )
                }
            }

            // Overlay loading during transition
            if (state.isTransitioning) {
                LoadingOverlay()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Detail Content
// ---------------------------------------------------------------------------

@Composable
private fun TaskDetailContent(
    task: TaskResponse,
    isTransitioning: Boolean,
    onTransition: (TaskStatus) -> Unit,
) {
    val currentStatus = TaskStatus.entries.firstOrNull { it.name == task.status }
    val statusColor = currentStatus?.let { StatusColors.taskStatus(it) }
        ?: MaterialTheme.colorScheme.outline
    val allowedTransitions = currentStatus?.allowedTransitions ?: emptyList()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // ── Header card: accent bar + status + rețetă + cantitate + prioritate ──
        item {
            Spacer(modifier = Modifier.height(4.dp))
            HoraeCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min)
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .width(4.dp)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(2.dp))
                            .background(statusColor),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        if (currentStatus != null) {
                            HoraeStatusBadge(
                                label = taskStatusLabel(currentStatus),
                                color = statusColor,
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = task.name,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = formatUnitQty(task.targetQuantity, task.targetUnit),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            PriorityBadge(priority = task.priority)
                        }
                    }
                }
            }
        }

        if (currentStatus == TaskStatus.BLOCAT) {
            item {
                val reason = task.statusHistory.lastOrNull { it.toStatus == TaskStatus.BLOCAT.name }?.reason
                com.horae.app.ui.common.HCard(modifier = Modifier.fillMaxWidth()) {
                    com.horae.app.ui.common.HStatusChip(TaskStatus.BLOCAT)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = reason?.takeIf { it.isNotBlank() }
                            ?: "Pornirea a eșuat: lipsește stoc pentru rețetă. Reîncearcă după recepție, mută-l înapoi la De făcut sau anulează-l.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        // ── Detalii ──
        item { HoraeSectionHeader("Detalii") }
        item {
            HoraeCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                ) {
                    KeyRow("Rețetă", task.recipeName)
                    KeyRow("Cantitate țintă", formatUnitQty(task.targetQuantity, task.targetUnit))
                    KeyRow("Factor scalare", "${task.scaleFactor.qtyFormatted()}x")
                    if (task.dueDate != null) {
                        KeyRow("Termen", com.horae.app.ui.common.RoDate.stamp(task.dueDate))
                    }
                    if (task.assignedTo != null) {
                        KeyRow("Asignat la", task.assignedTo.fullName)
                    }
                    KeyRow("Creat de", task.createdBy.fullName)
                    if (!task.notes.isNullOrBlank()) {
                        KeyRow("Note", task.notes)
                    }
                }
            }
        }

        // ── Timp ──
        item { HoraeSectionHeader("Timp") }
        item {
            HoraeCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                ) {
                    if (task.startedAt != null) {
                        KeyRow("Început", com.horae.app.ui.common.RoDate.shortDateTime(task.startedAt))
                    }
                    if (task.completedAt != null) {
                        KeyRow("Finalizat", com.horae.app.ui.common.RoDate.shortDateTime(task.completedAt))
                    }
                    KeyRow("Creat la", com.horae.app.ui.common.RoDate.shortDateTime(task.createdAt))
                    KeyRow("Actualizat la", com.horae.app.ui.common.RoDate.shortDateTime(task.updatedAt))
                }
            }
        }

        // ── Randament (only when FINALIZAT with actualYield) ──
        if (task.status == TaskStatus.FINALIZAT.name && task.actualYield != null) {
            item { HoraeSectionHeader("Randament") }
            item {
                HoraeCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                    ) {
                        KeyRow("Randament efectiv", formatUnitQty(task.actualYield, task.targetUnit))

                        if (task.varianceAbsolute != null) {
                            KeyRow(
                                key = "Varianță absolută",
                                value = "${if (task.varianceAbsolute >= 0) "+" else ""}${formatUnitQty(task.varianceAbsolute, task.targetUnit)}",
                                valueColor = varianceColor(task.variancePercent),
                            )
                        }
                        if (task.variancePercent != null) {
                            KeyRow(
                                key = "Varianță procentuală",
                                value = com.horae.app.ui.common.RoFormat.signedPercent(task.variancePercent),
                                valueColor = varianceColor(task.variancePercent),
                            )
                        }
                    }
                }
            }
        }

        // ── Istoric status ──
        if (task.statusHistory.isNotEmpty()) {
            item { HoraeSectionHeader("Istoric status") }
            item {
                HoraeCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        task.statusHistory.forEachIndexed { index, entry ->
                            if (index > 0) Divider()

                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    val fromLabel = entry.fromStatus?.let { from ->
                                        TaskStatus.entries.firstOrNull { it.name == from }
                                            ?.let { taskStatusLabel(it) } ?: from
                                    }
                                    val toStatus = TaskStatus.entries.firstOrNull { it.name == entry.toStatus }
                                    val toLabel = toStatus?.let { taskStatusLabel(it) } ?: entry.toStatus

                                    Text(
                                        text = if (fromLabel != null) "$fromLabel → $toLabel" else toLabel,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.weight(1f),
                                    )

                                    if (toStatus != null) {
                                        HoraeStatusBadge(
                                            label = taskStatusLabel(toStatus),
                                            color = StatusColors.taskStatus(toStatus),
                                        )
                                    }
                                }

                                Text(
                                    text = "de ${entry.changedBy.fullName} · ${com.horae.app.ui.common.RoDate.shortDateTime(entry.createdAt)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )

                                if (!entry.reason.isNullOrBlank()) {
                                    Text(
                                        text = "Motiv: ${entry.reason}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Acțiuni ──
        if (allowedTransitions.isNotEmpty()) {
            item { HoraeSectionHeader("Acțiuni") }
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    allowedTransitions.forEach { targetStatus ->
                        // tasks.transitions.start (reserves stock) and .finalize (capture yield)
                        // are two distinct tutorial steps with different bodies — anchor each
                        // button to its own step id, not the whole actions block.
                        val anchorId = when (targetStatus) {
                            TaskStatus.IN_LUCRU -> "tasks.transitions.start"
                            TaskStatus.FINALIZAT -> "tasks.transitions.finalize"
                            else -> null
                        }
                        val buttonModifier = Modifier.fillMaxWidth().let {
                            if (anchorId != null) it.tutorialAnchor(anchorId) else it
                        }
                        when (targetStatus) {
                            TaskStatus.ANULAT -> OutlinedButton(
                                onClick = { onTransition(targetStatus) },
                                enabled = !isTransitioning,
                                modifier = buttonModifier,
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error,
                                ),
                            ) {
                                Text(text = transitionButtonLabel(targetStatus))
                            }

                            TaskStatus.DE_FACUT -> OutlinedButton(
                                onClick = { onTransition(targetStatus) },
                                enabled = !isTransitioning,
                                modifier = buttonModifier,
                            ) {
                                Text(text = transitionButtonLabel(targetStatus))
                            }

                            else -> Button(
                                onClick = { onTransition(targetStatus) },
                                enabled = !isTransitioning,
                                modifier = buttonModifier,
                            ) {
                                Text(
                                    text = if (currentStatus == TaskStatus.BLOCAT && targetStatus == TaskStatus.IN_LUCRU) {
                                        "Reîncearcă pornirea"
                                    } else {
                                        transitionButtonLabel(targetStatus)
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }

        // Bottom spacing
        item { Spacer(modifier = Modifier.height(16.dp)) }
    }
}

// ---------------------------------------------------------------------------
// Cancel Reason Dialog
// ---------------------------------------------------------------------------

@Composable
private fun CancelReasonDialog(
    onConfirm: (reason: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var reason by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Anulare task") },
        text = {
            Column {
                Text(
                    text = "Introduceți motivul anulării:",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("Motiv anulare") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(reason) },
                enabled = reason.isNotBlank(),
            ) {
                Text("Confirmă")
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
// Reusable detail composables
// ---------------------------------------------------------------------------

/** Key–value row (label left, value right-aligned) mirroring the prototype `.krow`. */
@Composable
private fun KeyRow(
    key: String,
    value: String,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = key,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = valueColor,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun Divider() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outline),
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the color for a variance percentage value.
 * Green for <=5%, orange for <=15%, red for >15%.
 */
@Composable
private fun varianceColor(variancePercent: Double?): Color {
    if (variancePercent == null) return MaterialTheme.colorScheme.onSurface
    return when {
        abs(variancePercent) <= 5.0 -> Success
        abs(variancePercent) <= 15.0 -> Warning
        else -> MaterialTheme.colorScheme.error
    }
}

/**
 * Returns a human-readable Romanian button label for a transition target.
 */
private fun transitionButtonLabel(targetStatus: TaskStatus): String = when (targetStatus) {
    TaskStatus.IN_LUCRU -> "Începe lucrul"
    TaskStatus.FINALIZAT -> "Finalizează"
    TaskStatus.ANULAT -> "Anulează"
    TaskStatus.DE_FACUT -> "Mută înapoi la De făcut"
    TaskStatus.BLOCAT -> TaskStatus.BLOCAT.displayName
}
