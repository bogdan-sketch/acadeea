package com.horae.app.ui.tutorial

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalViewConfiguration
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Tags a real composable as a live coachmark target for [TutorialOverlay]: reports its bounds
 * (root-relative — the same coordinate space [TutorialOverlay] draws in, so no window-inset
 * math is needed) into [TutorialCenter.anchors] under [id] on every layout pass, and clears the
 * entry when the element leaves composition (screen navigated away, etc.) so the overlay never
 * spotlights a stale, off-screen rect.
 *
 * Android's equivalent of the iOS `.tutorialAnchor(id:)` PreferenceKey / web `data-tutorial-id`.
 * Only tag elements that genuinely exist — this reports positions, it never fabricates a target.
 *
 * Also wires a long-press "peek" (Android/iOS's counterpart to the web hover-preview): holding a
 * tagged element for the platform's long-press timeout shows its tip immediately via
 * [TutorialCenter.peek], even if already permanently dismissed, auto-clearing ~2.5s after release
 * so it never lingers. Uses a low-level `pointerInput` gesture (rather than
 * `Modifier.combinedClickable`'s `onLongClick`) so this composes cleanly onto elements that
 * already have their own click handling (buttons, fields, rows) without stealing or conflicting
 * with their tap behavior.
 */
fun Modifier.tutorialAnchor(id: String): Modifier = composed {
    val center = rememberTutorialCenter()
    val scope = rememberCoroutineScope()
    DisposableEffect(id) {
        onDispose { center.clearAnchor(id) }
    }
    val longPressTimeout = LocalViewConfiguration.current.longPressTimeoutMillis
    this
        .onGloballyPositioned { coordinates ->
            if (coordinates.isAttached) {
                center.reportAnchor(id, coordinates.boundsInRoot())
            }
        }
        .pointerInput(id, longPressTimeout) {
            awaitEachGesture {
                // Pass = Initial (before the element's own gesture handlers) so this observes the
                // down/up stream without consuming it — the element's own click/tap still fires.
                awaitFirstDown(pass = PointerEventPass.Initial)
                val longPressed = withTimeoutOrNull(longPressTimeout) {
                    // Wait for either an up (released early — not a long press) or the timeout.
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (event.changes.any { it.changedToUp() }) return@withTimeoutOrNull false
                    }
                    @Suppress("UNREACHABLE_CODE") true
                }
                if (longPressed == null) {
                    // Timed out while still pressed = a genuine long press. The auto-clear runs on
                    // an unrestricted scope — `delay` can't be called directly inside
                    // awaitEachGesture's restricted-suspension AwaitPointerEventScope.
                    center.peek(id)
                    scope.launch {
                        delay(2500)
                        center.clearPeek(id)
                    }
                }
            }
        }
}
