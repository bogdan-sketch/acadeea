package com.horae.app.ui.tutorial

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalContext
import com.horae.app.data.remote.dto.TutorialFlowDto
import com.horae.app.data.repository.TutorialRepository
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber

/**
 * Cross-screen tutorial state — mirrors iOS `TutorialCenter` (@Observable singleton) / web
 * `TutorialProvider`. Loads the curated content once, drives the active (manual) tour flow/step
 * for [TutorialOverlay], and holds a small anchor registry so tagged composables
 * ([Modifier.tutorialAnchor]) can report their on-screen position for the current step's callout.
 *
 * Tutorial mode is a **PER-USER, per-device, client-local preference** — there is no
 * org/admin flag. [enabled] and the dismissed-step set are persisted in plain `SharedPreferences`
 * keyed by the signed-in user's id (`tutorial.<userId>.enabled` / `tutorial.<userId>.dismissed`),
 * mirroring [com.horae.app.data.local.BrandingManager]'s storage style (same simple-prefs
 * mechanism `TokenManager`/`BrandingManager` already use elsewhere in this app — a full DataStore
 * dependency isn't part of this codebase). [setCurrentUser] is called once from the nav root
 * whenever the signed-in user changes (login, session restore, logout) to (re)load this user's
 * local state; a `null` id (logged out) resets to the neutral off/empty state without touching
 * any other user's stored prefs.
 */
@Singleton
class TutorialCenter @Inject constructor(
    private val tutorialRepository: TutorialRepository,
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

    data class UiState(
        val activeFlow: TutorialFlowDto? = null,
        val stepIndex: Int = 0,
    ) {
        val currentStep get() = activeFlow?.steps?.getOrNull(stepIndex)
        val isFirstStep get() = stepIndex == 0
        val isLastStep get() = activeFlow == null || stepIndex >= activeFlow.steps.lastIndex
    }

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val _flows = MutableStateFlow<List<TutorialFlowDto>>(emptyList())
    val flows: StateFlow<List<TutorialFlowDto>> = _flows.asStateFlow()

    private var loadAttempted = false
    private var currentUserId: String? = null

    /** Per-user "tutorial mode" preference — off by default for a user who's never touched it. */
    var enabled by mutableStateOf(false)
        private set

    private val dismissedSteps = mutableStateMapOf<String, Boolean>()

    /** Anchor id → last-reported bounds in window coordinates, kept up to date by every
     * currently-composed `.tutorialAnchor(id)` element. Read by [TutorialOverlay] to find the
     * first undismissed step live on the current screen (auto mode) or the active tour step's
     * position (tour mode); a step with no live anchor on the current screen simply doesn't show. */
    val anchors = mutableStateMapOf<String, Rect>()

    /** Long-press "peek" (Android/iOS equivalent of the web hover-preview) — set by
     * [Modifier.tutorialAnchor]'s long-press gesture, shown immediately by [TutorialOverlay]
     * regardless of dismissed state, highest priority over tour/auto. Auto-clears itself. */
    var peekedId by mutableStateOf<String?>(null)
        private set

    fun peek(id: String) {
        peekedId = id
    }

    fun clearPeek(id: String) {
        if (peekedId == id) peekedId = null
    }

    /** Step ids hidden on the CURRENT screen only (the "Ascunde sfaturile" pill) — reset whenever
     * the active nav route changes ([onRouteChanged]), so other screens are unaffected and this
     * screen's hints return on a later visit. Distinct from [dismissedSteps], which is permanent.
     * Plain immutable-snapshot `Set` (not `SnapshotStateSet` — not available in this project's
     * pinned compose-runtime version) swapped wholesale on every change. */
    var routeDismissed by mutableStateOf<Set<String>>(emptySet())
        private set

    private var lastRoute: String? = null

    /** Called from [com.horae.app.ui.navigation.AppNavHost] whenever the active route changes —
     * clears both the per-screen dismiss-all set and any lingering long-press peek, since neither
     * should carry over to a different screen. */
    fun onRouteChanged(route: String?) {
        if (route == lastRoute) return
        lastRoute = route
        routeDismissed = emptySet()
        peekedId = null
    }

    /** Hides every hint on the current screen (the anchor ids currently live, per [anchors])
     * until the next route change. */
    fun hideAllOnScreen() {
        routeDismissed = routeDismissed + anchors.keys
    }

    suspend fun ensureContentLoaded() {
        if (loadAttempted && _flows.value.isNotEmpty()) return
        loadAttempted = true
        try {
            _flows.value = tutorialRepository.getContent().flows
        } catch (e: Exception) {
            Timber.w(e, "TutorialCenter: failed to load tutorial content")
        }
    }

    /** (Re)loads this user's local tutorial prefs. Call whenever the signed-in user changes
     * (login, session restore, logout → null). Cheap no-op if the id hasn't actually changed. */
    fun setCurrentUser(userId: String?) {
        if (userId == currentUserId) return
        currentUserId = userId
        stop()
        dismissedSteps.clear()
        if (userId == null) {
            enabled = false
            return
        }
        enabled = prefs.getBoolean(key(userId, "enabled"), false)
        prefs.getStringSet(key(userId, "dismissed"), null)?.forEach { dismissedSteps[it] = true }
    }

    fun setTutorialEnabled(value: Boolean) {
        enabled = value
        val userId = currentUserId ?: return
        prefs.edit().putBoolean(key(userId, "enabled"), value).apply()
    }

    fun isDismissed(stepId: String): Boolean = dismissedSteps.containsKey(stepId)

    fun dismiss(stepId: String) {
        if (dismissedSteps.containsKey(stepId)) return
        dismissedSteps[stepId] = true
        val userId = currentUserId ?: return
        prefs.edit().putStringSet(key(userId, "dismissed"), dismissedSteps.keys.toSet()).apply()
    }

    fun start(flowId: String) {
        val flow = _flows.value.firstOrNull { it.id == flowId } ?: return
        _uiState.value = UiState(activeFlow = flow, stepIndex = 0)
    }

    fun next() {
        val s = _uiState.value
        val flow = s.activeFlow ?: return
        // Mark the step we're leaving as seen so it doesn't also auto-pop later.
        s.currentStep?.let { dismiss(it.id) }
        if (s.stepIndex < flow.steps.lastIndex) {
            _uiState.value = s.copy(stepIndex = s.stepIndex + 1)
        } else {
            stop()
        }
    }

    fun prev() {
        val s = _uiState.value
        if (s.stepIndex > 0) _uiState.value = s.copy(stepIndex = s.stepIndex - 1)
    }

    fun stop() {
        _uiState.value = UiState()
    }

    fun reportAnchor(id: String, bounds: Rect) {
        anchors[id] = bounds
    }

    fun clearAnchor(id: String) {
        anchors.remove(id)
    }

    private fun key(userId: String, suffix: String) = "tutorial.$userId.$suffix"

    companion object {
        private const val PREFS_FILE = "horae_tutorial_prefs"
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface TutorialCenterEntryPoint {
    fun tutorialCenter(): TutorialCenter
}

/** Obtains the singleton [TutorialCenter] outside a `hiltViewModel()` scope (it isn't a ViewModel —
 * it must survive across every screen, not just one nav destination). */
@Composable
fun rememberTutorialCenter(): TutorialCenter {
    val appContext = LocalContext.current.applicationContext
    return remember {
        EntryPointAccessors.fromApplication(appContext, TutorialCenterEntryPoint::class.java)
            .tutorialCenter()
    }
}
