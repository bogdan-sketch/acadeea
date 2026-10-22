package com.horae.app.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.SwapHoriz
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.NotificationResponse
import com.horae.app.data.repository.NotificationRepository
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
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

data class NotificationInboxUiState(
    val items: List<NotificationResponse> = emptyList(),
    val isLoading: Boolean = false,
    val page: Int = 1,
    val hasMore: Boolean = false,
    val error: String? = null,
) {
    val hasUnread: Boolean get() = items.any { !it.isRead }
}

@HiltViewModel
class NotificationInboxViewModel @Inject constructor(
    private val repository: NotificationRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationInboxUiState())
    val uiState: StateFlow<NotificationInboxUiState> = _uiState.asStateFlow()

    init { load(page = 1) }

    fun loadMore() {
        val s = _uiState.value
        if (s.isLoading || !s.hasMore) return
        load(page = s.page + 1)
    }

    private fun load(page: Int) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val res = repository.getNotifications(page = page)
                _uiState.update {
                    val merged = if (page == 1) res.data else it.items + res.data
                    it.copy(items = merged, page = res.page, hasMore = res.hasNextPage, isLoading = false)
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcare")) }
            }
        }
    }

    fun markRead(id: String) {
        val item = _uiState.value.items.firstOrNull { it.id == id } ?: return
        if (item.isRead) return
        // Optimistic: flip locally, then confirm with the server.
        _uiState.update { st ->
            st.copy(items = st.items.map { if (it.id == id) it.copy(readAt = "now") else it })
        }
        viewModelScope.launch { runCatching { repository.markRead(id) } }
    }

    fun markAllRead() {
        if (!_uiState.value.hasUnread) return
        _uiState.update { st -> st.copy(items = st.items.map { it.copy(readAt = it.readAt ?: "now") }) }
        viewModelScope.launch { runCatching { repository.markAllRead() } }
    }

    fun dismissError() = _uiState.update { it.copy(error = null) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationInboxScreen(
    navController: NavController,
    viewModel: NotificationInboxViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notificări", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                actions = {
                    if (state.hasUnread) {
                        IconButton(onClick = viewModel::markAllRead) {
                            Icon(Icons.Default.DoneAll, "Marchează toate citite")
                        }
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
            state.isLoading && state.items.isEmpty() -> {
                Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }

            state.items.isEmpty() -> {
                Box(Modifier.fillMaxSize().padding(pad).padding(32.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Notifications, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Nicio notificare", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "Aici apar alertele de stoc, taskurile și comenzile.",
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
                    itemsIndexed(state.items) { index, item ->
                        NotificationRow(item, onClick = { viewModel.markRead(item.id) })
                        if (index >= state.items.size - 3) {
                            LaunchedEffect(index, state.items.size) { viewModel.loadMore() }
                        }
                    }
                    if (state.isLoading && state.items.isNotEmpty()) {
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
private fun NotificationRow(item: NotificationResponse, onClick: () -> Unit) {
    HoraeCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                iconFor(item.type),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    item.title.ifBlank { "Notificare" },
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (item.isRead) FontWeight.Normal else FontWeight.Bold,
                )
                if (item.body.isNotBlank()) {
                    Text(item.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(
                    formatCreatedAt(item.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!item.isRead) {
                Box(
                    modifier = Modifier
                        .size(9.dp)
                        .background(MaterialTheme.colorScheme.primary, CircleShape),
                )
            }
        }
    }
}

private fun iconFor(type: String): ImageVector {
    val t = type.uppercase()
    return when {
        t.contains("TASK") -> Icons.AutoMirrored.Filled.Assignment
        t.contains("STOCK") || t.contains("MATERIAL") || t.contains("LOW") || t.contains("EXPIR") -> Icons.Default.Warning
        t.contains("ORDER") -> Icons.Default.ShoppingBag
        t.contains("TRANSFER") -> Icons.Default.SwapHoriz
        t.contains("INVENTORY") -> Icons.Default.Inventory2
        else -> Icons.Default.Notifications
    }
}

/** Local (Europe/Bucharest) time, day before month, 24 h — never the raw UTC clock (B3). */
private fun formatCreatedAt(raw: String): String =
    com.horae.app.ui.common.RoDate.shortDateTime(raw).ifEmpty { raw }
