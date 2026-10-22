package com.horae.app.ui.stock

import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.ConsumableResponse
import com.horae.app.data.remote.dto.StockMovementResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HoraeRefreshBox
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

data class ConsumableDetailUiState(
    val consumable: ConsumableResponse? = null,
    val movements: List<StockMovementResponse> = emptyList(),
    val availability: com.horae.app.data.remote.dto.StockItemAvailabilityResponse? = null,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ConsumableDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: StockRepository,
) : ViewModel() {

    private val consumableId: String = checkNotNull(savedStateHandle["consumableId"])

    private val _uiState = MutableStateFlow(ConsumableDetailUiState())
    val uiState: StateFlow<ConsumableDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    /** [refresh] = pull-to-refresh: a failure keeps what is shown. */
    fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            _uiState.update { if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true, error = null) }
            try {
                val consumableDeferred = async { repository.getConsumable(consumableId) }
                val movementsDeferred = async { repository.getMovements(consumableId = consumableId).data }
                val availabilityDeferred = async {
                    runCatching { repository.getItemAvailability(consumableId = consumableId) }.getOrNull()
                }
                _uiState.update {
                    it.copy(
                        consumable = consumableDeferred.await(),
                        movements = movementsDeferred.await(),
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
                        error = if (refresh || ApiErrors.isCancellation(e)) it.error
                        else ApiErrors.userMessage(e, "Nu am putut încărca consumabilul"),
                    )
                }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

private const val PIECES = "BUCATI"

/** Consumable detail on the redesign: header, actions, levels, locations, movements. */
@Composable
fun ConsumableDetailScreen(
    navController: NavController,
    role: UserRole = UserRole.AJUTOR_COFETAR,
    viewModel: ConsumableDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val sch = HoraeTheme.scheme
    val canTransfer = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_TRANSFER)

    state.error?.let { msg -> ErrorDialog(message = msg, onDismiss = viewModel::dismissError) }

    Column(Modifier.fillMaxSize().background(sch.background)) {
        StockTopBar(onBack = { navController.popBackStack() })
        val c = state.consumable
        when {
            c == null && state.isLoading -> LoadingOverlay()
            c == null -> StockEmptyText("Consumabilul nu a fost găsit. Poate a fost șters.")
            else -> HoraeRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { viewModel.load(refresh = true) },
                modifier = Modifier.clipToBounds().fillMaxSize(),
            ) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp)
                        .padding(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StockDetailHeader(
                        eyebrow = "Consumabil",
                        title = c.title,
                        status = c.status,
                        category = c.category?.takeIf { it.isNotBlank() } ?: "Fără categorie",
                        meta = c.minimumStock.takeIf { it > 0 }?.let { "prag minim ${formatQty(it, PIECES)}" },
                    )
                    if (canTransfer) {
                        StockActionRow(contentPadding = PaddingValues(0.dp)) {
                            StockActionChip("Transfer", Icons.Filled.SwapHoriz, { navController.navigate(StockRoutes.TRANSFER_CREATE) })
                        }
                    }
                    ConsumableLevelsCard(c)
                    state.availability?.locations?.filter { it.quantity != 0.0 }?.takeIf { it.isNotEmpty() }?.let { locs ->
                        HCard {
                            StockCardTitle("Pe locații")
                            locs.forEachIndexed { i, l ->
                                if (i > 0) StockDivider()
                                StockInfoRow(l.locationName, formatQty(l.quantity, PIECES))
                            }
                        }
                    }
                    if (state.movements.isNotEmpty()) MovementsCard(state.movements)
                    Text(
                        "Creat ${RoDate.shortDateTime(c.createdAt)} · actualizat ${RoDate.shortDateTime(c.updatedAt)}",
                        style = AppFont.body(12f),
                        color = sch.muted,
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ConsumableLevelsCard(c: ConsumableResponse) {
    val sch = HoraeTheme.scheme
    val kind = stockKind(c.stockCount, c.minimumStock)
    HCard {
        StockCardTitle("Niveluri stoc")
        Text(
            formatQty(c.stockCount, PIECES),
            style = AppFont.display(32f),
            color = if (kind == StatusKind.READY) sch.ink else StatusPalette.color(kind, sch),
        )
        Text("stoc total", style = AppFont.body(12f), color = sch.muted)
        Spacer(Modifier.height(6.dp))
        StockInfoRow("Rezervat", formatQty(c.reservedCount, PIECES))
        StockDivider()
        StockInfoRow("Disponibil", formatQty((c.stockCount - c.reservedCount).coerceAtLeast(0.0), PIECES))
        StockDivider()
        StockInfoRow("Stoc minim", formatQty(c.minimumStock, PIECES))
        if (c.orderedCount > 0) {
            StockDivider()
            StockInfoRow("Comandat", formatQty(c.orderedCount, PIECES))
        }
    }
}
