import SwiftUI
import Observation

/// One-shot deep link de pe homepage catre tabul Stoc: cardurile quick-info
/// de stoc de pe dashboard cer "deschide stocul filtrat pe <status>, la
/// <locatia selectata pe homepage>". AppTabView comuta tabul pe schimbarea
/// lui `requestID`; StockOverviewView consuma intentia (o singura data).
@Observable
final class StockDeepLink {
    static let shared = StockDeepLink()

    /// Creste la fiecare cerere — declanseaza onChange in AppTabView/StockOverviewView.
    private(set) var requestID = 0
    private var pending: (status: MaterialStatus?, locationId: String?)?

    func open(status: MaterialStatus?, locationId: String?) {
        pending = (status, locationId)
        requestID += 1
    }

    /// Returneaza si goleste intentia (one-shot).
    func consume() -> (status: MaterialStatus?, locationId: String?)? {
        defer { pending = nil }
        return pending
    }
}

/// Per-tab navigation path management.
@Observable
final class AppRouter {
    var dashboardPath = NavigationPath()
    var ordersPath = NavigationPath()
    var tasksPath = NavigationPath()
    var stockPath = NavigationPath()
    var recipesPath = NavigationPath()

    func popToRoot(tab: AppTab) {
        switch tab {
        case .dashboard: dashboardPath = NavigationPath()
        case .orders: ordersPath = NavigationPath()
        case .tasks: tasksPath = NavigationPath()
        case .stock: stockPath = NavigationPath()
        case .recipes: recipesPath = NavigationPath()
        }
    }

    /// Programmatic push onto a tab's stack (e.g. after a sheet creates something
    /// whose screen should open next). Views reach it via `\.routeNavigator`.
    func push(_ route: Route, on tab: AppTab) {
        switch tab {
        case .dashboard: dashboardPath.append(route)
        case .orders: ordersPath.append(route)
        case .tasks: tasksPath.append(route)
        case .stock: stockPath.append(route)
        case .recipes: recipesPath.append(route)
        }
    }

    // MARK: - Master / detail (iPad: Stoc, Comenzi)

    /// The screen open in the detail pane of a master → detail section.
    var stockSelection: Route?
    var ordersSelection: Route?
    /// Sections currently laid out as master → detail (set by the section
    /// while it is on screen at regular width).
    var masterDetailTabs: Set<AppTab> = []

    func selection(for tab: AppTab) -> Route? {
        switch tab {
        case .stock: stockSelection
        case .orders: ordersSelection
        default: nil
        }
    }

    /// Shows `route` as the root of the detail pane (master row tapped).
    func select(_ route: Route, on tab: AppTab) {
        popToRoot(tab: tab)
        switch tab {
        case .stock: stockSelection = route
        case .orders: ordersSelection = route
        default: push(route, on: tab)
        }
    }

    /// Opens `route` from outside the section's own screens (sidebar, deep
    /// links): into the detail pane when the section is master → detail,
    /// otherwise pushed on its stack.
    func open(_ route: Route, on tab: AppTab) {
        if masterDetailTabs.contains(tab) {
            select(route, on: tab)
        } else {
            push(route, on: tab)
        }
    }

    func path(for tab: AppTab) -> Binding<NavigationPath> {
        switch tab {
        case .dashboard: Binding(get: { self.dashboardPath }, set: { self.dashboardPath = $0 })
        case .orders: Binding(get: { self.ordersPath }, set: { self.ordersPath = $0 })
        case .tasks: Binding(get: { self.tasksPath }, set: { self.tasksPath = $0 })
        case .stock: Binding(get: { self.stockPath }, set: { self.stockPath = $0 })
        case .recipes: Binding(get: { self.recipesPath }, set: { self.recipesPath = $0 })
        }
    }
}

/// Pushes a `Route` onto the enclosing tab's NavigationStack. Injected per tab by
/// `AppTabView`, so it also reaches sheets presented from screens on that stack.
/// The default (outside a tab, e.g. previews) is a no-op.
struct RouteNavigator {
    let push: (Route) -> Void

    static let noop = RouteNavigator { _ in }
}

private struct RouteNavigatorKey: EnvironmentKey {
    static let defaultValue = RouteNavigator.noop
}

extension EnvironmentValues {
    var routeNavigator: RouteNavigator {
        get { self[RouteNavigatorKey.self] }
        set { self[RouteNavigatorKey.self] = newValue }
    }
}
