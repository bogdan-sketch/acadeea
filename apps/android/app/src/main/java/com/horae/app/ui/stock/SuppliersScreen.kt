package com.horae.app.ui.stock

import androidx.compose.ui.draw.clipToBounds
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.SupplierDto
import com.horae.app.data.repository.StockRepository
import com.horae.app.domain.model.StatusKind
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HSearchField
import com.horae.app.ui.common.HStatusChip
import com.horae.app.ui.common.HoraeRefreshBox
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.RequestGate
import com.horae.app.ui.common.accentGradientBackground
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.runRefresh
import com.horae.app.ui.common.searchKey
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SuppliersUiState(
    val suppliers: List<SupplierDto> = emptyList(),
    val query: String = "",
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val loaded: Boolean = false,
    val error: String? = null,
) {
    val visible: List<SupplierDto>
        get() {
            val q = searchKey(query.trim())
            if (q.isEmpty()) return suppliers
            return suppliers.filter { s ->
                searchKey(s.name).contains(q) || s.materials.any { searchKey(it.title).contains(q) }
            }
        }
}

@HiltViewModel
class SuppliersViewModel @Inject constructor(
    private val repository: StockRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(SuppliersUiState())
    val state: StateFlow<SuppliersUiState> = _state.asStateFlow()
    private val gate = RequestGate()

    init { load() }

    fun load(refresh: Boolean = false) {
        val token = gate.next()
        viewModelScope.launch {
            _state.update { if (refresh) it.copy(isRefreshing = true) else it.copy(isLoading = true) }
            val result = runRefresh(onError = { e ->
                if (gate.isCurrent(token) && !refresh) {
                    _state.update { it.copy(error = ApiErrors.userMessage(e, "Nu am putut încărca furnizorii")) }
                }
            }) { repository.getSuppliers() }
            if (!gate.isCurrent(token)) return@launch
            _state.update {
                it.copy(
                    suppliers = result?.sortedBy { s -> searchKey(s.name) } ?: it.suppliers,
                    isLoading = false,
                    isRefreshing = false,
                    loaded = it.loaded || result != null,
                )
            }
        }
    }

    fun setQuery(q: String) = _state.update { it.copy(query = q) }
    fun dismissError() = _state.update { it.copy(error = null) }
}

/** "Furnizori" — suppliers with contact details and the materials bought from them. */
@Composable
fun SuppliersScreen(
    navController: NavController,
    viewModel: SuppliersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val sch = HoraeTheme.scheme
    var expanded by rememberSaveable { mutableStateOf(setOf<String>()) }
    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Column(Modifier.fillMaxSize().accentGradientBackground()) {
        StockTopBar(onBack = { navController.popBackStack() })
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Text("Furnizori", style = AppFont.title(28f), color = sch.ink)
                Text("Furnizorii și materiile prime luate de la ei", style = AppFont.body(13f), color = sch.muted)
            }
            HSearchField(state.query, viewModel::setQuery, placeholder = "Caută furnizor sau materie primă")
        }
        if (!state.loaded && state.isLoading) {
            LoadingOverlay()
            return@Column
        }
        HoraeRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { viewModel.load(refresh = true) },
            modifier = Modifier.clipToBounds().fillMaxSize(),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (state.visible.isEmpty()) {
                    item { StockEmptyText(if (state.query.isBlank()) "Niciun furnizor încă." else "Niciun rezultat") }
                }
                items(state.visible, key = { it.id }) { sup ->
                    val open = sup.id in expanded
                    HCard(padding = PaddingValues(0.dp)) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable(role = Role.Button, onClickLabel = if (open) "Ascunde materiile prime" else "Arată materiile prime") {
                                    expanded = if (open) expanded - sup.id else expanded + sup.id
                                }
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(sup.name, style = AppFont.body(16f, FontWeight.SemiBold), color = sch.ink)
                                val contact = listOfNotNull(sup.contactPerson, sup.phone, sup.email)
                                    .filter { it.isNotBlank() }.joinToString(" · ")
                                if (contact.isNotBlank()) {
                                    Text(contact, style = AppFont.body(12f), color = sch.muted, maxLines = 2)
                                }
                                Text(
                                    if (sup.materialCount == 1) "1 materie primă" else "${sup.materialCount} materii prime",
                                    style = AppFont.body(12f),
                                    color = sch.muted,
                                )
                            }
                            if (sup.lowStockCount > 0) {
                                HStatusChip("${sup.lowStockCount} sub minim", StatusKind.WARNING, Modifier.padding(end = 6.dp))
                            }
                            if (sup.materials.isNotEmpty()) {
                                Icon(
                                    if (open) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                                    null,
                                    tint = sch.muted,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                        if (open) {
                            sup.materials.forEach { m ->
                                StockDivider()
                                StockItemRow(
                                    title = m.title,
                                    subtitle = m.minimumStock.takeIf { it > 0 }?.let { "min ${formatQty(it, m.unit)}" },
                                    quantity = formatQty(m.stockCount, m.unit),
                                    kind = stockKind(m.stockCount, m.minimumStock),
                                    onClick = { navController.navigate(Screen.RawMaterialDetail.createRoute(m.id)) },
                                )
                            }
                        }
                        sup.notes?.takeIf { it.isNotBlank() && open }?.let {
                            StockDivider()
                            Text(it, style = AppFont.body(13f), color = sch.muted, modifier = Modifier.padding(14.dp))
                        }
                    }
                }
            }
        }
    }
}
