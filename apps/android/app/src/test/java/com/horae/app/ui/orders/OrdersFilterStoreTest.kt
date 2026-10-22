package com.horae.app.ui.orders

import com.google.common.truth.Truth.assertThat
import com.horae.app.data.remote.dto.DeliveryMethodDto
import com.horae.app.domain.model.OrderStatus
import org.junit.Test

class OrdersFilterStoreTest {

    private val napoca = DeliveryMethodDto(name = "Ridicare la Acadeea Napoca", label = "Acadeea Napoca", count = 3)
    private val centru = DeliveryMethodDto(name = "Ridicare din Centru", label = "Centru", count = 1)
    private val cluj = DeliveryMethodDto(name = "Livrare în Cluj-Napoca", kind = "DELIVERY", count = 4)
    private val floresti = DeliveryMethodDto(name = "Livrare Florești", kind = "DELIVERY", kindSet = true, count = 2)

    @Test fun `chips - Toate, pickup methods, Livrare, no delivery methods when only one`() {
        val chips = deliveryChips(listOf(napoca, cluj, centru))
        assertThat(chips.map { it.label }).containsExactly("Toate", "Acadeea Napoca", "Centru", "Livrare").inOrder()
        assertThat(chips.map { it.filter }).containsExactly(
            DeliveryFilter.All,
            DeliveryFilter.Method("Ridicare la Acadeea Napoca"),
            DeliveryFilter.Method("Ridicare din Centru"),
            DeliveryFilter.Delivery,
        ).inOrder()
        assertThat(chips.first { it.filter == DeliveryFilter.Delivery }.count).isEqualTo(4)
    }

    @Test fun `chips - delivery methods listed after Livrare when 2+, Livrare counts their sum`() {
        val chips = deliveryChips(listOf(cluj, napoca, floresti))
        assertThat(chips.map { it.label })
            .containsExactly("Toate", "Acadeea Napoca", "Livrare", "Livrare în Cluj-Napoca", "Livrare Florești").inOrder()
        assertThat(chips.first { it.filter == DeliveryFilter.Delivery }.count).isEqualTo(6)
    }

    @Test fun `filter query values - method sends name, Livrare sends kind, Toate neither`() {
        assertThat(DeliveryFilter.All.methodName).isNull()
        assertThat(DeliveryFilter.All.kind).isNull()
        assertThat(DeliveryFilter.Delivery.methodName).isNull()
        assertThat(DeliveryFilter.Delivery.kind).isEqualTo("DELIVERY")
        assertThat(DeliveryFilter.Method("Ridicare din Centru").methodName).isEqualTo("Ridicare din Centru")
        assertThat(DeliveryFilter.Method("Ridicare din Centru").kind).isNull()
    }

    @Test fun `tapping the selected chip goes back to Toate, another chip switches`() {
        val m = DeliveryFilter.Method("Ridicare din Centru")
        assertThat(DeliveryFilter.All.toggled(m)).isEqualTo(m)
        assertThat(m.toggled(m)).isEqualTo(DeliveryFilter.All)
        assertThat(m.toggled(DeliveryFilter.Delivery)).isEqualTo(DeliveryFilter.Delivery)
        assertThat(DeliveryFilter.Delivery.toggled(DeliveryFilter.Delivery)).isEqualTo(DeliveryFilter.All)
        assertThat(DeliveryFilter.All.toggled(DeliveryFilter.All)).isEqualTo(DeliveryFilter.All)
    }

    @Test fun `a vanished method falls back to Toate`() {
        val list = listOf(napoca, cluj)
        assertThat(DeliveryFilter.Method("Ridicare din Centru").validIn(list)).isEqualTo(DeliveryFilter.All)
        assertThat(DeliveryFilter.Method(napoca.name).validIn(list)).isEqualTo(DeliveryFilter.Method(napoca.name))
        assertThat(DeliveryFilter.Delivery.validIn(list)).isEqualTo(DeliveryFilter.Delivery)
    }

    @Test fun `Pregatiri is the first view and keeps the old livrari API value`() {
        assertThat(OrderView.entries.first()).isEqualTo(OrderView.PREGATIRI)
        assertThat(OrderView.PREGATIRI.label).isEqualTo("Pregătiri")
        assertThat(OrderView.PREGATIRI.apiValue).isEqualTo("livrari")
        assertThat(OrderView.INTRARI.apiValue).isEqualTo("intrari")
    }

    @Test fun `status selection - default Noua, never empty, Toate toggles all and back`() {
        assertThat(DEFAULT_ORDER_STATUSES).containsExactly(OrderStatus.NOUA)
        val two = DEFAULT_ORDER_STATUSES.toggledStatus(OrderStatus.PREGATITA)
        assertThat(two).containsExactly(OrderStatus.NOUA, OrderStatus.PREGATITA)
        assertThat(setOf(OrderStatus.LIVRATA).toggledStatus(OrderStatus.LIVRATA)).isEqualTo(DEFAULT_ORDER_STATUSES)
        assertThat(two.toggledAll()).containsExactlyElementsIn(OrderStatus.entries)
        assertThat(OrderStatus.entries.toSet().toggledAll()).isEqualTo(DEFAULT_ORDER_STATUSES)
    }

    @Test fun `status query values follow the enum order and the hint reads Romanian`() {
        val sel = setOf(OrderStatus.PREGATITA, OrderStatus.NOUA)
        assertThat(sel.apiValues()).containsExactly("NOUA", "PREGATITA").inOrder()
        assertThat(DEFAULT_ORDER_STATUSES.hint()).isEqualTo("Doar: Nouă")
        assertThat(sel.hint()).isEqualTo("Nouă, Pregătită")
        assertThat(OrderStatus.entries.toSet().hint()).isEqualTo("Toate statusurile")
    }

    @Test fun `store - status filter shared, customized flag, toggles`() {
        val store = OrdersFilterStore(io.mockk.mockk(relaxed = true), io.mockk.mockk(relaxed = true))
        assertThat(store.statusesCustomized).isFalse()
        store.toggleStatus(OrderStatus.IN_TRANZIT)
        assertThat(store.statuses.value).containsExactly(OrderStatus.NOUA, OrderStatus.IN_TRANZIT)
        assertThat(store.statusesCustomized).isTrue()
        store.toggleStatus(OrderStatus.IN_TRANZIT)
        assertThat(store.statusesCustomized).isFalse()
        store.setStatuses(emptySet())
        assertThat(store.statuses.value).isEqualTo(DEFAULT_ORDER_STATUSES)
    }
}
