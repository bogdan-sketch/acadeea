import SwiftUI

/// Collapsing page head of the main list screens (1.39.0): the big head
/// (eyebrow, title, action buttons/strips, search, stat tiles) hides when the
/// list scrolls DOWN and comes back as soon as it scrolls UP; at the very top
/// it is always shown. The single-row pill filters sit BETWEEN the head and
/// the list, outside both, so they stay pinned — and, being outside the
/// scroll view, never take part in its pull-to-refresh.
///
/// Usage:
/// ```swift
/// @State private var headVisible = true
/// VStack(spacing: 0) {
///     bigHead.autoCollapsible(headVisible)   // collapses
///     pillRows                               // pinned
///     ScrollView { rows }
///         .refreshable { … }                 // only the list refreshes
///         .autoHideOnScroll($headVisible)
/// }
/// ```
/// Works over UIKit-backed `List`s too. iOS 18+ reads the real scroll offset;
/// iOS 17 falls back to the drag direction. Reduce Motion: no animation.
extension View {
    /// Collapses this view in place (height → 0, clipped + faded) when `visible` is false,
    /// so it reappears in the exact same position when shown again.
    func autoCollapsible(_ visible: Bool) -> some View {
        self
            .frame(height: visible ? nil : 0, alignment: .top)
            .clipped()
            .opacity(visible ? 1 : 0)
            .allowsHitTesting(visible)
            .accessibilityHidden(!visible)
    }

    /// Attach to the scrollable content: scrolling down hides the head,
    /// scrolling up (or reaching the top) brings it back. Horizontal swipes
    /// (carousels, row actions) are ignored.
    func autoHideOnScroll(_ visible: Binding<Bool>) -> some View {
        modifier(AutoHideOnScrollModifier(visible: visible))
    }
}

private struct AutoHideOnScrollModifier: ViewModifier {
    @Binding var visible: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Lowest offset seen while shown / highest while hidden — the head flips
    /// once the list travels `threshold` away from it in the other direction.
    @State private var anchor: CGFloat = 0

    private static let threshold: CGFloat = 28
    /// Within this distance of the top the head is always shown.
    private static let topZone: CGFloat = 12
    private static let minScrollableForHide: CGFloat = 240

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content
                .onScrollGeometryChange(for: ScrollSample.self) { geo in
                    ScrollSample(
                        offset: geo.contentOffset.y + geo.contentInsets.top,
                        maxOffset: geo.contentSize.height + geo.contentInsets.top
                            + geo.contentInsets.bottom - geo.containerSize.height,
                        container: geo.containerSize.height)
                } action: { old, new in
                    handle(old: old, new: new)
                }
        } else {
            content.simultaneousGesture(
                DragGesture(minimumDistance: 12)
                    .onChanged { value in
                        guard abs(value.translation.height) > abs(value.translation.width) else { return }
                        set(value.translation.height > 0)
                    }
            )
        }
    }

    private func handle(old: ScrollSample, new: ScrollSample) {
        let y = new.offset
        // Top (or pulled past it, e.g. pull-to-refresh): always shown.
        if y <= Self.topZone {
            anchor = y
            set(true)
            return
        }
        // The head itself just collapsed/expanded and resized the list, or
        // the list is bouncing at its bottom edge: not a user scroll.
        if abs(new.container - old.container) > 0.5 || y >= new.maxOffset - 1 {
            anchor = y
            return
        }
        if visible {
            anchor = min(anchor, y)
            // A list barely taller than the screen would snap back to the top
            // once the head frees its room — keep the head there.
            if y - anchor > Self.threshold, new.maxOffset > Self.minScrollableForHide {
                anchor = y
                set(false)
            }
        } else {
            anchor = max(anchor, y)
            if anchor - y > Self.threshold {
                anchor = y
                set(true)
            }
        }
    }

    private func set(_ value: Bool) {
        guard visible != value else { return }
        if reduceMotion {
            visible = value
        } else {
            withAnimation(.easeInOut(duration: 0.22)) { visible = value }
        }
    }
}

private struct ScrollSample: Equatable {
    let offset: CGFloat
    let maxOffset: CGFloat
    let container: CGFloat
}
