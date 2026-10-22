package com.horae.app.ui.recipes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.RecipeYieldHistoryResponse
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RecipeYieldHistoryUiState(
    val entries: List<RecipeYieldHistoryResponse> = emptyList(),
    val isLoading: Boolean = false,
    val page: Int = 1,
    val hasMore: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class RecipeYieldHistoryViewModel @Inject constructor(
    private val recipeRepository: RecipeRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecipeYieldHistoryUiState())
    val uiState: StateFlow<RecipeYieldHistoryUiState> = _uiState.asStateFlow()

    private var recipeId: String = ""
    private var started = false

    fun start(id: String) {
        if (started) return
        started = true
        recipeId = id
        load(page = 1)
    }

    fun loadMore() {
        val s = _uiState.value
        if (s.isLoading || !s.hasMore) return
        load(page = s.page + 1)
    }

    private fun load(page: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val res = recipeRepository.getYieldHistory(recipeId, page = page)
                _uiState.update {
                    val merged = if (page == 1) res.data else it.entries + res.data
                    it.copy(
                        entries = merged,
                        page = res.page,
                        hasMore = res.hasNextPage,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea istoricului"))
                }
            }
        }
    }

    fun dismissError() = _uiState.update { it.copy(error = null) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeYieldHistoryScreen(
    navController: NavController,
    recipeId: String,
    viewModel: RecipeYieldHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(recipeId) { viewModel.start(recipeId) }

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Istoric randament", fontWeight = FontWeight.Bold) },
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
        when {
            state.isLoading && state.entries.isEmpty() -> {
                Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            state.entries.isEmpty() -> {
                Box(Modifier.fillMaxSize().padding(pad).padding(32.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Niciun istoric", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "Randamentul se înregistrează la finalizarea producției.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(pad),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    itemsIndexed(state.entries) { index, entry ->
                        YieldHistoryRow(entry)
                        if (index >= state.entries.size - 3) {
                            LaunchedEffect(index, state.entries.size) { viewModel.loadMore() }
                        }
                    }
                    if (state.isLoading && state.entries.isNotEmpty()) {
                        item {
                            Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(strokeWidth = 2.dp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun YieldHistoryRow(entry: RecipeYieldHistoryResponse) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatVariance(entry.variancePercent),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = varianceColor(entry.variancePercent),
                    modifier = Modifier.weight(1f),
                )
                Text(
                    formatRecordedAt(entry.recordedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                LabeledValue("Țintă", entry.targetQuantity.qtyFormatted())
                LabeledValue("Real", entry.actualYield.qtyFormatted())
                LabeledValue("Scală", "${entry.scaleFactor.qtyFormatted()}x")
            }
        }
    }
}

@Composable
private fun LabeledValue(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

/** "+12,5 %" — Romanian comma, space before %. */
private fun formatVariance(pct: Double): String = com.horae.app.ui.common.RoFormat.signedPercent(pct)

private fun varianceColor(pct: Double): Color = when {
    kotlin.math.abs(pct) <= 5 -> Success
    kotlin.math.abs(pct) <= 15 -> Warning
    else -> Color(0xFFE5484D)
}


/** "17 oct. 2026, 12:08" in Europe/Bucharest (was printed on the UTC clock). */
private fun formatRecordedAt(raw: String): String =
    com.horae.app.ui.common.RoDate.shortDateTime(raw).ifBlank { raw }
