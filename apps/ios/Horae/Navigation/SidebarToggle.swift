import SwiftUI

// MARK: - Sidebar toggle (iPad)

/// The iPad "hide / show sidebar" control, handed down the environment by
/// `AppTabView` to the section roots (regular width only). Screens never own
/// it: `HScreenTitle` and the dashboard header render `SidebarToggleButton`,
/// which draws nothing when the value is absent (iPhone, pushed screens).
struct SidebarToggle {
    let isHidden: Bool
    let toggle: () -> Void

    var label: String { isHidden ? "Arată bara laterală" : "Ascunde bara laterală" }
}

private struct SidebarToggleKey: EnvironmentKey {
    static let defaultValue: SidebarToggle? = nil
}

extension EnvironmentValues {
    var sidebarToggle: SidebarToggle? {
        get { self[SidebarToggleKey.self] }
        set { self[SidebarToggleKey.self] = newValue }
    }
}

/// `sidebar.left` icon button that collapses / expands the iPad sidebar.
/// Empty when no `sidebarToggle` is in the environment.
struct SidebarToggleButton: View {
    @Environment(\.sidebarToggle) private var sidebarToggle

    var body: some View {
        if let sidebarToggle {
            HIconButton("sidebar.left", label: sidebarToggle.label, action: sidebarToggle.toggle)
                .accessibilityIdentifier("sidebarToggle")
        }
    }
}

// MARK: - Master / detail selection

private struct MasterDetailSelectionKey: EnvironmentKey {
    static let defaultValue: Route? = nil
}

extension EnvironmentValues {
    /// The route shown in the detail pane when a section (Stoc, Comenzi) runs
    /// as master → detail on iPad; lists use it to highlight the open row.
    var masterDetailSelection: Route? {
        get { self[MasterDetailSelectionKey.self] }
        set { self[MasterDetailSelectionKey.self] = newValue }
    }
}

private struct MasterDetailHighlight: ViewModifier {
    @Environment(\.masterDetailSelection) private var selection
    let route: Route
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        let isOn = selection == route
        content
            .overlay {
                if isOn {
                    let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    shape.fill(AppTheme.Colors.primary.opacity(0.07))
                        // Inset accent bar on the leading edge (prototype).
                        .overlay(alignment: .leading) {
                            Rectangle()
                                .fill(AppTheme.Colors.primary)
                                .frame(width: 3)
                        }
                        .clipShape(shape)
                        .allowsHitTesting(false)
                }
            }
            .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

extension View {
    /// Highlights this list row while `route` is open in the iPad detail pane.
    func masterDetailHighlight(_ route: Route, cornerRadius: CGFloat = 0) -> some View {
        modifier(MasterDetailHighlight(route: route, cornerRadius: cornerRadius))
    }
}

#Preview("SidebarToggleButton") {
    VStack(alignment: .leading, spacing: 16) {
        HScreenTitle("Stoc", eyebrow: "214 articole")
        Text("Fistic crud")
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .masterDetailHighlight(.rawMaterialDetail(id: "1"))
    }
    .environment(\.sidebarToggle, SidebarToggle(isHidden: false, toggle: {}))
    .environment(\.masterDetailSelection, .rawMaterialDetail(id: "1"))
    .padding()
    .background(AppTheme.Colors.appBackground)
}
