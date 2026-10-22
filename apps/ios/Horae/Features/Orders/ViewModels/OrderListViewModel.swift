import Foundation
import Observation

@Observable
final class OrderListViewModel {
    var orders: [OrderResponse] = []
    var isLoading = false
    var error: APIError?
    var searchText = ""
    var currentPage = 1
    var hasNextPage = false
    var stats: OrderStatsResponse?

    /// Bumped after a reset load that should bring "Azi" to the top (first
    /// load, Pregătiri ⇄ Intrări); the view scrolls to `focusGroupId`.
    var scrollToTodayRequest = 0

    /// View + method filter, shared with the calendar.
    let area = OrdersAreaState.shared
    private let service = OrderService.shared
    /// view|method the rows on screen were loaded for — a change made on the
    /// calendar is picked up when the list reappears.
    private(set) var loadedKey: String?
    private var scrollOnNextLoad = true
    private var searchTask: Task<Void, Never>?

    /// Debounced live search: cancels the previous in-flight debounce on each keystroke.
    func searchChanged() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            await self.loadOrders(reset: true)
        }
    }

    var query: OrderQuery {
        OrderQuery(
            page: currentPage,
            statuses: area.activeStatuses,
            search: searchText.isEmpty ? nil : searchText,
            view: area.view,
            deliveryMethod: area.activeDeliveryMethod,
            deliveryKind: area.activeDeliveryKind
        )
    }

    /// Bumped on every reset; a response from an older generation (a
    /// load-more still in flight when the user pulled to refresh or changed a
    /// filter) is dropped instead of being appended to the new list.
    private var generation = 0

    func loadOrders(reset: Bool = false) async {
        // Keep current rows during a reset — emptying the List mid
        // pull-to-refresh strands the UIRefreshControl spinner on screen.
        if reset {
            currentPage = 1
            generation += 1
        }
        let myGeneration = generation

        isLoading = true
        defer { if myGeneration == generation { isLoading = false } }

        let key = areaKey
        do {
            let response = try await service.fetchOrders(query: query)
            guard myGeneration == generation else { return }
            if reset {
                orders = Self.unique(response.data)
            } else {
                orders = Self.unique(orders + response.data)
            }
            hasNextPage = response.hasNextPage
            loadedKey = key
            if reset, scrollOnNextLoad {
                scrollOnNextLoad = false
                scrollToTodayRequest += 1
            }
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = APIError.networkError(error)
        }
    }

    /// Keeps the first occurrence of each id: SwiftUI lists glitch (rows jump,
    /// vanish) when two rows share an identity.
    private static func unique(_ list: [OrderResponse]) -> [OrderResponse] {
        var seen = Set<String>()
        return list.filter { seen.insert($0.id).inserted }
    }

    func loadMore() async {
        guard hasNextPage, !isLoading else { return }
        currentPage += 1
        await loadOrders()
    }

    func refresh() async {
        await loadOrders(reset: true)
    }

    var areaKey: String { "\(area.view.rawValue)|\(area.activeFilterKey)" }

    /// Pregătiri ⇄ Intrări: reload and bring "Azi" back to the top.
    func viewChanged() async {
        scrollOnNextLoad = true
        await loadOrders(reset: true)
    }

    func loadStats() async {
        do {
            stats = try await service.fetchStats()
        } catch {
            // Stats non-critical, silently fail
        }
    }

    // MARK: - Presentation

    /// Rows in the server's order for the current view, re-applied so a
    /// load-more page or a refresh never reshuffles rows.
    var sortedOrders: [OrderResponse] {
        OrderResponse.sorted(orders, view: area.view)
    }

    /// Day groups, future → past: one per day past tomorrow ("luni, 19 oct"),
    /// then Mâine, Azi, Ieri and one "Mai vechi". Key = placed day (intrari)
    /// or delivery day, undated = today (livrari).
    var groups: [OrderDayGroup] {
        let cal = RoDate.calendar
        let today = cal.startOfDay(for: Date())
        var result: [OrderDayGroup] = []
        for order in sortedOrders {
            let day = order.groupDay(for: area.view, today: today)
            let offset = cal.dateComponents([.day], from: today, to: day).day ?? 0
            let (id, title, rank): (String, String, Int) = switch offset {
            case 2...: ("d-\(RoDate.isoDay(day))", OrderFormat.groupDay(day), offset)
            case 1: ("maine", "Mâine", 1)
            case 0: ("azi", "Azi", 0)
            case -1: ("ieri", "Ieri", -1)
            default: ("older", "Mai vechi", Int.min)
            }
            if let index = result.firstIndex(where: { $0.id == id }) {
                result[index].orders.append(order)
            } else {
                result.append(OrderDayGroup(id: id, title: title, rank: rank, orders: [order]))
            }
        }
        return result.sorted { $0.rank > $1.rank }
    }

    /// "Azi" when present, else the nearest group after it (Ieri / Mai vechi).
    var focusGroupId: String? {
        groups.first { $0.rank <= 0 }?.id
    }

    /// Server-side count for a status (from /orders/stats).
    func count(for status: OrderStatus) -> Int? {
        stats?.statusCounts[status.rawValue]
    }

    /// Eyebrow above the title: "38 active · 3 ies azi".
    var summary: String? {
        var parts: [String] = []
        if let stats {
            let active = OrderStatus.allCases.filter(\.isOpen)
                .reduce(0) { $0 + (stats.statusCounts[$1.rawValue] ?? 0) }
            parts.append("\(active) active")
        }
        // "ies azi" only when every open status is on the list.
        let showsAllOpen = area.activeStatuses.map { list in
            OrderStatus.allCases.filter(\.isOpen).allSatisfy(list.contains)
        } ?? true
        if showsAllOpen, searchText.isEmpty {
            let leavingToday = orders.filter {
                $0.status.isOpen && $0.isDueToday
            }.count
            parts.append("\(leavingToday) ies azi")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// One day header of the Comenzi list.
struct OrderDayGroup: Identifiable {
    let id: String
    let title: String
    /// Days from today (Mai vechi = Int.min) — groups sort by it, desc.
    let rank: Int
    var orders: [OrderResponse]
}
