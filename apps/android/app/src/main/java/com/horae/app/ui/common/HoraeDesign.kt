package com.horae.app.ui.common

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.horae.app.domain.model.MaterialStatus
import com.horae.app.domain.model.OrderStatus
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.TaskStatus
import com.horae.app.domain.model.TransferStatus
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette

/*
 * Redesign building blocks (17.10.2026), the Compose twins of iOS `SharedComponents/H*`.
 * Metrics: card radius 18 · controls 44dp · chips 34dp visual (48dp touch) · icon buttons
 * 42dp visual (48dp touch). Colours come only from HoraeTheme.scheme / StatusPalette.
 *
 * Index: HCard · HChip · ChoiceChips · MultiChoiceChips · HSegmentedControl · HStatusChip ·
 * HIconButton · HFab · HPrimaryButton · HSecondaryButton · HSectionHeader · HScreenTitle ·
 * HSearchField · AccentGradientBackground. Lists → ChoiceListSheet (ChoiceSheet.kt);
 * pull-to-refresh → HoraeRefreshBox (HoraeRefresh.kt).
 */

/** Metrics shared by the redesign components. */
object HoraeMetrics {
    val cardRadius: Dp = 18.dp
    val controlHeight: Dp = 44.dp
    val chipHeight: Dp = 34.dp
    val iconButtonSize: Dp = 42.dp
    val minTouch: Dp = 48.dp
    val screenPadding: Dp = 16.dp
    val gradientHeight: Dp = 260.dp
}

// ── Card ───────────────────────────────────────────────────────────────

/** Card surface: scheme card colour, radius 18, 1dp border, no shadow. Tappable when [onClick] is set. */
@Composable
fun HCard(
    modifier: Modifier = Modifier,
    padding: PaddingValues = PaddingValues(14.dp),
    onClick: (() -> Unit)? = null,
    onClickLabel: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val s = HoraeTheme.scheme
    val shape = RoundedCornerShape(HoraeMetrics.cardRadius)
    var m = modifier.fillMaxWidth().clip(shape)
    if (onClick != null) m = m.clickable(onClickLabel = onClickLabel, onClick = onClick)
    Column(
        m.background(s.card).border(1.dp, s.border, shape).padding(padding),
        content = content,
    )
}

// ── Chips ──────────────────────────────────────────────────────────────

/**
 * Choice chip, 34dp capsule. Selected = accent fill + white text; idle = card + border.
 * Optional leading status [dot], [icon] and [count]. Toggling is the caller's job.
 */
@Composable
fun HChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    count: Int? = null,
    dot: Color? = null,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    role: Role = Role.Checkbox,
    /** Long labels: cap the chip's width and ellipsize the label (the count stays visible). */
    maxWidth: Dp? = null,
) {
    val s = HoraeTheme.scheme
    val bg by animateColorAsState(if (selected) s.primary else s.card, label = "chipBg")
    val fg = if (selected) s.onPrimary else s.ink
    Box(
        modifier
            .then(if (maxWidth != null) Modifier.widthIn(max = maxWidth) else Modifier)
            .minimumInteractiveComponentSize()
            .semantics { if (count != null) contentDescription = "$label, $count" },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier
                .height(HoraeMetrics.chipHeight)
                .clip(CircleShape)
                .background(bg)
                .border(1.dp, if (selected) s.primary else s.border, CircleShape)
                .selectable(selected = selected, enabled = enabled, role = role, onClick = onClick)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (dot != null) Box(Modifier.size(7.dp).clip(CircleShape).background(if (selected) s.onPrimary else dot))
            if (icon != null) Icon(icon, null, tint = fg, modifier = Modifier.size(16.dp))
            Text(
                label,
                style = AppFont.body(13f, FontWeight.SemiBold),
                color = if (enabled) fg else fg.copy(alpha = 0.45f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                // Bounded only with maxWidth (a weight under the scroll row's infinite width breaks).
                modifier = if (maxWidth != null) Modifier.weight(1f, fill = false) else Modifier,
            )
            if (count != null) {
                Text("$count", style = AppFont.body(12f, FontWeight.Bold), color = fg.copy(alpha = 0.7f))
            }
        }
    }
}

/**
 * Single choice as a chip row (replaces a dropdown with ≤ ~8 options). [selected] null =
 * nothing chosen. Scrolls horizontally, or wraps onto lines with [wrap] = true.
 */
@Composable
fun <T> ChoiceChips(
    options: List<T>,
    selected: T?,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    wrap: Boolean = false,
    dot: ((T) -> Color?)? = null,
    contentPadding: PaddingValues = PaddingValues(0.dp),
) {
    ChipLayout(modifier.selectableGroup(), wrap, contentPadding) {
        options.forEach { opt ->
            HChip(
                label = label(opt),
                selected = opt == selected,
                onClick = { onSelect(opt) },
                dot = dot?.invoke(opt),
                role = Role.RadioButton,
            )
        }
    }
}

/** Multiple choice as toggle chips. [onToggle] gets the option tapped; the caller updates the set. */
@Composable
fun <T> MultiChoiceChips(
    options: List<T>,
    selected: Set<T>,
    onToggle: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    wrap: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(0.dp),
) {
    ChipLayout(modifier, wrap, contentPadding) {
        options.forEach { opt ->
            HChip(label = label(opt), selected = opt in selected, onClick = { onToggle(opt) })
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipLayout(
    modifier: Modifier,
    wrap: Boolean,
    contentPadding: PaddingValues,
    content: @Composable () -> Unit,
) {
    if (wrap) {
        FlowRow(modifier.padding(contentPadding), horizontalArrangement = Arrangement.spacedBy(8.dp)) { content() }
    } else {
        Row(
            modifier.horizontalScroll(rememberScrollState()).padding(contentPadding),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) { content() }
    }
}

// ── Segmented control ──────────────────────────────────────────────────

/**
 * 2–4 mutually exclusive options in one 44dp pill (e.g. Livrare | Ridicare).
 * Selected segment = accent fill, white text.
 */
@Composable
fun <T> HSegmentedControl(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    icon: ((T) -> ImageVector?)? = null,
) {
    val s = HoraeTheme.scheme
    val outer = RoundedCornerShape(14.dp)
    Row(
        modifier
            .fillMaxWidth()
            .height(HoraeMetrics.controlHeight + 4.dp)
            .clip(outer)
            .background(s.card)
            .border(1.dp, s.border, outer)
            .padding(3.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEach { opt ->
            val isSel = opt == selected
            val bg by animateColorAsState(if (isSel) s.primary else Color.Transparent, label = "segBg")
            val fg = if (isSel) s.onPrimary else s.ink
            Row(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(11.dp))
                    .background(bg)
                    .selectable(selected = isSel, role = Role.Tab, onClick = { onSelect(opt) }),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                icon?.invoke(opt)?.let {
                    Icon(it, null, tint = fg, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                }
                Text(label(opt), style = AppFont.body(14f, FontWeight.SemiBold), color = fg, maxLines = 1)
            }
        }
    }
}

// ── Status chip ────────────────────────────────────────────────────────

/** Status capsule with a dot, fixed status colours (light/dark). Null [kind] = neutral (muted). */
@Composable
fun HStatusChip(label: String, kind: StatusKind?, modifier: Modifier = Modifier) {
    val s = HoraeTheme.scheme
    val fg = StatusPalette.color(kind, s)
    val bg = StatusPalette.wash(kind, s)
    Row(
        modifier.clip(CircleShape).background(bg).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(fg))
        Text(label, style = AppFont.body(11f, FontWeight.Bold), color = fg, maxLines = 1)
    }
}

@Composable fun HStatusChip(status: TaskStatus, modifier: Modifier = Modifier) = HStatusChip(status.displayName, status.kind, modifier)
@Composable fun HStatusChip(status: OrderStatus, modifier: Modifier = Modifier) = HStatusChip(status.displayName, status.kind, modifier)
@Composable fun HStatusChip(status: TransferStatus, modifier: Modifier = Modifier) = HStatusChip(status.displayName, status.kind, modifier)
@Composable fun HStatusChip(status: MaterialStatus, modifier: Modifier = Modifier) = HStatusChip(status.displayName, status.kind, modifier)

// ── Buttons ────────────────────────────────────────────────────────────

enum class HIconButtonVariant { STANDARD, PROMINENT, DESTRUCTIVE, PLAIN }

/**
 * Square icon button: 42dp visual, 48dp touch target, radius 12. [contentDescription] is
 * REQUIRED (spoken by TalkBack). PROMINENT = accent fill; DESTRUCTIVE = danger glyph;
 * PLAIN = no background/border (top bars).
 */
@Composable
fun HIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: HIconButtonVariant = HIconButtonVariant.STANDARD,
    enabled: Boolean = true,
    badge: Boolean = false,
) {
    val s = HoraeTheme.scheme
    val shape = RoundedCornerShape(12.dp)
    val fg = when (variant) {
        HIconButtonVariant.PROMINENT -> s.onPrimary
        HIconButtonVariant.DESTRUCTIVE -> StatusPalette.fg(StatusKind.DANGER, s.isDark)
        else -> s.ink
    }
    val bg = when (variant) {
        HIconButtonVariant.PROMINENT -> s.primary
        HIconButtonVariant.PLAIN -> Color.Transparent
        else -> s.card
    }
    val border = when (variant) {
        HIconButtonVariant.PROMINENT -> s.primary
        HIconButtonVariant.PLAIN -> Color.Transparent
        else -> s.border
    }
    Box(
        modifier
            .size(HoraeMetrics.minTouch)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = contentDescription, onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(HoraeMetrics.iconButtonSize).clip(shape).background(bg).border(1.dp, border, shape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = if (enabled) fg else fg.copy(alpha = 0.4f), modifier = Modifier.size(20.dp))
        }
        if (badge) {
            Box(
                Modifier.align(Alignment.TopEnd).padding(top = 6.dp, end = 6.dp).size(9.dp)
                    .clip(CircleShape).background(s.primary).border(1.5.dp, s.card, CircleShape),
            )
        }
    }
}

/** Floating action button: 56dp accent circle, white glyph, soft accent shadow. */
@Composable
fun HFab(
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Filled.Add,
) {
    val s = HoraeTheme.scheme
    Box(
        modifier
            .size(56.dp)
            .shadow(10.dp, CircleShape, ambientColor = s.primary, spotColor = s.primary)
            .clip(CircleShape)
            .background(s.primary)
            .clickable(role = Role.Button, onClickLabel = contentDescription, onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = s.onPrimary, modifier = Modifier.size(26.dp))
    }
}

/**
 * Full-width primary action, 44dp. Disabled stays readable (accent at 40 % with white
 * text — never accent-on-accent). [loading] shows a spinner and blocks taps.
 */
@Composable
fun HPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: ImageVector? = null,
    destructive: Boolean = false,
) {
    val s = HoraeTheme.scheme
    val base = if (destructive) StatusPalette.fg(StatusKind.DANGER, s.isDark) else s.primary
    val active = enabled && !loading
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = HoraeMetrics.minTouch)
            .clip(shape)
            .background(if (active || loading) base else base.copy(alpha = 0.4f).compositeOverSafe(s.card))
            .clickable(enabled = active, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
            Spacer(Modifier.width(10.dp))
        } else if (icon != null) {
            Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = AppFont.body(15f, FontWeight.SemiBold), color = Color.White, maxLines = 1)
    }
}

/** Full-width secondary action, 44dp: card fill, border, ink (or accent-text) label. */
@Composable
fun HSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
    accentText: Boolean = false,
) {
    val s = HoraeTheme.scheme
    val fg = (if (accentText) s.primaryText else s.ink).let { if (enabled) it else it.copy(alpha = 0.45f) }
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = HoraeMetrics.minTouch)
            .clip(shape)
            .background(s.card)
            .border(1.dp, s.border, shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = AppFont.body(15f, FontWeight.SemiBold), color = fg, maxLines = 1)
    }
}

private fun Color.compositeOverSafe(bg: Color): Color =
    androidx.compose.ui.graphics.lerp(bg, this.copy(alpha = 1f), this.alpha)

// ── Headers ────────────────────────────────────────────────────────────

/** Section header: 11sp bold UPPERCASE muted label + optional accent action or trailing slot. */
@Composable
fun HSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val s = HoraeTheme.scheme
    Row(
        modifier.fillMaxWidth().padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title.uppercase(RoLocale.locale),
            style = AppFont.body(11f, FontWeight.Bold).copy(letterSpacing = 0.5.sp),
            color = s.muted,
            modifier = Modifier.weight(1f).semantics { heading(); contentDescription = title },
        )
        if (actionLabel != null && onAction != null) {
            Text(
                actionLabel,
                style = AppFont.body(13f, FontWeight.SemiBold),
                color = s.primaryText,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(role = Role.Button, onClick = onAction)
                    .minimumInteractiveComponentSize()
                    .padding(horizontal = 4.dp),
            )
        }
        trailing?.invoke(this)
    }
}

/** Screen title: optional muted eyebrow over a 28sp Fraunces title; [trailing] holds icon buttons. */
@Composable
fun HScreenTitle(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val s = HoraeTheme.scheme
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            if (eyebrow != null) {
                Text(eyebrow, style = AppFont.body(12f, FontWeight.SemiBold), color = s.muted)
            }
            Text(
                title,
                style = AppFont.title(28f),
                color = s.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
        }
        trailing?.let { Row(verticalAlignment = Alignment.CenterVertically, content = it) }
    }
}

// ── Search field ───────────────────────────────────────────────────────

/** 44dp search field (card fill, border, search glyph, clear button). */
@Composable
fun HSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Caută",
    onSearch: (() -> Unit)? = null,
) {
    val s = HoraeTheme.scheme
    val shape = RoundedCornerShape(14.dp)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = AppFont.body(15f).copy(color = s.ink),
        cursorBrush = SolidColor(s.primary),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Search),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { onSearch?.invoke() }),
        modifier = modifier.fillMaxWidth(),
        decorationBox = { inner ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(HoraeMetrics.controlHeight)
                    .clip(shape)
                    .background(s.card)
                    .border(1.dp, s.border, shape)
                    .padding(start = 12.dp, end = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = s.muted, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Text(placeholder, style = AppFont.body(15f), color = s.muted, maxLines = 1)
                    inner()
                }
                if (value.isNotEmpty()) {
                    HIconButton(
                        Icons.Filled.Close, "Șterge căutarea", { onValueChange("") },
                        variant = HIconButtonVariant.PLAIN,
                    )
                }
            }
        },
    )
}

// ── Background ─────────────────────────────────────────────────────────

/**
 * Screen background: the scheme paper with the accent fading in from the top
 * (accent 30 % → 0 over 260dp, behind the status bar). Wrap a screen's content in it,
 * or use [Modifier.accentGradientBackground] on an existing container.
 */
@Composable
fun AccentGradientBackground(
    modifier: Modifier = Modifier,
    showGradient: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(modifier.fillMaxSize().accentGradientBackground(showGradient), content = content)
}

/** Modifier form of [AccentGradientBackground]. */
@Composable
fun Modifier.accentGradientBackground(showGradient: Boolean = true): Modifier {
    val s = HoraeTheme.scheme
    val base = this.background(s.background)
    if (!showGradient) return base
    return base.background(
        Brush.verticalGradient(
            0f to s.primary.copy(alpha = 0.30f),
            1f to Color.Transparent,
            startY = 0f,
            endY = with(androidx.compose.ui.platform.LocalDensity.current) { HoraeMetrics.gradientHeight.toPx() },
        ),
    )
}
