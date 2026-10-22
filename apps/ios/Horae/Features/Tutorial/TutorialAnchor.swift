import SwiftUI

/// Collects `[stepId: on-screen frame]` for every view tagged with
/// `.tutorialAnchor(id:)` and merges it UP the view tree to the root, where
/// `.tutorialOverlay()` reads it with `overlayPreferenceValue` and resolves the
/// current step's rect through its own `GeometryProxy`.
///
/// This is the standard SwiftUI coachmark plumbing: an `Anchor<CGRect>` is a
/// coordinate-space-free handle, so no tagged view needs its own GeometryReader
/// and nothing has to know where the overlay lives.
struct TutorialAnchorKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] { [:] }

    static func reduce(
        value: inout [String: Anchor<CGRect>],
        nextValue: () -> [String: Anchor<CGRect>]
    ) {
        // Last writer wins: if two screens ever tag the same id (e.g. a form
        // pushed over a list), the most recently rendered one is the visible one.
        value.merge(nextValue()) { _, new in new }
    }
}

extension View {
    /// Tag this view as the live coachmark target for a tutorial step id.
    /// Purely a measurement — it changes nothing visually and costs nothing
    /// while tutorial mode is off.
    ///
    /// While tutorial mode IS on it also wires **long-press peek** (the touch
    /// equivalent of the web's mouse hover): press and hold the tagged element
    /// for ~0.4s and its hint pops up on demand, even if it was acknowledged
    /// long ago; lifting the finger closes it and writes nothing.
    func tutorialAnchor(id: String) -> some View {
        modifier(TutorialAnchorModifier(id: id))
    }
}

/// Measures the tagged view and — while contextual hints are live — hosts the
/// press-and-hold peek gesture for its step.
private struct TutorialAnchorModifier: ViewModifier {
    let id: String

    @State private var center = TutorialCenter.shared
    /// Bumped on every peek start so the haptic fires once per hold.
    @State private var peekPulse = 0

    /// Gestures are armed only while contextual hints are live; with tutorial
    /// mode off (and during a guided tour) an anchor stays a pure measurement,
    /// exactly as before.
    private var isArmed: Bool { center.enabled && center.activeFlow == nil }

    func body(content: Content) -> some View {
        content
            .anchorPreference(key: TutorialAnchorKey.self, value: .bounds) { [id: $0] }
            // `simultaneousGesture` (never `.gesture`) so the tagged element
            // keeps its own behaviour: text fields still focus, buttons still
            // fire, lists still scroll. `including: .subviews` disarms the
            // gesture entirely when tutorial mode is off.
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.4, maximumDistance: 16)
                    .onEnded { _ in
                        center.peek(id: id)
                        peekPulse &+= 1
                    },
                including: isArmed ? .all : .subviews
            )
            // Lift (or a drag that ends) closes the peek. `TutorialCenter` also
            // keeps a timeout for the cases where this never arrives — the
            // gesture cancelled by a scroll, a sheet covering the anchor.
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { _ in center.endPeek(id: id) },
                including: isArmed ? .all : .subviews
            )
            .sensoryFeedback(.impact(weight: .light), trigger: peekPulse)
    }
}
