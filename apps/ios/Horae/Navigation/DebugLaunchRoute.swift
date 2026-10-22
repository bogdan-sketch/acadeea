#if DEBUG
import Foundation

/// DEBUG only: `HORAE_DEBUG_ROUTE` (set via `SIMCTL_CHILD_HORAE_DEBUG_ROUTE`)
/// opens a screen at launch so headless simulator screenshots can reach deep
/// views without UI taps. Values: `tasks`, `calendar`, `task:first`,
/// `task:<id>`, `orders`, `order:first`, `stock`, `material:<name>`, `recipes`,
/// `recipeDetail:<id>`, `settings`;
/// `HORAE_DEBUG_TAB=<tab>` alone selects a tab.
/// `HORAE_DEBUG_OPEN_FAB=1` opens the floating "+" menu (HFabMenu) on appear.
enum DebugLaunchRoute {
    /// True when screenshots want the "+" choice menu already open.
    static var opensFabMenu: Bool {
        ProcessInfo.processInfo.environment["HORAE_DEBUG_OPEN_FAB"] == "1"
    }

    /// True when a debug route is set — screenshots skip the push prompt.
    static var isActive: Bool {
        let env = ProcessInfo.processInfo.environment
        return env["HORAE_DEBUG_ROUTE"]?.isEmpty == false || env["HORAE_DEBUG_TAB"]?.isEmpty == false
    }

    static func resolve() async -> (tab: AppTab, route: Route?)? {
        let env = ProcessInfo.processInfo.environment
        // `HORAE_DEBUG_TAB=stock` alone just selects a tab.
        guard let value = env["HORAE_DEBUG_ROUTE"] else {
            return env["HORAE_DEBUG_TAB"].flatMap(AppTab.init(rawValue:)).map { ($0, nil) }
        }
        switch value {
        case "settings": return (.dashboard, .settings)
        case "settings:setari": return (.dashboard, .settings)
        case "home": return (.dashboard, nil)
        case "tasks": return (.tasks, nil)
        case "orders": return (.orders, nil)
        case "stock": return (.stock, nil)
        case "recipes": return (.recipes, nil)
        case "calendar": return (.tasks, .productionCalendar)
        case "task:first":
            var query = TaskQuery()
            query.limit = 5
            let tasks = (try? await TaskService.shared.fetchTasks(query: query).data) ?? []
            guard let task = tasks.first(where: { $0.status == .IN_LUCRU || $0.status == .DE_FACUT })
                ?? tasks.first
            else { return (.tasks, nil) }
            return (.tasks, .taskDetail(id: task.id))
        case "order:first":
            var query = OrderQuery()
            query.limit = 5
            let orders = (try? await OrderService.shared.fetchOrders(query: query).data) ?? []
            guard let order = orders.first else { return (.orders, nil) }
            return (.orders, .orderDetail(id: order.id))
        default:
            if value.hasPrefix("material:") {
                // `material:<name>` — the first raw material whose title contains <name>.
                let name = String(value.dropFirst(9))
                var query = RawMaterialQuery()
                query.limit = 500
                let materials = (try? await StockService.shared.fetchRawMaterials(query: query).data) ?? []
                guard let material = materials.first(where: { $0.title.localizedCaseInsensitiveContains(name) })
                    ?? materials.first
                else { return (.stock, nil) }
                return (.stock, .rawMaterialDetail(id: material.id))
            }
            if value.hasPrefix("task:") {
                return (.tasks, .taskDetail(id: String(value.dropFirst(5))))
            }
            if value.hasPrefix("recipeDetail:") {
                return (.recipes, .recipeDetail(id: String(value.dropFirst(13))))
            }
            return nil
        }
    }
}
#endif
