import Foundation

// MARK: - Location

struct LocationResponse: Decodable, Identifiable, Sendable, Equatable {
    let id: String
    let name: String
    let type: LocationType
    let address: String
    let phone: String?
    /// Id of this location in the shop's delivery plugin (Pickupia) — site
    /// orders with this id on their delivery method become pickups from here.
    let externalId: String?
    /// Main unit: site sales are deducted from this location's stock (the
    /// pickup location when it is a main unit, else the first main unit).
    /// Optional so older APIs still decode.
    let isMainUnit: Bool?
    let isActive: Bool
    let createdAt: Date
    let updatedAt: Date
}

extension LocationResponse {
    var isMain: Bool { isMainUnit ?? false }
}

extension Array where Element == LocationResponse {
    /// The location every operation starts on when the user hasn't picked one:
    /// the admin's `Organization.defaultLocationId` (Stoc › Locatii › Implicita)
    /// when it is in this list, else the one named "laborator" (production
    /// happens there), else the first entry. Same rule as web and Android.
    var preferredDefault: LocationResponse? {
        if let configured = BrandingManager.shared.defaultLocationId,
           let match = first(where: { $0.id == configured }) {
            return match
        }
        let laborator = first {
            $0.name.range(
                of: "laborator",
                options: [.caseInsensitive, .diacriticInsensitive],
                locale: Locale(identifier: "ro_RO")
            ) != nil
        }
        return laborator ?? first
    }
}

struct CreateLocationRequest: Encodable {
    let name: String
    let type: LocationType
    let address: String
    var phone: String?
    /// Empty string clears it on update; nil leaves it out.
    var externalId: String? = nil
    /// nil leaves it out (switch off / older API).
    var isMainUnit: Bool? = nil
}

// MARK: - Location Stock

struct LocationStockResponse: Decodable, Identifiable, Sendable {
    let id: String
    let locationId: String
    let rawMaterialId: String
    let rawMaterialTitle: String
    let category: String?
    let unit: UnitType
    let quantity: Double
    let updatedAt: Date
}

// MARK: - Location Recipe Stock

/// Produced recipe stock (semipreparate + produse finite) held at a location.
/// `GET /locations/:id/recipe-stock`
struct LocationRecipeStockResponse: Decodable, Identifiable, Sendable {
    let id: String
    let locationId: String
    let recipeId: String
    let recipeName: String
    let recipeType: RecipeType
    let category: String?
    let unit: UnitType
    let quantity: Double
    let reservedCount: Double
    /// Earliest expiry across the produced lots at this location (nil = not tracked).
    let expiryDate: Date?
    let updatedAt: Date
}

// MARK: - Transfer

struct TransferResponse: Decodable, Identifiable, Sendable {
    let id: String
    let status: TransferStatus
    let notes: String?
    let fromLocation: TransferLocation
    /// Always present — for ad-hoc destinations the server synthesizes
    /// `{id: "", name: destinationName, address: destinationAddress}`.
    let toLocation: TransferLocation
    /// True when the transfer goes to a one-off (event) destination, not a location.
    let adhocDestination: Bool
    /// Recipient (person) at the destination — printed on the aviz.
    let destinationContact: String?
    let createdBy: TransferUser
    let assignedTo: TransferUser?
    let items: [TransferItemResponse]
    let completedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, status, notes, fromLocation, toLocation, adhocDestination, destinationContact
        case createdBy, assignedTo, items, completedAt, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        status = try c.decode(TransferStatus.self, forKey: .status)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        fromLocation = try c.decode(TransferLocation.self, forKey: .fromLocation)
        toLocation = try c.decode(TransferLocation.self, forKey: .toLocation)
        adhocDestination = try c.decodeIfPresent(Bool.self, forKey: .adhocDestination) ?? false
        destinationContact = try c.decodeIfPresent(String.self, forKey: .destinationContact)
        createdBy = try c.decode(TransferUser.self, forKey: .createdBy)
        assignedTo = try c.decodeIfPresent(TransferUser.self, forKey: .assignedTo)
        items = try c.decode([TransferItemResponse].self, forKey: .items)
        completedAt = try c.decodeIfPresent(Date.self, forKey: .completedAt)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }
}

struct TransferLocation: Decodable, Sendable {
    /// Empty string for a synthesized ad-hoc destination.
    let id: String
    let name: String
    let address: String

    private enum CodingKeys: String, CodingKey { case id, name, address }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? ""
        name = try c.decode(String.self, forKey: .name)
        // Ad-hoc destinations may have no address.
        address = try c.decodeIfPresent(String.self, forKey: .address) ?? ""
    }
}

/// GET /stock/transfers/:id/aviz — legal "aviz de insotire a marfii" payload.
struct TransferAvizResponse: Decodable, Sendable {
    struct Party: Decodable, Sendable {
        let name: String
        let address: String?
        let cui: String?
        let locationName: String
    }

    struct Item: Decodable, Sendable {
        let name: String
        let quantity: Double
        let unit: UnitType
        let unitPrice: Double?
    }

    let serial: String
    let issuedAt: String
    let transferId: String
    let supplier: Party
    let buyer: Party
    let delegateName: String?
    /// Recipient (person) at the destination — "Destinatar" on the aviz.
    let recipientName: String?
    let items: [Item]
}

/// GET /stock/transfers/:id/conformity — declaratie de conformitate payload.
struct TransferConformityResponse: Decodable, Sendable {
    struct Org: Decodable, Sendable {
        let name: String
        let legalAddress: String?
        let cui: String?
        let regCom: String?
        let contactPhone: String?
        let contactEmail: String?
        let website: String?
        let administratorName: String?
    }

    struct Item: Decodable, Sendable {
        let name: String
        let quantity: Double
        let unit: UnitType
    }

    let serial: String
    let issuedAt: String
    let transferId: String
    let deliveredTo: String
    let deliveryDate: Date
    let organization: Org
    let items: [Item]
}

struct TransferUser: Decodable, Sendable {
    let id: String
    let firstName: String
    let lastName: String

    var fullName: String { "\(firstName) \(lastName)" }
}

struct TransferItemResponse: Decodable, Identifiable, Sendable {
    let id: String
    // Either a raw material OR a recipe (finished good / semipreparat) — one is null.
    let rawMaterialId: String?
    let recipeId: String?
    // Title of whichever item this is (raw material title or recipe name).
    let rawMaterialTitle: String
    let quantity: Double
    let unit: UnitType
}

struct CreateTransferRequest: Encodable {
    let fromLocationId: String
    /// Exactly one of `toLocationId` XOR `destinationName` must be set.
    var toLocationId: String?
    /// Ad-hoc (one-off / event) destination name — used instead of `toLocationId`.
    var destinationName: String?
    var destinationAddress: String?
    /// Recipient (person) at the destination — printed on the aviz.
    var destinationContact: String?
    var notes: String?
    var assignedToId: String?
    /// Aviz fields (API `CreateTransferDto`): delegate's ID card, vehicle,
    /// dispatch date (ISO 8601).
    var delegateIdCard: String? = nil
    var transportMeans: String? = nil
    var dispatchedAt: String? = nil
    let items: [TransferItemRequest]
}

struct TransferItemRequest: Encodable {
    var rawMaterialId: String?
    var recipeId: String?
    let quantity: Double
    let unit: UnitType
}

struct UpdateTransferStatusRequest: Encodable {
    let status: TransferStatus
    var assignedToId: String?
}

// MARK: - Location User Assignment

struct LocationUserResponse: Decodable, Identifiable, Sendable {
    let id: String
    let userId: String
    let firstName: String
    let lastName: String
    let role: String
    let isPrimary: Bool
    let createdAt: Date

    var fullName: String { "\(firstName) \(lastName)" }
}

struct AssignUserLocationRequest: Encodable {
    let userId: String
    var isPrimary: Bool = false
}

// MARK: - Transfer Approval

struct UpdateTransferApprovalRequest: Encodable {
    let status: String // PENDING, APPROVED, REJECTED
    var reason: String?
}

// MARK: - Location Dashboard

struct LocationDashboardResponse: Decodable, Sendable {
    let locationId: String
    let locationName: String
    let totalMaterials: Int
    let assignedUsers: Int
    let pendingInboundTransfers: Int
    let pendingOutboundTransfers: Int
    let lowStockMaterials: [LocationDashboardMaterial]
}

struct LocationDashboardMaterial: Decodable, Identifiable, Sendable {
    let rawMaterialId: String
    let title: String
    let quantity: Double
    let unit: String

    var id: String { rawMaterialId }
}

struct TransferQuery {
    var page: Int = 1
    var limit: Int = 20
    var status: TransferStatus?
    var fromLocationId: String?
    var toLocationId: String?

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        if let fromLocationId { items.append(URLQueryItem(name: "fromLocationId", value: fromLocationId)) }
        if let toLocationId { items.append(URLQueryItem(name: "toLocationId", value: toLocationId)) }
        return items
    }
}
