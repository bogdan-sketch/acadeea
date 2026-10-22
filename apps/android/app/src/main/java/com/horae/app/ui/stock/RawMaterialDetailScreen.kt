package com.horae.app.ui.stock

import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RawMaterialDeleteInfoDto
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.remote.dto.StockMovementResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.PieceType
import com.horae.app.domain.model.StockMovementType
import com.horae.app.domain.model.StorageType
import com.horae.app.domain.model.UnitType
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatCard
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.formatUnitQty
import androidx.compose.foundation.background
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.outlined.Delete
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import retrofit2.HttpException
import java.io.IOException
import javax.inject.Inject

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

data class RawMaterialDetailUiState(
    val material: RawMaterialResponse? = null,
    val movements: List<StockMovementResponse> = emptyList(),
    val availability: com.horae.app.data.remote.dto.StockItemAvailabilityResponse? = null,
    val isRefreshing: Boolean = false,
    val priceHistory: List<com.horae.app.data.remote.dto.RawMaterialPriceHistoryDto> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val deleteInfo: RawMaterialDeleteInfoDto? = null,
    val isDeleteInfoLoading: Boolean = false,
    val isDeleting: Boolean = false,
    val deleted: Boolean = false,
)

@HiltViewModel
class RawMaterialDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: StockRepository,
) : ViewModel() {

    private val materialId: String = checkNotNull(savedStateHandle["materialId"])

    private val _uiState = MutableStateFlow(RawMaterialDetailUiState())
    val uiState: StateFlow<RawMaterialDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    /** [refresh] = pull-to-refresh: keeps the shown data when the reload fails. */
    fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            _uiState.update { if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true, error = null) }
            try {
                val materialDeferred = async { repository.getRawMaterial(materialId) }
                val movementsDeferred = async {
                    repository.getMovements(rawMaterialId = materialId).data
                }
                val priceHistoryDeferred = async {
                    runCatching { repository.getRawMaterialPriceHistory(materialId) }
                        .getOrDefault(emptyList())
                }
                val availabilityDeferred = async {
                    runCatching { repository.getItemAvailability(rawMaterialId = materialId) }.getOrNull()
                }
                _uiState.update {
                    it.copy(
                        material = materialDeferred.await(),
                        movements = movementsDeferred.await(),
                        priceHistory = priceHistoryDeferred.await(),
                        availability = availabilityDeferred.await() ?: it.availability,
                        isLoading = false,
                        isRefreshing = false,
                    )
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = if (refresh || com.horae.app.data.remote.ApiErrors.isCancellation(e)) it.error
                        else com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut încărca materia primă"),
                    )
                }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    fun onDeleteClick() {
        if (_uiState.value.isDeleteInfoLoading) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleteInfoLoading = true, error = null) }
            try {
                val info = repository.getRawMaterialDeleteInfo(materialId)
                _uiState.update { it.copy(deleteInfo = info, isDeleteInfoLoading = false) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(isDeleteInfoLoading = false, error = extractApiMessage(e))
                }
            }
        }
    }

    fun dismissDeleteDialog() {
        if (_uiState.value.isDeleting) return
        _uiState.update { it.copy(deleteInfo = null) }
    }

    fun confirmDelete() {
        if (_uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true) }
            try {
                repository.deleteRawMaterial(materialId)
                _uiState.update { it.copy(isDeleting = false, deleteInfo = null, deleted = true) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(isDeleting = false, deleteInfo = null, error = extractApiMessage(e))
                }
            }
        }
    }

    /** Pulls the backend's Romanian `message` out of an HTTP error body when available. */
    private fun extractApiMessage(e: Exception): String {
        if (e is HttpException) {
            try {
                val body = e.response()?.errorBody()?.string()
                if (!body.isNullOrBlank()) {
                    when (val message = JSONObject(body).opt("message")) {
                        is String -> if (message.isNotBlank()) return message
                        is JSONArray -> if (message.length() > 0) return message.getString(0)
                    }
                }
            } catch (_: Exception) {
                // fall through to generic message
            }
        }
        return when (e) {
            is IOException -> "Verifică conexiunea la internet"
            else -> "A apărut o eroare. Încearcă din nou."
        }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RawMaterialDetailScreen(
    navController: NavController,
    role: UserRole,
    viewModel: RawMaterialDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.RAW_MATERIAL)

    // After a successful hard delete: flag the list screen to reload, then leave.
    LaunchedEffect(state.deleted) {
        if (state.deleted) {
            runCatching { navController.getBackStackEntry(Screen.RawMaterialList.route) }
                .getOrNull()
                ?.savedStateHandle
                ?.set(RAW_MATERIAL_LIST_REFRESH_KEY, true)
            navController.popBackStack()
        }
    }

    state.error?.let { msg ->
        ErrorDialog(message = msg, onDismiss = viewModel::dismissError)
    }

    state.deleteInfo?.let { info ->
        val material = state.material
        if (!info.canDelete) {
            CannotDeleteDialog(
                info = info,
                unit = material?.unit,
                onDismiss = viewModel::dismissDeleteDialog,
            )
        } else {
            ConfirmDeleteDialog(
                materialTitle = material?.title ?: "Material",
                everUsed = info.everUsed,
                isDeleting = state.isDeleting,
                onConfirm = viewModel::confirmDelete,
                onDismiss = viewModel::dismissDeleteDialog,
            )
        }
    }

    val canMove = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_MOVEMENT)
    val canTransfer = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_TRANSFER)
    val sch = com.horae.app.ui.theme.HoraeTheme.scheme

    Column(Modifier.fillMaxSize().background(sch.background)) {
        StockTopBar(onBack = { navController.popBackStack() })
        val m = state.material
        when {
            m == null && state.isLoading -> LoadingOverlay()
            m == null -> StockEmptyText("Materia primă nu a fost găsită. Poate a fost ștearsă.")
            else -> com.horae.app.ui.common.HoraeRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { viewModel.load(refresh = true) },
                modifier = Modifier.clipToBounds().fillMaxSize(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp)
                        .padding(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StockDetailHeader(
                        eyebrow = "Materie primă",
                        title = m.title,
                        status = m.status,
                        category = m.category?.takeIf { it.isNotBlank() } ?: "Fără categorie",
                        meta = listOfNotNull(
                            (m.supplierName ?: m.producer)?.takeIf { it.isNotBlank() },
                            m.minimumStock.takeIf { it > 0 }?.let { "prag minim ${formatQty(it, m.unit)}" },
                        ).joinToString(" · "),
                    )
                    StockActionRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                        if (canMove) {
                            StockActionChip("Recepție", Icons.Filled.ArrowDownward, { navController.navigate(StockRoutes.receive(m.id)) })
                        }
                        if (canTransfer) {
                            StockActionChip("Transfer", Icons.Filled.SwapHoriz, { navController.navigate(StockRoutes.TRANSFER_CREATE) })
                        }
                        if (canMove) {
                            StockActionChip("Ajustare", Icons.Filled.Tune, {
                                navController.navigate(StockRoutes.movementNew("AJUSTARE", m.id))
                            })
                        }
                        if (canDelete) {
                            StockActionChip(
                                "Șterge", Icons.Outlined.Delete, viewModel::onDeleteClick,
                                destructive = true, enabled = !state.isDeleteInfoLoading,
                            )
                        }
                    }
                    StockLevelsCard(m)
                    state.availability?.locations?.filter { it.quantity != 0.0 }?.takeIf { it.isNotEmpty() }?.let { locs ->
                        com.horae.app.ui.common.HCard {
                            StockCardTitle("Pe locații")
                            locs.forEachIndexed { i, l ->
                                if (i > 0) StockDivider()
                                StockInfoRow(l.locationName, formatQty(l.quantity, m.unit))
                            }
                        }
                    }
                    InfoCard(m)
                    if (state.priceHistory.isNotEmpty()) {
                        PriceHistoryCard(state.priceHistory, m.unit)
                    }
                    if (state.movements.isNotEmpty()) {
                        MovementsCard(state.movements)
                    }
                    Text(
                        "Creat ${com.horae.app.ui.common.RoDate.shortDateTime(m.createdAt)} · actualizat ${com.horae.app.ui.common.RoDate.shortDateTime(m.updatedAt)}",
                        style = com.horae.app.ui.theme.AppFont.body(12f),
                        color = sch.muted,
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
            }
        }
    }
}

/**
 * SavedStateHandle key set on the list screen's back-stack entry after a delete,
 * so [RawMaterialListScreen] reloads when the user navigates back.
 */
const val RAW_MATERIAL_LIST_REFRESH_KEY = "rawMaterialListRefresh"

@Composable
private fun CannotDeleteDialog(
    info: RawMaterialDeleteInfoDto,
    unit: String?,
    onDismiss: () -> Unit,
) {
    val message = if (info.currentStock == 0.0 && (info.activeTransfers ?: 0) > 0) {
        "Materialul apare pe un transfer în curs (în așteptare sau în tranzit). " +
            "Finalizează sau anulează transferul, apoi încearcă din nou."
    } else {
        "Materialul are stoc curent: ${formatUnitQty(info.currentStock, unit)}. " +
            "Poate fi șters definitiv doar când stocul este 0."
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nu poate fi ștearsă") },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Am înțeles")
            }
        },
    )
}

@Composable
private fun ConfirmDeleteDialog(
    materialTitle: String,
    everUsed: Boolean,
    isDeleting: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isDeleting) onDismiss() },
        title = { Text("Ștergi definitiv \"$materialTitle\"?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Acțiunea este ireversibilă.")
                if (everUsed) {
                    Text(
                        text = "Atenție: această materie primă a fost folosită în rețete sau " +
                            "producție — ștergerea elimină definitiv și istoricul de mișcări, " +
                            "loturile și trasabilitatea asociate.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = !isDeleting,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = MaterialTheme.colorScheme.error,
                ),
            ) {
                if (isDeleting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text("Șterge definitiv")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isDeleting) {
                Text("Anulează")
            }
        },
    )
}

/** Stoc total / rezervat / disponibil / minim — every figure in the material's unit. */
@Composable
private fun StockLevelsCard(m: RawMaterialResponse) {
    val kind = stockKind(m.stockCount, m.minimumStock)
    val sch = com.horae.app.ui.theme.HoraeTheme.scheme
    com.horae.app.ui.common.HCard {
        StockCardTitle("Niveluri stoc")
        Text(
            formatQty(m.stockCount, m.unit),
            style = com.horae.app.ui.theme.AppFont.display(32f),
            color = if (kind == com.horae.app.domain.model.StatusKind.READY) sch.ink
            else com.horae.app.ui.theme.StatusPalette.color(kind, sch),
        )
        Text("stoc total", style = com.horae.app.ui.theme.AppFont.body(12f), color = sch.muted)
        Spacer(Modifier.height(6.dp))
        StockInfoRow("Rezervat", formatQty(m.reservedCount, m.unit))
        StockDivider()
        StockInfoRow("Disponibil", formatQty((m.stockCount - m.reservedCount).coerceAtLeast(0.0), m.unit))
        StockDivider()
        StockInfoRow("Stoc minim", formatQty(m.minimumStock, m.unit))
        if (m.orderedCount > 0) {
            StockDivider()
            StockInfoRow("Comandat", formatQty(m.orderedCount, m.unit))
        }
    }
}

@Composable
private fun InfoCard(m: RawMaterialResponse) {
    val unitLabel = UnitType.fromString(m.unit)?.abbreviation ?: m.unit
    val pieceLabel = PieceType.entries.firstOrNull { it.name == m.pieceType }?.displayName
    val storageLabel = StorageType.fromString(m.storageType)?.displayName ?: m.storageType
    com.horae.app.ui.common.HCard {
        StockCardTitle("Informații")
        StockInfoRow("Furnizor", m.supplierName?.takeIf { it.isNotBlank() } ?: "Fără furnizor")
        m.producer?.takeIf { it.isNotBlank() }?.let { StockDivider(); StockInfoRow("Producător", it) }
        StockDivider()
        StockInfoRow("Unitate", unitLabel)
        if (m.quantityPerPiece > 0) {
            StockDivider()
            StockInfoRow("Cantitate pe bucată", formatQty(m.quantityPerPiece, m.unit))
            pieceLabel?.let { StockDivider(); StockInfoRow("Tip ambalaj", it) }
        }
        StockDivider()
        StockInfoRow("Tip depozitare", storageLabel)
        m.estimatedLossPercent?.let { StockDivider(); StockInfoRow("Pierderi estimate", com.horae.app.ui.common.RoFormat.percent(it)) }
        m.lotNumber?.takeIf { it.isNotBlank() }?.let { StockDivider(); StockInfoRow("Nr. lot", it) }
        m.expiryDate?.let { raw ->
            StockDivider()
            val past = com.horae.app.ui.common.RoDate.calendarDay(raw)?.isBefore(com.horae.app.ui.common.RoDate.today()) == true
            StockInfoRow(
                "Expiră",
                com.horae.app.ui.common.RoDate.shortDate(raw),
                valueColor = if (past) com.horae.app.ui.theme.StatusPalette.fg(com.horae.app.domain.model.StatusKind.DANGER) else null,
            )
        }
        m.purchasePrice?.let { StockDivider(); StockInfoRow("Preț achiziție", com.horae.app.ui.common.RoFormat.ronPer(it, m.unit)) }
    }
}

@Composable
internal fun MovementsCard(movements: List<StockMovementResponse>, title: String = "Mișcări recente") {
    com.horae.app.ui.common.HCard {
        StockCardTitle(title)
        movements.take(20).forEachIndexed { index, mov ->
            if (index > 0) StockDivider()
            RecentMovementRow(mov)
        }
    }
}

@Composable
internal fun RecentMovementRow(mov: StockMovementResponse) {
    val sch = com.horae.app.ui.theme.HoraeTheme.scheme
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                StockMovementType.label(mov.movementType),
                style = com.horae.app.ui.theme.AppFont.body(14f, FontWeight.SemiBold),
                color = sch.ink,
            )
            Text(
                listOfNotNull(
                    com.horae.app.ui.common.RoDate.shortDateTime(mov.createdAt),
                    mov.locationName,
                    mov.createdByName,
                ).joinToString(" · "),
                style = com.horae.app.ui.theme.AppFont.body(12f),
                color = sch.muted,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            formatQty(mov.quantity, mov.unit),
            style = com.horae.app.ui.theme.AppFont.body(14f, FontWeight.Bold),
            color = sch.ink,
        )
    }
}

@Composable
internal fun DetailRow(
    label: String,
    value: String,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = MaterialTheme.typography.bodyMedium, color = valueColor)
    }
}

/** "17 oct. 2026, 12:08" in Europe/Bucharest (was the raw UTC clock). */
internal fun formatDateShort(iso: String): String =
    com.horae.app.ui.common.RoDate.shortDateTime(iso).ifBlank { iso }

// ---------------------------------------------------------------------------
// Purchase price history — simple line chart (Canvas) + entry rows.
// Mirrors iOS RawMaterialDetailView's Swift Charts section.
// ---------------------------------------------------------------------------

@Composable
private fun PriceHistoryCard(history: List<com.horae.app.data.remote.dto.RawMaterialPriceHistoryDto>, unit: String) {
    // API returns newest-first; the chart wants oldest → newest.
    val points = history.mapNotNull { it.newPrice }.reversed()
    val lineColor = MaterialTheme.colorScheme.primary

    com.horae.app.ui.common.HCard {
        StockCardTitle("Istoric preț achiziție")
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (points.size >= 2) {
                val minV = points.min()
                val maxV = points.max()
                val span = (maxV - minV).takeIf { it > 0.0 } ?: 1.0
                androidx.compose.foundation.Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                ) {
                    val stepX = size.width / (points.size - 1)
                    val pad = 8.dp.toPx()
                    val usableH = size.height - pad * 2
                    fun y(v: Double) = pad + (1f - ((v - minV) / span).toFloat()) * usableH

                    val path = androidx.compose.ui.graphics.Path()
                    points.forEachIndexed { i, v ->
                        val x = i * stepX
                        if (i == 0) path.moveTo(x, y(v)) else path.lineTo(x, y(v))
                    }
                    drawPath(
                        path,
                        color = lineColor,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(
                            width = 2.dp.toPx(),
                            cap = androidx.compose.ui.graphics.StrokeCap.Round,
                            join = androidx.compose.ui.graphics.StrokeJoin.Round,
                        ),
                    )
                    points.forEachIndexed { i, v ->
                        drawCircle(lineColor, radius = 3.dp.toPx(), center = androidx.compose.ui.geometry.Offset(i * stepX, y(v)))
                    }
                }
            }

            history.take(10).forEach { h ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            h.newPrice?.let { com.horae.app.ui.common.RoFormat.ronPer(it, unit) } ?: "—",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        h.oldPrice?.let {
                            Text(
                                "din ${com.horae.app.ui.common.RoFormat.ronPer(it, unit)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Text(
                        com.horae.app.ui.common.RoDate.shortDate(h.createdAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

