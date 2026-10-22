package com.horae.app.ui.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
import com.horae.app.data.remote.api.OrderApi
import com.horae.app.data.remote.dto.OrderStatsResponseDto
import com.horae.app.ui.theme.Error
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.StatusColors
import com.horae.app.ui.theme.StatusIndigo
import com.horae.app.ui.theme.StatusPurple
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch
import timber.log.Timber

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class OrderStatsViewModel @Inject constructor(
    private val orderApi: OrderApi,
) : ViewModel() {

    var stats by mutableStateOf<OrderStatsResponseDto?>(null)
        private set
    var isLoading by mutableStateOf(false)
        private set
    var selectedRange by mutableStateOf("month")
        private set

    init {
        load()
    }

    fun selectRange(range: String) {
        selectedRange = range
        load()
    }

    private fun load() {
        viewModelScope.launch {
            isLoading = true
            try {
                val dateFrom = when (selectedRange) {
                    "week" -> com.horae.app.ui.common.RoDate.today().minusDays(7).toString()
                    "month" -> com.horae.app.ui.common.RoDate.today().minusMonths(1).toString()
                    "3months" -> com.horae.app.ui.common.RoDate.today().minusMonths(3).toString()
                    else -> null
                }
                stats = orderApi.getStats(dateFrom = dateFrom)
            } catch (e: Exception) {
                Timber.e(e, "OrderStatsViewModel: load failed")
            } finally {
                isLoading = false
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderStatsScreen(
    navController: NavController,
    viewModel: OrderStatsViewModel = hiltViewModel(),
) {
    Scaffold(
        topBar = {
            TopAppBar(
                windowInsets = androidx.compose.foundation.layout.WindowInsets(0),
title = { Text("Statistici comenzi") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Înapoi")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Period chips
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("week" to "Săptămână", "month" to "Lună", "3months" to "3 luni", "all" to "Tot").forEach { (key, label) ->
                    FilterChip(
                        selected = viewModel.selectedRange == key,
                        onClick = { viewModel.selectRange(key) },
                        label = { Text(label) },
                    )
                }
            }

            if (viewModel.isLoading) {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            viewModel.stats?.let { stats ->
                // Summary row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // Orders-type stat → tenant secondary (2nd series); "Livrate" keeps its semantic green.
                    StatCard(modifier = Modifier.weight(1f), title = "Total", value = "${stats.totalOrders}", color = MaterialTheme.colorScheme.secondary)
                    StatCard(modifier = Modifier.weight(1f), title = "Livrate", value = "${stats.completedOrders}", color = Success)
                }

                // Status breakdown
                if (stats.statusCounts.isNotEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Per status", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            val total = stats.statusCounts.values.sum().coerceAtLeast(1)
                            stats.statusCounts.forEach { (status, count) ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        statusDisplayName(status),
                                        style = MaterialTheme.typography.bodySmall,
                                        modifier = Modifier.width(90.dp),
                                    )
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(16.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(MaterialTheme.colorScheme.surfaceVariant),
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth(count.toFloat() / total)
                                                .height(16.dp)
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(statusBarColor(status)),
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("$count", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }

                // Delivery points
                if (stats.deliveryPointCounts.isNotEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Per punct de livrare", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                            stats.deliveryPointCounts.forEach { dp ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text(dp.deliveryPoint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                                    Text("${dp.count}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
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
private fun StatCard(modifier: Modifier = Modifier, title: String, value: String, color: Color) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = color)
            Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun statusDisplayName(status: String): String = when (status) {
    "NOUA" -> "Noi"
    "IN_PREGATIRE" -> "În pregătire"
    "PREGATITA" -> "Pregătite"
    "IN_TRANZIT" -> "În tranzit"
    "LIVRATA" -> "Livrate"
    "ANULATA" -> "Anulate"
    else -> status
}

private fun statusBarColor(status: String): Color = when (status) {
    "NOUA" -> Info
    "IN_PREGATIRE" -> Warning
    "PREGATITA" -> StatusPurple
    "IN_TRANZIT" -> StatusIndigo
    "LIVRATA" -> Success
    "ANULATA" -> Error
    else -> Color.Gray
}
