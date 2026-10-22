package com.horae.app.ui.stock

import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.ExpiringItemDto
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.StatusKind
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HSegmentedControl
import com.horae.app.ui.common.HoraeRefreshBox
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.RequestGate
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.accentGradientBackground
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.common.runRefresh
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ExpiringUiState(
    val days: Int = 7,
    val items: List<ExpiringItemDto> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val loaded: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ExpiringViewModel @Inject constructor(
    private val repository: StockRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ExpiringUiState())
    val state: StateFlow<ExpiringUiState> = _state.asStateFlow()
    private val gate = RequestGate()

    init { load() }

    fun setDays(days: Int) {
        if (days == _state.value.days) return
        _state.update { it.copy(days = days) }
        load()
    }

    fun load(refresh: Boolean = false) {
        val token = gate.next()
        val days = _state.value.days
        viewModelScope.launch {
            _state.update { if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true) }
            val result = runRefresh(onError = { e ->
                if (gate.isCurrent(token) && !refresh) {
                    _state.update { it.copy(error = ApiErrors.userMessage(e, "Nu am putut încărca expirările")) }
                }
            }) { repository.getExpiring(days) }
            if (!gate.isCurrent(token)) return@launch
            _state.update {
                it.copy(
                    items = result?.sortedBy { i -> i.daysUntilExpiry } ?: it.items,
                    isLoading = false,
                    isRefreshing = false,
                    loaded = it.loaded || result != null,
                )
            }
        }
    }

    fun dismissError() = _state.update { it.copy(error = null) }
}

private val dayOptions = listOf(3, 7, 14, 30)

private fun expiryLabel(days: Int): String = when {
    days < 0 -> "expirat"
    days == 0 -> "expiră azi"
    days == 1 -> "expiră mâine"
    else -> "în $days zile"
}

/** "Expirări" — lots and produced goods expiring within the chosen window. */
@Composable
fun ExpiringScreen(
    navController: NavController,
    viewModel: ExpiringViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val sch = HoraeTheme.scheme
    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Column(Modifier.fillMaxSize().accentGradientBackground()) {
        StockTopBar(onBack = { navController.popBackStack() })
        // Title hides on scroll down / back on scroll up; the day segment stays pinned (1.39.0).
        com.horae.app.ui.common.CollapsingHeaderLayout(
            modifier = Modifier.fillMaxSize(),
            header = {
                Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 12.dp)) {
                    Text("Expirări", style = AppFont.title(28f), color = sch.ink)
                    Text("Ce expiră în zilele următoare", style = AppFont.body(13f), color = sch.muted)
                }
            },
            pinned = {
                HSegmentedControl(
                    options = dayOptions,
                    selected = state.days,
                    onSelect = viewModel::setDays,
                    label = { "$it zile" },
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            },
        ) {
            when {
                !state.loaded && state.isLoading -> LoadingOverlay()
                else -> HoraeRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = { viewModel.load(refresh = true) },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (state.items.isEmpty()) {
                            item { StockEmptyText("Nimic nu expiră în următoarele ${state.days} zile.") }
                        } else {
                            item {
                                HCard(padding = PaddingValues(0.dp)) {
                                    state.items.forEachIndexed { i, it ->
                                        if (i > 0) StockDivider()
                                        val kind = when {
                                            it.daysUntilExpiry <= 1 -> StatusKind.DANGER
                                            it.daysUntilExpiry <= 7 -> StatusKind.WARNING
                                            else -> StatusKind.READY
                                        }
                                        StockItemRow(
                                            title = it.materialTitle,
                                            subtitle = listOfNotNull(
                                                expiryLabel(it.daysUntilExpiry),
                                                RoDate.shortDate(it.expiryDate),
                                                if (it.itemType == "PRODUS") "produs" else null,
                                                it.locationName,
                                            ).joinToString(" · "),
                                            subtitleKind = kind.takeIf { k -> k != StatusKind.READY },
                                            quantity = it.unit?.let { u -> formatQty(it.quantity, u) } ?: it.quantity.qtyFormatted(),
                                            kind = kind,
                                            onClick = null,
                                            showChevron = false,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
