package com.horae.app.ui.sales

import com.horae.app.ui.common.BulkActionCatalog
import com.horae.app.ui.common.BulkOutcome
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material.icons.filled.Download
import timber.log.Timber
import com.horae.app.ui.common.rememberBulkSelectionState
import com.horae.app.ui.common.BulkSelectionState
import com.horae.app.ui.common.BulkSelectTopBar
import com.horae.app.ui.common.BulkSelectCheckbox
import com.horae.app.ui.common.BulkSelectBottomBar
import com.horae.app.ui.common.BulkSelectAction
import com.horae.app.ui.common.BulkDeleteWarnings
import com.horae.app.ui.common.BulkDeleteResultDialog
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.CASLAction
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.SalesDeductionDto
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.SalesDeductionRepository
import com.horae.app.domain.model.SalesDeductionSource
import com.horae.app.domain.model.SalesDeductionStatus
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeCard
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

enum class SalesSourceChoice(val title: String, val hint: String) {
    EXCEL("Încarcă fișierul", "Raportul de vânzări exportat din eBriza (.xlsx sau .csv)"),
    MANUAL("Manual", "Alegi produsele și cantitățile vândute direct în aplicație"),
    WOOCOMMERCE("De pe site", "Comenzile WooCommerce (processing/completed) dintr-un interval"),
}

data class PickedFile(val uri: Uri, val name: String, val mimeType: String?)

data class NewSalesState(
    val open: Boolean = false,
    val locations: List<LocationResponse> = emptyList(),
    val locationId: String? = null,
    val source: SalesSourceChoice = SalesSourceChoice.EXCEL,
    val file: PickedFile? = null,
    /** Local dates (UTC-midnight millis as DatePicker reports them). */
    val fromDate: LocalDate = com.horae.app.ui.common.RoDate.today(),
    val toDate: LocalDate = com.horae.app.ui.common.RoDate.today(),
    val busy: Boolean = false,
) {
    val canContinue: Boolean
        get() = locationId != null && !busy &&
            (source != SalesSourceChoice.EXCEL || file != null) &&
            (source != SalesSourceChoice.WOOCOMMERCE || !fromDate.isAfter(toDate))
}

data class SalesListUiState(
    val items: List<SalesDeductionDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val hasNextPage: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    val newSession: NewSalesState = NewSalesState(),
    /** Set after a draft is created — the screen navigates to it, then clears it. */
    val createdId: String? = null,
    /** Select & delete (bulk) — in flight / last result. */
    val isPreviewing: Boolean = false,
    val bulkPreview: BulkDeletePreviewDto? = null,
    val isDeleting: Boolean = false,
    val isActing: Boolean = false,
    val bulkResult: BulkOutcome? = null,
)

@HiltViewModel
class SalesDeductionListViewModel @Inject constructor(
    private val repository: SalesDeductionRepository,
    private val locationRepository: LocationRepository,
    private val brandingManager: com.horae.app.data.local.BrandingManager,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SalesListUiState())
    val uiState: StateFlow<SalesListUiState> = _uiState.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val res = repository.list(page = 1, limit = 20)
                _uiState.update {
                    it.copy(
                        items = res.data,
                        total = res.total,
                        page = 1,
                        hasNextPage = res.hasNextPage,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update {
                    it.copy(isLoading = false, error = ApiErrors.userMessage(e, "Nu am putut încărca jurnalul"))
                }
            }
        }
    }

    fun loadMore() {
        val s = _uiState.value
        if (!s.hasNextPage || s.isLoading) return
        val next = s.page + 1
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val res = repository.list(page = next, limit = 20)
                _uiState.update {
                    it.copy(
                        items = it.items + res.data,
                        page = next,
                        hasNextPage = res.hasNextPage,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun dismissError() = _uiState.update { it.copy(error = null) }

    /** Bulk delete the selected deductions (confirmed ones are reverted server-side), then reload. */
    fun bulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true) }
            // Keep the confirm dialog up (spinner) until the result arrives.
            try {
                val result = repository.bulkDelete(ids)
                _uiState.update { it.copy(isDeleting = false, bulkPreview = null, bulkResult = BulkOutcome.ofDelete(result)) }
                load()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Timber.e(e, "SalesDeductionListViewModel: bulkDelete failed")
                _uiState.update {
                    it.copy(isDeleting = false, bulkPreview = null, error = ApiErrors.userMessage(e, "Eroare la ștergere"))
                }
            }
        }
    }

    /** Step 1 of bulk delete: ask the API what else the selection would touch; the screen then confirms. */
    fun previewBulkDelete(ids: List<String>) {
        if (ids.isEmpty() || _uiState.value.isPreviewing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isPreviewing = true) }
            try {
                val preview = repository.bulkDeletePreview(ids)
                _uiState.update { it.copy(isPreviewing = false, bulkPreview = preview) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Timber.e(e, "SalesDeductionListViewModel: previewBulkDelete failed")
                _uiState.update { it.copy(isPreviewing = false, error = ApiErrors.userMessage(e, "Nu am putut verifica ce se șterge")) }
            }
        }
    }

    fun clearBulkPreview() {
        _uiState.update { it.copy(bulkPreview = null) }
    }

    /** Apply a bulk action (status / assign / …) to the selected rows, then reload. */
    fun bulkAction(ids: List<String>, action: String, params: Map<String, Any?>?) {
        if (ids.isEmpty() || _uiState.value.isActing || _uiState.value.isDeleting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isActing = true) }
            try {
                val result = repository.bulkAction(ids, action, params)
                _uiState.update { it.copy(isActing = false, bulkResult = BulkOutcome.ofAction(result)) }
                load()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Timber.e(e, "SalesDeductionListViewModel: bulkAction failed")
                _uiState.update { it.copy(isActing = false, error = ApiErrors.userMessage(e, "Eroare la aplicarea acțiunii")) }
            }
        }
    }

    fun clearBulkResult() = _uiState.update { it.copy(bulkResult = null) }

    fun consumeCreated() = _uiState.update { it.copy(createdId = null) }

    // ── New session ──

    fun openNew() {
        _uiState.update { it.copy(newSession = it.newSession.copy(open = true, file = null, busy = false)) }
        if (_uiState.value.newSession.locations.isNotEmpty()) return
        viewModelScope.launch {
            try {
                // Magazinele întâi — de acolo se vinde de obicei.
                val active = locationRepository.getLocations()
                    .filter { it.isActive }
                    .sortedByDescending { it.type == "MAGAZIN" }
                // Locația implicită a organizației, dacă e setată și activă; altfel primul magazin.
                val preferred = brandingManager.defaultLocationId?.takeIf { d -> active.any { l -> l.id == d } }
                updateNew { ns -> ns.copy(locations = active, locationId = ns.locationId ?: preferred ?: active.firstOrNull()?.id) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(error = "Nu am putut încărca locațiile") }
            }
        }
    }

    fun closeNew() {
        if (_uiState.value.newSession.busy) return
        updateNew { it.copy(open = false) }
    }

    fun setLocation(id: String) = updateNew { it.copy(locationId = id) }

    /** Downloads the CSV template and hands the bytes to the screen (which shares the file). */
    fun downloadTemplate(onReady: (ByteArray) -> Unit) {
        val locationId = _uiState.value.newSession.locationId ?: return
        viewModelScope.launch {
            try {
                onReady(repository.templateCsv(locationId))
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Nu am putut descărca șablonul")) }
            }
        }
    }
    fun setSource(s: SalesSourceChoice) = updateNew { it.copy(source = s) }
    fun setFrom(d: LocalDate) = updateNew { it.copy(fromDate = d) }
    fun setTo(d: LocalDate) = updateNew { it.copy(toDate = d) }

    fun setFile(uri: Uri?) {
        if (uri == null) return
        var name = "raport.xlsx"
        try {
            appContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { c -> if (c.moveToFirst()) c.getString(0)?.let { name = it } }
        } catch (_: Exception) {
            // keep the default name
        }
        val mime = appContext.contentResolver.getType(uri)
        updateNew { it.copy(file = PickedFile(uri, name, mime)) }
    }

    fun submitNew() {
        val ns = _uiState.value.newSession
        if (!ns.canContinue) return
        val locationId = ns.locationId ?: return
        updateNew { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                val created = when (ns.source) {
                    SalesSourceChoice.EXCEL -> {
                        val file = ns.file ?: return@launch
                        val bytes = withContext(Dispatchers.IO) {
                            appContext.contentResolver.openInputStream(file.uri)?.use { it.readBytes() }
                        } ?: throw IllegalStateException("Nu am putut citi fișierul")
                        if (bytes.size > 10 * 1024 * 1024) {
                            throw IllegalStateException("Fișierul e prea mare (max. 10 MB)")
                        }
                        repository.fromExcel(bytes, file.name, file.mimeType, locationId)
                    }
                    SalesSourceChoice.WOOCOMMERCE -> {
                        val zone = com.horae.app.ui.common.RoDate.zone
                        val from = ns.fromDate.atStartOfDay(zone).toInstant()
                        val to = ns.toDate.atTime(LocalTime.of(23, 59, 59)).atZone(zone).toInstant()
                        repository.fromWoo(locationId, from.toString(), to.toString())
                    }
                    SalesSourceChoice.MANUAL -> repository.manual(locationId)
                }
                _uiState.update {
                    it.copy(createdId = created.id, newSession = it.newSession.copy(open = false, busy = false))
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                val msg = if (e is IllegalStateException) com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare")
                else ApiErrors.userMessage(e, "Nu am putut porni scăderea")
                _uiState.update { it.copy(error = msg, newSession = it.newSession.copy(busy = false)) }
            }
        }
    }

    private fun updateNew(f: (NewSalesState) -> NewSalesState) =
        _uiState.update { it.copy(newSession = f(it.newSession)) }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Jurnalul scăderilor de stoc pe bază de vânzări + pornirea uneia noi
 * (pas 1: locația, pas 2: sursa — Excel eBriza / manual / site).
 * Mirrors web `/stock/sales`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SalesDeductionListScreen(
    navController: NavController,
    role: UserRole,
    viewModel: SalesDeductionListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val canCreate = canWriteSales(role)
    val canDelete = PermissionManager.can(role, CASLAction.DELETE, CASLSubject.STOCK_MOVEMENT)
    val canAct = canCreate
    val canSelect = canDelete || canAct
    val bulk = rememberBulkSelectionState()
    val listState = rememberLazyListState()

    BulkDeleteResultDialog(
        result = state.bulkResult,
        onDismiss = {
            viewModel.clearBulkResult()
            bulk.exit()
        },
    )

    // Re-fetch every time the screen (re)enters composition — e.g. back from a draft.
    LaunchedEffect(Unit) { viewModel.load() }

    LaunchedEffect(state.createdId) {
        state.createdId?.let { id ->
            viewModel.consumeCreated()
            navController.navigate(Screen.SalesDeductionDetail.createRoute(id))
        }
    }

    val shouldLoadMore by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= state.items.size - 3 && state.hasNextPage && !state.isLoading
        }
    }
    LaunchedEffect(shouldLoadMore) { if (shouldLoadMore) viewModel.loadMore() }

    state.error?.let { ErrorDialog(message = it, onDismiss = viewModel::dismissError) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            if (bulk.isActive) {
                BulkSelectTopBar(state = bulk, allIds = state.items.map { it.id })
            } else {
                TopAppBar(
                    title = {
                        Column {
                            Text("Vânzări → stoc", fontWeight = FontWeight.Bold)
                            Text(
                                "Scade din stocul de produse ce s-a vândut",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Înapoi")
                        }
                    },
                    actions = { if (canSelect) BulkSelectAction(bulk) },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.background,
                        titleContentColor = MaterialTheme.colorScheme.onBackground,
                    ),
                )
            }
        },
        bottomBar = {
            if (bulk.isActive) {
                BulkSelectBottomBar(
                    state = bulk,
                    warning = BulkDeleteWarnings.SALES,
                    preview = state.bulkPreview,
                    isPreviewing = state.isPreviewing,
                    isDeleting = state.isDeleting,
                    onRequestPreview = viewModel::previewBulkDelete,
                    onDismissPreview = viewModel::clearBulkPreview,
                    onConfirmDelete = viewModel::bulkDelete,
                    canDelete = canDelete,
                    actions = BulkActionCatalog.sales,
                    canAct = canAct,
                    isActing = state.isActing,
                    onRunAction = viewModel::bulkAction,
                )
            }
        },
        floatingActionButton = {
            if (canCreate && !bulk.isActive) {
                FloatingActionButton(
                    onClick = viewModel::openNew,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = Color.White,
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Scădere nouă")
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                state.isLoading && state.items.isEmpty() -> LoadingOverlay()
                state.items.isEmpty() -> EmptyLog(canCreate = canCreate, onCreate = viewModel::openNew)
                else -> HoraeCard(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                        itemsIndexed(state.items, key = { _, d -> d.id }) { index, d ->
                            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            SalesLogRow(d, selection = bulk.takeIf { canSelect }) {
                                navController.navigate(Screen.SalesDeductionDetail.createRoute(d.id))
                            }
                        }
                        if (state.isLoading) {
                            item {
                                Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                    CircularProgressIndicator()
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (state.newSession.open) {
        NewSalesDeductionSheet(
            state = state.newSession,
            onDismiss = viewModel::closeNew,
            onLocation = viewModel::setLocation,
            onSource = viewModel::setSource,
            onFile = viewModel::setFile,
            onFrom = viewModel::setFrom,
            onTo = viewModel::setTo,
            onContinue = viewModel::submitNew,
            onTemplate = {
                viewModel.downloadTemplate { bytes -> shareCsv(context, bytes) }
            },
        )
    }
}

/** Writes the CSV to the cache dir and opens the share sheet (Files, Mail, Drive…). */
private fun shareCsv(context: android.content.Context, bytes: ByteArray) {
    try {
        val date = java.time.LocalDate.now().toString()
        val file = java.io.File(context.cacheDir, "scadere-stoc-$date.csv")
        file.writeBytes(bytes)
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(android.content.Intent.EXTRA_STREAM, uri)
            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(android.content.Intent.createChooser(intent, "Șablon scădere stoc"))
    } catch (e: Exception) {
        Timber.e(e, "Failed to share the CSV template")
    }
}

@Composable
private fun EmptyLog(canCreate: Boolean, onCreate: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.ReceiptLong,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(40.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text("Nicio scădere încă", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Încarcă raportul de vânzări din eBriza sau introdu vânzările manual.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (canCreate) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onCreate) { Text("Scădere nouă") }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SalesLogRow(
    d: SalesDeductionDto,
    selection: BulkSelectionState? = null,
    onClick: () -> Unit,
) {
    val status = SalesDeductionStatus.fromString(d.status)
    val source = SalesDeductionSource.fromString(d.source)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = {
                    if (selection?.isActive == true) selection.toggle(d.id) else onClick()
                },
                onLongClick = selection?.let { s -> { if (!s.isActive) { s.enter(); s.toggle(d.id) } } },
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (selection?.isActive == true) {
                BulkSelectCheckbox(state = selection, id = d.id)
            }
            Text(
                source?.displayName ?: d.source,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            HoraeStatusBadge(status?.displayName ?: d.status, statusColor(status))
        }
        val sub = d.fileName ?: d.note
        if (!sub.isNullOrBlank()) {
            Text(
                sub,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(summaryText(d), style = MaterialTheme.typography.bodyMedium)
        Text(
            listOf(
                fmtDateTime(d.confirmedAt ?: d.createdAt),
                d.locationName,
                d.confirmedByName ?: d.createdByName,
            ).filter { it.isNotBlank() }.joinToString(" · "),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun summaryText(d: SalesDeductionDto): String {
    val s = d.summary
    if (d.status == SalesDeductionStatus.DRAFT.name) return "${s.total} produse de verificat"
    val parts = mutableListOf("${s.accepted} scăzute")
    if (s.shortfalls > 0) parts += "${s.shortfalls} stoc insuficient"
    if (s.created > 0) parts += "${s.created} noi"
    if (s.declined > 0) parts += "${s.declined} ignorate"
    return parts.joinToString(" · ")
}

// ---------------------------------------------------------------------------
// New session sheet
// ---------------------------------------------------------------------------

private val excelMimeTypes = arrayOf(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "text/comma-separated-values",
    "application/csv",
    "text/plain",
)


@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewSalesDeductionSheet(
    state: NewSalesState,
    onDismiss: () -> Unit,
    onLocation: (String) -> Unit,
    onSource: (SalesSourceChoice) -> Unit,
    onFile: (Uri?) -> Unit,
    onFrom: (LocalDate) -> Unit,
    onTo: (LocalDate) -> Unit,
    onContinue: () -> Unit,
    onTemplate: () -> Unit = {},
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> onFile(uri) }
    var pickDate by remember { mutableStateOf<String?>(null) } // "from" | "to"

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Scădere nouă din vânzări", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

            // 1. Locația
            Text("1. Locația de unde se scade stocul", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            if (state.locations.isEmpty()) {
                Text(
                    "Nu ai nicio locație activă — fără locație nu se poate încărca fișierul.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            com.horae.app.ui.common.ChoiceChips(
                options = state.locations,
                selected = state.locations.firstOrNull { it.id == state.locationId },
                onSelect = { onLocation(it.id) },
                label = { it.name },
                wrap = true,
            )

            // 2. Sursa
            Text("2. De unde vin vânzările", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
            SalesSourceChoice.entries.forEach { s ->
                SourceOption(
                    choice = s,
                    icon = when (s) {
                        SalesSourceChoice.EXCEL -> Icons.Default.TableChart
                        SalesSourceChoice.MANUAL -> Icons.Default.Edit
                        SalesSourceChoice.WOOCOMMERCE -> Icons.Default.Language
                    },
                    selected = state.source == s,
                    onClick = { onSource(s) },
                )
            }

            if (state.source == SalesSourceChoice.EXCEL) {
                OutlinedButton(
                    onClick = { picker.launch(excelMimeTypes) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Default.TableChart, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(
                        state.file?.name ?: "Încarcă fișierul exportat din eBriza",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
                // Șablon pentru scoateri manuale: toate produsele, cantitatea goală.
                TextButton(onClick = onTemplate, enabled = state.locationId != null) {
                    Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text("Descarcă șablonul CSV (toate produsele)")
                }
                Text(
                    "Căutăm automat coloanele „Denumire/Produs” și „Cantitate”. Nimic nu se scade până nu confirmi. Șablonul are toate produsele cu numele exact; completezi doar cantitatea.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (state.source == SalesSourceChoice.WOOCOMMERCE) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { pickDate = "from" }, modifier = Modifier.weight(1f)) {
                        Text("De la: ${com.horae.app.ui.common.RoDate.shortDate(state.fromDate)}", maxLines = 1)
                    }
                    OutlinedButton(onClick = { pickDate = "to" }, modifier = Modifier.weight(1f)) {
                        Text("Până la: ${com.horae.app.ui.common.RoDate.shortDate(state.toDate)}", maxLines = 1)
                    }
                }
                if (state.fromDate.isAfter(state.toDate)) {
                    Text(
                        "Data de început e după data de sfârșit.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Text(
                    "Atenție: comenzile de pe site devin și comenzi de producție. Scade de aici doar produsele luate din stocul de raft, ca să nu scazi de două ori.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Warning,
                )
            }

            if (state.locationId == null) {
                Text(
                    "Alege mai întâi locația din care se scade stocul.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Warning,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss, enabled = !state.busy) { Text("Renunță") }
                Button(onClick = onContinue, enabled = state.canContinue) {
                    if (state.busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                        Spacer(Modifier.size(8.dp))
                    }
                    Text("Continuă")
                }
            }
        }
    }

    pickDate?.let { which ->
        val initial = if (which == "from") state.fromDate else state.toDate
        val dpState = rememberDatePickerState(
            initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = null },
            confirmButton = {
                TextButton(onClick = {
                    dpState.selectedDateMillis?.let { ms ->
                        // DatePicker reports UTC-midnight millis for the chosen calendar day.
                        val d = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                        if (which == "from") onFrom(d) else onTo(d)
                    }
                    pickDate = null
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { pickDate = null }) { Text("Anulează") } },
        ) {
            DatePicker(state = dpState)
        }
    }
}

@Composable
private fun SourceOption(
    choice: SalesSourceChoice,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val primary = MaterialTheme.colorScheme.primary
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) primary.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if (selected) primary else MaterialTheme.colorScheme.outline),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (selected) primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
            Column {
                Text(choice.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    choice.hint,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
