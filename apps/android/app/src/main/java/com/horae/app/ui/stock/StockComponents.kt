package com.horae.app.ui.stock

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.horae.app.domain.model.MaterialStatus
import com.horae.app.domain.model.StatusKind
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HIconButtonVariant
import com.horae.app.ui.common.HStatusChip
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette

/*
 * Stock redesign building blocks (mirror iOS StockOverviewComponents / StockDetailCards):
 * action chips, the dot · title · quantity row, detail header and info rows.
 */

/** Dot colour of a stock row: 0 → danger, at/below minimum → warning, else ready. */
fun stockKind(stockCount: Double, minimumStock: Double): StatusKind = when {
    stockCount <= 0.0 -> StatusKind.DANGER
    minimumStock > 0.0 && stockCount <= minimumStock -> StatusKind.WARNING
    else -> StatusKind.READY
}

/** API material status → "Activ" / "Stoc scăzut" / "Fără stoc" / "Întrerupt" chip. */
@Composable
fun MaterialStatusChip(status: String, modifier: Modifier = Modifier) {
    val st = MaterialStatus.fromString(status)
    HStatusChip(st?.displayName ?: status, st?.kind, modifier)
}

/**
 * Quick-action pill: card fill, border, accent glyph + ink label (iOS HQuickActionChip).
 * 36dp visual inside a 48dp touch target.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StockActionChip(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    destructive: Boolean = false,
    enabled: Boolean = true,
) {
    val s = HoraeTheme.scheme
    val tint = if (destructive) StatusPalette.fg(StatusKind.DANGER, s.isDark) else s.primaryText
    Box(modifier.minimumInteractiveComponentSize(), contentAlignment = Alignment.Center) {
        Row(
            Modifier
                .height(36.dp)
                .clip(CircleShape)
                .background(s.card)
                .border(1.dp, s.border, CircleShape)
                .combinedClickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(icon, null, tint = if (enabled) tint else tint.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
            Text(
                label,
                style = AppFont.body(13f, FontWeight.SemiBold),
                color = if (enabled) s.ink else s.muted,
                maxLines = 1,
            )
        }
    }
}

/** Horizontally scrolling row of [StockActionChip]s with the screen gutter. */
@Composable
fun StockActionRow(
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp),
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/**
 * Stock list row: status dot · title (+ subtitle) · quantity in the item's unit · chevron.
 * [leading] replaces nothing — it is drawn before the dot (bulk-select checkbox).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StockItemRow(
    title: String,
    quantity: String,
    kind: StatusKind?,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    subtitleKind: StatusKind? = null,
    onLongClick: (() -> Unit)? = null,
    showChevron: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
) {
    val s = HoraeTheme.scheme
    val dot = StatusPalette.color(kind, s)
    val state = when (kind) {
        StatusKind.DANGER -> "Fără stoc"
        StatusKind.WARNING -> "Sub stocul minim"
        else -> null
    }
    Row(
        modifier
            .fillMaxWidth()
            .then(
                if (onClick != null) Modifier.combinedClickable(onClick = onClick, onLongClick = onLongClick) else Modifier,
            )
            .defaultMinSize(minHeight = 52.dp)
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) { if (state != null) stateDescription = state },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(8.dp))
        }
        Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = AppFont.body(15f, FontWeight.SemiBold),
                color = s.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    style = AppFont.body(12f),
                    color = subtitleKind?.let { StatusPalette.color(it, s) } ?: s.muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        Text(
            quantity,
            style = AppFont.body(14f, FontWeight.Bold),
            color = if (kind == StatusKind.READY || kind == null) s.ink else dot,
            maxLines = 1,
        )
        if (showChevron) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight, null,
                tint = s.muted.copy(alpha = 0.7f), modifier = Modifier.size(18.dp),
            )
        }
    }
}

/** 1dp scheme hairline between rows of a list card. */
@Composable
fun StockDivider(modifier: Modifier = Modifier) {
    HorizontalDivider(modifier, thickness = 1.dp, color = HoraeTheme.scheme.border)
}

/** Back button + optional title, for stock sub-screens drawn on the accent gradient. */
@Composable
fun StockTopBar(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val s = HoraeTheme.scheme
    Row(
        modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HIconButton(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi", onBack, variant = HIconButtonVariant.PLAIN)
        if (title != null) {
            Text(
                title,
                style = AppFont.body(17f, FontWeight.SemiBold),
                color = s.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(start = 2.dp),
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        trailing?.invoke(this)
    }
}

/** Detail header: muted eyebrow, Fraunces title, status chip + category, meta line. */
@Composable
fun StockDetailHeader(
    eyebrow: String,
    title: String,
    modifier: Modifier = Modifier,
    status: String? = null,
    category: String? = null,
    meta: String? = null,
) {
    val s = HoraeTheme.scheme
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(eyebrow, style = AppFont.body(12f, FontWeight.SemiBold), color = s.muted)
        Text(title, style = AppFont.title(26f), color = s.ink, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (status != null) MaterialStatusChip(status)
            if (!category.isNullOrBlank()) {
                Text(
                    category,
                    style = AppFont.body(12f, FontWeight.SemiBold),
                    color = s.ink,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(s.card)
                        .border(1.dp, s.border, CircleShape)
                        .padding(horizontal = 10.dp, vertical = 3.dp),
                )
            }
        }
        if (!meta.isNullOrBlank()) {
            Text(meta, style = AppFont.body(13f), color = s.muted)
        }
    }
}

/** Small bold card title ("Informații", "Niveluri stoc"). */
@Composable
fun StockCardTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = AppFont.body(14f, FontWeight.Bold),
        color = HoraeTheme.scheme.ink,
        modifier = modifier.padding(bottom = 4.dp).semantics { contentDescription = text },
    )
}

/** Label ← → value row inside a detail card. */
@Composable
fun StockInfoRow(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color? = null) {
    val s = HoraeTheme.scheme
    Row(
        modifier.fillMaxWidth().padding(vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = AppFont.body(14f), color = s.muted, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(12.dp))
        Text(value, style = AppFont.body(14f, FontWeight.SemiBold), color = valueColor ?: s.ink)
    }
}

/** Centered muted empty-state text. */
@Composable
fun StockEmptyText(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = AppFont.body(14f),
        color = HoraeTheme.scheme.muted,
        modifier = modifier.fillMaxWidth().padding(vertical = 32.dp, horizontal = 16.dp),
        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
    )
}
