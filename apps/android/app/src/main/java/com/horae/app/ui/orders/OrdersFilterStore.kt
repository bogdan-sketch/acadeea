package com.horae.app.ui.orders

import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.dto.DeliveryMethodDto
import com.horae.app.data.remote.dto.DeliveryMethodKind
import com.horae.app.data.repository.OrderRepository
import com.horae.app.domain.model.OrderStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Comenzi view: "Pregătiri" (by delivery day, undated = Azi — the old "Livrări", API
 * `view=livrari`; first and DEFAULT since 1.39.0) | "Intrări" (newest placed first).
 */
enum class OrderView(val apiValue: String, val label: String) {
    PREGATIRI("livrari", "Pregătiri"),
    INTRARI("intrari", "Intrări"),
}

/** Status filter default (1.39.0): only "Nouă". */
val DEFAULT_ORDER_STATUSES: Set<OrderStatus> = setOf(OrderStatus.NOUA)

/**
 * Status-menu tap: toggles [tapped]; never leaves the selection empty (removing the last one
 * goes back to the default).
 */
fun Set<OrderStatus>.toggledStatus(tapped: OrderStatus): Set<OrderStatus> {
    val next = if (tapped in this) this - tapped else this + tapped
    return next.ifEmpty { DEFAULT_ORDER_STATUSES }
}

/** "Toate" tap: everything, or — when everything is already selected — back to the default. */
fun Set<OrderStatus>.toggledAll(): Set<OrderStatus> =
    if (containsAll(OrderStatus.entries)) DEFAULT_ORDER_STATUSES else OrderStatus.entries.toSet()

/** `statuses=` values in the enum order (`GET /orders`, `GET /orders/calendar?status=`). */
fun Set<OrderStatus>.apiValues(): List<String> = OrderStatus.entries.filter { it in this }.map { it.name }

/** One-line hint above the list: "Doar: Nouă" / "Nouă, Pregătită" / "Toate statusurile". */
fun Set<OrderStatus>.hint(): String {
    val names = OrderStatus.entries.filter { it in this }.map { it.displayName }
    return when {
        names.size == OrderStatus.entries.size -> "Toate statusurile"
        names.size == 1 -> "Doar: ${names.first()}"
        else -> names.joinToString(", ")
    }
}

/** The delivery-method filter: exactly one at a time, [All] ("Toate") by default. */
sealed interface DeliveryFilter {
    /** "Toate" — sends neither `deliveryMethod` nor `deliveryKind`. */
    data object All : DeliveryFilter
    /** "Livrare" — `deliveryKind=DELIVERY` (every delivery method). */
    data object Delivery : DeliveryFilter
    /** One method — `deliveryMethod=<name>` (exact name, not the label). */
    data class Method(val name: String) : DeliveryFilter

    /** `deliveryMethod` query value. */
    val methodName: String? get() = (this as? Method)?.name
    /** `deliveryKind` query value. */
    val kind: String? get() = if (this == Delivery) DeliveryMethodKind.DELIVERY.name else null
}

/** One chip of the delivery-method row. */
data class DeliveryChip(val filter: DeliveryFilter, val label: String, val count: Int)

/**
 * Chip row order: Toate · one chip per PICKUP method · Livrare (sum of delivery counts) · one
 * chip per DELIVERY method only when there are 2+ (so "where" it's delivered can be filtered).
 * Methods keep the server order (most used first).
 */
fun deliveryChips(methods: List<DeliveryMethodDto>): List<DeliveryChip> {
    val pickup = methods.filter { it.kindEnum == DeliveryMethodKind.PICKUP }
    val delivery = methods.filter { it.kindEnum == DeliveryMethodKind.DELIVERY }
    return buildList {
        add(DeliveryChip(DeliveryFilter.All, "Toate", 0))
        pickup.forEach { add(DeliveryChip(DeliveryFilter.Method(it.name), it.label, it.count)) }
        add(DeliveryChip(DeliveryFilter.Delivery, DeliveryMethodKind.DELIVERY.label, delivery.sumOf { it.count }))
        if (delivery.size >= 2) delivery.forEach { add(DeliveryChip(DeliveryFilter.Method(it.name), it.label, it.count)) }
    }
}

/** Tapping the selected chip again goes back to Toate. */
fun DeliveryFilter.toggled(tapped: DeliveryFilter): DeliveryFilter = if (tapped == this) DeliveryFilter.All else tapped

/** A selected method that is no longer in [methods] falls back to Toate. */
fun DeliveryFilter.validIn(methods: List<DeliveryMethodDto>): DeliveryFilter = when (this) {
    is DeliveryFilter.Method -> if (methods.any { it.name == name }) this else DeliveryFilter.All
    else -> this
}

/**
 * State shared by the whole orders area (list ⇄ calendar): the Pregătiri/Intrări view, the
 * status filter and the delivery-method filter, plus the shop's delivery methods (short names, kinds). A singleton so
 * the selection survives switching list ⇄ calendar; the screens' ViewModels observe it and reload.
 *
 * Delivery methods / filter / short names exist only with `Organization.wooDeliveryEnabled`
 * ([BrandingManager.wooDeliveryEnabled]); when it is off [activeFilter] is [DeliveryFilter.All]
 * and [labels] is empty, whatever was chosen before.
 */
@Singleton
class OrdersFilterStore @Inject constructor(
    private val repository: OrderRepository,
    private val branding: BrandingManager,
) {
    private val _view = MutableStateFlow(OrderView.PREGATIRI)
    val view: StateFlow<OrderView> = _view.asStateFlow()

    private val _statuses = MutableStateFlow(DEFAULT_ORDER_STATUSES)
    /**
     * Status filter shared by list + calendar, for this process only (an app restart goes back
     * to [DEFAULT_ORDER_STATUSES] = Nouă). Never empty.
     */
    val statuses: StateFlow<Set<OrderStatus>> = _statuses.asStateFlow()

    /** Badge on the filter icon: the selection is not the default. */
    val statusesCustomized: Boolean get() = _statuses.value != DEFAULT_ORDER_STATUSES

    fun toggleStatus(status: OrderStatus) {
        _statuses.value = _statuses.value.toggledStatus(status)
    }

    fun toggleAllStatuses() {
        _statuses.value = _statuses.value.toggledAll()
    }

    fun setStatuses(statuses: Set<OrderStatus>) {
        _statuses.value = statuses.ifEmpty { DEFAULT_ORDER_STATUSES }
    }

    private val _filter = MutableStateFlow<DeliveryFilter>(DeliveryFilter.All)
    /** Selected chip; [DeliveryFilter.All] = "Toate". */
    val filter: StateFlow<DeliveryFilter> = _filter.asStateFlow()

    private val _methods = MutableStateFlow<List<DeliveryMethodDto>>(emptyList())
    val methods: StateFlow<List<DeliveryMethodDto>> = _methods.asStateFlow()

    val wooDeliveryEnabled: Boolean get() = branding.wooDeliveryEnabled

    /** The filter to send — [DeliveryFilter.All] while the feature is off. */
    val activeFilter: DeliveryFilter get() = if (wooDeliveryEnabled) _filter.value else DeliveryFilter.All

    /** name → label (short name, else the stripped name); empty while the feature is off. */
    val labels: Map<String, String>
        get() = if (wooDeliveryEnabled) _methods.value.associate { it.name to it.label } else emptyMap()

    fun setView(view: OrderView) {
        _view.value = view
    }

    /** Chip tap: selects [tapped], or back to Toate when it is already selected. */
    fun select(tapped: DeliveryFilter) {
        _filter.value = _filter.value.toggled(tapped)
    }

    fun setFilter(filter: DeliveryFilter) {
        _filter.value = filter
    }

    /**
     * GET /orders/delivery-methods (no-op while the feature is off; errors keep the old list).
     * Called on every list/calendar (re)load and screen re-appear; a selected method that
     * disappeared falls back to Toate.
     */
    suspend fun refreshMethods() {
        if (!wooDeliveryEnabled) return
        runCatching { repository.getDeliveryMethods() }
            .onSuccess(::applyMethods)
            .onFailure { Timber.w(it, "OrdersFilterStore: delivery methods failed") }
    }

    /** Admin: set/clear a short name (kind untouched); the PUT answers with the full list. Throws on failure. */
    suspend fun setShortName(name: String, shortName: String?) {
        applyMethods(repository.setDeliveryMethodAlias(name, shortName))
    }

    /** Admin: set a method's kind, or null = back to auto (short name untouched). Throws on failure. */
    suspend fun setKind(name: String, kind: DeliveryMethodKind?) {
        applyMethods(repository.setDeliveryMethodKind(name, kind?.name))
    }

    private fun applyMethods(list: List<DeliveryMethodDto>) {
        _methods.value = list
        _filter.value = _filter.value.validIn(list)
    }
}
