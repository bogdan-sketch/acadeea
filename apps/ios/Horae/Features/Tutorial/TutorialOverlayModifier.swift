import SwiftUI

/// Root-level contextual tutorial hint — deliberately NOT a full-screen,
/// next/next/next tour. Attach ONCE at the app root (`AppTabView`), next to
/// `.toastOverlay()`.
///
/// Three ways a hint shows, in priority order:
///
/// 1. **Long-press peek (highest)** — press and hold any `.tutorialAnchor(id:)`
///    and its hint pops up immediately, even if already dismissed forever (see
///    `TutorialCenter.peek`). The touch equivalent of the web's mouse hover;
///    lifting the finger closes it and writes nothing.
/// 2. **Tour (opt-in)** — "Porneste turul" in the help center walks one flow's
///    steps in order through the SAME bubble, with a step counter and
///    Inapoi / Inainte. It follows the user across screens: when a screen
///    carrying the step's anchor appears, the bubble snaps onto it.
/// 3. **Contextual (default, lowest)** — while the user has tutorial mode on
///    (per-user setting, see `TutorialCenter`), the overlay looks at every
///    `.tutorialAnchor(id:)` currently on screen, picks the topmost one the
///    user hasn't acknowledged — permanently ("Am inteles") OR just for this
///    screen visit ("Ascunde sfaturile") — and shows ONE small bubble next to
///    it. No scrim, nothing dimmed, nothing blocked.
///
/// The floating "Ascunde sfaturile" pill (bottom-leading, only while this
/// screen has hints at all) is the lighter, transient sibling of "Am inteles":
/// it silences every hint on the CURRENT screen visit only and clears itself as
/// soon as the user navigates away.
struct TutorialOverlay: ViewModifier {
    @State private var center = TutorialCenter.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlayPreferenceValue(TutorialAnchorKey.self) { anchors in
            let anchorIds = Set(anchors.keys)
            ZStack(alignment: .bottomLeading) {
                GeometryReader { proxy in
                    if let target = resolve(anchors: anchors, proxy: proxy) {
                        TutorialCallout(
                            flow: target.flow,
                            step: target.step,
                            anchorRect: target.rect,
                            canvas: proxy.size,
                            mode: target.mode,
                            stepIndex: center.stepIndex,
                            reduceMotion: reduceMotion
                        )
                        .id(target.step.id)
                        .transition(
                            reduceMotion
                                ? .opacity
                                : .opacity.combined(with: .scale(scale: 0.96))
                        )
                    }
                }

                if shouldShowDismissAll(anchorIds: anchorIds) {
                    DismissAllPill { center.dismissAllOnScreen(anchorIds) }
                        .padding(.leading, AppTheme.Spacing.md)
                        .padding(.bottom, AppTheme.Spacing.md)
                        .transition(.opacity)
                }
            }
            .zIndex(998)  // under the toast banner, over everything else
            // The anchor set IS the screen fingerprint: when none of the
            // silenced screen's anchors is on screen anymore, the user has
            // navigated away and the per-screen hide is dropped.
            .onChange(of: anchorIds) { _, new in center.screenChanged(currentAnchorIds: new) }
        }
    }

    enum Mode { case peek, tour, auto }

    private struct Target {
        let flow: TutorialFlow
        let step: TutorialStep
        /// Frame of the tagged view in the root's coordinate space; nil when the
        /// step's element isn't on the screen currently visible (tour mode only).
        let rect: CGRect?
        let mode: Mode
    }

    /// Peek wins, then tour, then the topmost anchor on screen that is neither
    /// permanently nor per-screen dismissed.
    private func resolve(
        anchors: [String: Anchor<CGRect>],
        proxy: GeometryProxy
    ) -> Target? {
        if let peekedId = center.peekedId, let match = center.step(withId: peekedId) {
            return Target(
                flow: match.flow, step: match.step,
                rect: anchors[peekedId].map { proxy[$0] }, mode: .peek)
        }

        if let flow = center.activeFlow, let step = center.currentStep {
            return Target(
                flow: flow, step: step, rect: anchors[step.id].map { proxy[$0] }, mode: .tour)
        }
        guard center.enabled, !center.flows.isEmpty else { return nil }

        for (id, rect) in visibleAnchors(anchors, proxy: proxy)
        where !center.isDismissed(id) && !center.screenDismissedIds.contains(id) {
            if let match = center.step(withId: id) {
                return Target(flow: match.flow, step: match.step, rect: rect, mode: .auto)
            }
        }
        return nil
    }

    /// The pill shows whenever this screen HAS hints at all — including ones
    /// already acknowledged, since a long-press peek can bring any of them
    /// back and the pill is what silences the screen again. Hidden during a
    /// tour, during a peek, and once the screen is already silenced.
    private func shouldShowDismissAll(anchorIds: Set<String>) -> Bool {
        guard center.enabled, center.activeFlow == nil, center.peekedId == nil,
            center.screenDismissedIds.isEmpty
        else { return false }
        return anchorIds.contains { center.step(withId: $0) != nil }
    }

    /// Dictionaries are unordered — rank by on-screen position so "the first
    /// hint" is deterministic and matches reading order (top to bottom).
    private func visibleAnchors(
        _ anchors: [String: Anchor<CGRect>], proxy: GeometryProxy
    ) -> [(String, CGRect)] {
        let canvas = CGRect(origin: .zero, size: proxy.size)
        return
            anchors
            .compactMap { id, anchor -> (String, CGRect)? in
                let rect = proxy[anchor]
                guard rect.width > 0, rect.height > 0, canvas.intersects(rect) else { return nil }
                return (id, rect)
            }
            .sorted { lhs, rhs in
                lhs.1.minY == rhs.1.minY ? lhs.1.minX < rhs.1.minX : lhs.1.minY < rhs.1.minY
            }
    }
}

/// "Ascunde sfaturile" — silences every hint on the current screen only.
private struct DismissAllPill: View {
    let action: () -> Void

    @State private var taps = 0

    var body: some View {
        Button {
            taps &+= 1
            action()
        } label: {
            Label("Ascunde sfaturile", systemImage: "eye.slash")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .padding(.horizontal, AppTheme.Spacing.md)
                .frame(minHeight: 44)
                .background(AppTheme.Colors.card, in: Capsule())
                .overlay(Capsule().strokeBorder(AppTheme.Colors.separator, lineWidth: 1))
                .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .contentShape(Capsule())
        .sensoryFeedback(.selection, trigger: taps)
        .accessibilityLabel("Ascunde sfaturile de pe acest ecran")
        .accessibilityHint(
            "Sfaturile revin cand deschizi din nou ecranul. Tine apasat pe un camp ca sa vezi sfatul lui oricand."
        )
    }
}

extension View {
    /// Attach ONCE at the app root (AppTabView), next to `.toastOverlay()`.
    func tutorialOverlay() -> some View { modifier(TutorialOverlay()) }
}

// MARK: - Callout

/// The bubble itself: a small card anchored under (or over) the element it
/// describes, plus a thin ring around that element. Everything except the card
/// is hit-transparent, so the screen underneath stays fully usable.
private struct TutorialCallout: View {
    let flow: TutorialFlow
    let step: TutorialStep
    let anchorRect: CGRect?
    let canvas: CGSize
    let mode: TutorialOverlay.Mode
    let stepIndex: Int
    let reduceMotion: Bool

    @State private var cardHeight: CGFloat = 0

    private var center: TutorialCenter { .shared }

    private var isTour: Bool { mode == .tour }
    private var isPeek: Bool { mode == .peek }

    private var cardWidth: CGFloat { min(340, canvas.width - 2 * Self.margin) }

    private static let margin: CGFloat = 16
    private static let gap: CGFloat = 12

    /// Ring around the described element, padded so it isn't hugged too tight.
    private var ring: CGRect? { anchorRect?.insetBy(dx: -6, dy: -6) }

    /// Below the element when it fits, above otherwise; with no element at all
    /// (tour step whose screen isn't open) the card sits near the bottom.
    private var cardOrigin: CGPoint {
        guard let ring else {
            return CGPoint(
                x: (canvas.width - cardWidth) / 2,
                y: max(Self.margin, canvas.height - cardHeight - 64))
        }
        let below = ring.maxY + Self.gap
        let above = ring.minY - Self.gap - cardHeight
        let fitsBelow = below + cardHeight <= canvas.height - Self.margin
        let y = fitsBelow ? below : max(Self.margin, above)
        let x = min(
            max(Self.margin, ring.minX), max(Self.margin, canvas.width - cardWidth - Self.margin))
        return CGPoint(x: x, y: y)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let ring {
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md, style: .continuous)
                    .strokeBorder(AppTheme.Colors.primary.opacity(0.9), lineWidth: 2)
                    .frame(width: ring.width, height: ring.height)
                    .offset(x: ring.minX, y: ring.minY)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            card
                .frame(width: cardWidth)
                .background(
                    GeometryReader { geo in
                        Color.clear.onAppear { cardHeight = geo.size.height }
                            .onChange(of: geo.size.height) { _, new in cardHeight = new }
                    }
                )
                .offset(x: cardOrigin.x, y: cardOrigin.y)
                // A peek is a transient look at the element being held — it must
                // never swallow the touch that is producing it.
                .allowsHitTesting(!isPeek)
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.3), value: anchorRect)
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack(spacing: AppTheme.Spacing.xs) {
                Image(systemName: "lightbulb.fill")
                    .font(.caption2)
                    .foregroundStyle(AppTheme.Colors.primary)
                Text(flow.title)
                    .font(.caption)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineLimit(1)
                Spacer(minLength: AppTheme.Spacing.xs)
                if isTour {
                    Text("\(stepIndex + 1)/\(flow.steps.count)")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, AppTheme.Spacing.sm)
                        .padding(.vertical, AppTheme.Spacing.xxs)
                        .background(AppTheme.Colors.primary.opacity(0.14), in: Capsule())
                        .foregroundStyle(AppTheme.Colors.label)
                        .fixedSize()
                }
            }

            Text(step.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.Colors.label)

            Text(step.body)
                .font(.footnote)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .fixedSize(horizontal: false, vertical: true)

            if isTour && anchorRect == nil {
                Label(
                    "Deschide ecranul descris mai sus ca sa vezi elementul evidentiat.",
                    systemImage: "info.circle"
                )
                .font(.caption)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }

            controls.padding(.top, AppTheme.Spacing.xxs)
        }
        .padding(AppTheme.Spacing.md)
        .background(
            AppTheme.Colors.card,
            in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg, style: .continuous)
                .strokeBorder(AppTheme.Colors.primary.opacity(0.35), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.18), radius: 14, y: 5)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            isTour
                ? "\(flow.title), pasul \(stepIndex + 1) din \(flow.steps.count)"
                : "Sfat: \(step.title)")
    }

    @ViewBuilder
    private var controls: some View {
        if isTour {
            HStack(spacing: AppTheme.Spacing.sm) {
                Button("Inchide") { center.stop() }
                    .font(.footnote)
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityLabel("Inchide turul")

                Spacer(minLength: 0)

                if !center.isFirstStep {
                    Button("Inapoi") { center.prev() }
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(AppTheme.Colors.primary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                        .accessibilityLabel("Pasul anterior")
                }

                Button(center.isLastStep ? "Gata" : "Inainte") { center.next() }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .frame(minHeight: 44)
                    .background(AppTheme.Colors.primary, in: Capsule())
                    .contentShape(Capsule())
                    .accessibilityLabel(center.isLastStep ? "Termina turul" : "Pasul urmator")
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.selection, trigger: stepIndex)
        } else if isPeek {
            // Held on purpose — no buttons to hit while the finger is down, and
            // nothing is marked as seen. Just say how it got here.
            Label("Sfat afisat cat tii apasat", systemImage: "hand.tap")
                .font(.caption)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
        } else {
            HStack(spacing: AppTheme.Spacing.sm) {
                Spacer(minLength: 0)
                Button("Am inteles") { center.dismiss(stepId: step.id) }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .frame(minHeight: 44)
                    .background(AppTheme.Colors.primary, in: Capsule())
                    .contentShape(Capsule())
                    .accessibilityHint("Ascunde acest sfat definitiv")
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.selection, trigger: step.id)
        }
    }
}
