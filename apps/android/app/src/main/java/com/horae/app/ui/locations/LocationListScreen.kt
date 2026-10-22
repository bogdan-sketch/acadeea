package com.horae.app.ui.locations

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
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
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.OrganizationRepository
import com.horae.app.domain.model.UserRole
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeFilterChip
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.StatusPurple
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ── Location type → Romanian label + tint ──

private data class LocationTypeStyle(val label: String, val color: Color)

private fun locationTypeStyle(type: String): LocationTypeStyle = when (type) {
    "DEPOZIT" -> LocationTypeStyle("Depozit", Info)
    "FRIGIDER" -> LocationTypeStyle("Frigider", Info)
    "CONGELATOR" -> LocationTypeStyle("Congelator", StatusPurple)
    "LABORATOR" -> LocationTypeStyle("Laborator", Warning)
    "MAGAZIN" -> LocationTypeStyle("Magazin", Success)
    "PUNCT_LUCRU" -> LocationTypeStyle("Punct de lucru", Color.Gray)
    else -> LocationTypeStyle(type, Color.Gray)
}

// ── ViewModel ──

data class LocationListUiState(
    val locations: List<LocationResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val type: String? = null,
    /** Organization.defaultLocationId — preselected on every operation. */
    val defaultLocationId: String? = null,
    val savingDefault: Boolean = false,
)

@HiltViewModel
class LocationListViewModel @Inject constructor(
    private val repository: LocationRepository,
    private val organizationRepository: OrganizationRepository,
    private val brandingManager: BrandingManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LocationListUiState(defaultLocationId = brandingManager.defaultLocationId))
    val uiState: StateFlow<LocationListUiState> = _uiState.asStateFlow()

    /** Main-unit badges only with "Livrări din magazinul online". */
    val wooDeliveryEnabled: Boolean get() = brandingManager.wooDeliveryEnabled

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val result = repository.getLocations()
                _uiState.update { it.copy(locations = result, isLoading = false, defaultLocationId = brandingManager.defaultLocationId) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare necunoscută")) }
            }
        }
    }

    fun onTypeChange(type: String?) {
        _uiState.update { it.copy(type = type) }
    }

    /** Exactly one default: tapping the active one clears it, another moves it there. */
    fun toggleDefault(location: LocationResponse) {
        val next = if (_uiState.value.defaultLocationId == location.id) null else location.id
        viewModelScope.launch {
            _uiState.update { it.copy(savingDefault = true, error = null) }
            try {
                organizationRepository.setDefaultLocation(next)
                _uiState.update { it.copy(savingDefault = false, defaultLocationId = brandingManager.defaultLocationId) }
            } catch (e: Exception) {
                _uiState.update { it.copy(savingDefault = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la salvarea locației implicite")) }
            }
        }
    }
}

// ── Screen ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationListScreen(
    navController: NavController,
    role: UserRole,
    viewModel: LocationListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    // Only administrators change the organization (same gate as web's locations page).
    val canSetDefault = role == UserRole.ADMINISTRATOR

    val visibleTypes = state.locations.map { it.type }.distinct()
    val filtered = state.locations.filter { state.type == null || it.type == state.type }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Locații", fontWeight = FontWeight.Bold) },
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
        Column(modifier = Modifier.fillMaxSize().padding(pad)) {
            Text(
                text = "${state.locations.size} locații · stocul e urmărit per locație",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )

            if (visibleTypes.size > 1) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    visibleTypes.forEach { t ->
                        val style = locationTypeStyle(t)
                        HoraeFilterChip(
                            style.label,
                            selected = state.type == t,
                            onClick = { viewModel.onTypeChange(if (state.type == t) null else t) },
                            tint = style.color,
                        )
                    }
                }
            }

            when {
                state.isLoading && state.locations.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                state.error != null && state.locations.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            state.error ?: "Eroare",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                filtered.isEmpty() -> {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            "Nicio locație",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                else -> {
                    LazyColumn(
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    ) {
                        item {
                            HoraeCard(modifier = Modifier.fillMaxWidth()) {
                                Column {
                                    filtered.forEachIndexed { i, loc ->
                                        if (i > 0) {
                                            HorizontalDivider(
                                                modifier = Modifier.padding(horizontal = 16.dp),
                                                color = MaterialTheme.colorScheme.outlineVariant,
                                            )
                                        }
                                        LocationRow(
                                            location = loc,
                                            isDefault = state.defaultLocationId == loc.id,
                                            canSetDefault = canSetDefault && !state.savingDefault,
                                            onToggleDefault = { viewModel.toggleDefault(loc) },
                                            showMainUnit = viewModel.wooDeliveryEnabled,
                                        ) {
                                            navController.navigate(
                                                Screen.LocationDashboard.createRoute(loc.id),
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
}

@Composable
private fun LocationRow(
    location: LocationResponse,
    isDefault: Boolean,
    canSetDefault: Boolean,
    onToggleDefault: () -> Unit,
    /** `wooDeliveryEnabled`: show the "Principală" badge on main units. */
    showMainUnit: Boolean = false,
    onClick: () -> Unit,
) {
    val style = locationTypeStyle(location.type)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                location.name,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Text(
                location.address,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        Spacer(Modifier.height(0.dp))
        if (isDefault) HoraeStatusBadge("Implicită", MaterialTheme.colorScheme.primary)
        if (showMainUnit && location.isMainUnit) HoraeStatusBadge("Principală", MaterialTheme.colorScheme.secondary)
        HoraeStatusBadge(
            if (!location.isActive) "Inactiv" else style.label,
            if (!location.isActive) Color.Gray else style.color,
        )
        if (canSetDefault) {
            // Locația implicită a organizației: preselectată la orice operațiune.
            IconButton(onClick = onToggleDefault) {
                Icon(
                    if (isDefault) Icons.Filled.Star else Icons.Outlined.StarOutline,
                    contentDescription = if (isDefault) "Renunță la locația implicită" else "Setează ca locație implicită",
                    tint = if (isDefault) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Icon(
            Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
