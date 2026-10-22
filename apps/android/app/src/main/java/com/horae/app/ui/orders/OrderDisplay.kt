package com.horae.app.ui.orders

import com.horae.app.data.remote.dto.OrderItemResponseDto
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.domain.model.OrderStatus
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.qtyFormatted
import java.time.LocalDate

/*
 * How an order is shown (twin of iOS `OrderDisplay.swift`, web `orderTitle`/`orderCustomer`).
 * Owner's rule (17.10.2026): orders are identified by WHAT was ordered and WHO ordered it —
 * never by the WooCommerce number. The number shows only on the order detail (small meta,
 * without "WOO-") and still matches in search. Lists: newest first, no delivery time.
 */

/** Parsed status; unknown values fall back to NOUA. */
val OrderResponse.statusEnum: OrderStatus
    get() = OrderStatus.entries.firstOrNull { it.name == status } ?: OrderStatus.NOUA

val OrderStatus.isOpen: Boolean get() = this != OrderStatus.LIVRATA && this != OrderStatus.ANULATA

val OrderResponse.isPickup: Boolean get() = fulfillmentType == "PICKUP"

val OrderResponse.modeTitle: String get() = if (isPickup) "Ridicare" else "Livrare"

/** WooCommerce number ("11644") for site orders, null for manual ones. */
val OrderResponse.wooNumber: String?
    get() = if (orderNumber.uppercase().startsWith("WOO-")) orderNumber.drop(4) else null

val OrderResponse.isFromSite: Boolean get() = wooNumber != null || externalStatus != null

/** The number as people say it: "11644" (no "WOO-"); manual orders keep theirs. Detail only. */
val OrderResponse.displayNumber: String get() = wooNumber ?: orderNumber

/** Shop delivery method for imported Woo orders ("Ridicare Napoca 15"), blank → null. */
val OrderResponse.deliveryMethodText: String?
    get() = deliveryMethod?.trim()?.takeIf { it.isNotEmpty() }

/**
 * Delivery point unless it is the importer's placeholder ("WooCommerce") or just repeats the
 * shop delivery method (the importer copies it into deliveryPoint) — that one shows as "Metodă".
 */
val OrderResponse.meaningfulDeliveryPoint: String?
    get() = deliveryPoint.trim().takeIf {
        it.isNotEmpty() && !it.equals("WooCommerce", ignoreCase = true) &&
            !it.equals(deliveryMethodText, ignoreCase = true)
    }

/** Row muted line: "<metodă sau Ridicare/Livrare> · <termen>" ("Ridicare Napoca 15 · mâine"). */
val OrderResponse.rowMethodLine: String
    get() = listOfNotNull(deliveryMethodText ?: modeTitle, dueDate?.let { RoDate.deadline(it) }?.takeIf { it.isNotEmpty() })
        .joinToString(" · ")

/** Row line 3: the customer, else a real delivery point; null when neither. */
val OrderResponse.rowCustomer: String?
    get() = customerName?.trim()?.takeIf { it.isNotEmpty() } ?: meaningfulDeliveryPoint

/** Detail: customer when known, else the delivery point. */
val OrderResponse.displayCustomer: String
    get() = customerName?.trim()?.takeIf { it.isNotEmpty() } ?: deliveryPoint

private val OrderItemResponseDto.productName: String
    get() = recipeName.trim().ifEmpty { label?.trim().orEmpty() }

/** Row line 1: product names, first two then "+N" ("Tort fistic · Macarons +2"). */
val OrderResponse.productNamesLine: String
    get() {
        if (items.isEmpty()) return OrderFormat.productCount(itemCount)
        val shown = items.take(2).map { it.productName }
        val rest = items.size - shown.size
        return shown.joinToString(" · ") + if (rest > 0) " +$rest" else ""
    }

/** Row line 2: the same items' quantities in their unit ("2 buc · 1,5 kg"). */
val OrderResponse.quantitiesLine: String?
    get() = items.takeIf { it.isNotEmpty() }?.take(2)?.joinToString(" · ") { formatQty(it.quantity, it.unit) }

/** Detail title: "Tort vis de fistic 1 kg · Macarons ×12 +2". */
val OrderResponse.productsLine: String
    get() {
        if (items.isEmpty()) return OrderFormat.productCount(itemCount)
        val shown = items.take(2).map { item ->
            val qty = if (item.unit == "BUCATI") "×${item.quantity.qtyFormatted()}" else formatQty(item.quantity, item.unit)
            "${item.productName} $qty"
        }
        val rest = items.size - shown.size
        return shown.joinToString(" · ") + if (rest > 0) " +$rest" else ""
    }

/** TalkBack text in the row's order: products, quantities, customer, status. */
val OrderResponse.rowAccessibilityText: String
    get() = listOfNotNull(productNamesLine, quantitiesLine, rowCustomer, deliveryMethodText, statusEnum.displayName).joinToString(", ")

/** Numeric part of the order number ("WOO-11644" → 11644, "CMD-0412" → 412). */
val OrderResponse.orderNumberValue: Long
    get() = orderNumber.filter(Char::isDigit).take(18).toLongOrNull() ?: 0L

/**
 * Newest order first: createdAt desc, then numeric order number desc, then id desc. A total
 * order, so rows never reshuffle between refreshes or load-more pages.
 */
val OrderNewestFirst: Comparator<OrderResponse> = Comparator { a, b ->
    val ta = RoDate.parse(a.createdAt)
    val tb = RoDate.parse(b.createdAt)
    when {
        ta != null && tb != null && ta != tb -> tb.compareTo(ta)
        ta == null && tb == null && a.createdAt != b.createdAt -> b.createdAt.compareTo(a.createdAt)
        a.orderNumberValue != b.orderNumberValue -> b.orderNumberValue.compareTo(a.orderNumberValue)
        else -> b.id.compareTo(a.id)
    }
}

/** Keeps the first occurrence of each id (LazyColumn keys must be unique). */
fun List<OrderResponse>.uniqueById(): List<OrderResponse> {
    val seen = HashSet<String>()
    return filter { seen.add(it.id) }
}

/** Deadline: "Livrare azi, 11:30" / "Ridicare vineri, 17 oct." / "Livrare · fără termen". */
val OrderResponse.dueMeta: String
    get() = dueDate?.let { "$modeTitle ${RoDate.deadline(it)}" } ?: "$modeTitle · fără termen"

val OrderResponse.isOverdue: Boolean
    get() = statusEnum.isOpen && dueDate != null && RoDate.isPastDeadline(dueDate)

object OrderFormat {
    /** Romanian plural: "1 produs", "2 produse", "20 de produse" (B22). */
    fun productCount(n: Int): String {
        if (n == 1) return "1 produs"
        val rest = n % 100
        return if (n >= 20 && (rest == 0 || rest >= 20)) "$n de produse" else "$n produse"
    }
}

// ── Delivery-method labels (short names, 1.37.0) ─────────────────────────

/**
 * The method as shown: a combined "A + B" is split on " + ", each part mapped name → label
 * (admin short name) via [labels], then joined again. Unknown parts keep their name.
 */
fun deliveryMethodLabel(raw: String?, labels: Map<String, String>): String? {
    val text = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    if (labels.isEmpty()) return text
    return text.split(" + ").joinToString(" + ") { part -> part.trim().let { labels[it] ?: it } }
}

/** Shown delivery method for this order (see [deliveryMethodLabel]). */
fun OrderResponse.deliveryMethodLabel(labels: Map<String, String>): String? =
    deliveryMethodLabel(deliveryMethod, labels)

/** [rowMethodLine] with the method's short name. */
fun OrderResponse.rowMethodLine(labels: Map<String, String>): String =
    listOfNotNull(deliveryMethodLabel(labels) ?: modeTitle, dueDate?.let { RoDate.deadline(it) }?.takeIf { it.isNotEmpty() })
        .joinToString(" · ")

// ── Views + day groups (1.37.0) ──────────────────────────────────────────

/** Bucharest day the order was placed. */
fun OrderResponse.placedDay(): LocalDate? = RoDate.parse(createdAt)?.let { RoDate.local(it).toLocalDate() }

/** Pregătiri key day: the delivery day, or [today] when there is no due date. */
fun OrderResponse.deliveryDay(today: LocalDate = RoDate.today()): LocalDate = RoDate.calendarDay(dueDate) ?: today

/** The day an order is grouped under in [view]. */
fun OrderResponse.groupDay(view: OrderView, today: LocalDate = RoDate.today()): LocalDate? = when (view) {
    OrderView.INTRARI -> placedDay()
    OrderView.PREGATIRI -> deliveryDay(today)
}

/**
 * Pregătiri order (same rule as the API): delivery day desc (undated = today), then dueDate desc
 * with undated after dated on the same day, then newest placed first.
 */
fun orderDeliveryFirst(today: LocalDate = RoDate.today()): Comparator<OrderResponse> = Comparator { a, b ->
    val da = a.deliveryDay(today)
    val db = b.deliveryDay(today)
    if (da != db) return@Comparator db.compareTo(da)
    val ta = RoDate.parse(a.dueDate)
    val tb = RoDate.parse(b.dueDate)
    when {
        ta != null && tb == null -> -1
        ta == null && tb != null -> 1
        ta != null && tb != null && ta != tb -> tb.compareTo(ta)
        else -> OrderNewestFirst.compare(a, b)
    }
}

/** Sort for a view: Intrări = newest placed first, Pregătiri = [orderDeliveryFirst]. */
fun List<OrderResponse>.sortedFor(view: OrderView, today: LocalDate = RoDate.today()): List<OrderResponse> =
    sortedWith(if (view == OrderView.INTRARI) OrderNewestFirst else orderDeliveryFirst(today))

/** One list section: a header ("luni, 19 oct", "Mâine", "Azi", "Ieri", "Mai vechi") + its orders. */
data class OrderDayGroup(
    val key: String,
    val title: String,
    /** The section's day; null = "Mai vechi" (everything before yesterday). */
    val day: LocalDate?,
    val orders: List<OrderResponse>,
) {
    fun isTodayOrEarlier(today: LocalDate): Boolean = day == null || !day.isAfter(today)
}

/**
 * Day sections, future → past: each day after tomorrow on its own, then Mâine, Azi, Ieri and
 * ONE "Mai vechi". Orders keep their order inside a section.
 */
fun groupOrdersByDay(
    orders: List<OrderResponse>,
    view: OrderView,
    today: LocalDate = RoDate.today(),
): List<OrderDayGroup> {
    val yesterday = today.minusDays(1)
    val buckets = LinkedHashMap<LocalDate?, MutableList<OrderResponse>>()
    orders.forEach { order ->
        val day = order.groupDay(view, today)?.takeUnless { it.isBefore(yesterday) }
        buckets.getOrPut(day) { mutableListOf() } += order
    }
    return buckets.entries
        .sortedWith(compareByDescending<Map.Entry<LocalDate?, MutableList<OrderResponse>>> { it.key ?: LocalDate.MIN })
        .map { (day, list) ->
            OrderDayGroup(
                key = day?.toString() ?: "older",
                title = dayGroupTitle(day, today),
                day = day,
                orders = list,
            )
        }
}

private val roShortMonths = listOf("ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sept", "oct", "nov", "dec")
private val roWeekdays = listOf("luni", "marți", "miercuri", "joi", "vineri", "sâmbătă", "duminică")

/** "Azi" / "Mâine" / "Ieri" / "Mai vechi" / "luni, 19 oct" (+ year when not this year). */
fun dayGroupTitle(day: LocalDate?, today: LocalDate = RoDate.today()): String = when (day) {
    null -> "Mai vechi"
    today -> "Azi"
    today.plusDays(1) -> "Mâine"
    today.minusDays(1) -> "Ieri"
    else -> buildString {
        append(roWeekdays[day.dayOfWeek.value - 1]).append(", ").append(day.dayOfMonth).append(' ')
            .append(roShortMonths[day.monthValue - 1])
        if (day.year != today.year) append(' ').append(day.year)
    }
}

/**
 * Index in a LazyColumn of "header + rows" sections of the header to focus: "Azi", else the
 * nearest section after it (Ieri / Mai vechi); null when every section is in the future.
 */
fun todayHeaderIndex(groups: List<OrderDayGroup>, today: LocalDate = RoDate.today()): Int? {
    var index = 0
    groups.forEach { group ->
        if (group.isTodayOrEarlier(today)) return index
        index += 1 + group.orders.size
    }
    return null
}
