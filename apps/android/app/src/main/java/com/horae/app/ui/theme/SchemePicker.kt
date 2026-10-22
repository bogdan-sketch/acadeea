package com.horae.app.ui.theme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The six scheme tiles (Profil › Date › Preferințe), 3 per row: light row, dark row.
 * Each tile previews its own paper / card / accent. Tapping one applies it live.
 *
 * Default wiring: `SchemePickerGrid()` reads and writes [SchemeStore] itself; pass
 * [selected] / [onSelect] only to control it from outside.
 */
@Composable
fun SchemePickerGrid(
    modifier: Modifier = Modifier,
    selected: AppScheme = SchemeStore.scheme,
    onSelect: (AppScheme) -> Unit = { SchemeStore.scheme = it },
) {
    val rows = AppScheme.entries.chunked(3)
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { scheme ->
                    SchemeTile(
                        scheme = scheme,
                        isSelected = scheme == selected,
                        onClick = { onSelect(scheme) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun SchemeTile(
    scheme: AppScheme,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val current = HoraeTheme.scheme
    val shape = RoundedCornerShape(16.dp)
    Surface(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .selectable(selected = isSelected, role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = "Schema ${scheme.label}, ${scheme.kindLabel.lowercase()}" },
        shape = shape,
        color = current.card,
        border = BorderStroke(if (isSelected) 2.dp else 1.dp, if (isSelected) current.primary else current.border),
    ) {
        Column(Modifier.padding(8.dp)) {
            // Mini preview: the scheme's paper with a card and an accent pill.
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(58.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(scheme.background)
                    .border(1.dp, scheme.border, RoundedCornerShape(10.dp)),
            ) {
                Column(Modifier.padding(8.dp)) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(18.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(scheme.card)
                            .border(1.dp, scheme.border, RoundedCornerShape(5.dp)),
                    ) {
                        Box(
                            Modifier
                                .padding(start = 5.dp)
                                .align(Alignment.CenterStart)
                                .width(22.dp)
                                .height(4.dp)
                                .clip(CircleShape)
                                .background(scheme.ink.copy(alpha = 0.6f)),
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Box(
                        Modifier
                            .width(34.dp)
                            .height(12.dp)
                            .clip(CircleShape)
                            .background(scheme.primary),
                    )
                }
                if (isSelected) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(5.dp)
                            .size(18.dp)
                            .clip(CircleShape)
                            .background(scheme.primary),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Check, null, tint = scheme.onPrimary, modifier = Modifier.size(12.dp))
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(scheme.label, style = AppFont.body(13f, FontWeight.SemiBold), color = current.ink)
            Text(scheme.kindLabel, style = AppFont.body(11f), color = current.muted)
        }
    }
}
