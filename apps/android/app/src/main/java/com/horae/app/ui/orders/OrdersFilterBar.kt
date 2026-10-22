package com.horae.app.ui.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.DeliveryMethodDto
import com.horae.app.data.remote.dto.DeliveryMethodKind
import com.horae.app.ui.common.HChip
import com.horae.app.ui.common.HSecondaryButton
import com.horae.app.ui.common.HSegmentedControl
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.OrderStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Delivery-method name → label (short name) for the rows below; empty = show names as imported. */
val LocalDeliveryMethodLabels = compositionLocalOf<Map<String, String>> { emptyMap() }

/**
 * Top of the orders area (list AND calendar): Pregătiri | Intrări, then — only with
 * `wooDeliveryEnabled` and when the shop has methods — a scrolling chip row ([deliveryChips]):
 * Toate · Ridicare methods · Livrare · Livrare methods (when 2+), one selected at a time (tap
 * the selected one again = Toate), and, for admins, a "Metode" chip that opens the editor.
 */
@Composable
fun OrdersTopControls(
    view: OrderView,
    onView: (OrderView) -> Unit,
    showMethods: Boolean,
    methods: List<DeliveryMethodDto>,
    selectedFilter: DeliveryFilter,
    onSelectFilter: (DeliveryFilter) -> Unit,
    canEditNames: Boolean,
    modifier: Modifier = Modifier,
) {
    var editing by remember { mutableStateOf(false) }
    val chips = remember(methods) { deliveryChips(methods) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HSegmentedControl(
            options = OrderView.entries,
            selected = view,
            onSelect = onView,
            label = { it.label },
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        if (showMethods && methods.isNotEmpty()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                chips.forEach { chip ->
                    HChip(
                        label = chip.label,
                        selected = selectedFilter == chip.filter,
                        onClick = { onSelectFilter(chip.filter) },
                        count = chip.count.takeIf { it > 0 },
                        role = Role.RadioButton,
                        maxWidth = 200.dp,
                    )
                }
                if (canEditNames) {
                    HChip(
                        "Metode",
                        selected = false,
                        onClick = { editing = true },
                        icon = Icons.Outlined.Edit,
                        role = Role.Button,
                    )
                }
            }
        }
    }
    if (editing) DeliveryMethodNamesSheet(onDismiss = { editing = false })
}

// ── Delivery-method editor (admins): short name + Ridicare/Livrare ───────────────────────────────────────────

@HiltViewModel
class DeliveryMethodNamesViewModel @Inject constructor(
    private val store: OrdersFilterStore,
) : ViewModel() {
    val methods = store.methods

    var savingName by mutableStateOf<String?>(null)
        private set
    var savedName by mutableStateOf<String?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    /** Kind segment tapped → saved immediately (`{name, kind}`); null = back to auto. */
    fun saveKind(name: String, kind: DeliveryMethodKind?) {
        if (savingName != null) return
        viewModelScope.launch {
            savingName = name
            error = null
            try {
                store.setKind(name, kind)
            } catch (e: Exception) {
                error = ApiErrors.userMessage(e, "Nu am putut salva tipul metodei.")
            } finally {
                savingName = null
            }
        }
    }

    fun save(name: String, shortName: String) {
        if (savingName != null) return
        viewModelScope.launch {
            savingName = name
            error = null
            try {
                store.setShortName(name, shortName.trim().takeIf { it.isNotEmpty() })
                savedName = name
            } catch (e: Exception) {
                error = ApiErrors.userMessage(e, "Nu am putut salva denumirea.")
            } finally {
                savingName = null
            }
        }
    }
}

/**
 * Every method: full imported name (small, muted), a short-name field (placeholder = current
 * default label) saved per row, and a Ridicare | Livrare segment saved on tap ("auto" hint while
 * the kind is auto-detected; "Auto" resets an admin-set kind).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeliveryMethodNamesSheet(
    onDismiss: () -> Unit,
    viewModel: DeliveryMethodNamesViewModel = hiltViewModel(),
) {
    val s = HoraeTheme.scheme
    val methods by viewModel.methods.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = s.background) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding()) {
            Text(
                "Metode de livrare",
                style = AppFont.title(20f),
                color = s.ink,
                modifier = Modifier.padding(horizontal = 20.dp),
            )
            Text(
                "Un nume scurt apare în filtre și pe comenzi în locul denumirii din magazin. Gol = denumirea implicită. Tipul (Ridicare / Livrare) decide sub ce filtru apare metoda.",
                style = AppFont.body(13f),
                color = s.muted,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
            )
            viewModel.error?.let {
                Text(it, style = AppFont.body(13f, FontWeight.SemiBold), color = StatusPalette.fg(StatusKind.DANGER, s.isDark), modifier = Modifier.padding(horizontal = 20.dp))
            }
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                items(methods, key = { it.name }) { m ->
                    var text by remember(m.name, m.shortName) { mutableStateOf(m.shortName.orEmpty()) }
                    val dirty = text.trim() != m.shortName.orEmpty()
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            m.name,
                            style = AppFont.body(12f),
                            color = s.muted,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = text,
                                onValueChange = { text = it },
                                placeholder = { Text(if (m.shortName == null) m.label else m.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = { if (dirty) viewModel.save(m.name, text) }),
                                modifier = Modifier.weight(1f),
                            )
                            HSecondaryButton(
                                text = when {
                                    viewModel.savingName == m.name -> "…"
                                    !dirty && viewModel.savedName == m.name -> "Salvat"
                                    else -> "Salvează"
                                },
                                onClick = { viewModel.save(m.name, text) },
                                enabled = dirty && viewModel.savingName == null,
                                accentText = true,
                                modifier = Modifier.width(112.dp),
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            HSegmentedControl(
                                options = DeliveryMethodKind.entries,
                                selected = m.kindEnum,
                                onSelect = { k -> if (k != m.kindEnum || !m.kindSet) viewModel.saveKind(m.name, k) },
                                label = { it.label },
                                modifier = Modifier.weight(1f),
                            )
                            if (m.kindSet) {
                                Text(
                                    "Auto",
                                    style = AppFont.body(13f, FontWeight.SemiBold),
                                    color = s.primary,
                                    modifier = Modifier
                                        .clickable(enabled = viewModel.savingName == null, role = Role.Button) { viewModel.saveKind(m.name, null) }
                                        .padding(horizontal = 6.dp, vertical = 8.dp),
                                )
                            } else {
                                Text("auto", style = AppFont.body(12f), color = s.muted, modifier = Modifier.padding(horizontal = 6.dp))
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

// ── Status filter (1.39.0): icon next to the calendar → multi-select sheet ─────────────────────────────

/** Filter icon for the orders head (list + calendar); dot while the selection is not the default (Nouă). */
@Composable
fun OrderStatusFilterButton(
    selected: Set<OrderStatus>,
    onToggle: (OrderStatus) -> Unit,
    onToggleAll: () -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    com.horae.app.ui.common.HIconButton(
        Icons.Filled.FilterList,
        "Filtrează după status",
        { open = true },
        badge = selected != DEFAULT_ORDER_STATUSES,
    )
    if (open) {
        OrderStatusFilterSheet(selected = selected, onToggle = onToggle, onToggleAll = onToggleAll, onDismiss = { open = false })
    }
}

/** "Toate" + one checkable row per status, applied on tap (list + calendar reload live). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OrderStatusFilterSheet(
    selected: Set<OrderStatus>,
    onToggle: (OrderStatus) -> Unit,
    onToggleAll: () -> Unit,
    onDismiss: () -> Unit,
) {
    val s = HoraeTheme.scheme
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = s.background) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = 12.dp)) {
            Text("Status comenzi", style = AppFont.title(20f), color = s.ink, modifier = Modifier.padding(horizontal = 20.dp))
            Text(
                "Implicit vezi doar comenzile noi. Alegerea rămâne până închizi aplicația.",
                style = AppFont.body(13f),
                color = s.muted,
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 8.dp),
            )
            StatusFilterRow("Toate", selected.containsAll(OrderStatus.entries), onToggleAll)
            OrderStatus.entries.forEach { st ->
                StatusFilterRow(st.displayName, st in selected, { onToggle(st) }, dot = StatusPalette.fg(st.kind, s.isDark))
            }
        }
    }
}

@Composable
private fun StatusFilterRow(label: String, checked: Boolean, onClick: () -> Unit, dot: androidx.compose.ui.graphics.Color? = null) {
    val s = HoraeTheme.scheme
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Checkbox, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (dot != null) {
            androidx.compose.foundation.layout.Box(
                Modifier.size(10.dp).clip(CircleShape).background(dot),
            )
        } else {
            Spacer(Modifier.width(10.dp))
        }
        Text(label, style = AppFont.body(15f, if (checked) FontWeight.SemiBold else FontWeight.Normal), color = s.ink, modifier = Modifier.weight(1f))
        androidx.compose.material3.Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = androidx.compose.material3.CheckboxDefaults.colors(checkedColor = s.primary, checkmarkColor = s.onPrimary),
        )
    }
}

/** Muted one-liner above the orders list: "Doar: Nouă" / "Nouă, Pregătită" / "Toate statusurile". */
@Composable
fun OrderStatusHint(selected: Set<OrderStatus>, modifier: Modifier = Modifier) {
    Text(
        selected.hint(),
        style = AppFont.body(12f, FontWeight.SemiBold),
        color = HoraeTheme.scheme.muted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier,
    )
}
