package com.horae.app.ui.transfers

import com.horae.app.ui.common.BulkActionCatalog
import com.horae.app.ui.common.BulkOutcome
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.ui.common.rememberBulkSelectionState
import com.horae.app.ui.common.BulkSelectionState
import com.horae.app.ui.common.BulkSelectInlineHeader
import com.horae.app.ui.common.BulkSelectTopBar
import com.horae.app.ui.common.BulkSelectCheckbox
import com.horae.app.ui.common.BulkSelectBottomBar
import com.horae.app.ui.common.BulkSelectAction
import com.horae.app.ui.common.BulkDeleteWarnings
import com.horae.app.ui.common.BulkDeleteResultDialog
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.TransferResponse
import com.horae.app.data.repository.TransferRepository
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.TransferStatus
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeFilterChip
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.StatusColors
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

data class TransferListUiState(
    val transfers: List<TransferResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    /** Selected status chips. Empty = show every status. */
    val statusFilter: Set<TransferStatus> = emptySet(),
    /** Select & delete (bulk) — in flight / last result. */
    val isPreviewing: Boolean = false,
    val bulkPreview: BulkDeletePreviewDto? = null,
    val isDeleting: Boolean = false,
    val isActing: Boolean = false,
    val bulkResult: BulkOutcome? = null,
) {
    /** Transfers matching the selected chips (all when none selected). */
    val visible: List<TransferResponse>
        get() = if (statusFilter.isEmpty()) transfers
        else transfers.filter { t ->
            TransferStatus.fromString(t.status)?.let { it in statusFilter } ?: false
        }

    val pendingCount: Int
        get() = transfers.count { it.status == TransferStatus.IN_ASTEPTARE.name }
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class TransferListViewModel @Inject constructor(
    private val transferRepository: TransferRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TransferListUiState())
    val uiState: StateFlow<TransferListUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val response = transferRepository.getTransfers(page = 1, limit = 100)
                _uiState.update {
                    it.copy(transfers = response.data, isLoading = false, error = null)
                }
            } catch (e: Exception) {
                Timber.e(e, "TransferListViewModel: failed to fetch transfers")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea transferurilor"),
                    )
                }
            }
        }
    }

    fun toggleStatus(status: TransferStatus) {
        _uiState.update {
            val next = it.statusFilter.toMutableSet()
            if (!next.add(status)) next.remove(status)
            it.copy(statusFilter = next)
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /** Bulk delete the selected rows, then reload. */
    fun bulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true) }
            // Keep the confirm dialog up (spinner) until the result arrives.
            try {
                val result = transferRepository.bulkDelete(ids)
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, bulkResult = BulkOutcome.ofDelete(result)) }
                load()
            } catch (e: Exception) {
                Timber.e(e, "TransferListViewModel: bulkDelete failed")
                _uiState.update {
                    it.copy(isDeleting = false, bulkPreview = null, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la ștergere"))
                }
            }
        }
    }

    /** Step 1 of bulk delete: ask the API what else the selection would touch; the screen then confirms. */
    fun previewBulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isPreviewing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isPreviewing = true) }
            try {
                val preview = transferRepository.bulkDeletePreview(ids)
                _uiState.update { it.copy(isPreviewing = false, bulkPreview = preview) }
            } catch (e: Exception) {
                Timber.e(e, "TransferListViewModel: previewBulkDelete failed")
                _uiState.update { it.copy(isPreviewing = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut verifica ce se șterge")) }
            }
        }
    }

    fun clearBulkPreview() {
        _uiState.update { it.copy(bulkPreview = null) }
    }

    /** Apply a bulk action (status / assign / …) to the selected rows, then reload. */
    fun bulkAction(ids: List<String>, action: String, params: Map<String, Any?>?) {
        if (ids.isEmpty() || _uiState.value.isActing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isActing = true) }
            try {
                val result = transferRepository.bulkAction(ids, action, params)
                _uiState.update { it.copy(isActing = false, bulkResult = BulkOutcome.ofAction(result)) }
                load()
            } catch (e: Exception) {
                Timber.e(e, "TransferListViewModel: bulkAction failed")
                _uiState.update { it.copy(isActing = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la aplicarea acțiunii")) }
            }
        }
    }

    fun clearBulkResult() {
        _uiState.update { it.copy(bulkResult = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransferListScreen(
    navController: NavController,
    role: UserRole = UserRole.ADMINISTRATOR,
    viewModel: TransferListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val canCreate = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_MOVEMENT)
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.STOCK_TRANSFER)
    val canAct = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.STOCK_TRANSFER)
    val canSelect = canDelete || canAct
    val bulk = rememberBulkSelectionState()

    BulkDeleteResultDialog(
        result = uiState.bulkResult,
        onDismiss = {
            viewModel.clearBulkResult()
            bulk.exit()
        },
    )

    // Refresh when returning from the create screen (it sets a result flag).
    val currentEntry = navController.currentBackStackEntry
    LaunchedEffect(currentEntry) {
        val handle = currentEntry?.savedStateHandle ?: return@LaunchedEffect
        handle.getStateFlow("transfer_created", false).collect { created ->
            if (created) {
                handle["transfer_created"] = false
                viewModel.load()
            }
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            if (bulk.isActive) {
                BulkSelectTopBar(state = bulk, allIds = uiState.visible.map { it.id })
            } else {
                TopAppBar(
                    title = { Text("Transferuri", fontWeight = FontWeight.Bold) },
                    navigationIcon = {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Înapoi")
                        }
                    },
                    actions = { if (canSelect) BulkSelectAction(bulk) },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                        titleContentColor = MaterialTheme.colorScheme.onBackground,
                    ),
                )
            }
        },
        bottomBar = {
            if (bulk.isActive) {
                BulkSelectBottomBar(
                    state = bulk,
                    warning = BulkDeleteWarnings.TRANSFERS,
                    preview = uiState.bulkPreview,
                    isPreviewing = uiState.isPreviewing,
                    isDeleting = uiState.isDeleting,
                    onRequestPreview = viewModel::previewBulkDelete,
                    onDismissPreview = viewModel::clearBulkPreview,
                    onConfirmDelete = viewModel::bulkDelete,
                    canDelete = canDelete,
                    actions = BulkActionCatalog.transfers,
                    canAct = canAct,
                    isActing = uiState.isActing,
                    onRunAction = viewModel::bulkAction,
                )
            }
        },
        floatingActionButton = {
            if (canCreate && !bulk.isActive) {
                FloatingActionButton(
                    onClick = { navController.navigate(Screen.TransferCreate.route) },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = Color.White,
                    modifier = Modifier.tutorialAnchor("stock.transfers.open"),
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Transfer nou")
                }
            }
        },
    ) { innerPadding ->
        // Lead line hides on scroll down / back on scroll up; status pills stay pinned (1.39.0).
        com.horae.app.ui.common.CollapsingHeaderLayout(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            header = {
                // Lead line — matches the prototype "Mișcă stoc între locații · N în așteptare".
                Text(
                    text = buildString {
                        append("Mișcă stoc între locații")
                        if (uiState.pendingCount > 0) append(" · ${uiState.pendingCount} în așteptare")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            },
            pinned = {
                // Status filter chips — multi-select toggle, no "Toate".
                Row(
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    TransferStatus.entries.forEach { status ->
                        HoraeFilterChip(
                            label = status.displayName,
                            selected = status in uiState.statusFilter,
                            onClick = { viewModel.toggleStatus(status) },
                            tint = StatusColors.transferStatus(status),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
            },
        ) {
            when {
                uiState.isLoading && uiState.transfers.isEmpty() -> LoadingOverlay()
                uiState.visible.isEmpty() -> EmptyTransferState()
                else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(items = uiState.visible, key = { it.id }) { transfer ->
                        TransferRow(
                            transfer = transfer,
                            selection = bulk.takeIf { canSelect },
                            onClick = {
                                navController.navigate(Screen.TransferDetail.createRoute(transfer.id))
                            },
                        )
                        HorizontalDivider(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }
                }
            }
        }
    }

    uiState.error?.let { ErrorDialog(message = it, onDismiss = viewModel::clearError) }
}

// ---------------------------------------------------------------------------
// Single transfer row — ⇄ chip · source→dest + summary · status badge
// ---------------------------------------------------------------------------

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TransferRow(
    transfer: TransferResponse,
    onClick: () -> Unit,
    selection: BulkSelectionState? = null,
) {
    val status = TransferStatus.fromString(transfer.status) ?: TransferStatus.IN_ASTEPTARE
    val statusColor = StatusColors.transferStatus(status)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = {
                    if (selection?.isActive == true) selection.toggle(transfer.id) else onClick()
                },
                onLongClick = selection?.let { s -> { if (!s.isActive) { s.enter(); s.toggle(transfer.id) } } },
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (selection?.isActive == true) {
            BulkSelectCheckbox(state = selection, id = transfer.id)
        }
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Default.SwapHoriz,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "${transfer.fromLocation?.name ?: "—"} → ${transfer.toLocation?.name ?: "Destinație externă"}",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = transferSummary(transfer),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        HoraeStatusBadge(label = status.displayName, color = statusColor)
    }
}


/** "TR-0042 · 3 produse · 20 iul 09:20 · Ana Popescu" — from available fields. */
private fun transferSummary(transfer: TransferResponse): String {
    val parts = mutableListOf<String>()
    parts += "TR-" + transfer.id.take(8).uppercase()
    val count = transfer.items.size
    parts += "$count " + if (count == 1) "produs" else "produse"
    // Local (Europe/Bucharest) day + time — was printed on the UTC clock.
    com.horae.app.ui.common.RoDate.parse(transfer.createdAt)?.let { i ->
        parts += com.horae.app.ui.common.RoDate.dayMonthShort(com.horae.app.ui.common.RoDate.calendarDay(i)) +
            " " + com.horae.app.ui.common.RoDate.time(i)
    }
    return parts.joinToString(" · ")
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

@Composable
private fun EmptyTransferState() {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.SwapHoriz,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Niciun transfer",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
