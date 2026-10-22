import Observation
import SwiftUI

/// App-wide tutorial state: the per-user preference, the set of hints already
/// dismissed, the fetched content, the transient peek/per-screen state, and the
/// (optional) manual tour.
///
/// Tutorial mode is a **PER-USER, per-device preference** — like the "Ce e nou"
/// popup's `lastSeenWhatsNewVersion`, not an org/admin switch. There is no
/// backend field: everything lives in `UserDefaults`, keyed by the logged-in
/// user's id (`tutorial.<userId>.enabled` / `.dismissedSteps`), so two accounts
/// sharing an iPad keep their own setting and their own "seen" hints.
///
/// Interaction model (see `TutorialOverlayModifier`): contextual, NOT a forced
/// next/next/next tour. While enabled, the FIRST undismissed anchor visible on
/// the current screen shows one small callout with a single "Am inteles" —
/// nothing is dimmed and nothing is blocked. On top of that:
///
/// - **Long-press peek** — holding any `.tutorialAnchor(id:)` shows that step's
///   hint on demand, even when it was dismissed forever (`peekedId`). Nothing
///   is written: a peek is a look, not a state change.
/// - **Per-screen dismiss-all** — the "Ascunde sfaturile" pill silences every
///   hint on the CURRENT screen visit (`screenDismissedIds`), a lighter,
///   NON-persisted sibling of "Am inteles"; it clears itself on navigation.
///
/// The help center's "Porneste turul" still exists as a user-triggered guided
/// replay of one flow (the research is clear that user-triggered tours beat
/// auto-triggered ones), rendered through the same small callout with a counter.
@Observable
final class TutorialCenter {
    static let shared = TutorialCenter()

    private init() {}

    /// Curated content from `GET /tutorial/content`, already filtered to the
    /// flows whose feature exists on iOS.
    private(set) var flows: [TutorialFlow] = []
    private(set) var isLoading = false
    private(set) var loadError: APIError?

    /// Per-user preference: show contextual hints at all.
    private(set) var enabled = false
    /// Step ids this user already acknowledged — never auto-shown again.
    private(set) var dismissedSteps: Set<String> = []

    /// The running manual tour (nil = contextual/auto mode).
    private(set) var activeFlow: TutorialFlow?
    private(set) var stepIndex = 0

    /// Step whose hint is being held open by a long press on its anchor (the
    /// touch twin of the web's hover-peek). Shown even when the step was
    /// dismissed forever — a peek never changes any saved state.
    private(set) var peekedId: String?
    private var peekTimeout: Task<Void, Never>?

    /// Anchor ids silenced by "Ascunde sfaturile" on the screen the user is on
    /// RIGHT NOW. Deliberately transient — never persisted (unlike
    /// `dismissedSteps`) and dropped as soon as none of those anchors is on
    /// screen anymore (i.e. the user navigated away), so hints keep working on
    /// other screens and come back on a later visit to this one.
    private(set) var screenDismissedIds: Set<String> = []

    /// Whose preferences are currently loaded (nil = logged out / not synced).
    private var boundUserId: String?

    var currentStep: TutorialStep? {
        guard let activeFlow, activeFlow.steps.indices.contains(stepIndex) else { return nil }
        return activeFlow.steps[stepIndex]
    }

    var isFirstStep: Bool { stepIndex == 0 }
    var isLastStep: Bool { (activeFlow?.steps.count ?? 0) - 1 <= stepIndex }

    /// Flows grouped for the help center, in server order within each category.
    var categories: [String] {
        var seen = Set<String>()
        return flows.compactMap { seen.insert($0.category).inserted ? $0.category : nil }
    }

    // MARK: - Per-user preference

    private static func key(_ userId: String, _ suffix: String) -> String {
        "tutorial.\(userId).\(suffix)"
    }

    /// Re-read the preferences of whoever is logged in NOW. Cheap and
    /// idempotent — call it from the app root and from Settings; it only
    /// touches `UserDefaults` when the account actually changed.
    @MainActor
    func syncCurrentUser() {
        let userId = AuthManager.shared.currentUser?.id
        guard userId != boundUserId else { return }
        boundUserId = userId
        stop()

        guard let userId else {
            enabled = false
            dismissedSteps = []
            return
        }
        let defaults = UserDefaults.standard
        enabled = defaults.bool(forKey: Self.key(userId, "enabled"))
        if let data = defaults.data(forKey: Self.key(userId, "dismissedSteps")),
            let ids = try? JSONDecoder().decode([String].self, from: data)
        {
            dismissedSteps = Set(ids)
        } else {
            dismissedSteps = []
        }
        if enabled {
            Task { await loadContentIfNeeded() }
        }
    }

    @MainActor
    func setEnabled(_ value: Bool) {
        enabled = value
        if let boundUserId {
            UserDefaults.standard.set(value, forKey: Self.key(boundUserId, "enabled"))
        }
        if value {
            Task { await loadContentIfNeeded() }
        } else {
            stop()
        }
    }

    func isDismissed(_ stepId: String) -> Bool { dismissedSteps.contains(stepId) }

    /// Acknowledge one hint ("Am inteles") — it never auto-shows again.
    @MainActor
    func dismiss(stepId: String) {
        guard dismissedSteps.insert(stepId).inserted else { return }
        persistDismissed()
    }

    /// Bring back every hint this user has already acknowledged.
    @MainActor
    func resetDismissed() {
        guard !dismissedSteps.isEmpty else { return }
        dismissedSteps = []
        persistDismissed()
    }

    private func persistDismissed() {
        guard let boundUserId else { return }
        let data = try? JSONEncoder().encode(Array(dismissedSteps))
        UserDefaults.standard.set(data, forKey: Self.key(boundUserId, "dismissedSteps"))
    }

    // MARK: - Long-press peek

    /// Show `id`'s hint while the user holds its anchor. Ignores
    /// `dismissedSteps` AND `screenDismissedIds` on purpose: this is the
    /// "remind me what this field does" affordance, available forever.
    @MainActor
    func peek(id: String) {
        guard enabled, activeFlow == nil, step(withId: id) != nil else { return }
        peekTimeout?.cancel()
        withAnimation(.spring(duration: 0.25)) { peekedId = id }
        // Safety net: a lift we never see (gesture cancelled by a scroll, a
        // sheet appearing over the anchor, ...) must not pin the bubble forever.
        peekTimeout = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled else { return }
            self?.endPeek(id: id)
        }
    }

    /// End the peek started by `id` (finger lifted). A no-op for any other id,
    /// so a stale release can't close a newer peek.
    @MainActor
    func endPeek(id: String) {
        guard peekedId == id else { return }
        clearPeek()
    }

    @MainActor
    func clearPeek() {
        peekTimeout?.cancel()
        peekTimeout = nil
        guard peekedId != nil else { return }
        withAnimation(.easeOut(duration: 0.2)) { peekedId = nil }
    }

    // MARK: - Per-screen dismiss-all ("Ascunde sfaturile")

    var hintsHiddenOnCurrentScreen: Bool { !screenDismissedIds.isEmpty }

    /// Silence every hint on the screen the user is looking at now.
    /// `anchorIds` = the anchors currently on screen; they double as this
    /// screen's fingerprint for `screenChanged`.
    @MainActor
    func dismissAllOnScreen(_ anchorIds: Set<String>) {
        guard !anchorIds.isEmpty else { return }
        clearPeek()
        withAnimation(.easeOut(duration: 0.2)) { screenDismissedIds = anchorIds }
    }

    /// Called by the overlay whenever the on-screen anchor set changes. Once
    /// none of the silenced screen's anchors is on screen we've navigated
    /// away — drop the suppression so the next screen behaves normally (and so
    /// this screen's hints return on a future visit).
    @MainActor
    func screenChanged(currentAnchorIds: Set<String>) {
        guard !screenDismissedIds.isEmpty else { return }
        if screenDismissedIds.isDisjoint(with: currentAnchorIds) {
            screenDismissedIds = []
        }
    }

    // MARK: - Content

    /// Fetch once per launch. Cheap public endpoint; a failure is surfaced in
    /// the help center but never blocks anything else.
    @MainActor
    func loadContentIfNeeded() async {
        guard flows.isEmpty, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await TutorialService.shared.fetchContent()
            // Web-only flows (e.g. Excel import/export) have no iOS screen at
            // all — listing them would only teach users to look for missing UI.
            flows = fetched.filter(\.supportsIOS)
            loadError = nil
        } catch let apiError as APIError {
            loadError = apiError
        } catch {
            loadError = .unknown(error.localizedDescription)
        }
    }

    func flow(id: String) -> TutorialFlow? { flows.first { $0.id == id } }

    /// The flow + step that own an anchor id, for the contextual callout.
    func step(withId stepId: String) -> (flow: TutorialFlow, step: TutorialStep)? {
        for flow in flows {
            if let step = flow.steps.first(where: { $0.id == stepId }) {
                return (flow, step)
            }
        }
        return nil
    }

    // MARK: - Manual tour (help center → "Porneste turul")

    @MainActor
    func start(flowId: String) {
        guard let flow = flow(id: flowId), !flow.steps.isEmpty else { return }
        stepIndex = 0
        clearPeek()
        screenDismissedIds = []
        withAnimation(.spring(duration: 0.3)) { activeFlow = flow }
    }

    @MainActor
    func next() {
        guard let activeFlow else { return }
        // Mark the step we're leaving as seen so it doesn't also auto-pop later.
        dismiss(stepId: activeFlow.steps[stepIndex].id)
        guard stepIndex + 1 < activeFlow.steps.count else { return stop() }
        withAnimation(.spring(duration: 0.25)) { stepIndex += 1 }
    }

    @MainActor
    func prev() {
        guard stepIndex > 0 else { return }
        withAnimation(.spring(duration: 0.25)) { stepIndex -= 1 }
    }

    @MainActor
    func stop() {
        withAnimation(.easeOut(duration: 0.25)) { activeFlow = nil }
        stepIndex = 0
        clearPeek()
        screenDismissedIds = []
    }
}
