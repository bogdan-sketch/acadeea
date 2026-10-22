package com.horae.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * The category "dial" the owner approved in Claude Design — no dropdowns.
 * [KindDial]: up to three small tiles (Materii prime / Semipreparate / Produse
 * finite) tinted in their colour, the whole card; selected = solid.
 * [CategoryPillHeader]: group header inside a stock list — the category as a
 * pill in the kind colour + "finit · 4" on the right.
 */
object CategoryKindStyle {
    fun color(kind: String?): Color = when (kind) {
        "MATERIE_PRIMA" -> Color(0xFF43A047)
        "SEMIPREPARAT" -> Color(0xFF3F7BE0)
        "PRODUS_FINIT", "FINAL" -> Color(0xFFD4527B)
        else -> Color(0xFF6F6D78)
    }

    fun label(kind: String?): String = when (kind) {
        "MATERIE_PRIMA" -> "prim"
        "SEMIPREPARAT" -> "semi"
        "PRODUS_FINIT", "FINAL" -> "finit"
        else -> "misc"
    }

    fun name(kind: String): String = when (kind) {
        "MATERIE_PRIMA" -> "Materii prime"
        "SEMIPREPARAT" -> "Semipreparate"
        "PRODUS_FINIT", "FINAL" -> "Produse finite"
        else -> kind
    }
}

@Composable
fun KindDial(
    kinds: List<Pair<String, Int>>,
    selected: String?,
    onSelected: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val shown = kinds.filter { it.second > 0 }
    if (shown.isEmpty()) return
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        shown.forEach { (key, count) ->
            val on = selected == key
            val color = CategoryKindStyle.color(key)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp)
                    .background(if (on) color else color.copy(alpha = 0.16f), RoundedCornerShape(12.dp))
                    .clickable { onSelected(if (on) null else key) }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    CategoryKindStyle.name(key),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (on) Color.White else color,
                    maxLines = 1,
                )
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        "$count",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = if (on) Color.White else color,
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        CategoryKindStyle.label(key).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = (if (on) Color.White else color).copy(alpha = 0.8f),
                    )
                }
            }
        }
    }
}

@Composable
fun CategoryPillHeader(
    name: String,
    kind: String?,
    count: Int,
    modifier: Modifier = Modifier,
    /** null = plain header; otherwise the group collapses on tap. */
    collapsed: Boolean? = null,
    onToggle: (() -> Unit)? = null,
) {
    val color = CategoryKindStyle.color(kind)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onToggle != null) Modifier.clickable(onClick = onToggle) else Modifier)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            name,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.ExtraBold,
            color = color,
            modifier = Modifier
                .background(color.copy(alpha = 0.16f), RoundedCornerShape(8.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp),
        )
        Spacer(Modifier.weight(1f))
        Text(
            "${CategoryKindStyle.label(kind)} · $count".uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (collapsed != null) {
            Spacer(Modifier.padding(start = 6.dp))
            Icon(
                if (collapsed) Icons.Filled.KeyboardArrowRight else Icons.Filled.KeyboardArrowDown,
                contentDescription = if (collapsed) "Deschide grupul" else "Închide grupul",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
