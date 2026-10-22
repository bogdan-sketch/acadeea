package com.horae.app.ui.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.activity.compose.BackHandler
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.ApiErrors
import com.horae.app.data.remote.dto.CreateOrderItemRequest
import com.horae.app.data.remote.dto.CreateOrderRequest
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.OrderRepository
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.domain.model.UnitType
import com.horae.app.ui.common.ChoiceChips
import com.horae.app.ui.common.ChoiceListSheet
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HIconButtonVariant
import com.horae.app.ui.common.HPrimaryButton
import com.horae.app.ui.common.HSecondaryButton
import com.horae.app.ui.common.HSectionHeader
import com.horae.app.ui.common.HSegmentedControl
import com.horae.app.ui.common.RoDate
import com.horae.app.ui.common.RoFormat
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import timber.log.Timber
import java.time.LocalDate
import javax.inject.Inject

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

/** One product line of the draft; [quantityText] is what the user typed ("1,5"). */
data class DraftOrderItem(
    val recipe: RecipeListItemDto,
    val quantityText: String = "1",
) {
    val quantity: Double? get() = RoFormat.parseDecimal(quantityText)?.takeIf { it > 0 }
}

enum class FulfillmentMode(val label: String) { DELIVERY("Livrare"), PICKUP("Ridicare") }

@HiltViewModel
class OrderCreateViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val recipeRepository: RecipeRepository,
    private val locationRepository: LocationRepository,
) : ViewModel() {

    var recipes by mutableStateOf<List<RecipeListItemDto>>(emptyList())
        private set
    var locations by mutableStateOf<List<LocationResponse>>(emptyList())
        private set
    var isSubmitting by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    var mode by mutableStateOf(FulfillmentMode.DELIVERY)
    var pickupLocationId by mutableStateOf<String?>(null)
    var deliveryPoint by mutableStateOf("")
    var deliveryAddress by mutableStateOf("")
    var notes by mutableStateOf("")
    var dueDay by mutableStateOf<LocalDate?>(null)
    var items by mutableStateOf<List<DraftOrderItem>>(emptyList())
        private set

    init {
        viewModelScope.launch {
            runCatching { recipeRepository.getRecipes(type = "FINAL", limit = 100).data }
                .onSuccess { list -> recipes = list.filter { it.type == "FINAL" && !it.isArchived }.sortedBy { it.name.lowercase() } }
                .onFailure { e ->
                    Timber.e(e, "OrderCreateViewModel: recipes failed")
                    error = ApiErrors.userMessage(e, "Nu am putut încărca produsele.")
                }
        }
        viewModelScope.launch {
            runCatching { locationRepository.getLocations() }
                .onSuccess { list -> locations = list.filter { it.isActive } }
                .onFailure { Timber.w(it, "OrderCreateViewModel: locations failed") }
        }
    }

    val isDirty: Boolean
        get() = deliveryPoint.isNotBlank() || deliveryAddress.isNotBlank() || notes.isNotBlank() ||
            dueDay != null || mode == FulfillmentMode.PICKUP || items.isNotEmpty()

    /** Delivery needs a delivery point; pickup needs a location. Every line needs a quantity. */
    val canSubmit: Boolean
        get() = !isSubmitting && items.isNotEmpty() && items.all { it.quantity != null } &&
            if (mode == FulfillmentMode.PICKUP) pickupLocationId != null else deliveryPoint.isNotBlank()

    fun addItem(recipe: RecipeListItemDto) {
        if (items.any { it.recipe.id == recipe.id }) return
        items = items + DraftOrderItem(recipe)
    }

    fun setQuantity(recipeId: String, text: String) {
        items = items.map { if (it.recipe.id == recipeId) it.copy(quantityText = RoFormat.sanitizeDecimalInput(text)) else it }
    }

    fun removeItem(recipeId: String) {
        items = items.filterNot { it.recipe.id == recipeId }
    }

    fun clearError() {
        error = null
    }

    fun submit(onSuccess: () -> Unit) {
        if (!canSubmit) return
        val pickup = mode == FulfillmentMode.PICKUP
        val point = deliveryPoint.trim()
        val pickupName = locations.firstOrNull { it.id == pickupLocationId }?.name
        val request = CreateOrderRequest(
            // The API requires a point; for pickup it falls back to the location name.
            deliveryPoint = point.ifEmpty { pickupName ?: "Ridicare" },
            fulfillmentType = if (pickup) "PICKUP" else null,
            pickupLocationId = if (pickup) pickupLocationId else null,
            deliveryAddress = if (pickup) null else deliveryAddress.trim().ifBlank { null },
            notes = notes.trim().ifBlank { null },
            // Date-only deadline (00:00 UTC of the day) — shown without a time everywhere.
            dueDate = dueDay?.let(RoDate::dateOnlyInstant),
            items = items.map { CreateOrderItemRequest(recipeId = it.recipe.id, quantity = it.quantity!!, unit = it.recipe.unit) },
        )
        viewModelScope.launch {
            isSubmitting = true
            try {
                orderRepository.createOrder(request)
                onSuccess()
            } catch (e: Exception) {
                Timber.e(e, "OrderCreateViewModel: create failed")
                error = ApiErrors.userMessage(e, "Comanda nu a putut fi creată. Încearcă din nou.")
            } finally {
                isSubmitting = false
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Comandă nouă (full screen, iOS `CreateOrderSheet`): Livrare | Ridicare, pickup location
 * chips, delivery point/address or pickup name, optional date-only deadline, products from a
 * searchable list sheet (FINAL recipes) with a quantity each, notes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderCreateScreen(
    navController: NavController,
    viewModel: OrderCreateViewModel = hiltViewModel(),
) {
    val s = HoraeTheme.scheme
    var showProductSheet by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var confirmDiscard by remember { mutableStateOf(false) }

    fun close() {
        if (viewModel.isDirty) confirmDiscard = true else navController.popBackStack()
    }
    BackHandler(enabled = viewModel.isDirty && !viewModel.isSubmitting) { confirmDiscard = true }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        containerColor = s.background,
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0),
                title = { Text("Comandă nouă", style = AppFont.title(22f), color = s.ink) },
                navigationIcon = {
                    HIconButton(Icons.Filled.Close, "Renunță", ::close, variant = HIconButtonVariant.PLAIN)
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = s.background),
            )
        },
        bottomBar = {
            HPrimaryButton(
                text = "Creează comanda",
                onClick = {
                    viewModel.submit {
                        navController.previousBackStackEntry?.savedStateHandle?.set(ORDERS_REFRESH_KEY, true)
                        navController.popBackStack()
                    }
                },
                enabled = viewModel.canSubmit,
                loading = viewModel.isSubmitting,
                modifier = Modifier.fillMaxWidth().imePadding().padding(16.dp),
            )
        },
    ) { inner ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(inner)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // ── Predare ──
            HSectionHeader("Predare")
            HCard(Modifier.fillMaxWidth(), padding = PaddingValues(14.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    HSegmentedControl(
                        options = FulfillmentMode.entries,
                        selected = viewModel.mode,
                        onSelect = { viewModel.mode = it },
                        label = { it.label },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (viewModel.mode == FulfillmentMode.PICKUP) {
                        Text("Locație de ridicare", style = AppFont.body(13f, FontWeight.SemiBold), color = s.muted)
                        if (viewModel.locations.isEmpty()) {
                            Text("Nicio locație activă", style = AppFont.body(14f), color = s.muted)
                        } else {
                            ChoiceChips(
                                options = viewModel.locations,
                                selected = viewModel.locations.firstOrNull { it.id == viewModel.pickupLocationId },
                                onSelect = { loc ->
                                    viewModel.pickupLocationId = if (viewModel.pickupLocationId == loc.id) null else loc.id
                                },
                                label = { it.name },
                                wrap = true,
                            )
                        }
                        FormField(viewModel.deliveryPoint, { viewModel.deliveryPoint = it }, "Client / nume la ridicare")
                        Text("Clientul ridică produsele din locația aleasă.", style = AppFont.body(12f), color = s.muted)
                    } else {
                        FormField(viewModel.deliveryPoint, { viewModel.deliveryPoint = it }, "Punct de livrare *")
                        FormField(viewModel.deliveryAddress, { viewModel.deliveryAddress = it }, "Adresă (opțional)")
                    }
                    // Termen: date-only, Monday-first ro picker (locale forced app-wide).
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (viewModel.mode == FulfillmentMode.PICKUP) "Termen ridicare" else "Termen livrare",
                                style = AppFont.body(13f, FontWeight.SemiBold),
                                color = s.muted,
                            )
                            Text(
                                viewModel.dueDay?.let(RoDate::longDay) ?: "Fără termen",
                                style = AppFont.body(15f, FontWeight.SemiBold),
                                color = if (viewModel.dueDay == null) s.muted else s.ink,
                            )
                        }
                        if (viewModel.dueDay != null) {
                            HIconButton(Icons.Filled.Close, "Șterge termenul", { viewModel.dueDay = null }, variant = HIconButtonVariant.PLAIN)
                        }
                        HIconButton(Icons.Filled.Event, "Alege data", { showDatePicker = true })
                    }
                }
            }

            // ── Produse ──
            HSectionHeader("Produse", modifier = Modifier.padding(top = 6.dp))
            viewModel.items.forEach { item ->
                HCard(Modifier.fillMaxWidth(), padding = PaddingValues(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            item.recipe.name,
                            style = AppFont.body(15f, FontWeight.Bold),
                            color = s.ink,
                            modifier = Modifier.weight(1f),
                        )
                        HIconButton(
                            Icons.Filled.DeleteOutline,
                            "Șterge ${item.recipe.name}",
                            { viewModel.removeItem(item.recipe.id) },
                            variant = HIconButtonVariant.DESTRUCTIVE,
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = item.quantityText,
                            onValueChange = { viewModel.setQuantity(item.recipe.id, it) },
                            label = { Text("Cantitate") },
                            singleLine = true,
                            isError = item.quantity == null,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.width(140.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            UnitType.fromString(item.recipe.unit)?.abbreviation ?: item.recipe.unit,
                            style = AppFont.body(15f, FontWeight.SemiBold),
                            color = s.muted,
                        )
                    }
                }
            }
            HSecondaryButton(
                text = "Adaugă produs",
                onClick = { showProductSheet = true },
                icon = Icons.Filled.Add,
                accentText = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (viewModel.items.isEmpty()) {
                Text("Adaugă cel puțin un produs", style = AppFont.body(12f), color = s.muted, modifier = Modifier.padding(horizontal = 4.dp))
            }

            // ── Note ──
            HSectionHeader("Note", modifier = Modifier.padding(top = 6.dp))
            OutlinedTextField(
                value = viewModel.notes,
                onValueChange = { viewModel.notes = it },
                placeholder = { Text("Note (opțional)") },
                minLines = 2,
                maxLines = 6,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    if (showProductSheet) {
        val taken = viewModel.items.map { it.recipe.id }.toSet()
        ChoiceListSheet(
            title = "Alege produsul",
            items = viewModel.recipes.filterNot { it.id in taken },
            selected = null,
            itemLabel = { it.name },
            itemSubtitle = { r -> listOfNotNull(r.category, UnitType.fromString(r.unit)?.abbreviation ?: r.unit).joinToString(" · ") },
            itemKey = { it.id },
            searchable = true,
            searchPlaceholder = "Caută produsul",
            emptyText = if (viewModel.recipes.isEmpty()) "Se încarcă produsele…" else "Niciun produs găsit",
            onSelect = { it?.let(viewModel::addItem) },
            onDismiss = { showProductSheet = false },
        )
    }

    if (showDatePicker) {
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = RoDate.toPickerMillis(viewModel.dueDay ?: RoDate.today().plusDays(1)),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { viewModel.dueDay = RoDate.fromPickerMillis(it) }
                    showDatePicker = false
                }) { Text("Gata") }
            },
            dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("Renunță") } },
        ) { DatePicker(state = pickerState) }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Renunți la comandă?") },
            text = { Text("Ce ai completat se pierde.") },
            confirmButton = {
                TextButton(onClick = { confirmDiscard = false; navController.popBackStack() }) { Text("Renunță") }
            },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text("Continuă") } },
        )
    }

    viewModel.error?.let { ErrorDialog(message = it, onDismiss = viewModel::clearError) }
}

@Composable
private fun FormField(value: String, onValueChange: (String) -> Unit, label: String) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth(),
    )
}
