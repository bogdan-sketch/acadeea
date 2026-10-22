package com.horae.app.ui.common

import com.horae.app.data.remote.dto.BulkDeleteFailureDto
import com.horae.app.data.remote.dto.BulkActionResultDto
import androidx.compose.foundation.layout.Box
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.SelectAll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.horae.app.data.remote.dto.BulkDeleteResultDto

/**
 * "Selectează și șterge" — multi-select + bulk delete shared by every list
 * screen (tasks, orders, transfers, raw materials, consumables, recipes,
 * sales). One [BulkSelectionState] per screen; the screen swaps its top bar
 * for [BulkSelectTopBar] while active, renders [BulkSelectCheckbox] in front
 * of each row, and mounts [BulkSelectBottomBar] + [BulkDeleteResultDialog].
 * The ViewModel owns the network call (`repo.bulkDelete(ids)`) and reload.
 */

/** Entity-specific confirm text (Romanian), mirrored on web + iOS. */
object BulkDeleteWarnings {
    const val TASKS = "Acțiunea nu poate fi anulată."
    const val ORDERS = "Acțiunea nu poate fi anulată."
    const val TRANSFERS = "Transferurile active returnează stocul la sursă."
    const val RAW_MATERIALS = "Se șterg definitiv, împreună cu stocul, mișcările și loturile."
    const val CONSUMABLES = "Se șterg definitiv, împreună cu stocul, mișcările și loturile."
    const val RECIPES = "Rețetele cu taskuri în istoric sau comenzi nu se pot șterge."
    const val SALES = "Scăderile confirmate sunt anulate (stocul revine) înainte de ștergere."
}

@Stable
class BulkSelectionState {
    var isActive by mutableStateOf(false)
        private set
    private val _selected = mutableStateListOf<String>()
    val selected: List<String> get() = _selected
    val count: Int get() = _selected.size

    fun isSelected(id: String): Boolean = _selected.contains(id)

    fun enter() { isActive = true }

    fun exit() {
        isActive = false
        _selected.clear()
    }

    fun toggle(id: String) {
        if (!_selected.remove(id)) _selected.add(id)
    }

    /** Selects all [ids] — or clears when every one of them is already selected. */
    fun toggleAll(ids: List<String>) {
        if (ids.isNotEmpty() && ids.all { _selected.contains(it) }) {
            _selected.removeAll(ids.toSet())
        } else {
            ids.filterNot { _selected.contains(it) }.forEach { _selected.add(it) }
        }
    }

    fun clear() = _selected.clear()
}

@Composable
fun rememberBulkSelectionState(): BulkSelectionState = remember { BulkSelectionState() }

/** Top-bar action that enters select mode. Show only when the user may delete the subject. */
@Composable
fun BulkSelectAction(state: BulkSelectionState) {
    IconButton(onClick = { state.enter() }) {
        Icon(Icons.Default.Checklist, contentDescription = "Selectează")
    }
}

/** Replaces the screen's top bar while select mode is active. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BulkSelectTopBar(
    state: BulkSelectionState,
    allIds: List<String>,
) {
    TopAppBar(
        title = {
            Text(
                if (state.count == 0) "Selectează" else "${state.count} selectate",
                fontWeight = FontWeight.SemiBold,
            )
        },
        navigationIcon = {
            IconButton(onClick = { state.exit() }) {
                Icon(Icons.Default.Close, contentDescription = "Anulează")
            }
        },
        actions = {
            IconButton(onClick = { state.toggleAll(allIds) }, enabled = allIds.isNotEmpty()) {
                Icon(Icons.Default.SelectAll, contentDescription = "Selectează tot")
            }
        },
    )
}

/**
 * For list screens that have no TopAppBar of their own (raw materials,
 * consumables): a slim row with "Selectează" when idle, or
 * close · "N selectate" · select-all while active.
 */
@Composable
fun BulkSelectInlineHeader(
    state: BulkSelectionState,
    allIds: List<String>,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state.isActive) {
            IconButton(onClick = { state.exit() }) {
                Icon(Icons.Default.Close, contentDescription = "Anulează")
            }
            Text(
                if (state.count == 0) "Selectează" else "${state.count} selectate",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { state.toggleAll(allIds) }, enabled = allIds.isNotEmpty()) {
                Icon(Icons.Default.SelectAll, contentDescription = "Selectează tot")
            }
        } else {
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { state.enter() }) {
                Icon(Icons.Default.Checklist, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(6.dp))
                Text("Selectează")
            }
        }
    }
}

/** Leading checkbox for a list row in select mode. */
@Composable
fun BulkSelectCheckbox(
    state: BulkSelectionState,
    id: String,
    modifier: Modifier = Modifier,
) {
    Checkbox(
        checked = state.isSelected(id),
        onCheckedChange = { state.toggle(id) },
        modifier = modifier.size(24.dp),
    )
}

/** Outcome of a bulk delete OR bulk action, for the shared result dialog. */
data class BulkOutcome(
    val done: Int,
    val failed: List<BulkDeleteFailureDto>,
    /** "șterse" | "actualizate" */
    val verb: String,
) {
    companion object {
        fun ofDelete(r: BulkDeleteResultDto) = BulkOutcome(r.deleted.size, r.failed, "șterse")
        fun ofAction(r: BulkActionResultDto) = BulkOutcome(r.done.size, r.failed, "actualizate")
    }
}

/**
 * Sticky bottom bar: "N selectate", "Anulează", "Acțiuni" (menu of
 * [actions], gated by [canAct]) and destructive "Șterge (N)" (gated by
 * [canDelete]). "Șterge" first asks for a preview ([onRequestPreview]); once
 * [preview] arrives the confirm dialog lists what else gets touched and
 * [onConfirmDelete] runs with `cascade = true`. An action collects its
 * parameter ([BulkActionParamPicker]), confirms, then calls [onRunAction].
 */
@Composable
fun BulkSelectBottomBar(
    state: BulkSelectionState,
    warning: String,
    preview: BulkDeletePreviewDto?,
    isPreviewing: Boolean,
    isDeleting: Boolean,
    onRequestPreview: (List<String>) -> Unit,
    onDismissPreview: () -> Unit,
    onConfirmDelete: (List<String>) -> Unit,
    canDelete: Boolean = true,
    actions: List<BulkActionDef> = emptyList(),
    canAct: Boolean = false,
    isActing: Boolean = false,
    onRunAction: (ids: List<String>, action: String, params: Map<String, Any?>?) -> Unit = { _, _, _ -> },
) {
    val busy = isPreviewing || isDeleting || isActing
    var menuOpen by remember { mutableStateOf(false) }
    var picking by remember { mutableStateOf<BulkActionDef?>(null) }
    var confirming by remember { mutableStateOf<BulkActionChoice?>(null) }
    val showActions = canAct && actions.isNotEmpty()

    Surface(
        tonalElevation = 3.dp,
        shadowElevation = 8.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "${state.count} selectate",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            OutlinedButton(onClick = { state.exit() }, enabled = !busy) {
                Text("Anulează")
            }
            if (showActions) {
                Box {
                    Button(onClick = { menuOpen = true }, enabled = state.count > 0 && !busy) {
                        if (isActing) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.size(8.dp))
                        }
                        Icon(Icons.Default.Checklist, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(6.dp))
                        Text("Acțiuni")
                    }
                    // Actions list as a bottom sheet (no dropdown menus — owner's rule).
                    if (menuOpen) {
                        val entries = remember(actions) {
                            buildList {
                                actions.forEach { def ->
                                    when (val param = def.param) {
                                        is BulkParam.Bool -> {
                                            add(BulkMenuEntry(param.trueLabel, def.label) {
                                                confirming = BulkActionChoice(def, param.trueLabel, mapOf(def.paramName to true))
                                            })
                                            add(BulkMenuEntry(param.falseLabel, def.label) {
                                                confirming = BulkActionChoice(def, param.falseLabel, mapOf(def.paramName to false))
                                            })
                                        }
                                        is BulkParam.None -> add(BulkMenuEntry(def.label, null) {
                                            confirming = BulkActionChoice(def, null, null)
                                        })
                                        else -> add(BulkMenuEntry("${def.label}…", null) { picking = def })
                                    }
                                }
                            }
                        }
                        ChoiceListSheet(
                            title = "Acțiuni",
                            items = entries,
                            selected = null,
                            itemLabel = { it.label },
                            itemSubtitle = { it.subtitle },
                            onSelect = { it?.onPick?.invoke() },
                            onDismiss = { menuOpen = false },
                        )
                    }
                }
            }
            if (canDelete) {
                Button(
                    onClick = { onRequestPreview(state.selected.toList()) },
                    enabled = state.count > 0 && !busy,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                    ),
                ) {
                    if (isPreviewing || isDeleting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onError,
                        )
                        Spacer(Modifier.size(8.dp))
                    }
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(6.dp))
                    Text("Șterge (${state.count})")
                }
            }
        }
    }

    picking?.let { def ->
        BulkActionParamPicker(def = def) { choice ->
            picking = null
            if (choice != null) confirming = choice
        }
    }

    confirming?.let { choice ->
        val what = choice.def.label + (choice.valueLabel?.let { " → $it" } ?: "")
        AlertDialog(
            onDismissRequest = { if (!isActing) confirming = null },
            title = { Text("Aplici „${choice.def.label}” la ${state.count} elemente?") },
            text = { Text(what) },
            confirmButton = {
                TextButton(
                    enabled = !isActing,
                    onClick = {
                        confirming = null
                        onRunAction(state.selected.toList(), choice.def.key, choice.params)
                    },
                ) { Text("Aplică", fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(onClick = { confirming = null }, enabled = !isActing) { Text("Anulează") }
            },
        )
    }

    if (preview != null) {
        BulkDeleteConfirmDialog(
            count = state.count,
            warning = warning,
            preview = preview,
            isDeleting = isDeleting,
            onDismiss = onDismissPreview,
            onConfirm = { onConfirmDelete(state.selected.toList()) },
        )
    }
}

/**
 * Confirm step fed by the preview: entity warning, then "Se vor afecta și:"
 * with one line per dependent, plus a note for ids that vanished meanwhile.
 */
@Composable
fun BulkDeleteConfirmDialog(
    count: Int,
    warning: String,
    preview: BulkDeletePreviewDto,
    isDeleting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val hasDependents = preview.dependents.isNotEmpty()
    AlertDialog(
        onDismissRequest = { if (!isDeleting) onDismiss() },
        title = { Text("Ștergi $count elemente?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(warning)
                if (hasDependents) {
                    Text("Se vor afecta și:", fontWeight = FontWeight.SemiBold)
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        preview.dependents.forEach { d ->
                            Text("• ${d.label}: ${d.count}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Text(
                        "Acestea se șterg sau se deconectează împreună cu elementele selectate.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (preview.missing.isNotEmpty()) {
                    Text(
                        "${preview.missing.size} nu mai există (vor fi ignorate).",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !isDeleting) {
                if (isDeleting) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.size(6.dp))
                }
                Text(
                    if (hasDependents) "Șterge tot" else "Șterge",
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isDeleting) { Text("Anulează") }
        },
    )
}

/** "X șterse / actualizate" + the first few failure reasons, if any. */
@Composable
fun BulkDeleteResultDialog(
    result: BulkOutcome?,
    onDismiss: () -> Unit,
) {
    if (result == null) return
    val done = result.done
    val failed = result.failed
    val verb = result.verb
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (failed.isEmpty()) "$done $verb" else "$done $verb, ${failed.size} nu") },
        text = {
            if (failed.isEmpty()) {
                Text(if (verb == "șterse") "Elementele selectate au fost șterse." else "Elementele selectate au fost actualizate.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Nu s-au putut procesa:", fontWeight = FontWeight.SemiBold)
                    failed.take(5).forEach { f ->
                        Text("• ${f.reason}", style = MaterialTheme.typography.bodySmall)
                    }
                    if (failed.size > 5) {
                        Text("… și încă ${failed.size - 5}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
    )
}

/** One row of the bulk "Acțiuni" sheet. */
private class BulkMenuEntry(val label: String, val subtitle: String?, val onPick: () -> Unit)
