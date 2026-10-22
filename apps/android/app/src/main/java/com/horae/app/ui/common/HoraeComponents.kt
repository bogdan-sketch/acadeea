package com.horae.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Horae shared UI — the design-system building blocks that make Compose match
 * the Claude Design Android prototype (android/app.css): warm cards, watermark
 * stat cards, tinted filter pills, section headers, quick-action tiles.
 */

/** Section header: 14/700 bold title + optional "Vezi tot" accent action. */
@Composable
fun HoraeSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 0.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        if (actionLabel != null && onAction != null) {
            Text(
                actionLabel,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable(onClick = onAction),
            )
        }
    }
}

/**
 * Stat card with a big tinted WATERMARK icon in the top-right corner (mirrors
 * the web/prototype .stat): uppercase label, 26sp value, optional sub line.
 * With `onClick` it doubles as a filter (accent ring when `selected`).
 */
@Composable
fun HoraeStatCard(
    label: String,
    value: String,
    icon: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
    sub: String? = null,
    subColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    selected: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(HoraeMetrics.cardRadius)
    var m = modifier.clip(shape)
    if (onClick != null) m = m.clickable(onClick = onClick)
    Surface(
        modifier = m,
        shape = shape,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(
            if (selected) 2.dp else 1.dp,
            if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
        ),
        tonalElevation = 0.dp,
    ) {
        Box {
            // Watermark glyph — tinted chip rotated -8°, clipped by the card.
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 14.dp, y = (-14).dp)
                    .size(72.dp)
                    .rotate(-8f)
                    .clip(RoundedCornerShape(22.dp))
                    .background(tint.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, null, tint = Color.White.copy(alpha = 0.75f), modifier = Modifier.size(34.dp))
            }
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    label.uppercase(),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.4.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    value,
                    style = com.horae.app.ui.theme.AppFont.display(28f),
                    color = valueColor,
                )
                if (sub != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(sub, fontSize = 11.5.sp, color = subColor)
                }
            }
        }
    }
}

/**
 * Filter pill — tinted capsule with an optional icon on the left + label
 * (mirrors iOS FilterChip + web chips). Selected = solid accent, white text;
 * idle = soft wash + tinted border. Toggle is the caller's job.
 */
@Composable
fun HoraeFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    tint: Color = MaterialTheme.colorScheme.primary,
) {
    val shape = RoundedCornerShape(999.dp)
    Surface(
        modifier = modifier.clip(shape).clickable(onClick = onClick),
        shape = shape,
        color = if (selected) tint else tint.copy(alpha = 0.14f),
        border = if (selected) null else BorderStroke(1.dp, tint.copy(alpha = 0.3f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (icon != null) {
                Icon(
                    icon,
                    null,
                    tint = if (selected) Color.White else tint,
                    modifier = Modifier.size(15.dp),
                )
            }
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/**
 * Quick-action tile — solid accent pill with icon + label (in-category actions
 * only, per the prototype .tile). Compact, single-row scroller friendly.
 */
@Composable
fun HoraeQuickTile(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.primary,
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
            )
        }
    }
}

/** Card surface (radius 18, 1dp scheme border, flat). New code: [HCard]. */
@Composable
fun HoraeCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(HoraeMetrics.cardRadius),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) { content() }
}

/**
 * Status capsule with a leading dot for an arbitrary colour. For statuses prefer
 * [HStatusChip] (kind → fixed palette wash with light/dark variants).
 */
@Composable
fun HoraeStatusBadge(label: String, color: Color, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(999.dp),
        color = color.copy(alpha = if (com.horae.app.ui.theme.HoraeTheme.scheme.isDark) 0.20f else 0.13f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Box(Modifier.size(6.dp).clip(RoundedCornerShape(3.dp)).background(color))
            Text(
                label,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = color,
            )
        }
    }
}
