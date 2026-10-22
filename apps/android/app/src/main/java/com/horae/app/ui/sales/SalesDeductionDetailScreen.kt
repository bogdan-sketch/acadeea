package com.horae.app.ui.sales

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.SalesDeductionDto
import com.horae.app.data.remote.dto.SalesDeductionLineDto
import com.horae.app.data.remote.dto.SalesMatchCandidateDto
import com.horae.app.data.remote.dto.SalesProductOptionDto
import com.horae.app.domain.model.SalesDeductionDecision
import com.horae.app.domain.model.SalesDeductionSource
import com.horae.app.domain.model.SalesDeductionStatus
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeFilterChip
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.formatUnitQty
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.Error
import com.horae.app.ui.theme.Info
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning

/**
 * Detail of one sales deduction. DRAFT → the confirmer (per-line Scade /
 * Produs nou / Ignoră, product picker, ± quantity, shortfall resolution,
 * bulk confirm); CONFIRMED / ANULAT → the read-only log entry (+ revert).
 * Mirrors web `/stock/sales/[id]`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SalesDeductionDetailScreen(
    navController: NavController,
    role: UserRole,
    viewModel: SalesDeductionDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val canWrite = canWriteSales(role)

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }
    LaunchedEffect(state.discarded) {
        if (state.discarded) navController.popBackStack()
    }
    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    val d = state.deduction
    val isDraft = d?.status == SalesDeductionStatus.DRAFT.name
    var revertOpen by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            when {
                                d == null -> "Vânzări → stoc"
                                isDraft -> "Confirmă vânzările"
                                else -> sourceName(d.source)
                            },
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (d != null) {
                            Text(
                                if (isDraft) "${sourceName(d.source)} · ${d.locationName}" else d.locationName,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Înapoi")
                    }
                },
                actions = {
                    if (d?.status == SalesDeductionStatus.CONFIRMED.name && canWrite) {
                        TextButton(onClick = { revertOpen = true }) {
                            Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Anulează")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
            )
        },
        bottomBar = {
            if (isDraft && canWrite) {
                ConfirmerBottomBar(
                    rows = state.rows,
                    computed = computeRows(state.rows, state.productById),
                    discarding = state.discarding,
                    onDiscard = viewModel::discard,
                    onConfirm = viewModel::openConfirm,
                )
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                state.loadError != null -> Text(
                    state.loadError ?: "",
                    modifier = Modifier.fillMaxWidth().padding(32.dp),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                d == null -> LoadingOverlay()
                isDraft -> Confirmer(
                    d = d,
                    state = state,
                    onUpdate = viewModel::updateRow,
                    onRemove = viewModel::removeRow,
                    onAdd = viewModel::addManualRow,
                    onFilter = viewModel::setFilter,
                    onOpenDuplicate = { navController.navigate(Screen.SalesDeductionDetail.createRoute(it)) },
                )
                else -> ReadOnlyDetail(d)
            }
        }
    }

    if (state.confirmOpen && d != null) {
        ConfirmSheet(
            d = d,
            rows = state.rows,
            products = state.productById,
            saving = state.saving,
            onDismiss = viewModel::closeConfirm,
            onSubmit = viewModel::submit,
        )
    }

    if (revertOpen && d != null) {
        AlertDialog(
            onDismissRequest = { if (!state.reverting) revertOpen = false },
            title = { Text("Anulezi scăderea?") },
            text = {
                Text(
                    "Cantitățile scăzute se pun înapoi în stocul din ${d.locationName} (peste stocul de acum). " +
                        "Produsele noi create din raport rămân în aplicație.",
                )
            },
            confirmButton = {
                Button(onClick = { viewModel.revert { revertOpen = false } }, enabled = !state.reverting) {
                    if (state.reverting) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Da, anulează")
                }
            },
            dismissButton = {
                TextButton(onClick = { revertOpen = false }, enabled = !state.reverting) { Text("Nu") }
            },
        )
    }
}

private fun sourceName(source: String): String = SalesDeductionSource.fromString(source)?.displayName ?: source

// ── Draft: the confirmer ─────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Confirmer(
    d: SalesDeductionDto,
    state: SalesDetailUiState,
    onUpdate: (String, (SalesRow) -> SalesRow) -> Unit,
    onRemove: (String) -> Unit,
    onAdd: () -> Unit,
    onFilter: (SalesFilter) -> Unit,
    onOpenDuplicate: (String) -> Unit,
) {
    val rows = state.rows
    val productById = state.productById
    val computed = remember(rows, state.products) { computeRows(rows, productById) }
    var pickerFor by remember { mutableStateOf<String?>(null) }

    val counts = remember(rows, computed) {
        mapOf(
            SalesFilter.ALL to rows.size,
            SalesFilter.REVIEW to rows.count { needsReview(it) },
            SalesFilter.STOCK to rows.count { r ->
                val c = computed[r.key]
                c != null && (c.shortfall > 0 || r.stockMode == StockMode.OVERRIDE)
            },
            SalesFilter.NEW to rows.count { it.decision == SalesDeductionDecision.CREATE_NEW },
            SalesFilter.DECLINED to rows.count { it.decision == SalesDeductionDecision.DECLINE },
        )
    }
    val visible = rows.filter { r ->
        val c = computed[r.key]
        when (state.filter) {
            SalesFilter.REVIEW -> needsReview(r) || c?.invalid != null
            SalesFilter.STOCK -> c != null && (c.shortfall > 0 || r.stockMode == StockMode.OVERRIDE)
            SalesFilter.NEW -> r.decision == SalesDeductionDecision.CREATE_NEW
            SalesFilter.DECLINED -> r.decision == SalesDeductionDecision.DECLINE
            SalesFilter.ALL -> true
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                "Verifică fiecare produs: acceptă, corectează, ignoră sau adaugă-l ca produs nou. " +
                    "Stocul se modifică doar după „Confirmă tot”.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (d.duplicateOf.isNotEmpty()) {
            item {
                Surface(shape = RoundedCornerShape(12.dp), color = Warning.copy(alpha = 0.12f)) {
                    Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Warning, null, tint = Warning, modifier = Modifier.size(18.dp))
                        Column {
                            Text(
                                "Acest fișier a mai fost confirmat o dată — confirmând din nou, vânzările se scad de două ori.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Warning,
                            )
                            Text(
                                "Vezi scăderea anterioară",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                color = Warning,
                                modifier = Modifier
                                    .padding(top = 4.dp)
                                    .clickable { onOpenDuplicate(d.duplicateOf.first()) },
                            )
                        }
                    }
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(SalesFilter.entries) { f ->
                    HoraeFilterChip(
                        label = "${f.label} · ${counts[f] ?: 0}",
                        selected = state.filter == f,
                        onClick = { onFilter(f) },
                    )
                }
            }
        }
        item {
            OutlinedButton(onClick = onAdd, shape = RoundedCornerShape(12.dp)) {
                Icon(Icons.Default.AddCircleOutline, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Adaugă produs")
            }
        }
        if (visible.isEmpty()) {
            item {
                Text(
                    if (rows.isEmpty()) "Niciun produs încă — adaugă unul." else "Nimic în acest filtru.",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(visible, key = { it.key }) { r ->
                LineEditor(
                    row = r,
                    c = computed[r.key],
                    product = r.recipeId?.let { productById[it] },
                    products = state.products,
                    categories = state.categories,
                    showInvalid = state.showInvalid,
                    onChange = { f -> onUpdate(r.key, f) },
                    onRemove = { onRemove(r.key) },
                    onPick = { pickerFor = r.key },
                )
            }
        }
    }

    pickerFor?.let { key ->
        val row = rows.firstOrNull { it.key == key }
        if (row == null) {
            pickerFor = null
        } else {
            ProductPickerSheet(
                products = state.products,
                candidates = row.candidates,
                selectedId = row.recipeId,
                onDismiss = { pickerFor = null },
                onSelect = { p ->
                    onUpdate(key) { it.copy(recipeId = p.id, rawName = it.rawName.ifBlank { p.name }) }
                    pickerFor = null
                },
            )
        }
    }
}

@Composable
private fun ConfirmerBottomBar(
    rows: List<SalesRow>,
    computed: Map<String, RowComputed>,
    discarding: Boolean,
    onDiscard: () -> Unit,
    onConfirm: () -> Unit,
) {
    val accept = rows.count { it.decision == SalesDeductionDecision.ACCEPT }
    val created = rows.count { it.decision == SalesDeductionDecision.CREATE_NEW }
    val declined = rows.count { it.decision == SalesDeductionDecision.DECLINE }
    val unresolved = rows.count { computed[it.key]?.unresolved == true }
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 6.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp)) {
            Text(
                buildString {
                    append("$accept de scăzut · $created noi · $declined ignorate")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (unresolved > 0) {
                Text(
                    "$unresolved cu stoc insuficient",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Warning,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDiscard, enabled = !discarding) {
                    if (discarding) {
                        CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                    }
                    Text("Renunță")
                }
                Button(onClick = onConfirm) {
                    Icon(Icons.Default.Check, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Confirmă tot")
                }
            }
        }
    }
}

// ── One line ─────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun LineEditor(
    row: SalesRow,
    c: RowComputed?,
    product: SalesProductOptionDto?,
    products: List<SalesProductOptionDto>,
    categories: List<String>,
    showInvalid: Boolean,
    onChange: ((SalesRow) -> SalesRow) -> Unit,
    onRemove: () -> Unit,
    onPick: () -> Unit,
) {
    val invalid = showInvalid && c?.invalid != null
    val (badgeLabel, badgeColor) = matchBadge(row.matchKind, row.matchScore)
    val step = { delta: Double ->
        onChange { r -> r.copy(qty = numText(round3((toNum(r.qty) ?: 0.0) + delta))) }
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (row.decision == SalesDeductionDecision.DECLINE) 0.6f else 1f),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (invalid) Error else MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Din raport
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    if (row.isManual) {
                        Text(
                            "ADĂUGAT MANUAL",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        Text(
                            row.rawName,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(top = 2.dp),
                        ) {
                            row.quantityReported?.let {
                                Text(
                                    "raport: ${it.qtyFormatted()} ${row.rawUnit ?: ""}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            HoraeStatusBadge(badgeLabel, badgeColor)
                        }
                    }
                }
                if (row.isManual) {
                    IconButton(onClick = onRemove) {
                        Icon(Icons.Default.Delete, contentDescription = "Șterge rândul", tint = Error)
                    }
                }
            }

            // Decizie
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                val options = SalesDeductionDecision.entries
                options.forEachIndexed { i, opt ->
                    SegmentedButton(
                        selected = row.decision == opt,
                        onClick = { onChange { r -> r.copy(decision = opt, newName = r.newName.ifBlank { r.rawName }) } },
                        shape = SegmentedButtonDefaults.itemShape(i, options.size),
                        icon = {},
                    ) {
                        Text(opt.displayName, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                    }
                }
            }

            when (row.decision) {
                SalesDeductionDecision.ACCEPT -> {
                    ProductSelector(
                        selected = product,
                        suggestion = row.candidates.firstNotNullOfOrNull { cand -> products.firstOrNull { it.id == cand.id } },
                        onClick = onPick,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        QuantityStepper(
                            value = row.qty,
                            onValue = { v -> onChange { it.copy(qty = v) } },
                            onStep = step,
                        )
                        if (product != null && c != null) {
                            Column {
                                Text("stoc", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    "${formatUnitQty(c.before, product.unit)} → ${formatUnitQty(c.after, product.unit)}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                    if (product != null && c != null) {
                        StockSubRows(row, c, product, onChange)
                    }
                }
                SalesDeductionDecision.CREATE_NEW -> NewProductFields(row, categories, onChange)
                SalesDeductionDecision.DECLINE -> Text(
                    "Nu se modifică nimic pentru acest rând.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (invalid) {
                Text(
                    "Lipsește: ${c?.invalid}",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Error,
                )
            }
        }
    }
}

@Composable
private fun ProductSelector(
    selected: SalesProductOptionDto?,
    suggestion: SalesProductOptionDto?,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (selected != null) MaterialTheme.colorScheme.outline else Warning),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                when {
                    selected != null -> selected.name
                    suggestion != null -> "Sugestie: ${suggestion.name}?"
                    else -> "Alege produsul"
                },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (selected != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(Icons.Default.UnfoldMore, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun QuantityStepper(value: String, onValue: (String) -> Unit, onStep: (Double) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedIconBox(onClick = { onStep(-1.0) }) {
            Icon(Icons.Default.Remove, contentDescription = "Scade 1", modifier = Modifier.size(16.dp))
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValue,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            textStyle = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center),
            modifier = Modifier.width(88.dp).padding(horizontal = 4.dp),
        )
        OutlinedIconBox(onClick = { onStep(1.0) }) {
            Icon(Icons.Default.Add, contentDescription = "Adaugă 1", modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun OutlinedIconBox(onClick: () -> Unit, content: @Composable () -> Unit) {
    Surface(
        modifier = Modifier.size(40.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Box(contentAlignment = Alignment.Center) { content() }
    }
}

/** Sub-rows: corecție (negative), deficit, suprascriere. */
@Composable
private fun StockSubRows(
    row: SalesRow,
    c: RowComputed,
    product: SalesProductOptionDto,
    onChange: ((SalesRow) -> SalesRow) -> Unit,
) {
    val qty = c.qty
    if (qty != null && qty < 0) {
        Text(
            "Cantitate negativă: se adaugă înapoi ${formatUnitQty(-qty, product.unit)} în stoc.",
            style = MaterialTheme.typography.bodySmall,
            color = Success,
        )
    }
    if (c.shortfall > 0 || row.stockMode != StockMode.NORMAL) {
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = if (c.unresolved) Warning.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Column(Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (c.shortfall > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Default.Warning, null, tint = Warning, modifier = Modifier.size(16.dp))
                        Text(
                            "Ai vândut ${(qty ?: 0.0).qtyFormatted()}, dar în stoc sunt doar ${c.before.qtyFormatted()}. " +
                                "Stocul nu poate fi negativ.",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = Warning,
                        )
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().clickable { onChange { it.copy(stockMode = StockMode.CLAMP) } },
                    ) {
                        RadioButton(
                            selected = row.stockMode == StockMode.CLAMP,
                            onClick = { onChange { it.copy(stockMode = StockMode.CLAMP) } },
                        )
                        Text(
                            "Scade până la 0 (vânzarea rămâne înregistrată: ${(qty ?: 0.0).qtyFormatted()})",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = row.stockMode == StockMode.OVERRIDE,
                        onClick = { onChange { it.copy(stockMode = StockMode.OVERRIDE) } },
                    )
                    Text("Suprascrie stocul la", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.width(6.dp))
                    OutlinedTextField(
                        value = row.override,
                        onValueChange = { v -> onChange { it.copy(override = v, stockMode = StockMode.OVERRIDE) } },
                        singleLine = true,
                        placeholder = { Text("0") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        textStyle = MaterialTheme.typography.bodyMedium.copy(textAlign = TextAlign.Center),
                        modifier = Modifier.width(84.dp),
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(unitLabel(product.unit), style = MaterialTheme.typography.bodySmall)
                }
                if (row.stockMode != StockMode.NORMAL && c.shortfall == 0.0) {
                    Text(
                        "anulează suprascrierea",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .padding(start = 12.dp, top = 2.dp)
                            .clickable { onChange { it.copy(stockMode = StockMode.NORMAL, override = "") } },
                    )
                }
            }
        }
    }
    if (c.shortfall == 0.0 && row.stockMode == StockMode.NORMAL) {
        Text(
            "Suprascrie stocul",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.clickable { onChange { it.copy(stockMode = StockMode.OVERRIDE) } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewProductFields(
    row: SalesRow,
    categories: List<String>,
    onChange: ((SalesRow) -> SalesRow) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = row.newName,
            onValueChange = { v -> onChange { it.copy(newName = v) } },
            label = { Text("Nume produs nou") },
            leadingIcon = { Icon(Icons.Default.Inventory2, null, tint = Info) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            SimpleDropdown(
                label = "Unitate",
                value = row.newUnit.displayName,
                options = newProductUnits.map { it.displayName },
                onSelect = { i -> onChange { it.copy(newUnit = newProductUnits[i]) } },
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = row.newStock,
                onValueChange = { v -> onChange { it.copy(newStock = v) } },
                label = { Text("Stoc acum") },
                placeholder = { Text("0") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f),
            )
        }
        SimpleDropdown(
            label = "Categorie",
            value = row.newCategory ?: "Fără categorie",
            options = listOf("Fără categorie") + categories,
            onSelect = { i -> onChange { it.copy(newCategory = if (i == 0) null else categories[i - 1]) } },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** A choice field (label + value) that opens a list sheet — replaces the old dropdown. */
@Composable
private fun SimpleDropdown(
    label: String,
    value: String,
    options: List<String>,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    com.horae.app.ui.common.HPickerField(label = label, value = value, onClick = { open = true }, modifier = modifier)
    if (open) {
        com.horae.app.ui.common.ChoiceListSheet(
            title = label,
            items = options.indices.toList(),
            selected = options.indexOf(value).takeIf { it >= 0 },
            itemLabel = { options[it] },
            onSelect = { i -> if (i != null) onSelect(i) },
            onDismiss = { open = false },
        )
    }
}

// ── Product picker (candidates first, then all) ──────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductPickerSheet(
    products: List<SalesProductOptionDto>,
    candidates: List<SalesMatchCandidateDto>,
    selectedId: String?,
    onDismiss: () -> Unit,
    onSelect: (SalesProductOptionDto) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by remember { mutableStateOf("") }
    val q = query.trim().lowercase()
    val matches = { p: SalesProductOptionDto -> q.isEmpty() || p.name.lowercase().contains(q) }
    val suggested = candidates.mapNotNull { cand -> products.firstOrNull { it.id == cand.id } }.distinctBy { it.id }
    val suggestedIds = suggested.map { it.id }.toSet()
    val suggestedVisible = suggested.filter(matches)
    val rest = products.filter { it.id !in suggestedIds && matches(it) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Text(
                "Alege produsul",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Caută produs...") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            LazyColumn(Modifier.heightIn(max = 480.dp)) {
                if (suggestedVisible.isNotEmpty()) {
                    item { PickerSection("Sugestii după nume") }
                    items(suggestedVisible, key = { "s-" + it.id }) { p ->
                        PickerProductRow(p, p.id == selectedId) { onSelect(p) }
                    }
                }
                if (rest.isNotEmpty()) {
                    item { PickerSection("Toate produsele") }
                    items(rest, key = { it.id }) { p ->
                        PickerProductRow(p, p.id == selectedId) { onSelect(p) }
                    }
                }
                if (suggestedVisible.isEmpty() && rest.isEmpty()) {
                    item {
                        Text(
                            "Niciun produs găsit.",
                            modifier = Modifier.fillMaxWidth().padding(24.dp),
                            textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PickerSection(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun PickerProductRow(p: SalesProductOptionDto, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            Icons.Default.Check,
            null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(18.dp).alpha(if (selected) 1f else 0f),
        )
        Text(
            p.name,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            formatUnitQty(p.stock, p.unit),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ── Bulk confirmation ────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConfirmSheet(
    d: SalesDeductionDto,
    rows: List<SalesRow>,
    products: Map<String, SalesProductOptionDto>,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (note: String, ackAll: Boolean) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var note by remember { mutableStateOf("") }
    var ackAll by remember { mutableStateOf(false) }
    val computed = remember(rows, products) { computeRows(rows, products) }

    val accepted = rows.filter { it.decision == SalesDeductionDecision.ACCEPT }
    val unresolved = accepted.filter { computed[it.key]?.unresolved == true }
    val clamped = accepted.filter { it.stockMode == StockMode.CLAMP && (computed[it.key]?.shortfall ?: 0.0) > 0 }
    val overrides = accepted.filter { it.stockMode == StockMode.OVERRIDE }
    val ok = accepted.filter { it !in unresolved && it !in clamped && it !in overrides }
    val created = rows.filter { it.decision == SalesDeductionDecision.CREATE_NEW }
    val declined = rows.filter { it.decision == SalesDeductionDecision.DECLINE }
    val blocked = unresolved.isNotEmpty() && !ackAll

    val nameOf = { r: SalesRow -> r.recipeId?.let { products[it]?.name } ?: r.rawName.ifBlank { "Produs" } }
    val qtyText = { r: SalesRow ->
        val c = computed[r.key]
        val q = c?.qty ?: 0.0
        val unit = r.recipeId?.let { products[it]?.unit }
        val sign = if (q < 0) "+" + formatUnitQty(-q, unit) else "−" + formatUnitQty(q, unit)
        "$sign · ${formatUnitQty(c?.before ?: 0.0, unit)} → ${formatUnitQty(c?.after ?: 0.0, unit)}"
    }

    ModalBottomSheet(onDismissRequest = { if (!saving) onDismiss() }, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Confirmă toate modificările", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "${d.locationName} · totul se aplică într-un singur pas și primești o singură notificare cu rezumatul.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SummarySection("Stoc insuficient — nerezolvat", unresolved, Warning, nameOf) { r ->
                val c = computed[r.key]
                "vândut ${(c?.qty ?: 0.0).qtyFormatted()}, stoc ${(c?.before ?: 0.0).qtyFormatted()}"
            }
            if (unresolved.isNotEmpty()) {
                Surface(shape = RoundedCornerShape(10.dp), color = Warning.copy(alpha = 0.12f)) {
                    Row(
                        Modifier.fillMaxWidth().clickable { ackAll = !ackAll }.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = ackAll, onCheckedChange = { ackAll = it })
                        Text(
                            "Am înțeles: pentru aceste ${unresolved.size} produse se scade cât e în stoc (ajung la 0), " +
                                "iar vânzarea rămâne înregistrată integral.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            SummarySection("Aduse la 0 (stoc insuficient, confirmat)", clamped, Warning, nameOf, qtyText)
            SummarySection("Stoc suprascris", overrides, Info, nameOf) { r -> "stoc nou: ${(toNum(r.override) ?: 0.0).qtyFormatted()}" }
            SummarySection("Produse noi", created, Info, nameOf) { r -> "stoc: ${r.newStock.ifBlank { "0" }}" }
            SummarySection("Se scad normal", ok, MaterialTheme.colorScheme.onSurfaceVariant, nameOf, qtyText)
            SummarySection("Ignorate", declined, SalesGray, nameOf) { "—" }

            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text("Notă (opțional)") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss, enabled = !saving) { Text("Înapoi") }
                Button(onClick = { onSubmit(note, ackAll) }, enabled = !saving && !blocked) {
                    if (saving) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Confirmă și actualizează stocul")
                }
            }
        }
    }
}

@Composable
private fun SummarySection(
    title: String,
    items: List<SalesRow>,
    tone: Color,
    nameOf: (SalesRow) -> String,
    render: (SalesRow) -> String,
) {
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            "${title.uppercase()} · ${items.size}",
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = tone,
        )
        items.forEach { r ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    nameOf(r),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(render(r), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ── Confirmed / reverted: the log entry ──────────────────────────────────

@Composable
private fun ReadOnlyDetail(d: SalesDeductionDto) {
    val status = SalesDeductionStatus.fromString(d.status)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HoraeStatusBadge(status?.displayName ?: d.status, statusColor(status))
                    d.revertedAt?.let {
                        Text(
                            "anulată ${fmtDateTime(it)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                d.confirmedAt?.let {
                    Text(
                        "Confirmată ${fmtDateTime(it)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                val meta = listOfNotNull(d.confirmedByName?.let { "de $it" }, d.fileName, d.note)
                    .filter { it.isNotBlank() }
                if (meta.isNotEmpty()) {
                    Text(meta.joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val s = d.summary
                Text(
                    "${s.accepted} scăzute · ${s.created} noi · ${s.declined} ignorate" +
                        if (s.shortfalls > 0) " · ${s.shortfalls} cu stoc insuficient" else "",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        item {
            HoraeCard(Modifier.fillMaxWidth()) {
                Column {
                    d.lines.orEmpty().forEachIndexed { i, l ->
                        if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        ReadOnlyLine(l)
                    }
                    if (d.lines.isNullOrEmpty()) {
                        Text(
                            "Niciun produs.",
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReadOnlyLine(l: SalesDeductionLineDto) {
    val decision = SalesDeductionDecision.fromString(l.decision)
    val observation = when (decision) {
        SalesDeductionDecision.DECLINE -> "ignorat"
        SalesDeductionDecision.CREATE_NEW -> "produs nou creat"
        SalesDeductionDecision.ACCEPT -> buildList {
            l.shortfall?.takeIf { it != 0.0 }?.let { add("stoc insuficient, lipsă ${it.qtyFormatted()}") }
            l.stockOverride?.let { add("stoc suprascris la ${it.qtyFormatted()}") }
            if ((l.quantity ?: 0.0) < 0) add("adăugat înapoi")
        }.joinToString(" · ")
    }
    Column(
        Modifier
            .fillMaxWidth()
            .alpha(if (decision == SalesDeductionDecision.DECLINE) 0.6f else 1f)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                l.rawName,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (decision == SalesDeductionDecision.ACCEPT && l.quantity != null) l.quantity.qtyFormatted() else "—",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        l.quantityReported?.let {
            Text(
                "raport: ${it.qtyFormatted()} ${l.rawUnit ?: ""}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            "Produs: ${l.recipeName ?: "—"}" +
                if (l.stockBefore != null) {
                    " · stoc ${formatUnitQty(l.stockBefore, l.recipeUnit)} → ${formatUnitQty(l.stockAfter ?: 0.0, l.recipeUnit)}"
                } else {
                    ""
                },
            style = MaterialTheme.typography.bodySmall,
        )
        if (observation.isNotBlank()) {
            Text(
                observation,
                style = MaterialTheme.typography.bodySmall,
                color = if ((l.shortfall ?: 0.0) > 0) Warning else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

