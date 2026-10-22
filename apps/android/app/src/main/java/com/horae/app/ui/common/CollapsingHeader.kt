package com.horae.app.ui.common

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Velocity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/*
 * Sticky pill filters + collapsing page head (1.39.0) — the ONE mechanism for every main list page.
 *
 *   CollapsingHeaderLayout(
 *       header = { HScreenTitle(…); HSearchField(…) },   // hides on scroll down, back on scroll up
 *       pinned = { OrdersTopControls(…) },              // single-row pill filters: always visible
 *   ) { HoraeRefreshBox(…) { LazyColumn(…) } }           // the list (pull-to-refresh lives HERE only)
 *
 * The head follows the finger ("enterAlways"): a scroll down first slides the head away, a scroll
 * up brings it back before the list moves — so at the very top everything is visible. The list
 * area grows by exactly what the head gives up, so rows never jump. After a fling the head settles
 * fully shown / hidden (instantly with Reduce Motion — no animation). The pinned pill rows sit
 * OUTSIDE the scroll content and outside any pull-to-refresh: they only scroll horizontally, a
 * vertical drag on them does nothing. Nested instances work (Stoc → tab page): the outer head
 * collapses first, then the inner one.
 */

/** Collapse offset of one [CollapsingHeaderLayout] head (0 = fully shown, [heightPx] = hidden). */
@Stable
class CollapsingHeaderState {
    /** Pixels currently hidden. */
    var offsetPx by mutableFloatStateOf(0f)
        internal set

    /** Measured head height (plain field: written in layout, read when scrolling). */
    internal var heightPx: Float = 0f

    /** 0 = shown … 1 = hidden. */
    val collapsedFraction: Float get() = if (heightPx <= 0f) 0f else (offsetPx / heightPx).coerceIn(0f, 1f)

    internal var reduceMotion: Boolean = false
    internal var scope: CoroutineScope? = null
    private var settleJob: Job? = null

    /** Show the whole head again (e.g. after a filter switch scrolled the list to the top). */
    fun expand() {
        settleJob?.cancel()
        offsetPx = 0f
    }

    internal val connection = object : NestedScrollConnection {
        override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
            if (heightPx <= 0f || available.y == 0f) return Offset.Zero
            settleJob?.cancel()
            val old = offsetPx
            val new = (old - available.y).coerceIn(0f, heightPx)
            offsetPx = new
            return Offset(0f, old - new)
        }

        override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
            settle()
            return Velocity.Zero
        }
    }

    /** Half-way heads snap to the nearest end (no animation with Reduce Motion). */
    private fun settle() {
        if (heightPx <= 0f || offsetPx <= 0f || offsetPx >= heightPx) return
        val target = if (offsetPx > heightPx / 2f) heightPx else 0f
        if (reduceMotion) {
            offsetPx = target
            return
        }
        settleJob = scope?.launch {
            val anim = Animatable(offsetPx)
            anim.animateTo(target, tween(180)) { offsetPx = value.coerceIn(0f, heightPx) }
        }
    }
}

@Composable
fun rememberCollapsingHeaderState(): CollapsingHeaderState = remember { CollapsingHeaderState() }

/**
 * Page head ([header], collapses) + [pinned] pill rows (stay) + [content] (the list, fills the
 * rest). See the file comment.
 */
@Composable
fun CollapsingHeaderLayout(
    modifier: Modifier = Modifier,
    state: CollapsingHeaderState = rememberCollapsingHeaderState(),
    header: @Composable ColumnScope.() -> Unit,
    pinned: @Composable ColumnScope.() -> Unit = {},
    content: @Composable BoxScope.() -> Unit,
) {
    val reduceMotion = rememberReduceMotion()
    val scope = rememberCoroutineScope()
    state.reduceMotion = reduceMotion
    state.scope = scope
    Column(modifier.nestedScroll(state.connection)) {
        CollapsingBox(state) { Column(Modifier.fillMaxWidth(), content = header) }
        Column(Modifier.fillMaxWidth(), content = pinned)
        Box(Modifier.fillMaxWidth().weight(1f), content = content)
    }
}

/** Measures [content] at full height and shows only the part not yet scrolled away, fading it out. */
@Composable
private fun CollapsingBox(state: CollapsingHeaderState, content: @Composable () -> Unit) {
    val current by rememberUpdatedState(state)
    Layout(content = content, modifier = Modifier.fillMaxWidth().clipToBounds()) { measurables, constraints ->
        val placeable = measurables.firstOrNull()
            ?.measure(constraints.copy(minHeight = 0, maxHeight = Constraints.Infinity))
        val full = placeable?.height ?: 0
        current.heightPx = full.toFloat()
        val offset = current.offsetPx.coerceIn(0f, full.toFloat())
        val fraction = if (full == 0) 0f else offset / full
        layout(placeable?.width ?: constraints.minWidth, (full - offset).roundToInt().coerceAtLeast(0)) {
            placeable?.placeWithLayer(0, -offset.roundToInt()) { alpha = 1f - fraction }
        }
    }
}
