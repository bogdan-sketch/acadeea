import SwiftUI

/// iPad master → detail for one section (Stoc, Comenzi) inside the split
/// view's detail column: the section's own root list on the left (rendered at
/// compact width, exactly as on iPhone) and the selected screen on the right.
///
/// The root screens are not rebuilt: their rows keep `NavigationLink(value:)`.
/// The master stack's path is a `[Route]` binding that never grows — every
/// push it receives becomes the detail pane's root instead (`router.select`).
/// Further navigation inside the detail pane uses the section's normal path.
struct MasterDetailSection<Master: View, Detail: View>: View {
    let tab: AppTab
    let router: AppRouter
    let sidebarToggle: SidebarToggle?
    /// Width of the whole section (master + detail), from the caller's
    /// GeometryReader — the list column shrinks on iPad mini.
    var availableWidth: CGFloat = 1024
    @ViewBuilder let master: () -> Master
    @ViewBuilder let detail: (Route) -> Detail

    /// Prototype: list column ~360–380pt next to the detail; on iPad mini
    /// portrait (744pt) it gives up some width so the detail stays readable.
    private var masterWidth: CGFloat {
        min(380, max(320, (availableWidth * 0.45).rounded()))
    }

    private var masterPath: Binding<[Route]> {
        Binding(
            get: { [] },
            set: { routes in
                guard let route = routes.last else { return }
                router.select(route, on: tab)
            }
        )
    }

    var body: some View {
        HStack(spacing: 0) {
            NavigationStack(path: masterPath) {
                master()
                    // Required for the rows' NavigationLink(value:) to be live;
                    // the binding above reroutes them before anything shows.
                    .navigationDestination(for: Route.self) { _ in EmptyView() }
            }
            .environment(\.horizontalSizeClass, .compact)
            .environment(\.sidebarToggle, sidebarToggle)
            .environment(\.masterDetailSelection, router.selection(for: tab))
            .environment(\.routeNavigator, RouteNavigator { route in router.select(route, on: tab) })
            .frame(width: masterWidth)

            Rectangle()
                .fill(AppTheme.Colors.border)
                .frame(width: 1)
                .ignoresSafeArea()

            NavigationStack(path: router.path(for: tab)) {
                Group {
                    if let selection = router.selection(for: tab) {
                        detail(selection)
                            .id(selection)
                    } else {
                        placeholder
                    }
                }
                .navigationDestination(for: Route.self) { route in
                    detail(route)
                }
            }
            .environment(\.routeNavigator, RouteNavigator { route in router.push(route, on: tab) })
            .frame(maxWidth: .infinity)
        }
        .onAppear { router.masterDetailTabs.insert(tab) }
        .onDisappear { router.masterDetailTabs.remove(tab) }
    }

    private var placeholder: some View {
        ContentUnavailableView(
            tab == .orders ? "Alege o comandă" : "Alege un produs",
            systemImage: tab == .orders ? "bag" : "cube",
            description: Text(tab == .orders
                ? "Detaliile comenzii apar aici."
                : "Loturile și mișcările apar aici.")
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

#Preview("MasterDetailSection") {
    MasterDetailSection(
        tab: .orders,
        router: AppRouter(),
        sidebarToggle: SidebarToggle(isHidden: false, toggle: {}),
        master: { OrderListView() },
        detail: { _ in Text("Detaliu") }
    )
}
