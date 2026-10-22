package com.horae.app.ui.analytics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Warning
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.AnalyticsSummaryDto
import com.horae.app.data.remote.dto.OrderAnalyticsDto
import com.horae.app.data.remote.dto.ProductionAnalyticsDto
import com.horae.app.data.remote.dto.UserProductivityDto
import com.horae.app.data.repository.AnalyticsRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeSectionHeader
import com.horae.app.ui.common.HoraeStatCard
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.StatusPurple
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AnalyticsUiState(
    val summary: AnalyticsSummaryDto? = null,
    val production: ProductionAnalyticsDto? = null,
    val orders: OrderAnalyticsDto? = null,
    val users: List<UserProductivityDto> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class AnalyticsViewModel @Inject constructor(
    private val repository: AnalyticsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnalyticsUiState())
    val uiState: StateFlow<AnalyticsUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val summary = async { repository.getSummary() }
                val production = async { repository.getProduction() }
                val orders = async { repository.getOrders() }
                val users = async { runCatching { repository.getUserProductivity() }.getOrDefault(emptyList()) }
                _uiState.update {
                    it.copy(
                        summary = summary.await(),
                        production = production.await(),
                        orders = orders.await(),
                        users = users.await(),
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea analiticelor")) }
            }
        }
    }

    fun dismissError() = _uiState.update { it.copy(error = null) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsDashboardScreen(
    navController: NavController,
    viewModel: AnalyticsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Analitice", fontWeight = FontWeight.Bold) },
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
        if (state.isLoading && state.summary == null) {
            Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            state.summary?.let { SummaryGrid(it) }
            state.production?.let { ProductionCard(it) }
            state.orders?.let { OrdersCard(it) }
            if (state.users.isNotEmpty()) UsersCard(state.users)
        }
    }
}

@Composable
private fun SummaryGrid(s: AnalyticsSummaryDto) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HoraeStatCard("Finalizate azi", "${s.tasksCompletedToday}", Icons.Default.CheckCircle, Success, modifier = Modifier.weight(1f))
            HoraeStatCard("Comenzi primite azi", "${s.ordersToday}", Icons.Default.ShoppingBag, Info, modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HoraeStatCard("Stoc scăzut", "${s.lowStockItems}", Icons.Default.Warning, Warning, valueColor = Warning, modifier = Modifier.weight(1f))
            HoraeStatCard("Utilizatori", "${s.activeUsers}", Icons.Default.Group, StatusPurple, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun ProductionCard(p: ProductionAnalyticsDto) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HoraeSectionHeader("Producție")
            MetricRow("Finalizate", "${p.totalTasksCompleted}")
            MetricRow("Anulate", "${p.totalTasksCancelled}")
            p.averageCompletionHours?.let { MetricRow("Timp mediu", "${it.qtyFormatted()} ore") }
            p.yieldVarianceAvg?.let { MetricRow("Varianță randament", "${it.qtyFormatted()}%") }
        }
    }
}

@Composable
private fun OrdersCard(o: OrderAnalyticsDto) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HoraeSectionHeader("Comenzi")
            MetricRow("Total", "${o.totalOrders}")
            o.onTimeRate?.let { MetricRow("La timp", com.horae.app.ui.common.RoFormat.percent(it, 0)) }
            if (o.popularProducts.isNotEmpty()) {
                Text(
                    "Produse populare",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
                o.popularProducts.take(5).forEach { MetricRow(it.name, it.quantity.qtyFormatted()) }
            }
        }
    }
}

@Composable
private fun UsersCard(users: List<UserProductivityDto>) {
    HoraeCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HoraeSectionHeader("Productivitate echipă")
            users.take(10).forEach { u ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(u.fullName.ifBlank { "—" }, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(
                        "${u.tasksCompleted} task-uri",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    u.avgCompletionHours?.let {
                        Text(
                            "  ${it.qtyFormatted()}h",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MetricRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}
