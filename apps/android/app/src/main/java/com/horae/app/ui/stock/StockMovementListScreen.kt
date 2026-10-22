package com.horae.app.ui.stock

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.CancellationException
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.StockMovementResponse
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.StockMovementType
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeFilterChip
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.formatUnitQty
import com.horae.app.ui.theme.Error
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.StatusPurple
import com.horae.app.ui.theme.Success
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── Movement type → tint + sign ──

private fun movementColor(type: String): Color = when (type) {
    "INTRARE", "INTRARE_PRODUCTIE" -> Success
    "IESIRE_PRODUCTIE" -> Info
    "IESIRE_VANZARE" -> Error
    "AJUSTARE" -> StatusPurple
    else -> Color.Gray
}

private fun movementLabel(type: String): String =
    StockMovementType.label(type)

private fun movementSign(type: String): String = when (type) {
    "INTRARE", "INTRARE_PRODUCTIE" -> "+"
    "IESIRE_PRODUCTIE", "IESIRE_TESTE", "IESIRE_VANZARE" -> "−"
    else -> ""
}

// The DTO carries only ids for the item, so we describe its kind.
private fun itemKind(m: StockMovementResponse): String = when {
    m.rawMaterialId != null -> "Materie primă"
    m.consumableId != null -> "Consumabil"
    m.recipeId != null -> "Rețetă"
    else -> "Mișcare"
}

// ── ViewModel ──

data class StockMovementListUiState(
    val movements: List<StockMovementResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val movementType: String? = null,
    val isExporting: Boolean = false,
)

@HiltViewModel
class StockMovementListViewModel @Inject constructor(
    private val repository: StockRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(StockMovementListUiState())
    val uiState: StateFlow<StockMovementListUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val s = _uiState.value
                val result = repository.getMovements(
                    page = 1,
                    limit = 50,
                    movementType = s.movementType,
                )
                _uiState.update { it.copy(movements = result.data, isLoading = false) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut încărca mișcările")) }
            }
        }
    }

    fun onTypeChange(type: String?) {
        _uiState.update { it.copy(movementType = type) }
        load()
    }

    /** Excel of the log (current type filter, last 30 days) → share sheet. */
    fun exportXlsx(onReady: (ByteArray) -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }
            try {
                onReady(repository.movementsXlsx(movementType = _uiState.value.movementType))
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Exportul a eșuat")) }
            } finally {
                _uiState.update { it.copy(isExporting = false) }
            }
        }
    }
}

// ── Screen ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockMovementListScreen(
    navController: NavController,
    viewModel: StockMovementListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Mișcări de stoc", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.exportXlsx { shareXlsx(context, it, "miscari-stoc", "Mișcări de stoc") } },
                        enabled = !state.isExporting,
                    ) {
                        Icon(Icons.Default.Share, contentDescription = "Exportă Excel")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        Column(modifier = Modifier.fillMaxSize().padding(pad)) {
            // Type filter chips (toggle)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MovementChip(state, viewModel, "INTRARE", "Intrare", Success)
                MovementChip(state, viewModel, "IESIRE_PRODUCTIE", "Ieșire producție", Info)
                MovementChip(state, viewModel, "INTRARE_PRODUCTIE", "Intrare producție", Success)
                MovementChip(state, viewModel, "AJUSTARE", "Ajustare", StatusPurple)
                MovementChip(state, viewModel, "IESIRE_TESTE", "Consum teste", Info)
                MovementChip(state, viewModel, "IESIRE_VANZARE", "Vânzare", Error)
            }

            when {
                state.isLoading && state.movements.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                state.error != null && state.movements.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            state.error ?: "Eroare",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                state.movements.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            "Nicio mișcare",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                else -> {
                    val groups = state.movements.groupBy { dayKey(it.createdAt) }
                    LazyColumn(
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        groups.forEach { (day, items) ->
                            item(key = day) {
                                Column {
                                    Text(
                                        dayLabel(day),
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(bottom = 8.dp, start = 2.dp),
                                    )
                                    HoraeCard(modifier = Modifier.fillMaxWidth()) {
                                        Column {
                                            items.forEachIndexed { i, m ->
                                                if (i > 0) {
                                                    HorizontalDivider(
                                                        modifier = Modifier.padding(horizontal = 16.dp),
                                                        color = MaterialTheme.colorScheme.outlineVariant,
                                                    )
                                                }
                                                MovementRow(m)
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
    }
}

@Composable
private fun MovementChip(
    state: StockMovementListUiState,
    viewModel: StockMovementListViewModel,
    type: String,
    label: String,
    tint: Color,
) {
    HoraeFilterChip(
        label,
        selected = state.movementType == type,
        onClick = { viewModel.onTypeChange(if (state.movementType == type) null else type) },
        tint = tint,
    )
}

@Composable
private fun MovementRow(m: StockMovementResponse) {
    val color = movementColor(m.movementType)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    m.referenceNote?.takeIf { it.isNotBlank() } ?: itemKind(m),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Text(
                    movementSign(m.movementType) + formatUnitQty(m.quantity, m.unit),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = color,
                )
            }
            Spacer(Modifier.height(2.dp))
            Text(
                movementSubtitle(m),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        HoraeStatusBadge(movementLabel(m.movementType), color)
    }
}

private fun movementSubtitle(m: StockMovementResponse): String {
    val parts = buildList {
        m.createdByName?.takeIf { it.isNotBlank() }?.let { add(it) }
        m.locationName?.takeIf { it.isNotBlank() }?.let { add(it) }
        timeLabel(m.createdAt)?.let { add(it) }
    }
    return parts.joinToString(" · ").ifBlank { itemKind(m) }
}

// ── Date helpers (Europe/Bucharest — the API sends UTC instants) ──

private fun dayKey(iso: String): String =
    com.horae.app.ui.common.RoDate.calendarDay(iso)?.toString() ?: iso

private fun dayLabel(day: String): String {
    val date = runCatching { LocalDate.parse(day) }.getOrNull() ?: return day
    val today = com.horae.app.ui.common.RoDate.today()
    return when (date) {
        today -> "Azi"
        today.minusDays(1) -> "Ieri"
        else -> com.horae.app.ui.common.RoDate.capitalizedFirst(
            if (date.year == today.year) com.horae.app.ui.common.RoDate.longDay(date)
            else com.horae.app.ui.common.RoDate.fullDate(date),
        )
    }
}

private fun timeLabel(iso: String): String? =
    com.horae.app.ui.common.RoDate.time(iso).ifBlank { null }
