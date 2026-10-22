import SwiftUI

/// Layout tokens + helpers for the REGULAR width class (iPad, large phones in
/// landscape). The compact (iPhone) layout is untouched — every helper here is
/// a no-op there, so screens opt in without forking their body.
enum AdaptiveLayout {
    /// Max width for "reading/editing" content (forms, details, settings) on
    /// wide screens. Wider than this a Form reads as a row of labels lost in
    /// whitespace.
    static let readableMaxWidth: CGFloat = 820

    /// Minimum card width when a list turns into a grid on wide screens.
    static let gridMinItemWidth: CGFloat = 340

    /// Page gutter shared by lists/grids (matches `.insetGrouped`).
    static let gutter: CGFloat = 20

    /// How many grid columns fit in `width` at `minItemWidth` per card.
    static func gridColumns(
        for width: CGFloat,
        minItemWidth: CGFloat = gridMinItemWidth,
        spacing: CGFloat = AppTheme.Spacing.md
    ) -> Int {
        max(1, Int((width + spacing) / (minItemWidth + spacing)))
    }
}

// MARK: - Environment

private struct ScreenBackgroundHandledKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Set by `.readableWidth()`: an ancestor already draws the page
    /// background full-bleed, so `.appScreenBackground()` inside must not
    /// paint a second (narrower) one — the gradient would double up.
    var screenBackgroundHandled: Bool {
        get { self[ScreenBackgroundHandledKey.self] }
        set { self[ScreenBackgroundHandledKey.self] = newValue }
    }
}

// MARK: - Readable width

private struct ReadableWidthModifier: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    let maxWidth: CGFloat
    let showsGradient: Bool

    func body(content: Content) -> some View {
        if sizeClass == .regular {
            content
                // Forms/Lists drop their own grouped background so they sit on
                // the page background drawn below, edge to edge.
                .scrollContentBackground(.hidden)
                .environment(\.screenBackgroundHandled, true)
                .frame(maxWidth: maxWidth)
                .frame(maxWidth: .infinity)
                .modifier(AppScreenBackground(showsGradient: showsGradient))
        } else {
            content
        }
    }
}

extension View {
    /// On wide screens, centre the content in a column of at most `maxWidth`
    /// points and paint the standard page background behind it. Compact: no-op.
    func readableWidth(
        _ maxWidth: CGFloat = AdaptiveLayout.readableMaxWidth,
        // No accent gradient by default: the same pushed screen looks the
        // same on iPhone and iPad (the redesign has none, web neither).
        showsGradient: Bool = false
    ) -> some View {
        modifier(ReadableWidthModifier(maxWidth: maxWidth, showsGradient: showsGradient))
    }
}

// MARK: - Card

/// Card chrome used when a list row is shown as a grid cell on wide screens.
struct AdaptiveCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.Colors.card)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg))
            .contentShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg))
    }
}

extension View {
    func adaptiveCard() -> some View { modifier(AdaptiveCardModifier()) }
}

// MARK: - Route width policy

extension Route {
    /// Screens that want the whole detail width on iPad (lists that become
    /// grids, boards, calendars, charts). Everything else — forms, details,
    /// settings — is centred in a readable column (`.readableWidth()`).
    var prefersFullWidth: Bool {
        switch self {
        case .taskList, .productionCalendar, .stockHistory,
             .recipeList, .recipeYieldHistory, .priceHistory,
             .rawMaterialList, .consumableList, .stockMovements, .expiryTracking,
             .stockSearch, .suppliers, .salesDeductions,
             .userList, .roleList,
             .orderList, .orderStats, .orderCalendar,
             .categoryManagement,
             .locationList, .locationStock, .locationDashboard, .myLocations,
             .transferList,
             .analyticsDashboard,
             .integrationList,
             .shoppingList, .activityFeed, .notificationInbox, .helpCenter:
            return true
        default:
            return false
        }
    }
}
