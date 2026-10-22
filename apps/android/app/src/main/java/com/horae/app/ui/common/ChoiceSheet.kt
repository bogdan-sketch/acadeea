package com.horae.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import kotlinx.coroutines.launch
import java.text.Normalizer

/*
 * ChoiceListSheet — the replacement for EVERY dropdown / spinner / ExposedDropdownMenu
 * (owner's rule: no dropdowns). A modal bottom sheet with a title, an optional search
 * field (diacritics-insensitive: "paine" finds "Pâine") and a list of rows with a check.
 *
 * Usage (single):
 *   var open by remember { mutableStateOf(false) }
 *   HPickerField(label = "Produs", value = product?.name, onClick = { open = true })
 *   if (open) ChoiceListSheet(
 *       title = "Alege produsul", items = products, selected = product,
 *       itemLabel = { it.name }, itemSubtitle = { it.category },
 *       onSelect = { product = it }, onDismiss = { open = false })
 * Multi: MultiChoiceListSheet(..., selected = set, onConfirm = { set = it }).
 * ≤ ~6 fixed options fit better as ChoiceChips / HSegmentedControl (HoraeDesign.kt).
 */

/** Lower-case, diacritics-free key for searching Romanian text. */
fun searchKey(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase(RoLocale.locale)

/**
 * Single choice. Picking a row calls [onSelect] then closes (animated) and calls [onDismiss].
 * [searchable] defaults to on from 8 items. [noneLabel] adds a first "none" row → onSelect(null).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> ChoiceListSheet(
    title: String,
    items: List<T>,
    selected: T?,
    itemLabel: (T) -> String,
    onSelect: (T?) -> Unit,
    onDismiss: () -> Unit,
    itemSubtitle: ((T) -> String?)? = null,
    itemKey: ((T) -> Any)? = null,
    searchable: Boolean = items.size >= 8,
    searchPlaceholder: String = "Caută",
    noneLabel: String? = null,
    emptyText: String = "Niciun rezultat",
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    val filtered = remember(items, query) { filterItems(items, query, itemLabel, itemSubtitle) }

    fun close() {
        scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        SheetBody(title, searchable, query, { query = it }, searchPlaceholder) {
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 520.dp), contentPadding = PaddingValues(bottom = 16.dp)) {
                if (noneLabel != null && query.isBlank()) {
                    item(key = "__none__") {
                        ChoiceRow(noneLabel, null, selected == null, Role.RadioButton) { onSelect(null); close() }
                    }
                }
                if (filtered.isEmpty()) {
                    item(key = "__empty__") { EmptyRow(emptyText) }
                }
                items(filtered, key = itemKey) { item ->
                    ChoiceRow(itemLabel(item), itemSubtitle?.invoke(item), item == selected, Role.RadioButton) {
                        onSelect(item); close()
                    }
                }
            }
        }
    }
}

/**
 * Multiple choice with a "Gata (N)" confirm button. Toggling is local to the sheet;
 * [onConfirm] receives the final set. Dismissing without confirming keeps the old value.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> MultiChoiceListSheet(
    title: String,
    items: List<T>,
    selected: Set<T>,
    itemLabel: (T) -> String,
    onConfirm: (Set<T>) -> Unit,
    onDismiss: () -> Unit,
    itemSubtitle: ((T) -> String?)? = null,
    itemKey: ((T) -> Any)? = null,
    searchable: Boolean = items.size >= 8,
    searchPlaceholder: String = "Caută",
    confirmLabel: String = "Gata",
    emptyText: String = "Niciun rezultat",
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var picked by remember { mutableStateOf(selected) }
    val filtered = remember(items, query) { filterItems(items, query, itemLabel, itemSubtitle) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        SheetBody(title, searchable, query, { query = it }, searchPlaceholder) {
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 460.dp)) {
                if (filtered.isEmpty()) item(key = "__empty__") { EmptyRow(emptyText) }
                items(filtered, key = itemKey) { item ->
                    ChoiceRow(itemLabel(item), itemSubtitle?.invoke(item), item in picked, Role.Checkbox) {
                        picked = if (item in picked) picked - item else picked + item
                    }
                }
            }
            HPrimaryButton(
                text = if (picked.isEmpty()) confirmLabel else "$confirmLabel (${picked.size})",
                onClick = {
                    onConfirm(picked)
                    scope.launch { sheetState.hide() }.invokeOnCompletion { onDismiss() }
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}

/**
 * Read-only field that opens a [ChoiceListSheet]: label above, current value (or
 * placeholder) inside a 44dp box with a chevron. Use it where a dropdown used to be.
 */
@Composable
fun HPickerField(
    label: String?,
    value: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Alege",
    enabled: Boolean = true,
) {
    val s = HoraeTheme.scheme
    val shape = RoundedCornerShape(14.dp)
    Column(modifier.fillMaxWidth()) {
        if (label != null) {
            Text(label, style = AppFont.body(13f, FontWeight.SemiBold), color = s.muted, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
        }
        Row(
            Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = HoraeMetrics.minTouch)
                .clip(shape)
                .background(s.card)
                .border(1.dp, s.border, shape)
                .clickable(enabled = enabled, role = Role.Button, onClickLabel = label ?: placeholder, onClick = onClick)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                value ?: placeholder,
                style = AppFont.body(15f, if (value != null) FontWeight.Medium else FontWeight.Normal),
                color = if (value != null && enabled) s.ink else s.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight, null,
                tint = s.muted, modifier = Modifier.size(20.dp),
            )
        }
    }
}

private fun <T> filterItems(items: List<T>, query: String, label: (T) -> String, subtitle: ((T) -> String?)?): List<T> {
    val q = searchKey(query.trim())
    if (q.isEmpty()) return items
    return items.filter { item ->
        searchKey(label(item)).contains(q) || (subtitle?.invoke(item)?.let { searchKey(it).contains(q) } ?: false)
    }
}

@Composable
private fun SheetBody(
    title: String,
    searchable: Boolean,
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    content: @Composable () -> Unit,
) {
    val s = HoraeTheme.scheme
    Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding()) {
        Text(title, style = AppFont.title(20f), color = s.ink, modifier = Modifier.padding(horizontal = 20.dp))
        Spacer(Modifier.size(12.dp))
        if (searchable) {
            HSearchField(query, onQuery, placeholder = placeholder, modifier = Modifier.padding(horizontal = 16.dp))
            Spacer(Modifier.size(8.dp))
        }
        content()
    }
}

@Composable
private fun ChoiceRow(label: String, subtitle: String?, selected: Boolean, role: Role, onClick: () -> Unit) {
    val s = HoraeTheme.scheme
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(role = role, onClick = onClick)
                .defaultMinSize(minHeight = 52.dp)
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    label,
                    style = AppFont.body(15f, if (selected) FontWeight.SemiBold else FontWeight.Normal),
                    color = if (selected) s.primaryText else s.ink,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(subtitle, style = AppFont.body(12f), color = s.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
                if (selected) {
                    Box(Modifier.size(22.dp).clip(CircleShape).background(s.primary), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Check, null, tint = s.onPrimary, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }
        HorizontalDivider(Modifier.padding(start = 20.dp), color = s.border)
    }
}

@Composable
private fun EmptyRow(text: String) {
    Text(
        text,
        style = AppFont.body(14f),
        color = HoraeTheme.scheme.muted,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 24.dp),
    )
}
