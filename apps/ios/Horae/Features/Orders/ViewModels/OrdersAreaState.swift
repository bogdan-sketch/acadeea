import Foundation
import Observation

/// State shared by the whole Comenzi area (list ⇄ calendar): the
/// "Pregătiri" | "Intrări" view, the status filter and the shop
/// delivery-method filter, plus the method list behind the filter chips and
/// the alias labels. One instance, so a choice made on the list is still there
/// on the calendar and back (for the session — a restart resets it).
@Observable
final class OrdersAreaState {
    static let shared = OrdersAreaState()

    /// Default "Pregătiri" (1.39.0, owner's rule).
    var view: OrderAreaView = .livrari
    /// Status filter of the head's filter button; empty = Toate.
    /// Default: only "Nouă".
    var statusFilter: Set<OrderStatus> = OrdersAreaState.defaultStatuses
    static let defaultStatuses: Set<OrderStatus> = [.NOUA]
    /// The one selected chip; `.all` (Toate) is the default.
    var deliveryFilter: DeliveryFilter = .all
    /// `GET /orders/delivery-methods`, most used first. Empty when the switch
    /// is off, the API doesn't have the endpoint yet, or the first call failed —
    /// the chip row then simply doesn't show.
    private(set) var methods: [DeliveryMethodInfo] = []
    /// Method name whose short name / kind is being saved.
    private(set) var isSavingAlias: String?
    private var loadTask: Task<Void, Never>?

    private init() {}

    /// "Livrări din magazinul online" switch — gates the filter + aliases.
    var isWooDeliveryEnabled: Bool { BrandingManager.shared.wooDeliveryEnabled }

    /// `deliveryMethod` actually sent to the API (none while the switch is off).
    var activeDeliveryMethod: String? {
        guard isWooDeliveryEnabled, case .method(let name) = deliveryFilter else { return nil }
        return name
    }

    /// `deliveryKind` actually sent to the API (the "Livrare" chip).
    var activeDeliveryKind: DeliveryKind? {
        guard isWooDeliveryEnabled, case .kind(let kind) = deliveryFilter else { return nil }
        return kind
    }

    /// Identity of the filter sent to the API (list reload key).
    var activeFilterKey: String {
        let statuses = activeStatuses.map { $0.map(\.rawValue).joined(separator: ",") } ?? "*"
        if let activeDeliveryMethod { return "m:\(activeDeliveryMethod)|s:\(statuses)" }
        if let activeDeliveryKind { return "k:\(activeDeliveryKind.rawValue)|s:\(statuses)" }
        return "s:\(statuses)"
    }

    // MARK: - Status filter

    var isStatusFilterDefault: Bool { statusFilter == Self.defaultStatuses }

    /// Sent as `statuses=` (list) / `status=` (calendar); nil = every status.
    var activeStatuses: [OrderStatus]? {
        statusFilter.isEmpty ? nil : OrderStatus.allCases.filter(statusFilter.contains)
    }

    /// "Doar: Nouă" / "Nouă, Pregătită" / "Toate statusurile".
    var statusSummary: String {
        guard let list = activeStatuses else { return "Toate statusurile" }
        let names = list.map(\.displayName)
        return names.count == 1 ? "Doar: \(names[0])" : names.joined(separator: ", ")
    }

    /// Adds/removes one status (from Toate: picks just that one). Every
    /// status picked = Toate; un-picking the last one = Toate too (an empty
    /// list would show nothing).
    func toggleStatus(_ status: OrderStatus) {
        var next = statusFilter
        if next.contains(status) { next.remove(status) } else { next.insert(status) }
        statusFilter = next.count == OrderStatus.allCases.count ? [] : next
    }

    /// Show the chip row only when the switch is on and the list loaded.
    var showsMethodFilter: Bool { isWooDeliveryEnabled && !methods.isEmpty }

    var pickupMethods: [DeliveryMethodInfo] { methods.filter { $0.kind == .PICKUP } }
    var deliveryMethods: [DeliveryMethodInfo] { methods.filter { $0.kind == .DELIVERY } }
    /// "Livrare" chip badge = every delivery method's count.
    var deliveryCount: Int { deliveryMethods.reduce(0) { $0 + $1.count } }

    /// Chip tap: select it, or back to Toate when it was already selected.
    func toggle(_ filter: DeliveryFilter) {
        deliveryFilter = deliveryFilter == filter ? .all : filter
    }

    /// Re-fetched on every orders/calendar (re)load; concurrent callers share
    /// one request.
    func loadMethods() async {
        guard isWooDeliveryEnabled else {
            methods = []
            deliveryFilter = .all
            return
        }
        if let loadTask { return await loadTask.value }
        let task = Task { [weak self] in
            guard let self else { return }
            do {
                self.apply(try await OrderService.shared.fetchDeliveryMethods())
            } catch {
                // Best-effort: keep what we had (an API without the endpoint
                // stays empty → no filter row).
            }
        }
        loadTask = task
        await task.value
        loadTask = nil
    }

    /// Admin: set (or clear with an empty string) a method's short name.
    func saveAlias(name: String, shortName: String) async throws {
        let trimmed = shortName.trimmingCharacters(in: .whitespacesAndNewlines)
        try await save(DeliveryMethodAliasRequest(name: name, shortName: .some(trimmed.isEmpty ? nil : trimmed)))
    }

    /// Admin: set a method's kind (nil = back to auto-detection).
    func saveKind(name: String, kind: DeliveryKind?) async throws {
        try await save(DeliveryMethodAliasRequest(name: name, kind: .some(kind)))
    }

    private func save(_ body: DeliveryMethodAliasRequest) async throws {
        isSavingAlias = body.name
        defer { isSavingAlias = nil }
        apply(try await OrderService.shared.setDeliveryMethodAlias(body))
    }

    /// New list in; a selection that no longer applies falls back to Toate.
    private func apply(_ list: [DeliveryMethodInfo]) {
        methods = list
        switch deliveryFilter {
        case .all: break
        case .method(let name):
            if !list.contains(where: { $0.name == name }) { deliveryFilter = .all }
        case .kind(let kind):
            if !list.contains(where: { $0.kind == kind }) { deliveryFilter = .all }
        }
    }

    /// Display label for an order's `deliveryMethod`: it may join several
    /// methods with " + " — each part is mapped name → label, then rejoined.
    func label(forMethod raw: String) -> String {
        guard !methods.isEmpty else { return raw }
        return raw.components(separatedBy: " + ")
            .map { part in
                let key = part.trimmingCharacters(in: .whitespaces)
                return methods.first { $0.name == key }?.label ?? part
            }
            .joined(separator: " + ")
    }
}

/// One chip of the delivery-method row.
enum DeliveryFilter: Hashable, Sendable {
    /// Toate — no filter.
    case all
    /// One method, by its exact imported `name`.
    case method(String)
    /// Every method of a kind ("Livrare").
    case kind(DeliveryKind)
}
