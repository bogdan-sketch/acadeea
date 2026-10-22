package com.horae.app.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.horae.app.domain.model.StatusKind
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HoraeMetrics
import com.horae.app.ui.common.RoLocale
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette

/** Tone of a Profil section / word button. */
enum class ProfileTone { STANDARD, PRIMARY, DANGER }

/**
 * A Profil card: bold title, muted description, optional tag ("doar root"), body and an
 * optional footer strip — like iOS `ProfileSection`.
 */
@Composable
fun ProfileSection(
    title: String,
    description: String? = null,
    modifier: Modifier = Modifier,
    tone: ProfileTone = ProfileTone.STANDARD,
    tag: String? = null,
    footer: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val s = HoraeTheme.scheme
    val danger = StatusPalette.fg(StatusKind.DANGER, s.isDark)
    HCard(modifier = modifier.fillMaxWidth(), padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    title,
                    style = AppFont.body(18f, FontWeight.Bold),
                    color = if (tone == ProfileTone.DANGER) danger else s.ink,
                    modifier = Modifier.weight(1f, fill = false).semantics { heading() },
                )
                if (tag != null) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        tag.uppercase(RoLocale.locale),
                        style = AppFont.body(10f, FontWeight.Bold).copy(letterSpacing = 0.5.sp),
                        color = s.muted,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(s.background)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            if (description != null) {
                Spacer(Modifier.height(4.dp))
                Text(description, style = AppFont.body(14f), color = s.muted)
            }
        }
        content()
        if (footer != null) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(s.border))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = footer,
            )
        }
    }
}

/** A row inside a section: optional glyph, title + subtitle, trailing actions. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileRow(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    glyph: ImageVector? = null,
    onClick: (() -> Unit)? = null,
    /** Small control on the right of the title (a switch); [trailing] goes below. */
    end: (@Composable () -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val s = HoraeTheme.scheme
    Column(
        modifier
            .fillMaxWidth()
            .let { if (onClick != null) it.clickable(role = Role.Button, onClick = onClick) else it }
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (glyph != null) {
                Box(
                    Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(s.background),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(glyph, null, tint = s.ink, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = AppFont.body(15f, FontWeight.SemiBold), color = s.ink)
                if (!subtitle.isNullOrBlank()) {
                    Text(subtitle, style = AppFont.body(13f), color = s.muted)
                }
            }
            if (end != null) {
                Spacer(Modifier.width(12.dp))
                end()
            }
        }
        if (trailing != null) {
            Spacer(Modifier.height(8.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, content = trailing)
            }
        }
    }
}

/** Outlined word button with an icon (iOS `ProfileWordButton`), 44dp tall, 48dp touch. */
@Composable
fun ProfileWordButton(
    title: String,
    icon: ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: ProfileTone = ProfileTone.STANDARD,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    val s = HoraeTheme.scheme
    val danger = StatusPalette.fg(StatusKind.DANGER, s.isDark)
    val shape = RoundedCornerShape(12.dp)
    val (bg, fg, border) = when (tone) {
        ProfileTone.PRIMARY -> Triple(s.primary, s.onPrimary, s.primary)
        ProfileTone.DANGER -> Triple(Color.Transparent, danger, danger.copy(alpha = 0.45f))
        ProfileTone.STANDARD -> Triple(Color.Transparent, s.ink, s.border)
    }
    val active = enabled && !busy
    Row(
        modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .clickable(enabled = active, role = Role.Button, onClick = onClick)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .heightIn(min = HoraeMetrics.controlHeight)
                .clip(shape)
                .background(if (active) bg else bg.copy(alpha = bg.alpha * 0.5f))
                .border(1.dp, border, shape)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val tint = if (active) fg else fg.copy(alpha = 0.45f)
            if (busy) {
                CircularProgressIndicator(Modifier.size(16.dp), color = tint, strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            } else if (icon != null) {
                Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
            }
            Text(title, style = AppFont.body(14f, FontWeight.Bold), color = tint, maxLines = 1)
        }
    }
}

/** Labelled text input (44dp, card fill, border); [readOnly] greys it out. */
@Composable
fun ProfileTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
    hint: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    val s = HoraeTheme.scheme
    val shape = RoundedCornerShape(14.dp)
    Column(modifier) {
        Text(label, style = AppFont.body(13f, FontWeight.SemiBold), color = s.muted)
        Spacer(Modifier.height(6.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            readOnly = readOnly,
            singleLine = true,
            textStyle = AppFont.body(16f).copy(color = if (readOnly) s.muted else s.ink),
            cursorBrush = SolidColor(s.primary),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                Box(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(shape)
                        .background(if (readOnly) s.background else s.card)
                        .border(1.dp, s.border, shape)
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) { inner() }
            },
        )
        if (hint != null) {
            Spacer(Modifier.height(6.dp))
            Text(hint, style = AppFont.body(12f), color = s.muted)
        }
    }
}

/** Accent-washed pill (role name, "Implicită"). */
@Composable
fun ProfilePill(text: String, modifier: Modifier = Modifier) {
    val s = HoraeTheme.scheme
    Text(
        text,
        style = AppFont.body(14f, FontWeight.Bold),
        color = s.primaryText,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .clip(CircleShape)
            .background(s.primary.copy(alpha = if (s.isDark) 0.22f else 0.12f))
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

@Composable
fun ProfileDivider() {
    Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(HoraeTheme.scheme.border))
}
