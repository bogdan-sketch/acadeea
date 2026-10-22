package com.horae.app.ui.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.remote.dto.UpdateOrderItemRequest
import com.horae.app.data.remote.dto.UpdateOrderRequest
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.OrderRepository
import com.horae.app.domain.model.OrderItemStatus
import com.horae.app.domain.model.OrderStatus
import com.horae.app.domain.model.StatusKind
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HIconButtonVariant
import com.horae.app.ui.common.HPrimaryButton
import com.horae.app.ui.common.HSecondaryButton
import com.horae.app.ui.common.HSectionHeader
import com.horae.app.ui.common.HStatusChip
import com.horae.app.ui.common.HoraeRefreshBox
import com.horae.app.ui.common.RequestGate
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.runRefresh
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

data class OrderDetailUiState(
    val order: OrderResponse? = null,
    val pickupLocation: LocationResponse? = null,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isUpdating: Boolean = false,
    val error: String? = null,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class OrderDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val orderRepository: OrderRepository,
    private val locationRepository: LocationRepository,
    private val filters: OrdersFilterStore,
) : ViewModel() {

    /** Shop delivery methods (short names) — the "Metodă" row shows the label. */
    val deliveryMethods: StateFlow<List<com.horae.app.data.remote.dto.DeliveryMethodDto>> = filters.methods

    /** name → short label (empty while `wooDeliveryEnabled` is off). */
    val methodLabels: Map<String, String> get() = filters.labels

    private val orderId: String = savedStateHandle["orderId"] ?: ""

    private val _uiState = MutableStateFlow(OrderDetailUiState())
    val uiState: StateFlow<OrderDetailUiState> = _uiState.asStateFlow()
    private val gate = RequestGate()

    init {
        loadOrder()
        if (filters.methods.value.isEmpty()) viewModelScope.launch { filters.refreshMethods() }
    }

    /** Loads (or refreshes) the order; a failed refresh keeps what is on screen. */
    fun loadOrder() {
        val token = gate.next()
        viewModelScope.launch {
            _uiState.update { if (it.order == null) it.copy(isLoading = true) else it.copy(isRefreshing = true) }
            val order = runRefresh(onError = { e ->
                Timber.e(e, "OrderDetailViewModel: load failed")
                _uiState.update { it.copy(error = ApiErrors.userMessage(e, "Nu am putut încărca comanda.")) }
            }) { orderRepository.getOrder(orderId) }
            if (!gate.isCurrent(token)) return@launch
            _uiState.update { it.copy(order = order ?: it.order, isLoading = false, isRefreshing = false) }
            order?.pickupLocationId?.takeIf { order.isPickup && _uiState.value.pickupLocation?.id != it }?.let { id ->
                runCatching { locationRepository.getLocations() }.getOrNull()
                    ?.firstOrNull { it.id == id }
                    ?.let { loc -> _uiState.update { it.copy(pickupLocation = loc) } }
            }
        }
    }

    private fun mutate(label: String, block: suspend () -> Unit) {
        if (_uiState.value.isUpdating) return
        viewModelScope.launch {
            _uiState.update { it.copy(isUpdating = true) }
            try {
                block()
            } catch (e: Exception) {
                Timber.e(e, "OrderDetailViewModel: $label failed")
                _uiState.update { it.copy(error = ApiErrors.userMessage(e)) }
            } finally {
                _uiState.update { it.copy(isUpdating = false) }
            }
        }
    }

    fun updateStatus(newStatus: OrderStatus) = mutate("updateStatus") {
        val updated = orderRepository.updateOrder(orderId, UpdateOrderRequest(status = newStatus.name))
        _uiState.update { it.copy(order = updated) }
    }

    fun updateItemStatus(itemId: String, newStatus: OrderItemStatus) = mutate("updateItemStatus") {
        orderRepository.updateItem(orderId, itemId, UpdateOrderItemRequest(status = newStatus.name))
        loadOrder()
    }

    fun createDeliveryNote() = mutate("createDeliveryNote") {
        orderRepository.createDeliveryNote(orderId)
        loadOrder()
    }

    fun signDeliveryNote(name: String, signaturePng: ByteArray) = mutate("signDeliveryNote") {
        orderRepository.signDeliveryNote(orderId, name, signaturePng)
        loadOrder()
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Order detail: eyebrow (source + when placed), Fraunces title = what was ordered,
 * "customer · Comanda 11644" (the ONLY place the number shows, without "WOO-"),
 * deadline meta in Bucharest time (date-only deadlines without a time), status track,
 * products, details, actions, delivery note.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    navController: NavController,
    viewModel: OrderDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val methods by viewModel.deliveryMethods.collectAsState()
    val methodLabels = remember(methods) { viewModel.methodLabels }
    val s = HoraeTheme.scheme
    var showSignatureSheet by remember { mutableStateOf(false) }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        containerColor = s.background,
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0),
                title = {},
                navigationIcon = {
                    HIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi", { navController.popBackStack() }, variant = HIconButtonVariant.PLAIN)
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = s.background),
            )
        },
    ) { innerPadding ->
        val order = uiState.order
        when {
            order == null && uiState.isLoading -> Box(Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = s.primary)
            }
            order != null -> HoraeRefreshBox(
                isRefreshing = uiState.isRefreshing,
                onRefresh = viewModel::loadOrder,
                modifier = Modifier.fillMaxSize().padding(innerPadding).clipToBounds(),
            ) {
                androidx.compose.runtime.CompositionLocalProvider(LocalDeliveryMethodLabels provides methodLabels) {
                    OrderDetailContent(
                        order = order,
                        pickupLocation = uiState.pickupLocation,
                        isUpdating = uiState.isUpdating,
                        onStatus = viewModel::updateStatus,
                        onCreateNote = viewModel::createDeliveryNote,
                        onSign = { showSignatureSheet = true },
                        onOpenNote = { navController.navigate(OrdersRoutes.deliveryNote(order.id)) },
                    )
                }
            }
        }
    }

    uiState.error?.let { ErrorDialog(message = it, onDismiss = viewModel::clearError) }

    if (showSignatureSheet) {
        SignatureCaptureDialog(
            onDismiss = { showSignatureSheet = false },
            onSign = { name, imageData ->
                viewModel.signDeliveryNote(name, imageData)
                showSignatureSheet = false
            },
        )
    }
}

@Composable
private fun OrderDetailContent(
    order: OrderResponse,
    pickupLocation: LocationResponse?,
    isUpdating: Boolean,
    onStatus: (OrderStatus) -> Unit,
    onCreateNote: () -> Unit,
    onSign: () -> Unit,
    onOpenNote: () -> Unit,
) {
    val s = HoraeTheme.scheme
    val status = order.statusEnum
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
            .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OrderDetailHeader(order, pickupLocation)
        OrderStatusTrack(status)

        // ── Produse ──
        val doneCount = order.items.count {
            it.status == OrderItemStatus.GATA.name || it.status == OrderItemStatus.IN_TRANZIT.name || it.status == OrderItemStatus.LIVRAT.name
        }
        HSectionHeader(
            "Produse (${order.items.size})",
            modifier = Modifier.padding(top = 6.dp),
            trailing = { Text("$doneCount din ${order.items.size} gata", style = AppFont.body(12f), color = s.muted) },
        )
        HCard(Modifier.fillMaxWidth(), padding = PaddingValues(0.dp)) {
            order.items.forEachIndexed { index, item ->
                val itemStatus = OrderItemStatus.fromString(item.status) ?: OrderItemStatus.IN_PREGATIRE
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.recipeName.ifBlank { item.label.orEmpty() }, style = AppFont.body(15f, FontWeight.SemiBold), color = s.ink)
                        Text(formatQty(item.quantity, item.unit), style = AppFont.body(12f, FontWeight.SemiBold), color = s.primaryText)
                        item.notes?.takeIf { it.isNotBlank() }?.let { Text(it, style = AppFont.body(12f), color = s.muted) }
                    }
                    HStatusChip(itemStatus.displayName, itemStatus.kind)
                }
                if (index < order.items.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = s.border)
            }
        }

        // ── Detalii ──
        HSectionHeader("Detalii", modifier = Modifier.padding(top = 6.dp))
        HCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)) {
            KeyValueRow("Predare", order.modeTitle)
            order.deliveryMethodLabel(LocalDeliveryMethodLabels.current)?.let { KeyValueRow("Metodă", it) }
            if (order.isPickup) {
                (pickupLocation?.name ?: order.meaningfulDeliveryPoint)?.let { KeyValueRow("Locație ridicare", it) }
            } else {
                order.meaningfulDeliveryPoint?.let { KeyValueRow("Punct livrare", it) }
                order.deliveryAddress?.takeIf { it.isNotBlank() }?.let { KeyValueRow("Adresă", it) }
            }
            KeyValueRow("Termen", order.dueDate?.let(RoDate::stamp) ?: "Fără termen")
            order.assignedTo?.let { KeyValueRow("Livrator", it.fullName) }
            KeyValueRow("Creată", RoDate.shortDateTime(order.createdAt))
            order.completedAt?.let { KeyValueRow("Finalizată", RoDate.shortDateTime(it)) }
            order.notes?.takeIf { it.isNotBlank() }?.let { KeyValueRow("Note", it) }
        }

        // ── Acțiuni ──
        val transitions = status.allowedTransitions
        if (transitions.isNotEmpty()) {
            HSectionHeader("Acțiuni", modifier = Modifier.padding(top = 6.dp))
            Column(Modifier.tutorialAnchor("orders.create.status"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                transitions.forEach { next ->
                    if (next == OrderStatus.ANULATA) {
                        HSecondaryButton("Anulează comanda", { onStatus(next) }, Modifier.fillMaxWidth(), enabled = !isUpdating)
                    } else {
                        HPrimaryButton("Trece la: ${next.displayName}", { onStatus(next) }, Modifier.fillMaxWidth(), enabled = !isUpdating, loading = isUpdating)
                    }
                }
            }
        }

        // ── Foaie de parcurs ──
        HSectionHeader("Foaie de parcurs", modifier = Modifier.padding(top = 6.dp).tutorialAnchor("orders.create.deliveryNote"))
        val note = order.deliveryNote
        if (note != null) {
            HCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)) {
                KeyValueRow("Punct livrare", note.deliveryPoint)
                KeyValueRow("Adresă", note.deliveryAddress)
                if (note.hasSignature) {
                    KeyValueRow("Semnat de", note.signedByName ?: "–")
                    note.signedAt?.let { KeyValueRow("Data semnării", RoDate.shortDateTime(it)) }
                }
            }
            if (!note.hasSignature) HPrimaryButton("Semnează la predare", onSign, Modifier.fillMaxWidth(), enabled = !isUpdating)
            HSecondaryButton("Vezi / exportă PDF", onOpenNote, Modifier.fillMaxWidth())
        } else {
            HSecondaryButton("Generează foaie de parcurs", onCreateNote, Modifier.fillMaxWidth(), enabled = !isUpdating, accentText = true)
        }
    }
}

/** Eyebrow, title (products), "customer · Comanda N", deadline meta. */
@Composable
internal fun OrderDetailHeader(order: OrderResponse, pickupLocation: LocationResponse?) {
    val s = HoraeTheme.scheme
    val placed = RoDate.deadline(order.createdAt)
    val eyebrow = if (order.isFromSite) "Site · WooCommerce · plasată $placed" else "Creată de ${order.createdBy.fullName} · $placed"
    val place = if (order.isPickup) pickupLocation?.name ?: order.meaningfulDeliveryPoint else order.meaningfulDeliveryPoint
    val meta = listOfNotNull(
        order.dueMeta + if (order.isOverdue) " · întârziată" else "",
        place,
        OrderFormat.productCount(order.itemCount),
    ).joinToString(" · ")
    val customer = order.displayCustomer
    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(eyebrow, style = AppFont.body(12f, FontWeight.SemiBold), color = s.primaryText)
        Text(order.productsLine, style = AppFont.title(26f), color = s.ink, modifier = Modifier.semantics { heading() })
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = s.ink, fontSize = 15.sp)) { append(customer) }
                withStyle(SpanStyle(color = s.muted, fontSize = 12.sp)) {
                    append(if (customer.isEmpty()) "" else " · ")
                    append("Comanda ${order.displayNumber}")
                }
            },
            style = AppFont.body(15f),
        )
        Text(
            meta,
            style = AppFont.body(12f),
            color = if (order.isOverdue) StatusPalette.fg(StatusKind.DANGER, s.isDark) else s.muted,
        )
    }
}

/** 5-step status track (Nouă → Livrată); a cancelled order greys it out under a banner. */
@Composable
private fun OrderStatusTrack(status: OrderStatus) {
    val s = HoraeTheme.scheme
    val steps = listOf(OrderStatus.NOUA, OrderStatus.IN_PREGATIRE, OrderStatus.PREGATITA, OrderStatus.IN_TRANZIT, OrderStatus.LIVRATA)
    val current = steps.indexOf(status).takeIf { it >= 0 }
    Column(
        Modifier.semantics(mergeDescendants = true) {
            contentDescription = "Stare comandă: ${status.displayName}" + (current?.let { ", pasul ${it + 1} din ${steps.size}" } ?: "")
        },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (status == OrderStatus.ANULATA) HStatusChip("Comandă anulată", StatusKind.DANGER)
        // One shared label size for all five tiles: any tile whose label would not fit
        // on one line shrinks it for every tile, so labels stay uniform and on one
        // line (no wrap, no ellipsis) and the tiles keep the same height.
        var labelSize by remember { mutableStateOf(11f) }
        Row(
            Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
                .then(if (status == OrderStatus.ANULATA) Modifier.background(s.background.copy(alpha = 0.5f)) else Modifier),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            steps.forEachIndexed { i, step ->
                val done = current != null && i < current
                val isCurrent = i == current
                val shape = RoundedCornerShape(10.dp)
                Column(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(shape)
                        .background(if (isCurrent) s.primary.copy(alpha = 0.10f) else s.card)
                        .border(1.dp, if (isCurrent) s.primary else s.border, shape)
                        .padding(start = 3.dp, end = 3.dp, top = 6.dp, bottom = 8.dp),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(
                                when {
                                    done -> StatusPalette.fg(StatusKind.READY, s.isDark)
                                    isCurrent -> s.primary
                                    else -> s.border
                                },
                            ),
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        step.displayName,
                        style = AppFont.body(labelSize, FontWeight.Bold).copy(letterSpacing = (-0.2).sp),
                        color = if ((done || isCurrent) && status != OrderStatus.ANULATA) s.ink else s.muted,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Clip,
                        onTextLayout = { result ->
                            if (result.didOverflowWidth && labelSize > 7.5f) labelSize = (labelSize - 0.5f).coerceAtLeast(7.5f)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun KeyValueRow(label: String, value: String) {
    val s = HoraeTheme.scheme
    Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.Top) {
        Text(label, style = AppFont.body(14f), color = s.muted, modifier = Modifier.width(120.dp))
        Text(
            value,
            style = AppFont.body(14f, FontWeight.Medium),
            color = s.ink,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
    }
}
