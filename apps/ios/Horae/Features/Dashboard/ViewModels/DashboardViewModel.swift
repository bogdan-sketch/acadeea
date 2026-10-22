import Foundation
import Observation

@Observable
final class DashboardViewModel {
    var taskCounts: [String: Int] = [:]
    var orderCounts: [String: Int] = [:]
    var lowStockMaterials: [LowStockMaterial] = []
    var recentTasks: [DashboardRecentTask] = []
    var todayTasksDue: Int = 0
    var todayOrdersDue: Int = 0
    var todaySalesAmount: Double = 0
    var todayDeliveries: Int = 0
    var todayPickups: Int = 0
    /// Orders due today (Panou › "Comenzile de azi"); empty without Order read.
    var todayOrders: [OrderResponse] = []
    /// Lots expiring in the next 3 days (Panou › "Expiră în 3 zile").
    var expiringSoon: [ExpiringItem] = []
    var isLoading = false
    var error: APIError?

    // Locations
    var locations: [LocationResponse] = []
    var selectedLocationId: String?

    private let dashboardService = DashboardService.shared
    private let locationService = LocationService.shared

    var permissions: PermissionManager { AuthManager.shared.permissionManager }

    // MARK: - Computed stats

    /// Uncapped totals from the API, with a fallback to counting the (capped)
    /// alert list for older backends.
    var serverLowStockCount: Int?
    var serverOutOfStockCount: Int?

    var outOfStockCount: Int {
        serverOutOfStockCount ?? lowStockMaterials.filter { $0.status == "OUT_OF_STOCK" }.count
    }

    var lowStockCount: Int {
        serverLowStockCount ?? lowStockMaterials.filter { $0.status == "LOW_STOCK" }.count
    }

    var tasksInProgress: Int {
        taskCounts[TaskStatus.IN_LUCRU.rawValue] ?? 0
    }

    var tasksRemaining: Int {
        todayTasksDue
    }

    func taskCount(for status: TaskStatus) -> Int {
        taskCounts[status.rawValue] ?? 0
    }

    func orderCount(for status: OrderStatus) -> Int {
        orderCounts[status.rawValue] ?? 0
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let stats = try await dashboardService.fetchStats(locationId: selectedLocationId)
            taskCounts = stats.taskCounts
            orderCounts = stats.orderCounts
            lowStockMaterials = stats.lowStockMaterials
            // "Producție acum": the API sends the last 5 tasks by createdAt,
            // closed ones included — keep only the active statuses.
            let active = Set([TaskStatus.DE_FACUT, .IN_LUCRU, .BLOCAT].map(\.rawValue))
            recentTasks = stats.recentTasks.filter { active.contains($0.status) }
            todayTasksDue = stats.todayTasksDue
            todayOrdersDue = stats.todayOrdersDue
            todaySalesAmount = stats.todaySalesAmount ?? 0
            todayDeliveries = stats.todayDeliveries ?? 0
            todayPickups = stats.todayPickups ?? 0
            serverLowStockCount = stats.lowStockCount
            serverOutOfStockCount = stats.outOfStockCount
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        // Best-effort extras for the redesigned dashboard — a failure here
        // must not hide the stats above.
        async let orders = loadTodayOrders()
        async let expiring = loadExpiringSoon()
        _ = await (orders, expiring)
    }

    private var canSeeStock: Bool {
        permissions.can(.read, .RawMaterial) && permissions.can(.read, .Consumable)
    }

    private func loadTodayOrders() async {
        guard permissions.can(.read, .Order) else { todayOrders = []; return }
        let today = RoDate.isoDay(.now)
        do {
            let byDay = try await OrderService.shared.fetchCalendar(from: today, to: today)
            todayOrders = byDay.values.flatMap { $0 }
                .filter { $0.status != .ANULATA }
                .sorted(by: OrderResponse.newestFirst)
        } catch {
            todayOrders = []
        }
    }

    private func loadExpiringSoon() async {
        guard canSeeStock else { expiringSoon = []; return }
        do {
            expiringSoon = try await StockService.shared.fetchExpiring(days: 3)
                .filter { $0.daysUntilExpiry >= 0 }
                .sorted { $0.expiryDate < $1.expiryDate }
        } catch {
            expiringSoon = []
        }
    }

    func loadLocations() async {
        do {
            locations = try await locationService.fetchLocations()
        } catch {}
    }
}
