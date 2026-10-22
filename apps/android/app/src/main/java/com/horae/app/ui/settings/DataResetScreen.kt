package com.horae.app.ui.settings

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.ResetCategoryPreviewDto
import com.horae.app.data.repository.DataResetRepository
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatusBadge

/** Romanian labels for the per-model counts (rest stay as in the API). */
private val MODEL_LABELS_RO = mapOf(
    "Task" to "Taskuri",
    "TaskStatusHistory" to "Istoric taskuri",
    "RecipeYieldHistory" to "Randamente",
    "StockReservation" to "Rezervări",
    "LotConsumption" to "Consumuri loturi",
    "EquipmentReservation" to "Rezervări echipamente",
    "StockMovement" to "Mișcări de stoc",
    "StockLot" to "Loturi",
    "RecipeStockLot" to "Loturi produse",
    "MaterialStock" to "Stoc pe locații",
    "RecipeStock" to "Stoc produse pe locații",
    "StockTransfer" to "Transferuri",
    "StockTransferItem" to "Articole transfer",
    "TransferApproval" to "Aprobări transfer",
    "Order" to "Comenzi",
    "OrderItem" to "Articole comandă",
    "OrderStatusHistory" to "Istoric comenzi",
    "DeliveryNote" to "Avize de livrare",
    "ConformityCertificate" to "Certificate",
    "ExternalOrderSource" to "Comenzi externe",
    "SalesDeduction" to "Scăderi din vânzări",
    "SalesDeductionLine" to "Linii vânzări",
    "Notification" to "Notificări",
    "Recipe" to "Rețete",
    "RecipeComponent" to "Componente rețete",
    "RecipeIngredient" to "Ingrediente",
    "RecipeVersion" to "Versiuni rețete",
    "PriceHistory" to "Istoric prețuri",
    "ProductMapping" to "Mapări produse",
    "SalesProductAlias" to "Aliasuri vânzări",
    "RawMaterial" to "Materii prime",
    "Consumable" to "Consumabile",
    "UnitConversion" to "Conversii unități",
)

private fun countLines(counts: Map<String, Int>): String =
    counts.filter { it.value > 0 }
        .entries.sortedByDescending { it.value }
        .joinToString(" · ") { "${MODEL_LABELS_RO[it.key] ?: it.key}: ${it.value}" }

/**
 * Setări → Administrare → "Resetare date" (admin only).
 * Mirrors web `settings/reset` + iOS `DataResetView`: category toggles with row
 * counts, auto-checked dependencies, a separate "Date de bază" zone (recipes,
 * raw materials) and a typed-word confirmation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataResetScreen(
    navController: NavController,
    viewModel: DataResetViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    var showConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(state.successMessage, state.errorMessage) {
        val message = state.successMessage ?: state.errorMessage ?: return@LaunchedEffect
        if (state.successMessage != null) showConfirm = false
        snackbarHostState.showSnackbar(message)
        viewModel.clearMessages()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Resetare date") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Înapoi")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(top = 8.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            // Backup note
            HoraeCard(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        Icons.Default.Backup,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Column {
                        Text(
                            "Se face backup automat înainte",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "Starea organizației se salvează în Backup & Restaurare înainte de orice resetare. Dacă te răzgândești, poți restaura de acolo.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Operational data
            Spacer(Modifier.height(14.dp))
            HoraeSectionHeader("Date operaționale", modifier = Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.height(8.dp))
            HoraeCard(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                if (state.isLoading) {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) { CircularProgressIndicator() }
                } else {
                    Column {
                        state.operational.forEachIndexed { index, category ->
                            if (index > 0) HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                            CategoryRow(
                                category = category,
                                checked = state.isChecked(category),
                                implied = state.isImplied(category),
                                enabled = !state.isRunning,
                                onCheckedChange = { viewModel.setSelected(category.key, it) },
                            )
                        }
                    }
                }
            }

            // Master data
            if (!state.isLoading && state.danger.isNotEmpty()) {
                Spacer(Modifier.height(18.dp))
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        "Date de bază",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Spacer(Modifier.height(8.dp))
                HoraeCard(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Column {
                        Text(
                            "Rețetele și materiile prime nu se șterg niciodată implicit — doar dacă le bifezi aici. Ștergerea lor include automat datele care depind de ele.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                        )
                        state.danger.forEach { category ->
                            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                            CategoryRow(
                                category = category,
                                checked = state.isChecked(category),
                                implied = state.isImplied(category),
                                enabled = !state.isRunning,
                                danger = true,
                                onCheckedChange = { viewModel.setSelected(category.key, it) },
                            )
                        }
                    }
                }
            }

            // Action
            Spacer(Modifier.height(18.dp))
            Column(
                modifier = Modifier.padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = if (state.effective.isEmpty()) "Nimic selectat"
                    else "${state.effective.joinToString(", ") { it.label }} — ${state.effectiveTotal} înregistrări",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { showConfirm = true },
                    enabled = !state.isLoading && !state.isRunning && state.effective.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.DeleteSweep, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Resetează selecția")
                }
            }
        }
    }

    if (showConfirm) {
        ConfirmResetDialog(
            labels = state.effective.map { it.label },
            total = state.effectiveTotal,
            includesDanger = state.includesDanger,
            isRunning = state.isRunning,
            onConfirm = { viewModel.run() },
            onDismiss = { if (!state.isRunning) showConfirm = false },
        )
    }
}

@Composable
private fun CategoryRow(
    category: ResetCategoryPreviewDto,
    checked: Boolean,
    implied: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    danger: Boolean = false,
) {
    val lines = countLines(category.counts)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    category.label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                HoraeStatusBadge(
                    label = "${category.total}",
                    color = if (category.total > 0) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (implied) {
                    HoraeStatusBadge(label = "inclus automat", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(
                category.description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (lines.isNotEmpty()) {
                Text(
                    lines,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled && !implied,
            colors = if (danger) SwitchDefaults.colors(
                checkedTrackColor = MaterialTheme.colorScheme.error,
                checkedThumbColor = MaterialTheme.colorScheme.onError,
            ) else SwitchDefaults.colors(),
        )
    }
}

@Composable
private fun ConfirmResetDialog(
    labels: List<String>,
    total: Int,
    includesDanger: Boolean,
    isRunning: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    var confirmText by remember { mutableStateOf("") }
    val word = DataResetRepository.CONFIRM_WORD

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Default.DeleteSweep,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
            )
        },
        title = { Text("Resetezi datele selectate?") },
        text = {
            Column {
                Text(
                    text = buildString {
                        append("Se șterg definitiv $total înregistrări din: ${labels.joinToString(", ")}.")
                        if (includesDanger) append("\n\nInclude date de bază (rețete / materii prime).")
                        append("\n\nÎnainte se salvează automat un backup. Scrie $word pentru a confirma.")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = confirmText,
                    onValueChange = { confirmText = it },
                    label = { Text(word) },
                    singleLine = true,
                    enabled = !isRunning,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = confirmText == word && !isRunning,
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                if (isRunning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.error,
                    )
                } else {
                    Text("Resetează")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isRunning) { Text("Anulează") }
        },
    )
}
