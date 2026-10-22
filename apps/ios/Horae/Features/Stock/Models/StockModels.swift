import Foundation

struct RawMaterialResponse: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let category: String?
    let producer: String?
    let supplierId: String?
    let supplierName: String?
    let unit: UnitType
    let quantityPerPiece: Double?
    let pieceType: PieceType?
    // Fractional stock is real (5.45 kg) — never truncate to Int.
    let stockCount: Double
    let openedCount: Double
    let orderedCount: Double
    let reservedCount: Double
    let storageType: StorageType
    let status: MaterialStatus
    let minimumStock: Double
    let estimatedLossPercent: Double
    let purchasePrice: Double?
    let invoiceNumber: String?
    let invoiceDate: Date?
    let lotNumber: String?
    let expiryDate: Date?
    let nutrition: NutritionValues?
    /// EU-14 allergen keys this material declares (propagated up recipes).
    let allergens: [String]
    let createdAt: Date
    let updatedAt: Date

    var isLowStock: Bool { stockCount <= minimumStock && minimumStock > 0 }

    private enum CodingKeys: String, CodingKey {
        case id, title, category, producer, supplierId, supplierName, unit, quantityPerPiece, pieceType
        case stockCount, openedCount, orderedCount, reservedCount
        case storageType, status, minimumStock, estimatedLossPercent, purchasePrice
        case invoiceNumber, invoiceDate, lotNumber, expiryDate, nutrition, allergens, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        producer = try c.decodeIfPresent(String.self, forKey: .producer)
        supplierId = try c.decodeIfPresent(String.self, forKey: .supplierId)
        supplierName = try c.decodeIfPresent(String.self, forKey: .supplierName)
        unit = try c.decode(UnitType.self, forKey: .unit)
        quantityPerPiece = try c.flexibleDoubleIfPresent(forKey: .quantityPerPiece)
        pieceType = try c.decodeIfPresent(PieceType.self, forKey: .pieceType)
        stockCount = try c.flexibleDouble(forKey: .stockCount)
        openedCount = (try? c.flexibleDouble(forKey: .openedCount)) ?? 0
        orderedCount = (try? c.flexibleDouble(forKey: .orderedCount)) ?? 0
        reservedCount = (try? c.flexibleDouble(forKey: .reservedCount)) ?? 0
        storageType = try c.decode(StorageType.self, forKey: .storageType)
        status = try c.decode(MaterialStatus.self, forKey: .status)
        minimumStock = try c.flexibleDouble(forKey: .minimumStock)
        estimatedLossPercent = (try? c.flexibleDouble(forKey: .estimatedLossPercent)) ?? 0
        purchasePrice = try c.flexibleDoubleIfPresent(forKey: .purchasePrice)
        invoiceNumber = try c.decodeIfPresent(String.self, forKey: .invoiceNumber)
        invoiceDate = try c.decodeIfPresent(Date.self, forKey: .invoiceDate)
        lotNumber = try c.decodeIfPresent(String.self, forKey: .lotNumber)
        expiryDate = try c.decodeIfPresent(Date.self, forKey: .expiryDate)
        nutrition = try c.decodeIfPresent(NutritionValues.self, forKey: .nutrition)
        allergens = try c.decodeIfPresent([String].self, forKey: .allergens) ?? []
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }
}

struct ConsumableResponse: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let category: String?
    let stockCount: Double
    let orderedCount: Double
    let reservedCount: Double
    let status: MaterialStatus
    let minimumStock: Double
    let createdAt: Date
    let updatedAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, title, category, stockCount, orderedCount, reservedCount
        case status, minimumStock, createdAt, updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        stockCount = try c.flexibleDouble(forKey: .stockCount)
        orderedCount = (try? c.flexibleDouble(forKey: .orderedCount)) ?? 0
        reservedCount = (try? c.flexibleDouble(forKey: .reservedCount)) ?? 0
        status = try c.decode(MaterialStatus.self, forKey: .status)
        minimumStock = try c.flexibleDouble(forKey: .minimumStock)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }
}

struct StockMovementResponse: Decodable, Identifiable, Sendable {
    let id: String
    let rawMaterialId: String?
    let consumableId: String?
    let recipeId: String?
    let itemTitle: String?
    let movementType: StockMovementType
    let quantity: Double
    let unit: UnitType
    let taskId: String?
    let referenceNote: String?
    let performedById: String
    let createdByName: String?
    let locationName: String?
    let createdAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, rawMaterialId, consumableId, recipeId, itemTitle, movementType
        case quantity, unit, taskId, referenceNote, performedById, createdByName, locationName, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        rawMaterialId = try c.decodeIfPresent(String.self, forKey: .rawMaterialId)
        consumableId = try c.decodeIfPresent(String.self, forKey: .consumableId)
        recipeId = try c.decodeIfPresent(String.self, forKey: .recipeId)
        itemTitle = try c.decodeIfPresent(String.self, forKey: .itemTitle)
        movementType = try c.decode(StockMovementType.self, forKey: .movementType)
        quantity = try c.flexibleDouble(forKey: .quantity)
        unit = try c.decode(UnitType.self, forKey: .unit)
        taskId = try c.decodeIfPresent(String.self, forKey: .taskId)
        referenceNote = try c.decodeIfPresent(String.self, forKey: .referenceNote)
        performedById = try c.decode(String.self, forKey: .performedById)
        createdByName = try c.decodeIfPresent(String.self, forKey: .createdByName)
        locationName = try c.decodeIfPresent(String.self, forKey: .locationName)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
    }
}

// MARK: - Item availability (stock + reservations + pending transfers)

/// GET /stock/item-availability — global + per-location stock of one item,
/// what tasks reserve from it and which transfers are still moving it.
struct StockItemAvailability: Decodable, Sendable {
    let totalQuantity: Double
    let reservedForTasks: Double
    let activeTaskCount: Int
    let locations: [ItemLocationStock]
    let pendingTransfers: [ItemPendingTransfer]

    var hasReservations: Bool { reservedForTasks > 0 || !pendingTransfers.isEmpty }

    private enum CodingKeys: String, CodingKey {
        case totalQuantity, reservedForTasks, activeTaskCount, locations, pendingTransfers
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totalQuantity = (try? c.flexibleDouble(forKey: .totalQuantity)) ?? 0
        reservedForTasks = (try? c.flexibleDouble(forKey: .reservedForTasks)) ?? 0
        activeTaskCount = (try? c.flexibleInt(forKey: .activeTaskCount)) ?? 0
        locations = try c.decodeIfPresent([ItemLocationStock].self, forKey: .locations) ?? []
        pendingTransfers = try c.decodeIfPresent([ItemPendingTransfer].self, forKey: .pendingTransfers) ?? []
    }
}

struct ItemLocationStock: Decodable, Identifiable, Sendable {
    let locationId: String
    let locationName: String
    let quantity: Double
    let reservedCount: Double

    var id: String { locationId }

    private enum CodingKeys: String, CodingKey {
        case locationId, locationName, quantity, reservedCount
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        locationId = try c.decode(String.self, forKey: .locationId)
        locationName = try c.decodeIfPresent(String.self, forKey: .locationName) ?? ""
        quantity = (try? c.flexibleDouble(forKey: .quantity)) ?? 0
        reservedCount = (try? c.flexibleDouble(forKey: .reservedCount)) ?? 0
    }
}

struct ItemPendingTransfer: Decodable, Identifiable, Sendable {
    let id: String
    let status: String
    let fromLocationId: String?
    let fromLocationName: String?
    let toLocationId: String?
    let toLocationName: String?
    let quantity: Double
    let unit: UnitType?

    private enum CodingKeys: String, CodingKey {
        case id, status, fromLocationId, fromLocationName, toLocationId, toLocationName, quantity, unit
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? ""
        fromLocationId = try c.decodeIfPresent(String.self, forKey: .fromLocationId)
        fromLocationName = try c.decodeIfPresent(String.self, forKey: .fromLocationName)
        toLocationId = try c.decodeIfPresent(String.self, forKey: .toLocationId)
        toLocationName = try c.decodeIfPresent(String.self, forKey: .toLocationName)
        quantity = (try? c.flexibleDouble(forKey: .quantity)) ?? 0
        unit = try? c.decodeIfPresent(UnitType.self, forKey: .unit)
    }
}

struct RecipeStockResponse: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let type: RecipeType
    let category: String?
    let flavors: [String]
    let stockCount: Double
    let reservedCount: Double
    let unit: UnitType
    let photoUrl: String?
    let sellingPrice: Double?
    let calculatedCost: Double?

    private enum CodingKeys: String, CodingKey {
        case id, name, type, category, flavors, stockCount, reservedCount
        case unit, photoUrl, sellingPrice, calculatedCost
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        type = try c.decode(RecipeType.self, forKey: .type)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        flavors = try c.decodeIfPresent([String].self, forKey: .flavors) ?? []
        stockCount = try c.flexibleDouble(forKey: .stockCount)
        reservedCount = (try? c.flexibleDouble(forKey: .reservedCount)) ?? 0
        unit = try c.decode(UnitType.self, forKey: .unit)
        photoUrl = try c.decodeIfPresent(String.self, forKey: .photoUrl)
        sellingPrice = try c.flexibleDoubleIfPresent(forKey: .sellingPrice)
        calculatedCost = try c.flexibleDoubleIfPresent(forKey: .calculatedCost)
    }
}

// MARK: - Stats

struct StockStatsResponse: Decodable, Sendable {
    let statusCounts: [String: Int]
    let totalItems: Int
}

/// GET /raw-materials/:id/delete-info — hard-delete precheck.
struct RawMaterialDeleteInfo: Codable {
    let currentStock: Double
    let canDelete: Bool
    let everUsed: Bool
    /// Live transfers (in asteptare / in tranzit) carrying the material —
    /// they block the delete even at stock 0. Optional for older APIs.
    let activeTransfers: Int?
}

struct RawMaterialQuery {
    var page: Int = 1
    var limit: Int = 20
    var search: String?
    var storageType: StorageType?
    var status: MaterialStatus?

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        if let storageType { items.append(URLQueryItem(name: "storageType", value: storageType.rawValue)) }
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        return items
    }
}

struct ConsumableQuery {
    var page: Int = 1
    var limit: Int = 20
    var search: String?
    var status: MaterialStatus?

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        return items
    }
}

struct StockMovementQuery {
    var page: Int = 1
    var limit: Int = 20
    var rawMaterialId: String?
    var consumableId: String?
    var recipeId: String?
    var movementType: StockMovementType?
    /// ISO day (yyyy-MM-dd), inclusive. Nil = no bound (the export then covers the last 30 days).
    var from: String?
    var to: String?

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        items.append(contentsOf: filterItems)
        return items
    }

    /// The filters only — what the Excel export takes (no paging).
    var filterItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let rawMaterialId { items.append(URLQueryItem(name: "rawMaterialId", value: rawMaterialId)) }
        if let consumableId { items.append(URLQueryItem(name: "consumableId", value: consumableId)) }
        if let recipeId { items.append(URLQueryItem(name: "recipeId", value: recipeId)) }
        if let movementType { items.append(URLQueryItem(name: "movementType", value: movementType.rawValue)) }
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        return items
    }
}

struct RecipeStockQuery {
    var page: Int = 1
    var limit: Int = 20
    var type: RecipeType?
    var category: String?
    var search: String?

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let type { items.append(URLQueryItem(name: "type", value: type.rawValue)) }
        if let category, !category.isEmpty { items.append(URLQueryItem(name: "category", value: category)) }
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        return items
    }
}

struct CreateRawMaterialRequest: Encodable {
    let title: String
    var category: String?
    var lotNumber: String?
    var expiryDate: String?
    let producer: String?
    var supplierId: String?
    var locationId: String?
    let unit: UnitType
    var quantityPerPiece: Double?
    var pieceType: PieceType?
    let storageType: StorageType
    let minimumStock: Double?
    var estimatedLossPercent: Double?
    let purchasePrice: Double?
    /// Whether the entered price includes VAT — the API normalizes to the org cost basis.
    var priceIncludesVat: Bool? = nil
    let invoiceNumber: String?
    let invoiceDate: String?
}

/// Full edit of a raw material (admin). Only non-nil fields are sent;
/// `clearCategory` / `clearSupplier` send an explicit null (API
/// `UpdateRawMaterialDto`: null category = no category, null supplier = unlink).
struct UpdateRawMaterialRequest: Encodable {
    var title: String?
    var producer: String?
    var unit: UnitType?
    var quantityPerPiece: Double?
    var pieceType: PieceType?
    var storageType: StorageType?
    var minimumStock: Double?
    var estimatedLossPercent: Double?
    var purchasePrice: Double?
    /// Whether the entered price includes VAT — the API normalizes to the org cost basis.
    var priceIncludesVat: Bool? = nil
    var lotNumber: String?
    var expiryDate: String?
    var locationId: String?
    /// EU-14 allergen keys — replaces the whole list when sent.
    var allergens: [String]? = nil
    var category: String? = nil
    var clearCategory = false
    var supplierId: String? = nil
    var clearSupplier = false
    var status: MaterialStatus? = nil
    var invoiceNumber: String? = nil
    /// "yyyy-MM-dd"; `clearInvoiceDate` sends null.
    var invoiceDate: String? = nil
    var clearInvoiceDate = false

    private enum CodingKeys: String, CodingKey {
        case title, producer, unit, quantityPerPiece, pieceType, storageType, minimumStock
        case estimatedLossPercent, purchasePrice, priceIncludesVat, lotNumber, expiryDate
        case locationId, allergens, category, supplierId, status, invoiceNumber, invoiceDate
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(producer, forKey: .producer)
        try c.encodeIfPresent(unit, forKey: .unit)
        try c.encodeIfPresent(quantityPerPiece, forKey: .quantityPerPiece)
        try c.encodeIfPresent(pieceType, forKey: .pieceType)
        try c.encodeIfPresent(storageType, forKey: .storageType)
        try c.encodeIfPresent(minimumStock, forKey: .minimumStock)
        try c.encodeIfPresent(estimatedLossPercent, forKey: .estimatedLossPercent)
        try c.encodeIfPresent(purchasePrice, forKey: .purchasePrice)
        try c.encodeIfPresent(priceIncludesVat, forKey: .priceIncludesVat)
        try c.encodeIfPresent(lotNumber, forKey: .lotNumber)
        try c.encodeIfPresent(expiryDate, forKey: .expiryDate)
        try c.encodeIfPresent(locationId, forKey: .locationId)
        try c.encodeIfPresent(allergens, forKey: .allergens)
        if clearCategory { try c.encodeNil(forKey: .category) } else { try c.encodeIfPresent(category, forKey: .category) }
        if clearSupplier { try c.encodeNil(forKey: .supplierId) } else { try c.encodeIfPresent(supplierId, forKey: .supplierId) }
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(invoiceNumber, forKey: .invoiceNumber)
        if clearInvoiceDate { try c.encodeNil(forKey: .invoiceDate) } else { try c.encodeIfPresent(invoiceDate, forKey: .invoiceDate) }
    }
}

struct PriceHistoryEntry: Decodable, Identifiable, Sendable {
    let id: String
    let priceType: String
    let oldPrice: Double?
    let newPrice: Double
    let createdAt: Date
    let changedBy: PriceHistoryUser
}

struct PriceHistoryUser: Decodable, Sendable {
    let id: String
    let firstName: String
    let lastName: String
}

struct CreateConsumableRequest: Encodable {
    let title: String
    var category: String?
    let minimumStock: Double?
}

/// Partial update that always encodes `category` (so null clears it → Misc).
struct UpdateItemCategoryRequest: Encodable {
    let category: String?

    enum CodingKeys: String, CodingKey { case category }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(category, forKey: .category)
    }
}

/// Partial update that always encodes `supplierId` (null unlinks the supplier).
struct UpdateMaterialSupplierRequest: Encodable {
    let supplierId: String?

    enum CodingKeys: String, CodingKey { case supplierId }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(supplierId, forKey: .supplierId)
    }
}

struct CreateStockMovementRequest: Encodable {
    var rawMaterialId: String?
    var consumableId: String?
    let movementType: StockMovementType
    let quantity: Double
    let unit: UnitType
    var referenceNote: String?
    // Intake (INTRARE) details — recorded as a StockLot for the intake history.
    var lotNumber: String?
    var expiryDate: String?
    var purchasePrice: Double?
    /// Whether the entered price includes VAT — the API normalizes to the org cost basis.
    var priceIncludesVat: Bool? = nil
    var supplier: String?
    var locationId: String?
    /// Intake extras (API `CreateStockMovementDto`): scanned barcode and the
    /// supplier's invoice number, stored on the lot.
    var barcode: String? = nil
    var supplierInvoice: String? = nil
}

// MARK: - Intake history (stock lots) + price history

struct StockLotEntry: Decodable, Identifiable, Sendable {
    let id: String
    let lotNumber: String?
    let unit: UnitType?
    let quantity: Double
    let expiryDate: Date?
    let purchasePrice: Double?
    let supplier: String?
    let supplierInvoice: String?
    let receivedAt: Date
    /// What's left of this intake (FIFO). Optional for older APIs.
    let remainingQuantity: Double?
    /// Held back from FIFO — production consumes every other lot first.
    let onHold: Bool?
}

struct CreateRecipeMovementRequest: Encodable {
    let recipeId: String
    let movementType: StockMovementType
    let quantity: Double
    let unit: UnitType
    var referenceNote: String?
}

// MARK: - Batch Receive

struct BatchReceiveItem: Encodable {
    var rawMaterialId: String?
    var consumableId: String?
    let quantity: Double
    let unit: UnitType
    var lotNumber: String?
    var barcode: String?
    var expiryDate: String?
    var purchasePrice: Double?
    /// Whether the entered price includes VAT — the API normalizes to the org cost basis.
    var priceIncludesVat: Bool? = nil
    var supplierInvoice: String?
    var referenceNote: String?
}

struct BatchReceiveRequest: Encodable {
    let items: [BatchReceiveItem]
    var locationId: String?
}

// MARK: - Consum teste (R&D)

/// One line of a test/R&D consumption. Exactly one of the two ids is set.
struct TestConsumptionItem: Encodable {
    var rawMaterialId: String?
    var consumableId: String?
    let quantity: Double
    let unit: UnitType
}

/// `POST /stock/test-consumption` — decrements stock exactly like production
/// (per-location, FIFO on lots) but without a task or recipe output.
struct TestConsumptionRequest: Encodable {
    let locationId: String
    let items: [TestConsumptionItem]
    var notes: String?
}

// MARK: - Low Stock

struct LowStockItem: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let type: String // "raw_material" or "consumable"
    let currentStock: Double
    let minimumStock: Double
    let unit: String

    var stockPercentage: Double {
        guard minimumStock > 0 else { return 1 }
        return currentStock / minimumStock
    }
}

// MARK: - Expiring

struct ExpiringItem: Decodable, Identifiable, Sendable {
    let lotId: String
    let materialTitle: String
    let quantity: Double
    let expiryDate: Date
    let daysUntilExpiry: Int
    /// "MATERIE" (raw material lot) or "PRODUS" (produced good). Absent on old payloads.
    let itemType: String?
    /// Location holding the item (populated for produced goods).
    let locationName: String?
    /// Raw unit string from the API (lot unit / recipe unit); nil on old payloads.
    let unit: String?

    var id: String { lotId }

    /// "12 kg" — quantity with its unit (bare number only on old payloads).
    var quantityText: String {
        unit.map { UnitType.formatQty(quantity, unitRaw: $0) } ?? quantity.qtyFormatted
    }

    var isProduced: Bool { itemType == "PRODUS" }

    private enum CodingKeys: String, CodingKey {
        case lotId, materialTitle, quantity, expiryDate, daysUntilExpiry, itemType, locationName, unit
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lotId = try c.decode(String.self, forKey: .lotId)
        materialTitle = try c.decode(String.self, forKey: .materialTitle)
        quantity = try c.decode(Double.self, forKey: .quantity)
        expiryDate = try c.decode(Date.self, forKey: .expiryDate)
        daysUntilExpiry = try c.decode(Int.self, forKey: .daysUntilExpiry)
        itemType = try c.decodeIfPresent(String.self, forKey: .itemType)
        locationName = try c.decodeIfPresent(String.self, forKey: .locationName)
        unit = try c.decodeIfPresent(String.self, forKey: .unit)
    }
}

// MARK: - Stock Lots

struct StockLotResponse: Decodable, Identifiable, Sendable {
    let id: String
    let rawMaterialId: String?
    let consumableId: String?
    let materialTitle: String?
    let lotNumber: String?
    let barcode: String?
    let quantity: Double
    let expiryDate: Date?
    let purchasePrice: Double?
    let supplierInvoice: String?
    let receivedAt: Date
}

// MARK: - Recipe (produced) lots

/// A production batch of a finished good / semipreparat, per location. Only
/// lots with remaining quantity are returned, in FIFO order (earliest expiry
/// first, then oldest production). Stock produced before v1.21 has no lots.
struct RecipeLotResponse: Decodable, Identifiable, Sendable {
    let id: String
    let lotNumber: String
    /// How much this batch produced.
    let quantity: Double
    /// What is left of it after FIFO consumption.
    let remainingQuantity: Double
    let expiryDate: Date?
    let producedAt: Date
    let locationId: String
    let locationName: String?

    /// Already past its expiry date.
    var isExpired: Bool {
        guard let expiryDate else { return false }
        return expiryDate < Date()
    }

    /// Expires within three days (and is not expired yet).
    var expiresSoon: Bool {
        guard let expiryDate, !isExpired else { return false }
        return expiryDate.timeIntervalSinceNow <= 3 * 24 * 60 * 60
    }
}
