package com.horae.app.ui.tutorial

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.horae.app.data.remote.dto.TutorialFlowDto
import com.horae.app.data.remote.dto.TutorialStepDto

/**
 * Contextual tutorial callout — NOT a full-screen forced tour (mirrors web
 * `components/tutorial-overlay.tsx`, see that file's docblock for the underlying UX research).
 * Mounted once near the app root ([com.horae.app.ui.navigation.AppNavHost] `MainAppShell`).
 * Renders nothing while [TutorialCenter.enabled] is off — this is a per-user preference, not an
 * org switch.
 *
 * Three ways a hint shows, in priority order (mirrors web `tutorial-overlay.tsx`):
 * 1. **Long-press peek**: holding any [Modifier.tutorialAnchor] shows its tip immediately, even if
 *    already dismissed — highest priority while active.
 * 2. **Tour mode**: a manual "Pornește turul" from the help center sets an active flow; the
 *    callout instead follows that flow's current step (Prev/Next + a step counter) — but only
 *    while that step's anchor is actually live on the current screen; multi-screen flows simply
 *    show nothing until the user navigates to the right screen.
 * 3. **Auto mode** (default, lowest priority): scans the curated flows, in their authored order,
 *    for the first step whose id (a) has a live anchor on the CURRENT screen, (b) hasn't been
 *    dismissed by this user forever, and (c) isn't hidden for this screen visit only (the
 *    "Ascunde sfaturile" pill, [TutorialCenter.routeDismissed]) — shows one callout with a single
 *    "Am înțeles" that dismisses it forever.
 *
 * A floating "Ascunde sfaturile" pill (bottom-start, shown whenever at least one auto-mode hint
 * is showable on this screen) hides every hint on the CURRENT screen only —
 * [TutorialCenter.onRouteChanged] clears it automatically on navigation.
 */
@Composable
fun TutorialOverlay(modifier: Modifier = Modifier) {
    val center = rememberTutorialCenter()
    val uiState by center.uiState.collectAsState()
    val flows by center.flows.collectAsState()
    val anchors = center.anchors
    val routeDismissed = center.routeDismissed
    val peekedId = center.peekedId

    if (!center.enabled || flows.isEmpty()) return

    fun findFlowStep(id: String): Pair<TutorialFlowDto, TutorialStepDto>? =
        flows.asSequence()
            .flatMap { flow -> flow.steps.asSequence().map { step -> flow to step } }
            .firstOrNull { (_, step) -> step.id == id }

    val activeFlow = uiState.activeFlow
    val target: Triple<TutorialFlowDto, TutorialStepDto, Rect>? = when {
        peekedId != null -> {
            val rect = anchors[peekedId]
            val found = findFlowStep(peekedId)
            if (rect != null && found != null) Triple(found.first, found.second, rect) else null
        }
        activeFlow != null -> {
            val step = uiState.currentStep
            val rect = step?.let { anchors[it.id] }
            if (step != null && rect != null) Triple(activeFlow, step, rect) else null
        }
        else -> {
            flows.asSequence()
                .flatMap { flow -> flow.steps.asSequence().map { step -> flow to step } }
                .firstNotNullOfOrNull { (flow, step) ->
                    val rect = anchors[step.id]
                    if (rect != null && step.id !in routeDismissed && !center.isDismissed(step.id)) {
                        Triple(flow, step, rect)
                    } else null
                }
        }
    }

    // Anything eligible (live anchor, not permanently dismissed) even if hidden-for-this-screen —
    // drives whether the "Ascunde sfaturile" pill itself should show.
    val anyEligibleOnScreen = activeFlow == null && peekedId == null && flows.any { flow ->
        flow.steps.any { step -> anchors[step.id] != null && !center.isDismissed(step.id) }
    }

    if (anyEligibleOnScreen) {
        Box(modifier.fillMaxSize()) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(16.dp),
                shape = RoundedCornerShape(50),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shadowElevation = 4.dp,
                onClick = { center.hideAllOnScreen() },
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        Icons.Default.VisibilityOff,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(0.dp),
                    )
                    Text(
                        "Ascunde sfaturile (pe ecranul ăsta)",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    val (flow, step, anchorRect) = target ?: return
    val inTour = activeFlow != null
    val isPeek = peekedId != null

    val density = LocalDensity.current
    var cardSize by remember { mutableStateOf(IntSize.Zero) }

    BoxWithConstraints(modifier.fillMaxSize()) {
        val screenWidthPx = with(density) { maxWidth.toPx() }
        val screenHeightPx = with(density) { maxHeight.toPx() }
        val marginPx = with(density) { 16.dp.toPx() }

        val offsetPx = remember(anchorRect, cardSize, screenWidthPx, screenHeightPx) {
            if (cardSize == IntSize.Zero) {
                IntOffset(0, 0)
            } else {
                val spaceBelow = screenHeightPx - anchorRect.bottom
                val spaceAbove = anchorRect.top
                val y = if (spaceBelow >= cardSize.height + marginPx || spaceBelow >= spaceAbove) {
                    anchorRect.bottom + marginPx
                } else {
                    anchorRect.top - marginPx - cardSize.height
                }.coerceIn(marginPx, (screenHeightPx - cardSize.height - marginPx).coerceAtLeast(marginPx))
                val x = (anchorRect.center.x - cardSize.width / 2f)
                    .coerceIn(marginPx, (screenWidthPx - cardSize.width - marginPx).coerceAtLeast(marginPx))
                IntOffset(x.toInt(), y.toInt())
            }
        }

        Surface(
            modifier = Modifier
                .offset { offsetPx }
                .onSizeChanged { cardSize = it }
                .widthIn(max = 320.dp)
                .padding(horizontal = 20.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            shadowElevation = 6.dp,
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Lightbulb,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(end = 6.dp),
                        )
                        Text(
                            flow.title + if (inTour) " · ${uiState.stepIndex + 1}/${flow.steps.size}" else "",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (!isPeek) {
                        IconButton(onClick = { if (inTour) center.stop() else center.dismiss(step.id) }) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Închide",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                Text(step.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(step.body, style = MaterialTheme.typography.bodySmall)
                if (inTour) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        TextButton(onClick = center::prev, enabled = !uiState.isFirstStep) {
                            Text("Anterior")
                        }
                        TextButton(onClick = center::next) {
                            Text(if (uiState.isLastStep) "Termină" else "Continuă")
                        }
                    }
                } else if (!isPeek) {
                    TextButton(
                        onClick = { center.dismiss(step.id) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Am înțeles")
                    }
                }
            }
        }
    }
}
