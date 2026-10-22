package com.horae.app.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.horae.app.domain.model.FulfillmentType
import com.horae.app.domain.model.OrderStatus
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.TaskStatus
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.SchemePickerGrid
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Living reference of the slice-A design system: every shared component and formatter
 * on one scrollable screen, in the active scheme. Debug builds open it with
 *   adb shell am start -n <pkg>/com.horae.app.MainActivity --ez horae.gallery true
 * (see MainActivity). Not reachable from the app UI.
 */
@Composable
fun ComponentGallery() {
    val s = HoraeTheme.scheme
    var segment by remember { mutableStateOf(FulfillmentType.DELIVERY) }
    var location by remember { mutableStateOf<String?>("Toate") }
    var allergens by remember { mutableStateOf(setOf("Gluten")) }
    var query by remember { mutableStateOf("") }
    var product by remember { mutableStateOf<String?>(null) }
    var sheetOpen by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var qtyText by remember { mutableStateOf("1,5") }
    val scope = rememberCoroutineScope()
    val products = listOf("Pâine albă", "Tartă cu fructe", "Ecler vanilie", "Choux mari", "Macarons", "Savarină", "Amandină", "Cozonac", "Pandișpan")

    AccentGradientBackground {
        HoraeRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; delay(800); refreshing = false } },
        ) {
            LazyColumn(
                Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    HScreenTitle("Componente", eyebrow = RoDate.longDay(RoDate.today())) {
                        HIconButton(Icons.Filled.Search, "Caută", {})
                        HIconButton(Icons.Filled.Notifications, "Notificări", {}, badge = true)
                    }
                }
                item { HSectionHeader("Schemă de culori") }
                item { SchemePickerGrid() }
                item { HSectionHeader("Chips", actionLabel = "Vezi tot", onAction = {}) }
                item {
                    ChoiceChips(
                        options = listOf("Toate", "Laborator", "Magazin Centru", "Depozit"),
                        selected = location, onSelect = { location = it }, label = { it },
                    )
                }
                item {
                    MultiChoiceChips(
                        options = listOf("Gluten", "Ouă", "Lapte (lactoză)", "Fructe cu coajă (nuci)", "Susan"),
                        selected = allergens,
                        onToggle = { a -> allergens = if (a in allergens) allergens - a else allergens + a },
                        label = { it },
                    )
                }
                item {
                    HSegmentedControl(
                        options = FulfillmentType.entries, selected = segment, onSelect = { segment = it },
                        label = { it.displayName },
                        icon = { if (it == FulfillmentType.DELIVERY) Icons.Filled.LocalShipping else Icons.Filled.Storefront },
                    )
                }
                item { HSectionHeader("Statusuri") }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TaskStatus.entries.forEach { HStatusChip(it) }
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(OrderStatus.NOUA, OrderStatus.IN_PREGATIRE, OrderStatus.LIVRATA, OrderStatus.ANULATA).forEach { HStatusChip(it) }
                        HStatusChip("Stoc scăzut", StatusKind.WARNING)
                    }
                }
                item { HSectionHeader("Butoane") }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        HIconButton(Icons.Filled.Edit, "Editează", {})
                        HIconButton(Icons.Filled.Delete, "Șterge", {}, variant = HIconButtonVariant.DESTRUCTIVE)
                        HIconButton(Icons.Filled.Search, "Caută", {}, variant = HIconButtonVariant.PROMINENT)
                        Spacer(Modifier.weight(1f))
                        HFab("Comandă nouă", {})
                    }
                }
                item { HPrimaryButton("Salvează", {}) }
                item { HPrimaryButton("Autentificare", {}, enabled = false) }
                item { HSecondaryButton("Anulează", {}) }
                item { HSectionHeader("Câmpuri") }
                item { HSearchField(query, { query = it }, placeholder = "Caută comenzi") }
                item {
                    HPickerField("Produs", product, onClick = { sheetOpen = true }, placeholder = "Alege produsul")
                }
                item {
                    androidx.compose.material3.OutlinedTextField(
                        value = qtyText,
                        onValueChange = { qtyText = RoFormat.sanitizeDecimalInput(it) },
                        label = { Text("Cantitate (kg)") },
                        supportingText = { Text("Citit: ${RoFormat.parseDecimal(qtyText)?.let { formatQty(it, "KILOGRAME") } ?: "–"}") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item { HSectionHeader("Formatare") }
                item {
                    HCard {
                        val lines = listOf(
                            "Stoc" to formatQty(34.44, "KILOGRAME"),
                            "Rest după scădere" to formatQty(1e-12, "KILOGRAME"),
                            "Preț" to RoFormat.ronPer(41.32, "KILOGRAME"),
                            "Marjă" to RoFormat.percent(12.5),
                            "Creat la" to RoDate.shortDateTime("2026-10-17T09:08:00.000Z"),
                            "Termen (doar zi)" to RoDate.shortDateTime("2026-10-17T00:00:00.000Z"),
                            "Săptămâna" to RoDate.weekRange(RoDate.weekDays(RoDate.today())),
                        )
                        lines.forEach { (k, v) ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                Text(k, style = AppFont.body(14f), color = s.muted, modifier = Modifier.weight(1f))
                                Text(v, style = AppFont.body(14f, FontWeight.SemiBold), color = s.ink)
                            }
                        }
                    }
                }
                item {
                    HCard(onClick = {}) {
                        Text("1.248", style = AppFont.display(32f), color = s.ink)
                        Text("Comenzi azi", style = AppFont.body(13f), color = s.muted)
                    }
                }
                item { Box(Modifier.height(40.dp)) }
            }
        }
    }

    if (sheetOpen) {
        ChoiceListSheet(
            title = "Alege produsul",
            items = products,
            selected = product,
            itemLabel = { it },
            itemSubtitle = { "Produs finit" },
            onSelect = { product = it },
            onDismiss = { sheetOpen = false },
        )
    }
}
