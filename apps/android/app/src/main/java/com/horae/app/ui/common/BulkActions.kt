package com.horae.app.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import com.horae.app.data.repository.LocationRepository
import com.horae.app.data.repository.RecipeRepository
import com.horae.app.data.repository.StockRepository
import com.horae.app.data.repository.UserRepository
import com.horae.app.domain.model.OrderStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/**
 * Bulk ACTIONS (besides delete) for the select mode — `POST /<resource>/bulk-action`
 * `{ ids, action, params }`. Each list screen passes its catalog entry
 * ([BulkActionCatalog]) to [BulkSelectBottomBar]; the "Acțiuni" menu lists the
 * [BulkActionDef]s, a picker collects the parameter ([BulkParam]), then a
 * confirm "Aplici „<label>” la N elemente?" runs the ViewModel's `bulkAction`.
 */

/** How the action's single parameter is collected. */
sealed class BulkParam {
    /** value → label, shown as a radio list. */
    data class Enum(val options: List<Pair<String, String>>) : BulkParam()
    /** Two menu entries, no picker. */
    data class Bool(val trueLabel: String, val falseLabel: String) : BulkParam()
    data object User : BulkParam()
    data object Location : BulkParam()
    /** Categories of these kinds (`GET /recipes/categories?kind=`), merged; `null` option = Misc. */
    data class Category(val kinds: List<String>) : BulkParam()
    data object Supplier : BulkParam()
    data object Date : BulkParam()
    data class Number(val label: String) : BulkParam()
    data object None : BulkParam()
}

/**
 * One entry of the "Acțiuni" menu. [paramName] is the key written into
 * `params` (defaults to the action key).
 */
data class BulkActionDef(
    val key: String,
    val label: String,
    val param: BulkParam,
    val paramName: String = key,
)

/** A chosen action, ready to confirm: label of the value for the confirm text + the params payload. */
data class BulkActionChoice(
    val def: BulkActionDef,
    val valueLabel: String?,
    val params: Map<String, Any?>?,
)

/** Per-screen action lists — mirror the API's `bulk-action` catalog. */
object BulkActionCatalog {
    val tasks = listOf(
        BulkActionDef(
            "status", "Schimbă starea",
            BulkParam.Enum(listOf("DE_FACUT" to "De făcut", "IN_LUCRU" to "În lucru", "ANULAT" to "Anulează")),
        ),
        BulkActionDef("assign", "Asignează", BulkParam.User, paramName = "assignedToId"),
        BulkActionDef("plannedDate", "Data planificată", BulkParam.Date),
        BulkActionDef("dueDate", "Termen", BulkParam.Date),
        BulkActionDef("priority", "Prioritate", BulkParam.Enum((1..5).map { "$it" to "Prioritate $it" })),
        BulkActionDef("location", "Locație", BulkParam.Location, paramName = "locationId"),
    )

    val orders = listOf(
        BulkActionDef("status", "Schimbă starea", BulkParam.Enum(OrderStatus.entries.map { it.name to it.displayName })),
        BulkActionDef("assign", "Asignează livrator", BulkParam.User, paramName = "assignedToId"),
        BulkActionDef("dueDate", "Termen", BulkParam.Date),
        BulkActionDef("archive", "Arhivare", BulkParam.Bool("Arhivează", "Dezarhivează"), paramName = "archived"),
    )

    val transfers = listOf(
        BulkActionDef(
            "status", "Schimbă starea",
            BulkParam.Enum(listOf("IN_TRANZIT" to "În tranzit", "FINALIZAT" to "Finalizează", "ANULAT" to "Anulează")),
        ),
    )

    private val materialStatus = BulkParam.Enum(listOf("ACTIVE" to "Activ", "DISCONTINUED" to "Întrerupt"))

    val rawMaterials = listOf(
        BulkActionDef("category", "Categorie", BulkParam.Category(listOf("PRODUCT"))),
        BulkActionDef("status", "Stare", materialStatus),
        BulkActionDef("supplier", "Furnizor", BulkParam.Supplier, paramName = "supplierId"),
        BulkActionDef("minimumStock", "Stoc minim", BulkParam.Number("Stoc minim")),
    )

    val consumables = listOf(
        BulkActionDef("category", "Categorie", BulkParam.Category(listOf("PRODUCT"))),
        BulkActionDef("status", "Stare", materialStatus),
        BulkActionDef("minimumStock", "Stoc minim", BulkParam.Number("Stoc minim")),
    )

    val recipes = listOf(
        BulkActionDef("archive", "Arhivare", BulkParam.Bool("Arhivează", "Dezarhivează"), paramName = "archived"),
        BulkActionDef("draft", "Ciornă", BulkParam.Bool("Ciornă", "Publică")),
        BulkActionDef("category", "Categorie", BulkParam.Category(listOf("PRODUS_FINIT", "SEMIPREPARAT"))),
    )

    val sales = listOf(
        BulkActionDef("discard", "Renunță la ciorne", BulkParam.None),
        BulkActionDef("revert", "Anulează confirmările", BulkParam.None),
    )
}

// ---------------------------------------------------------------------------
// Picker data
// ---------------------------------------------------------------------------

/** Loads the option lists the pickers need (users, locations, categories, suppliers). */
@HiltViewModel
class BulkActionPickerViewModel @Inject constructor(
    private val users: UserRepository,
    private val locations: LocationRepository,
    private val recipes: RecipeRepository,
    private val stock: StockRepository,
) : ViewModel() {

    /** value(id or name; null = "none") → label */
    suspend fun options(param: BulkParam): List<Pair<String?, String>> = when (param) {
        is BulkParam.User ->
            users.getUsers(page = 1, limit = 200, isActive = true).data
                .sortedBy { it.fullName.lowercase() }
                .map { it.id to it.fullName }
        is BulkParam.Location ->
            locations.getLocations().filter { it.isActive }.map { it.id to it.name }
        is BulkParam.Category ->
            listOf<Pair<String?, String>>(null to "Misc (fără categorie)") +
                param.kinds.flatMap { k -> runCatching { recipes.getCategories(k) }.getOrDefault(emptyList()) }
                    .distinct().sorted().map { it to it }
        is BulkParam.Supplier ->
            listOf<Pair<String?, String>>(null to "Fără furnizor") +
                stock.getSuppliers().sortedBy { it.name.lowercase() }.map { it.id to it.name }
        else -> emptyList()
    }
}

// ---------------------------------------------------------------------------
// Picker dialog → BulkActionChoice
// ---------------------------------------------------------------------------

/**
 * Collects the parameter for [def] and hands back a [BulkActionChoice]
 * (or null on cancel). Enum/User/Location/Category/Supplier = radio list,
 * Date = DatePickerDialog, Number = numeric field.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BulkActionParamPicker(
    def: BulkActionDef,
    onResult: (BulkActionChoice?) -> Unit,
) {
    when (val param = def.param) {
        is BulkParam.Date -> {
            val state = rememberDatePickerState()
            DatePickerDialog(
                onDismissRequest = { onResult(null) },
                confirmButton = {
                    TextButton(
                        enabled = state.selectedDateMillis != null,
                        onClick = {
                            val millis = state.selectedDateMillis ?: return@TextButton
                            val iso = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(millis))
                            onResult(BulkActionChoice(def, iso.take(10), mapOf(def.paramName to iso)))
                        },
                    ) { Text("Aplică") }
                },
                dismissButton = { TextButton(onClick = { onResult(null) }) { Text("Anulează") } },
            ) { DatePicker(state = state) }
        }

        is BulkParam.Number -> {
            var text by remember { mutableStateOf("") }
            val value = text.replace(',', '.').toDoubleOrNull()
            AlertDialog(
                onDismissRequest = { onResult(null) },
                title = { Text(def.label) },
                text = {
                    OutlinedTextField(
                        value = text,
                        onValueChange = { text = it },
                        label = { Text(param.label) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
                confirmButton = {
                    TextButton(
                        enabled = value != null && value >= 0,
                        onClick = { onResult(BulkActionChoice(def, text, mapOf(def.paramName to value))) },
                    ) { Text("Aplică") }
                },
                dismissButton = { TextButton(onClick = { onResult(null) }) { Text("Anulează") } },
            )
        }

        is BulkParam.Enum -> OptionListDialog(
            title = def.label,
            options = param.options.map { (v, l) -> (v as String?) to l },
            isLoading = false,
            onDismiss = { onResult(null) },
            onPick = { v, l -> onResult(BulkActionChoice(def, l, mapOf(def.paramName to v))) },
        )

        is BulkParam.User, is BulkParam.Location, is BulkParam.Category, is BulkParam.Supplier -> {
            val vm: BulkActionPickerViewModel = hiltViewModel()
            var options by remember { mutableStateOf<List<Pair<String?, String>>?>(null) }
            var loadError by remember { mutableStateOf<String?>(null) }
            LaunchedEffect(def) {
                try {
                    options = vm.options(param)
                } catch (e: Exception) {
                    loadError = e.message ?: "Nu am putut încărca opțiunile"
                }
            }
            if (loadError != null) {
                ErrorDialog(message = loadError!!, onDismiss = { onResult(null) })
            } else {
                OptionListDialog(
                    title = def.label,
                    options = options ?: emptyList(),
                    isLoading = options == null,
                    onDismiss = { onResult(null) },
                    onPick = { v, l -> onResult(BulkActionChoice(def, l, mapOf(def.paramName to v))) },
                )
            }
        }

        // Bool / None never reach the picker (the menu resolves them).
        is BulkParam.Bool, is BulkParam.None -> onResult(null)
    }
}

@Composable
private fun OptionListDialog(
    title: String,
    options: List<Pair<String?, String>>,
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onPick: (String?, String) -> Unit,
) {
    var selected by remember { mutableStateOf<Pair<String?, String>?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            if (isLoading) {
                Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (options.isEmpty()) {
                Text("Nicio opțiune disponibilă.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Column(
                    modifier = Modifier
                        .heightIn(max = 360.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    options.forEach { opt ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selected = opt }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            RadioButton(selected = selected == opt, onClick = { selected = opt })
                            Text(opt.second, fontWeight = if (selected == opt) FontWeight.SemiBold else null)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = selected != null,
                onClick = { selected?.let { onPick(it.first, it.second) } },
            ) { Text("Aplică") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Anulează") } },
    )
}
