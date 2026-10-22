package com.horae.app.ui.transfers

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import com.horae.app.domain.model.TransferApproval
import com.horae.app.domain.model.TransferStatus
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.formatUnitQty
import com.horae.app.ui.theme.Error
import com.horae.app.ui.theme.StatusColors
import com.horae.app.ui.theme.Success
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
// UI State + ViewModel
// ---------------------------------------------------------------------------

data class TransferDetailUiState(
    val transfer: TransferResponse? = null,
    val isLoading: Boolean = false,
    val isUpdating: Boolean = false,
    val isBuildingDoc: Boolean = false,
    // One-shot: (jobName, html) to hand to the print framework, then cleared.
    val docToPrint: Pair<String, String>? = null,
    val error: String? = null,
)

@HiltViewModel
class TransferDetailViewModel @Inject constructor(
    private val transferRepository: TransferRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TransferDetailUiState())
    val uiState: StateFlow<TransferDetailUiState> = _uiState.asStateFlow()

    fun load(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val transfer = transferRepository.getTransfer(id)
                _uiState.update { it.copy(transfer = transfer, isLoading = false, error = null) }
            } catch (e: Exception) {
                Timber.e(e, "TransferDetailViewModel: failed to load transfer")
                _uiState.update {
                    it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea transferului"))
                }
            }
        }
    }

    fun changeStatus(id: String, status: TransferStatus) {
        viewModelScope.launch {
            _uiState.update { it.copy(isUpdating = true) }
            try {
                val updated = transferRepository.updateTransferStatus(id, status.name)
                _uiState.update { it.copy(transfer = updated, isUpdating = false, error = null) }
            } catch (e: Exception) {
                Timber.e(e, "TransferDetailViewModel: failed to change status")
                _uiState.update {
                    it.copy(isUpdating = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la actualizarea statusului"))
                }
            }
        }
    }

    fun approve(id: String, reason: String? = null) = submitApproval(id, TransferApproval.APPROVED, reason)

    fun reject(id: String, reason: String? = null) = submitApproval(id, TransferApproval.REJECTED, reason)

    private fun submitApproval(id: String, status: String, reason: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(isUpdating = true) }
            try {
                val updated = transferRepository.updateTransferApproval(
                    id = id,
                    status = status,
                    reason = reason?.takeIf { r -> r.isNotBlank() },
                )
                _uiState.update { it.copy(transfer = updated, isUpdating = false, error = null) }
            } catch (e: Exception) {
                Timber.e(e, "TransferDetailViewModel: failed to submit approval")
                _uiState.update {
                    it.copy(isUpdating = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la aprobarea transferului"))
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /** Fetch the aviz payload, render it to HTML, and queue it for printing. */
    fun buildAviz(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isBuildingDoc = true) }
            try {
                val html = avizHtml(transferRepository.getAviz(id))
                _uiState.update { it.copy(isBuildingDoc = false, docToPrint = "Aviz de insotire" to html) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isBuildingDoc = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la generarea avizului"))
                }
            }
        }
    }

    /** Fetch the conformity payload, render it to HTML, and queue it for printing. */
    fun buildConformity(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isBuildingDoc = true) }
            try {
                val html = conformityHtml(transferRepository.getConformity(id))
                _uiState.update { it.copy(isBuildingDoc = false, docToPrint = "Declaratie de conformitate" to html) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isBuildingDoc = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la generarea declarației"))
                }
            }
        }
    }

    fun onDocPrinted() = _uiState.update { it.copy(docToPrint = null) }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransferDetailScreen(
    navController: NavController,
    transferId: String,
    role: UserRole = UserRole.ADMINISTRATOR,
    viewModel: TransferDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var showRejectDialog by remember { mutableStateOf(false) }
    // Transfers move stock; gate the write actions on the stock-movement ability.
    val canManage = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_MOVEMENT)

    androidx.compose.runtime.LaunchedEffect(transferId) { viewModel.load(transferId) }

    // Hand any freshly-built document to the Android print framework, once.
    val context = androidx.compose.ui.platform.LocalContext.current
    androidx.compose.runtime.LaunchedEffect(uiState.docToPrint) {
        uiState.docToPrint?.let { (jobName, html) ->
            printHtmlDocument(context, jobName, html)
            viewModel.onDocPrinted()
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Detalii transfer", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Înapoi")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
            )
        },
    ) { innerPadding ->
        val transfer = uiState.transfer
        when {
            uiState.isLoading && transfer == null -> Box(Modifier.fillMaxSize().padding(innerPadding)) {
                LoadingOverlay()
            }
            transfer == null -> Box(
                Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Nu s-a putut încărca transferul",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> TransferContent(
                transfer = transfer,
                isUpdating = uiState.isUpdating,
                isBuildingDoc = uiState.isBuildingDoc,
                canManage = canManage,
                onStatus = { viewModel.changeStatus(transferId, it) },
                onApprove = { viewModel.approve(transferId) },
                onReject = { showRejectDialog = true },
                onPrintAviz = { viewModel.buildAviz(transferId) },
                onPrintConformity = { viewModel.buildConformity(transferId) },
                modifier = Modifier.padding(innerPadding),
            )
        }
    }

    if (showRejectDialog) {
        RejectDialog(
            onDismiss = { showRejectDialog = false },
            onConfirm = { reason ->
                showRejectDialog = false
                viewModel.reject(transferId, reason)
            },
        )
    }

    uiState.error?.let { ErrorDialog(message = it, onDismiss = viewModel::clearError) }
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

@Composable
private fun TransferContent(
    transfer: TransferResponse,
    isUpdating: Boolean,
    isBuildingDoc: Boolean,
    canManage: Boolean,
    onStatus: (TransferStatus) -> Unit,
    onApprove: () -> Unit,
    onReject: () -> Unit,
    onPrintAviz: () -> Unit,
    onPrintConformity: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val status = TransferStatus.fromString(transfer.status) ?: TransferStatus.IN_ASTEPTARE

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Status badge header
        Row(verticalAlignment = Alignment.CenterVertically) {
            HoraeStatusBadge(label = status.displayName, color = StatusColors.transferStatus(status))
        }

        // Locations
        HoraeCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(14.dp)) {
                LocationLine(
                    icon = Icons.Default.ArrowUpward,
                    tint = MaterialTheme.colorScheme.primary,
                    label = "De la",
                    name = transfer.fromLocation?.name ?: "—",
                    address = transfer.fromLocation?.address ?: "",
                )
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 10.dp),
                    color = MaterialTheme.colorScheme.outlineVariant,
                )
                LocationLine(
                    icon = Icons.Default.ArrowDownward,
                    tint = Success,
                    label = "Către",
                    name = transfer.toLocation?.name ?: "Destinație externă",
                    address = transfer.toLocation?.address ?: "",
                )
            }
        }

        // Items
        Text(
            "Produse (${transfer.items.size})",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        HoraeCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                transfer.items.forEachIndexed { index, item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            item.rawMaterialTitle ?: "Articol",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            formatUnitQty(item.quantity, item.unit ?: ""),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (index < transfer.items.lastIndex) {
                        HorizontalDivider(
                            modifier = Modifier.padding(horizontal = 14.dp),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }
                }
            }
        }

        // Info
        HoraeCard(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                InfoLine("Creat de", transfer.createdBy?.fullName ?: "—")
                InfoLine("Data creării", formatDateTime(transfer.createdAt))
                transfer.completedAt?.let { InfoLine("Finalizat", formatDateTime(it)) }
                transfer.notes?.takeIf { it.isNotBlank() }?.let { InfoLine("Note", it) }
            }
        }

        // Actions
        if (canManage && status.allowedTransitions.isNotEmpty()) {
            Text(
                "Acțiuni",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            if (isUpdating) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.size(10.dp))
                    Text("Se actualizează...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            if (status == TransferStatus.IN_ASTEPTARE) {
                ActionButton(
                    label = "Aprobă transferul",
                    icon = Icons.Default.ThumbUp,
                    container = Success,
                    enabled = !isUpdating,
                    onClick = onApprove,
                )
                ActionButton(
                    label = "Marchează în tranzit",
                    icon = Icons.Default.LocalShipping,
                    container = MaterialTheme.colorScheme.primary,
                    enabled = !isUpdating,
                    onClick = { onStatus(TransferStatus.IN_TRANZIT) },
                    modifier = Modifier.tutorialAnchor("stock.transfers.transit"),
                )
                OutlinedActionButton(
                    label = "Respinge",
                    icon = Icons.Default.Cancel,
                    tint = Error,
                    enabled = !isUpdating,
                    onClick = onReject,
                )
            }

            if (status == TransferStatus.IN_TRANZIT) {
                ActionButton(
                    label = "Finalizează",
                    icon = Icons.Default.CheckCircle,
                    container = Success,
                    enabled = !isUpdating,
                    onClick = { onStatus(TransferStatus.FINALIZAT) },
                    modifier = Modifier.tutorialAnchor("stock.transfers.finalize"),
                )
            }

            if (TransferStatus.ANULAT in status.allowedTransitions) {
                OutlinedActionButton(
                    label = "Anulează transferul",
                    icon = Icons.Default.Cancel,
                    tint = Error,
                    enabled = !isUpdating,
                    onClick = { onStatus(TransferStatus.ANULAT) },
                )
            }
        }

        // Documente — aviz de însoțire + declarație de conformitate (print / PDF)
        Text(
            "Documente",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        if (isBuildingDoc) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.size(10.dp))
                Text("Se generează documentul...", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        OutlinedActionButton(
            label = "Aviz de însoțire",
            icon = Icons.Default.Description,
            tint = MaterialTheme.colorScheme.primary,
            enabled = !isBuildingDoc,
            onClick = onPrintAviz,
        )
        OutlinedActionButton(
            label = "Declarație de conformitate",
            icon = Icons.Default.VerifiedUser,
            tint = MaterialTheme.colorScheme.primary,
            enabled = !isBuildingDoc,
            onClick = onPrintConformity,
        )

        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun LocationLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    label: String,
    name: String,
    address: String,
) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Column {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            if (address.isNotBlank()) {
                Text(
                    address,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

@Composable
private fun ActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    container: Color,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth(),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = Color.White),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(8.dp))
        Text(label, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun OutlinedActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = tint),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(8.dp))
        Text(label, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun RejectDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Respinge transferul") },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                placeholder = { Text("Motiv (opțional)") },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(reason) }) {
                Text("Respinge", color = Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Renunță") }
        },
    )
}


/** "17 oct. 2026, 12:08" in Europe/Bucharest. */
private fun formatDateTime(raw: String): String =
    com.horae.app.ui.common.RoDate.shortDateTime(raw).ifBlank { raw.take(10) }
