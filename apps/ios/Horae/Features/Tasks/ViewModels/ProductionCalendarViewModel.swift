import Foundation
import Observation

/// One row of the calendar day list.
struct CalendarEvent: Identifiable {
    enum Layer: String, CaseIterable, Identifiable {
        case orders, production, expiries

        var id: String { rawValue }

        var title: String {
            switch self {
            case .orders: "Comenzi"
            case .production: "Producție"
            case .expiries: "Expirări"
            }
        }

        var kind: AppTheme.Status.Kind {
            switch self {
            case .orders: .new
            case .production: .inProgress
            case .expiries: .warning
            }
        }
    }

    let id: String
    let layer: Layer
    /// nil = no meaningful time (shown as "—", listed last).
    let time: Date?
    let title: String
    let route: Route?
    /// Second line (orders: who ordered). Shown before the layer name.
    var subtitle: String? = nil
}

/// Production calendar: one Monday → Sunday week, three layers (orders,
/// production, expiries) and a selected day.
@Observable
final class ProductionCalendarViewModel {
    /// Zi = the selected day's agenda (default on every open, owner's rule);
    /// Săptămână = all seven days, Monday → Sunday.
    enum Mode: String, CaseIterable, Identifiable {
        case day, week

        var id: String { rawValue }

        var title: String {
            switch self {
            case .day: "Zi"
            case .week: "Săptămână"
            }
        }
    }

    var mode: Mode = .day
    /// Active tasks per API day key ("yyyy-MM-dd").
    var calendar: [String: [TaskResponse]] = [:]
    var orders: [String: [OrderResponse]] = [:]
    var expiries: [String: [ExpiringItem]] = [:]
    var isLoading = true
    var error: APIError?
    /// Any day of the shown week.
    var currentDate = Date()
    var selectedDate = Date()
    var activeLayers: Set<CalendarEvent.Layer> = Set(CalendarEvent.Layer.allCases)

    // Only active tasks — exclude FINALIZAT and ANULAT
    private let activeStatuses: Set<TaskStatus> = [.DE_FACUT, .BLOCAT, .IN_LUCRU]

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    /// Layers this user can see (orders/stock need their own read rights).
    var availableLayers: [CalendarEvent.Layer] {
        CalendarEvent.Layer.allCases.filter { layer in
            switch layer {
            case .production: true
            case .orders: permissions.can(.read, .Order)
            case .expiries: permissions.can(.read, .RawMaterial) && permissions.can(.read, .Consumable)
            }
        }
    }

    var weekDays: [Date] { RoDate.weekDays(containing: currentDate) }

    /// Changes only when the shown week changes (reload trigger).
    var weekKey: String { RoDate.isoDay(RoDate.startOfWeek(currentDate)) }

    var selectedIsToday: Bool { RoDate.calendar.isDateInToday(selectedDate) }

    /// Days of the shown week that have events (week mode list).
    var busyDays: [Date] { weekDays.filter { !events(on: $0).isEmpty } }

    var weekNumber: Int { RoDate.calendar.component(.weekOfYear, from: currentDate) }

    var weekContainsToday: Bool {
        RoDate.calendar.isDate(currentDate, equalTo: .now, toGranularity: .weekOfYear)
    }

    var totalTasks: Int { calendar.values.reduce(0) { $0 + $1.count } }
    var totalOrders: Int { orders.values.reduce(0) { $0 + $1.count } }

    // MARK: - Events

    func events(on day: Date) -> [CalendarEvent] {
        let key = RoDate.isoDay(day)
        var result: [CalendarEvent] = []
        if activeLayers.contains(.orders) {
            result += (orders[key] ?? []).map { order in
                // What was ordered + who — never the order number (owner rule).
                CalendarEvent(
                    id: "o-\(order.id)", layer: .orders, time: order.dueDate,
                    title: order.productsLine, route: .orderDetail(id: order.id),
                    subtitle: order.rowCustomer)
            }
        }
        if activeLayers.contains(.production) {
            result += (calendar[key] ?? []).map { task in
                CalendarEvent(
                    id: "t-\(task.id)", layer: .production, time: task.dueDate ?? task.plannedDate,
                    title: "\(task.name) \(QtyBadge.text(task.targetQuantity, unitRaw: task.targetUnit.rawValue)) — \(task.status.displayName.lowercased())",
                    route: .taskDetail(id: task.id))
            }
        }
        if activeLayers.contains(.expiries) {
            result += (expiries[key] ?? []).map { item in
                let place = item.locationName.map { " · \($0)" } ?? ""
                return CalendarEvent(
                    id: "e-\(item.lotId)", layer: .expiries, time: nil,
                    title: "\(item.materialTitle)\(place) · expiră", route: .expiryTracking)
            }
        }
        return result.sorted { lhs, rhs in
            switch (lhs.time, rhs.time) {
            case let (l?, r?): l < r
            case (_?, nil): true
            case (nil, _?): false
            case (nil, nil): lhs.title < rhs.title
            }
        }
    }

    /// Which layers have something on `day` (dots of the week strip).
    func layers(on day: Date) -> [CalendarEvent.Layer] {
        let key = RoDate.isoDay(day)
        return availableLayers.filter { layer in
            guard activeLayers.contains(layer) else { return false }
            switch layer {
            case .orders: return !(orders[key] ?? []).isEmpty
            case .production: return !(calendar[key] ?? []).isEmpty
            case .expiries: return !(expiries[key] ?? []).isEmpty
            }
        }
    }

    /// First day after the selected one (same week) that has events.
    var nextBusyDay: Date? {
        weekDays.first { $0 > selectedDate && !RoDate.calendar.isDate($0, inSameDayAs: selectedDate) && !events(on: $0).isEmpty }
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        error = nil
        let days = weekDays
        guard let first = days.first, let last = days.last else { return }
        let from = RoDate.isoDay(first)
        let to = RoDate.isoDay(last)
        let layers = availableLayers

        async let tasks = TaskService.shared.fetchCalendar(from: from, to: to)
        async let orderDays: [String: [OrderResponse]] = layers.contains(.orders)
            ? (try? await OrderService.shared.fetchCalendar(from: from, to: to)) ?? [:] : [:]
        async let expiring: [String: [ExpiringItem]] = layers.contains(.expiries)
            ? await loadExpiries(until: last) : [:]

        do {
            let all = try await tasks
            // Filter to active statuses only
            var filtered: [String: [TaskResponse]] = [:]
            for (date, tasks) in all {
                let active = tasks.filter { activeStatuses.contains($0.status) }
                if !active.isEmpty { filtered[date] = active }
            }
            calendar = filtered
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        orders = await orderDays.mapValues { $0.filter { $0.status != .ANULATA } }
        expiries = await expiring
        isLoading = false
    }

    /// Lots expiring between today and `until` (past weeks: none).
    private func loadExpiries(until last: Date) async -> [String: [ExpiringItem]] {
        let cal = RoDate.calendar
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: .now), to: last).day ?? -1
        guard days >= 0 else { return [:] }
        guard let items = try? await StockService.shared.fetchExpiring(days: days + 1) else { return [:] }
        return Dictionary(grouping: items.filter { $0.daysUntilExpiry >= 0 }) { RoDate.isoDay($0.expiryDate) }
    }

    // MARK: - Navigation

    /// ‹ › — one day in day mode, one week in week mode.
    func navigate(_ direction: Int) {
        let cal = RoDate.calendar
        if mode == .day {
            selectedDate = cal.date(byAdding: .day, value: direction, to: selectedDate) ?? selectedDate
            currentDate = selectedDate
            return
        }
        currentDate = cal.date(byAdding: .weekOfYear, value: direction, to: currentDate) ?? currentDate
        selectedDate = cal.date(byAdding: .weekOfYear, value: direction, to: selectedDate) ?? selectedDate
    }

    /// Week strip / week list tap: open that day's agenda.
    func select(_ day: Date) {
        selectedDate = day
        mode = .day
    }

    func goToday() {
        currentDate = Date()
        selectedDate = Date()
    }

    func toggle(_ layer: CalendarEvent.Layer) {
        if activeLayers.contains(layer) {
            // Keep at least one layer on — an empty calendar reads as broken.
            if activeLayers.count > 1 { activeLayers.remove(layer) }
        } else {
            activeLayers.insert(layer)
        }
    }
}
