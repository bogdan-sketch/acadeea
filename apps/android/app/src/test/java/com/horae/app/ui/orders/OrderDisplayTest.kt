package com.horae.app.ui.orders

import com.google.common.truth.Truth.assertThat
import com.horae.app.domain.model.OrderStatus
import com.horae.app.testutil.Fixtures.item
import com.horae.app.testutil.Fixtures.order
import com.horae.app.ui.common.RoDate
import org.junit.Test

/** Orders are shown by WHAT and WHO — never by the WooCommerce number. */
class OrderDisplayTest {

    // ── ordering + dedupe ────────────────────────────────────────────────

    @Test fun `newest createdAt first`() {
        val list = listOf(
            order("a", createdAt = "2026-10-16T08:00:00Z"),
            order("b", createdAt = "2026-10-17T08:00:00Z"),
            order("c", createdAt = "2026-10-15T08:00:00Z"),
        ).sortedWith(OrderNewestFirst)
        assertThat(list.map { it.id }).containsExactly("b", "a", "c").inOrder()
    }

    @Test fun `same instant falls back to numeric order number, not string order`() {
        val list = listOf(
            order("x", orderNumber = "WOO-9999"),
            order("y", orderNumber = "WOO-11644"),
            order("z", orderNumber = "WOO-10000"),
        ).sortedWith(OrderNewestFirst)
        assertThat(list.map { it.orderNumber }).containsExactly("WOO-11644", "WOO-10000", "WOO-9999").inOrder()
    }

    @Test fun `same instant written differently still compares equal`() {
        val list = listOf(
            order("p", orderNumber = "CMD-1", createdAt = "2026-10-17T08:00:00Z"),
            order("q", orderNumber = "CMD-2", createdAt = "2026-10-17T08:00:00.000Z"),
        ).sortedWith(OrderNewestFirst)
        assertThat(list.map { it.id }).containsExactly("q", "p").inOrder()
    }

    @Test fun `same instant and number falls back to id desc`() {
        val list = listOf(order("a1", orderNumber = "X"), order("a3", orderNumber = "X"), order("a2", orderNumber = "X"))
            .sortedWith(OrderNewestFirst)
        assertThat(list.map { it.id }).containsExactly("a3", "a2", "a1").inOrder()
    }

    @Test fun `sorting is stable across shuffles (total order)`() {
        val base = (1..30).map { i ->
            order("id$i", orderNumber = "WOO-${1000 + i % 7}", createdAt = "2026-10-${10 + i % 5}T08:00:00Z")
        }
        val expected = base.sortedWith(OrderNewestFirst).map { it.id }
        repeat(5) { seed ->
            assertThat(base.shuffled(java.util.Random(seed.toLong())).sortedWith(OrderNewestFirst).map { it.id })
                .isEqualTo(expected)
        }
    }

    @Test fun `orderNumberValue reads digits only`() {
        assertThat(order("1", orderNumber = "WOO-11644").orderNumberValue).isEqualTo(11644L)
        assertThat(order("1", orderNumber = "CMD-0412").orderNumberValue).isEqualTo(412L)
        assertThat(order("1", orderNumber = "fără").orderNumberValue).isEqualTo(0L)
    }

    @Test fun `uniqueById keeps the first occurrence`() {
        val a1 = order("a", customerName = "Prima")
        val a2 = order("a", customerName = "Dublura")
        val list = listOf(a1, order("b"), a2).uniqueById()
        assertThat(list.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(list.first().customerName).isEqualTo("Prima")
    }

    // ── products / quantities lines ──────────────────────────────────────

    private val fourItems = listOf(
        item("Tort vis de fistic", 1.0, "KILOGRAME"),
        item("Macarons", 12.0, "BUCATI"),
        item("Ecler", 3.0),
        item("Savarină", 2.0),
    )

    @Test fun `detail products line shows two items with quantities then plus N`() {
        assertThat(order("o", items = fourItems).productsLine).isEqualTo("Tort vis de fistic 1 kg · Macarons ×12 +2")
    }

    @Test fun `products line scales metric quantities`() {
        val o = order("o", items = listOf(item("Cremă", 1500.0, "GRAME")))
        assertThat(o.productsLine).isEqualTo("Cremă 1,5 kg")
    }

    @Test fun `row lines show names, then quantities in their own unit`() {
        val o = order("o", items = fourItems)
        assertThat(o.productNamesLine).isEqualTo("Tort vis de fistic · Macarons +2")
        assertThat(o.quantitiesLine).isEqualTo("1 kg · 12 buc")
    }

    @Test fun `exactly two items have no plus suffix`() {
        val o = order("o", items = fourItems.take(2))
        assertThat(o.productNamesLine).isEqualTo("Tort vis de fistic · Macarons")
        assertThat(o.productsLine).doesNotContain("+")
    }

    @Test fun `unmapped site product uses its label`() {
        val o = order("o", items = listOf(item("", 2.0, label = "Tort personalizat")))
        assertThat(o.productNamesLine).isEqualTo("Tort personalizat")
    }

    @Test fun `no items falls back to a Romanian product count`() {
        assertThat(order("o", itemCount = 1).productNamesLine).isEqualTo("1 produs")
        assertThat(order("o", itemCount = 3).productsLine).isEqualTo("3 produse")
        assertThat(order("o", itemCount = 0).quantitiesLine).isNull()
    }

    @Test fun `Romanian plural uses de from 20`() {
        assertThat(OrderFormat.productCount(0)).isEqualTo("0 produse")
        assertThat(OrderFormat.productCount(19)).isEqualTo("19 produse")
        assertThat(OrderFormat.productCount(20)).isEqualTo("20 de produse")
        assertThat(OrderFormat.productCount(101)).isEqualTo("101 produse")
        assertThat(OrderFormat.productCount(119)).isEqualTo("119 produse")
        assertThat(OrderFormat.productCount(120)).isEqualTo("120 de produse")
        assertThat(OrderFormat.productCount(200)).isEqualTo("200 de produse")
    }

    // ── customer ─────────────────────────────────────────────────────────

    @Test fun `customer first, else a real delivery point`() {
        assertThat(order("o", customerName = "  Maria Ionescu ").rowCustomer).isEqualTo("Maria Ionescu")
        assertThat(order("o", customerName = null, deliveryPoint = "Cafenea Unirii").rowCustomer).isEqualTo("Cafenea Unirii")
        assertThat(order("o", customerName = " ", deliveryPoint = "Cafenea Unirii").displayCustomer).isEqualTo("Cafenea Unirii")
    }

    @Test fun `WooCommerce placeholder is not a delivery point`() {
        val o = order("o", customerName = null, deliveryPoint = "WooCommerce")
        assertThat(o.meaningfulDeliveryPoint).isNull()
        assertThat(o.rowCustomer).isNull()
        assertThat(order("o", deliveryPoint = "woocommerce").meaningfulDeliveryPoint).isNull()
        assertThat(order("o", deliveryPoint = "  ").meaningfulDeliveryPoint).isNull()
    }

    // ── no "WOO-" anywhere ───────────────────────────────────────────────

    @Test fun `site order never shows WOO prefix`() {
        val o = order("o", orderNumber = "WOO-11644", items = fourItems, customerName = "Maria", externalStatus = "processing")
        assertThat(o.wooNumber).isEqualTo("11644")
        assertThat(o.displayNumber).isEqualTo("11644")
        assertThat(o.isFromSite).isTrue()
        listOf(o.productNamesLine, o.quantitiesLine, o.rowCustomer, o.productsLine, o.displayCustomer,
            o.rowAccessibilityText, o.displayNumber, o.dueMeta).forEach { text ->
            assertThat(text.orEmpty().uppercase()).doesNotContain("WOO")
        }
        assertThat(order("o", orderNumber = "woo-5").displayNumber).isEqualTo("5")
    }

    @Test fun `manual order keeps its number and is not from site`() {
        val o = order("o", orderNumber = "CMD-0412")
        assertThat(o.wooNumber).isNull()
        assertThat(o.displayNumber).isEqualTo("CMD-0412")
        assertThat(o.isFromSite).isFalse()
    }

    @Test fun `accessibility text follows the row order`() {
        val o = order("o", items = fourItems.take(1), customerName = "Maria", status = "PREGATITA")
        assertThat(o.rowAccessibilityText).isEqualTo("Tort vis de fistic, 1 kg, Maria, Pregătită")
    }

    // ── status / mode / deadline ─────────────────────────────────────────

    @Test fun `unknown status falls back to Noua`() {
        assertThat(order("o", status = "CEVA").statusEnum).isEqualTo(OrderStatus.NOUA)
        assertThat(order("o", status = "LIVRATA").statusEnum).isEqualTo(OrderStatus.LIVRATA)
    }

    @Test fun `mode titles`() {
        assertThat(order("o").modeTitle).isEqualTo("Livrare")
        assertThat(order("o", fulfillmentType = "PICKUP").modeTitle).isEqualTo("Ridicare")
        assertThat(order("o", fulfillmentType = "PICKUP").isPickup).isTrue()
    }

    @Test fun `due meta`() {
        val today = RoDate.isoDay(RoDate.today())
        assertThat(order("o", dueDate = today).dueMeta).isEqualTo("Livrare azi")
        assertThat(order("o", fulfillmentType = "PICKUP", dueDate = "2020-03-01").dueMeta).isEqualTo("Ridicare 1 mar. 2020")
        assertThat(order("o").dueMeta).isEqualTo("Livrare · fără termen")
    }

    @Test fun `overdue only while open`() {
        assertThat(order("o", dueDate = "2020-03-01").isOverdue).isTrue()
        assertThat(order("o", dueDate = "2020-03-01", status = "LIVRATA").isOverdue).isFalse()
        assertThat(order("o", dueDate = "2020-03-01", status = "ANULATA").isOverdue).isFalse()
        assertThat(order("o", dueDate = null).isOverdue).isFalse()
        assertThat(order("o", dueDate = "2999-01-01").isOverdue).isFalse()
    }

    // ── 1.37.0: method short names, views, day groups ───────────────────

    @Test fun `combined methods map each part to its short name`() {
        val labels = mapOf("Ridicare Napoca 15" to "Napoca", "Livrare în Cluj-Napoca" to "Cluj")
        assertThat(deliveryMethodLabel("Ridicare Napoca 15 + Livrare în Cluj-Napoca", labels)).isEqualTo("Napoca + Cluj")
        assertThat(deliveryMethodLabel("Altceva", labels)).isEqualTo("Altceva")
        assertThat(deliveryMethodLabel("  ", labels)).isNull()
    }

    @Test fun `day groups go future to past with one Mai vechi`() {
        val today = java.time.LocalDate.of(2026, 10, 18) // duminică
        fun due(d: Long) = RoDate.isoDay(today.plusDays(d))
        val orders = listOf(
            order("f3", dueDate = due(3)), order("f2", dueDate = due(2)), order("t1", dueDate = due(1)),
            order("t0", dueDate = due(0)), order("nodate"), order("y", dueDate = due(-1)),
            order("o5", dueDate = due(-5)), order("o9", dueDate = due(-9)),
        ).sortedFor(OrderView.PREGATIRI, today)
        val groups = groupOrdersByDay(orders, OrderView.PREGATIRI, today)
        assertThat(groups.map { it.title })
            .containsExactly("miercuri, 21 oct", "marți, 20 oct", "Mâine", "Azi", "Ieri", "Mai vechi").inOrder()
        assertThat(groups.first { it.title == "Azi" }.orders.map { it.id }).containsExactly("t0", "nodate").inOrder()
        assertThat(groups.last().orders.map { it.id }).containsExactly("o5", "o9").inOrder()
        // header index of "Azi": 3 future headers + their 3 rows
        assertThat(todayHeaderIndex(groups, today)).isEqualTo(6)
    }

    @Test fun `intrari groups by the day placed`() {
        val today = java.time.LocalDate.of(2026, 10, 18)
        val groups = groupOrdersByDay(
            listOf(order("a", createdAt = "2026-10-18T09:00:00Z"), order("b", createdAt = "2026-10-17T21:30:00Z")),
            OrderView.INTRARI, today,
        )
        // 21:30Z on the 17th is 00:30 on the 18th in Bucharest
        assertThat(groups.map { it.title }).containsExactly("Azi")
        assertThat(dayGroupTitle(java.time.LocalDate.of(2027, 1, 4), today)).isEqualTo("luni, 4 ian 2027")
    }
}
