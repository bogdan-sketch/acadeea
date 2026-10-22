package com.horae.app.ui.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.nestedscroll.nestedScroll
import com.horae.app.data.remote.ApiErrors
import com.horae.app.ui.theme.HoraeTheme
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicLong

/*
 * Pull-to-refresh, the redesign way (spec R9):
 *  1. a refresh NEVER empties the list — keep the old items on screen until new ones arrive;
 *  2. a failed refresh keeps the data and shows a retryable error (ApiErrors.userMessage);
 *  3. a cancelled request (screen left, newer request) is silent — never a "cancelled" error;
 *  4. stale responses are dropped (RequestGate) so an older reply never overwrites a newer one.
 *
 * Screen:   HoraeRefreshBox(isRefreshing = state.isRefreshing, onRefresh = viewModel::refresh) { LazyColumn … }
 * ViewModel:
 *   private val gate = RequestGate()
 *   fun refresh() = viewModelScope.launch {
 *       val token = gate.next()
 *       _state.update { it.copy(isRefreshing = true) }          // items stay as they are
 *       runRefresh(onError = { e -> _state.update { it.copy(error = ApiErrors.userMessage(e)) } }) {
 *           val fresh = repo.load()
 *           if (gate.isCurrent(token)) _state.update { it.copy(items = fresh) }
 *       }
 *       if (gate.isCurrent(token)) _state.update { it.copy(isRefreshing = false) }
 *   }
 */

/**
 * Wraps scrollable [content] with the Material pull-to-refresh indicator (scheme accent).
 * A pull calls [onRefresh] once; the spinner stays until [isRefreshing] has gone true and
 * back to false (or ~0,5 s if the refresh finished before it was observed).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HoraeRefreshBox(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val refreshing by rememberUpdatedState(isRefreshing)
    val latestOnRefresh by rememberUpdatedState(onRefresh)
    val enabledState by rememberUpdatedState(enabled)
    val state = rememberPullToRefreshState(enabled = { enabledState })

    LaunchedEffect(state.isRefreshing) {
        if (!state.isRefreshing) return@LaunchedEffect
        latestOnRefresh()
        // Wait for the ViewModel to report the refresh (it may already be done)…
        withTimeoutOrNull(500) { snapshotFlow { refreshing }.first { it } }
        // …then for it to finish.
        snapshotFlow { refreshing }.first { !it }
        state.endRefresh()
    }

    val s = HoraeTheme.scheme
    // clipToBounds + only composing the indicator while pulled/refreshing: the idle
    // container sits just above the box and its shadow poked out under search fields
    // and chips placed above the list. Every screen gets this here, not per call site.
    Box(modifier.clipToBounds().nestedScroll(state.nestedScrollConnection)) {
        content()
        if (state.isRefreshing || state.progress > 0f) {
            PullToRefreshContainer(
                state = state,
                modifier = Modifier.align(Alignment.TopCenter),
                containerColor = s.card,
                contentColor = s.primary,
            )
        }
    }
}

/**
 * Monotonic request token: call [next] when a load starts, apply its result only if
 * [isCurrent] is still true (a newer load / refresh / filter change invalidates older ones).
 */
class RequestGate {
    private val counter = AtomicLong(0)
    fun next(): Long = counter.incrementAndGet()
    fun isCurrent(token: Long): Boolean = counter.get() == token
}

/**
 * Runs a (re)load: errors go to [onError] (keep showing the old data), cancellation is
 * silent and rethrown so structured concurrency still works. Returns the block's result,
 * or null when it failed.
 */
suspend fun <T> runRefresh(onError: (Throwable) -> Unit, block: suspend () -> T): T? = try {
    block()
} catch (e: CancellationException) {
    throw e
} catch (e: Throwable) {
    if (!ApiErrors.isCancellation(e)) onError(e)
    null
}
