import Foundation

/// Mirrors OrderResponseDto from the API.
struct OrderResponse: Decodable, Identifiable, Sendable {
    let id: String
    let orderNumber: String
    let status: OrderStatus
    /// Pickup vs delivery. Optional so older API builds still decode; the
    /// server default is `DELIVERY`.
    let fulfillmentType: OrderFulfillmentType?
    /// Location the customer picks up from (PICKUP only).
    let pickupLocationId: String?
    let deliveryPoint: String
    let deliveryAddress: String?
    let notes: String?
    let createdById: String
    let assignedToId: String?
    let dueDate: Date?
    let createdAt: Date
    let updatedAt: Date
    let completedAt: Date?
    let createdBy: OrderUser
    let assignedTo: OrderUser?
    let items: [OrderItemResponse]
    let deliveryNote: DeliveryNoteResponse?
    let itemCount: Int
    let hasInvoice: Bool?
    let invoiceFileName: String?
    /// External (WooCommerce) orders only.
    let customerName: String?
    let externalStatus: String?
    /// Delivery method chosen in the shop (Pickupia), e.g. "Ridicare Napoca 15".
    let deliveryMethod: String?
}

/// Mirrors Prisma `OrderFulfillmentType`. Unknown values decode to
/// `.unknown` so a new server-side case never breaks the whole order.
enum OrderFulfillmentType: String, Codable, Sendable {
    case DELIVERY, PICKUP, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = OrderFulfillmentType(rawValue: raw) ?? .unknown
    }
}

struct OrderUser: Decodable, Sendable {
    let id: String
    let firstName: String
    let lastName: String

    var fullName: String { "\(firstName) \(lastName)" }
}

struct OrderItemResponse: Decodable, Identifiable, Sendable {
    let id: String
    /// Nil for external (Woo) items without a product mapping — `recipeName`
    /// then carries the site's product name (server-side label fallback).
    let recipeId: String?
    let recipeName: String
    let quantity: Double
    let unit: UnitType
    let status: OrderItemStatus
    let notes: String?
}

struct DeliveryNoteResponse: Decodable, Sendable {
    let id: String
    let deliveryAddress: String
    let deliveryPoint: String
    let serialNumber: String?
    let hasSignature: Bool
    let signedByName: String?
    let signedAt: Date?
    let notes: String?
    let generatedAt: Date
    let signatureImageBase64: String?
}

struct ConformityCertificateResponse: Decodable, Sendable {
    let id: String
    let serialNumber: String
    let issuedBy: OrderUser
    let notes: String?
    let createdAt: Date
}

// MARK: - Request Models

struct CreateOrderRequest: Encodable {
    let deliveryPoint: String
    /// DELIVERY (default on the server) or PICKUP; nil = server default.
    var fulfillmentType: OrderFulfillmentType?
    var pickupLocationId: String?
    var deliveryAddress: String?
    var notes: String?
    var assignedToId: String?
    var dueDate: String?
    let items: [CreateOrderItemRequest]
}

struct CreateOrderItemRequest: Encodable {
    let recipeId: String
    let quantity: Double
    let unit: UnitType
    var notes: String?
}

struct UpdateOrderRequest: Encodable {
    var status: OrderStatus?
    var deliveryPoint: String?
    var deliveryAddress: String?
    var notes: String?
    var assignedToId: String?
    var dueDate: String?
}

struct AddOrderItemRequest: Encodable {
    let recipeId: String
    let quantity: Double
    let unit: UnitType
    var notes: String?
}

struct UpdateOrderItemRequest: Encodable {
    var quantity: Double?
    var unit: UnitType?
    var status: OrderItemStatus?
    var notes: String?
}

// MARK: - Stats

struct OrderStatsResponse: Decodable, Sendable {
    let totalOrders: Int
    let completedOrders: Int
    let statusCounts: [String: Int]
    let deliveryPointCounts: [DeliveryPointCount]
}

struct DeliveryPointCount: Decodable, Identifiable, Sendable {
    var id: String { deliveryPoint }
    let deliveryPoint: String
    let count: Int
}

/// Query parameters for order list.
struct OrderQuery {
    var page: Int = 1
    /// The list is grouped by due day, so a page must hold every order that can
    /// land in a group; small pages reshuffled the groups as they arrived.
    var limit: Int = 100
    var status: OrderStatus?
    /// Several statuses (1.39.0, `statuses=NOUA,PREGATITA`); nil/empty = all.
    var statuses: [OrderStatus]?
    var assignedToId: String?
    var search: String?
    /// Server-side ordering (`intrari` = newest placed first, `livrari` =
    /// delivery day desc). Older APIs ignore it.
    var view: OrderAreaView?
    /// Exact imported method `name` (not the label).
    var deliveryMethod: String?
    /// Orders whose method has this kind (1.38.0) — the "Livrare" chip.
    var deliveryKind: DeliveryKind?

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        if let statuses, !statuses.isEmpty {
            items.append(URLQueryItem(name: "statuses", value: statuses.map(\.rawValue).joined(separator: ",")))
        }
        if let assignedToId { items.append(URLQueryItem(name: "assignedToId", value: assignedToId)) }
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        if let view { items.append(URLQueryItem(name: "view", value: view.rawValue)) }
        if let deliveryMethod { items.append(URLQueryItem(name: "deliveryMethod", value: deliveryMethod)) }
        if let deliveryKind { items.append(URLQueryItem(name: "deliveryKind", value: deliveryKind.rawValue)) }
        return items
    }
}

// MARK: - Views + delivery methods (1.37.0)

/// "Pregătiri" (by delivery day, the default since 1.39.0 — API `view=livrari`)
/// | "Intrări" (by the day the order was placed). Pregătiri comes first.
enum OrderAreaView: String, CaseIterable, Identifiable, Sendable {
    case livrari, intrari

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .intrari: "Intrări"
        case .livrari: "Pregătiri"
        }
    }
}

/// Ridicare (pickup) or Livrare (delivery) — admin-assigned or auto-detected.
enum DeliveryKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case PICKUP, DELIVERY

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .PICKUP: "Ridicare"
        case .DELIVERY: "Livrare"
        }
    }
}

/// `GET /orders/delivery-methods` row — most used first.
struct DeliveryMethodInfo: Decodable, Identifiable, Sendable, Equatable {
    /// Method exactly as imported from the shop (the filter value).
    let name: String
    /// Admin alias; nil = none.
    let shortName: String?
    /// `shortName ?? name` without a leading "Ridicare la / de la / din".
    let label: String
    /// Admin assignment when `kindSet`, else auto-detected.
    let kind: DeliveryKind
    /// False = `kind` is the auto-detected one.
    let kindSet: Bool
    /// Active orders with this method.
    let count: Int

    var id: String { name }

    /// Label the method shows without a short name (the editor's placeholder).
    var defaultLabel: String {
        guard shortName != nil else { return label }
        let stripped = name.replacingOccurrences(
            of: #"^\s*ridicare\s+(la|de la|din)\s+"#, with: "",
            options: [.regularExpression, .caseInsensitive])
        return stripped.isEmpty ? name : stripped
    }

    private enum CodingKeys: String, CodingKey { case name, shortName, label, kind, kindSet, count }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        shortName = try c.decodeIfPresent(String.self, forKey: .shortName)
        label = try c.decodeIfPresent(String.self, forKey: .label) ?? shortName ?? name
        // Pre-1.38.0 APIs have no kind: treat everything as delivery.
        kind = (try? c.decodeIfPresent(DeliveryKind.self, forKey: .kind)) ?? .DELIVERY
        kindSet = try c.decodeIfPresent(Bool.self, forKey: .kindSet) ?? false
        count = try c.decodeIfPresent(Int.self, forKey: .count) ?? 0
    }
}

/// Body of `PUT /orders/delivery-methods/alias`. Each field is either left
/// out (unchanged), explicit null (back to default / auto) or a value.
struct DeliveryMethodAliasRequest: Encodable {
    let name: String
    /// nil = omitted; `.some(nil)` = null (default label).
    var shortName: String??
    /// nil = omitted; `.some(nil)` = null (back to auto).
    var kind: DeliveryKind??

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name)
        if let shortName { try c.encode(shortName, forKey: .shortName) } // explicit null clears
        if let kind { try c.encode(kind, forKey: .kind) }
    }

    private enum CodingKeys: String, CodingKey { case name, shortName, kind }
}
