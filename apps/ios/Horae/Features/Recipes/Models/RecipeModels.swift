import Foundation

// MARK: - Prisma Decimal Decoding Helpers

/// Prisma Decimal fields may serialize as numbers OR strings depending on API version.
/// These helpers handle both formats transparently.
extension KeyedDecodingContainer {
    func flexibleDouble(forKey key: Key) throws -> Double {
        if let v = try? decode(Double.self, forKey: key) { return v }
        if let s = try? decode(String.self, forKey: key), let v = Double(s) { return v }
        if let v = try? decode(Int.self, forKey: key) { return Double(v) }
        throw DecodingError.typeMismatch(Double.self, .init(codingPath: codingPath + [key], debugDescription: "Expected number or numeric string"))
    }

    func flexibleDoubleIfPresent(forKey key: Key) throws -> Double? {
        guard contains(key), !(try decodeNil(forKey: key)) else { return nil }
        return try flexibleDouble(forKey: key)
    }

    func flexibleInt(forKey key: Key) throws -> Int {
        if let v = try? decode(Int.self, forKey: key) { return v }
        if let v = try? decode(Double.self, forKey: key) { return Int(v) }
        if let s = try? decode(String.self, forKey: key), let v = Int(s) { return v }
        throw DecodingError.typeMismatch(Int.self, .init(codingPath: codingPath + [key], debugDescription: "Expected number or numeric string"))
    }

    func flexibleIntIfPresent(forKey key: Key) throws -> Int? {
        guard contains(key), !(try decodeNil(forKey: key)) else { return nil }
        return try flexibleInt(forKey: key)
    }
}

// MARK: - Response Models

struct RecipeResponse: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let photoUrl: String?
    let unit: UnitType
    let quantityPerPiece: Double
    let yieldQuantity: Double
    let type: RecipeType
    let version: Int
    // Fractional stock is real (5.45 kg) — never truncate to Int.
    let stockCount: Double?
    let reservedCount: Double?
    let category: String?
    let estimatedLossPercent: Double
    let sellingPrice: Double?
    /// Weight of the whole finished batch in grams AFTER preparation (e.g. baking
    /// water loss). EU-1169 yield factor: when set, the nutrition endpoint uses it
    /// as the per-100g denominator instead of summed raw ingredient weight.
    let finishedWeightGrams: Double?
    /// For a semipreparat yielding BUCATI: what one bucată equals (e.g. 2 KILOGRAME),
    /// so it can be used as an ingredient in a mass/volume unit. nil = no bridge.
    let pieceEquivalentQuantity: Double?
    let pieceEquivalentUnit: UnitType?
    /// Shelf life in whole months for produced goods (nil = expiry not tracked).
    let shelfLifeMonths: Int?
    let flavors: [String]?
    /// Archived recipes are hidden from default listings/pickers; history stays readable.
    let isArchived: Bool
    /// Draft recipes are hidden from default listings/pickers until published.
    let isDraft: Bool
    /// When the recipe was last saved as a draft (nil = never / published).
    let draftedAt: Date?
    /// Byproduct = a SEMIPREPARAT left over after producing another recipe;
    /// listed as its own category in ingredient pickers.
    let isByproduct: Bool
    /// The recipe this byproduct is left over from (byproducts only).
    let sourceRecipeId: String?
    /// Active byproducts this recipe leaves behind (drives the form toggle).
    let byproducts: [RecipeByproductSummary]
    let createdById: String
    let createdAt: Date
    let updatedAt: Date
    let components: [RecipeComponent]

    private enum CodingKeys: String, CodingKey {
        case id, name, photoUrl, unit, quantityPerPiece, yieldQuantity, type
        case version, stockCount, reservedCount, category, estimatedLossPercent, sellingPrice
        case finishedWeightGrams, pieceEquivalentQuantity, pieceEquivalentUnit
        case shelfLifeMonths, flavors, isArchived, isDraft, draftedAt
        case isByproduct, sourceRecipeId, byproducts
        case createdById, createdAt, updatedAt, components
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        photoUrl = try c.decodeIfPresent(String.self, forKey: .photoUrl)
        unit = try c.decode(UnitType.self, forKey: .unit)
        quantityPerPiece = try c.flexibleDouble(forKey: .quantityPerPiece)
        yieldQuantity = try c.flexibleDouble(forKey: .yieldQuantity)
        type = try c.decode(RecipeType.self, forKey: .type)
        version = try c.decode(Int.self, forKey: .version)
        stockCount = try c.flexibleDoubleIfPresent(forKey: .stockCount)
        reservedCount = try c.flexibleDoubleIfPresent(forKey: .reservedCount)
        category = try c.decodeIfPresent(String.self, forKey: .category)
        estimatedLossPercent = (try? c.flexibleDouble(forKey: .estimatedLossPercent)) ?? 0
        sellingPrice = try c.flexibleDoubleIfPresent(forKey: .sellingPrice)
        finishedWeightGrams = try c.flexibleDoubleIfPresent(forKey: .finishedWeightGrams)
        pieceEquivalentQuantity = try c.flexibleDoubleIfPresent(forKey: .pieceEquivalentQuantity)
        pieceEquivalentUnit = try c.decodeIfPresent(UnitType.self, forKey: .pieceEquivalentUnit)
        shelfLifeMonths = try c.flexibleIntIfPresent(forKey: .shelfLifeMonths)
        flavors = try c.decodeIfPresent([String].self, forKey: .flavors)
        isArchived = try c.decodeIfPresent(Bool.self, forKey: .isArchived) ?? false
        isDraft = try c.decodeIfPresent(Bool.self, forKey: .isDraft) ?? false
        draftedAt = try c.decodeIfPresent(Date.self, forKey: .draftedAt)
        isByproduct = try c.decodeIfPresent(Bool.self, forKey: .isByproduct) ?? false
        sourceRecipeId = try c.decodeIfPresent(String.self, forKey: .sourceRecipeId)
        byproducts = try c.decodeIfPresent([RecipeByproductSummary].self, forKey: .byproducts) ?? []
        createdById = try c.decode(String.self, forKey: .createdById)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decode(Date.self, forKey: .updatedAt)
        components = try c.decodeIfPresent([RecipeComponent].self, forKey: .components) ?? []
    }
}

struct RecipeComponent: Decodable, Identifiable, Sendable {
    let id: String
    let recipeId: String
    let name: String
    let sortOrder: Int
    let ingredients: [RecipeIngredient]
}

struct RecipeIngredient: Decodable, Identifiable, Sendable {
    let id: String
    let componentId: String
    let rawMaterialId: String?
    let semipreparatRecipeId: String?
    let name: String
    let quantity: Double
    let unit: UnitType
    let prepMethod: String?
    let sortOrder: Int
    let rawMaterialStockCount: Double?
    let rawMaterialReservedCount: Double?
    let rawMaterialUnit: UnitType?

    var isSemipreparat: Bool { semipreparatRecipeId != nil }
    var isRawMaterial: Bool { rawMaterialId != nil }

    /// Available stock for raw material ingredients (stock - reserved).
    var availableStock: Double? {
        guard let stock = rawMaterialStockCount else { return nil }
        return stock - (rawMaterialReservedCount ?? 0)
    }

    private enum CodingKeys: String, CodingKey {
        case id, componentId, rawMaterialId, semipreparatRecipeId
        case name, quantity, unit, prepMethod, sortOrder
        case rawMaterialStockCount, rawMaterialReservedCount, rawMaterialUnit
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        componentId = try c.decode(String.self, forKey: .componentId)
        rawMaterialId = try c.decodeIfPresent(String.self, forKey: .rawMaterialId)
        semipreparatRecipeId = try c.decodeIfPresent(String.self, forKey: .semipreparatRecipeId)
        name = try c.decode(String.self, forKey: .name)
        quantity = try c.flexibleDouble(forKey: .quantity)
        unit = try c.decode(UnitType.self, forKey: .unit)
        prepMethod = try c.decodeIfPresent(String.self, forKey: .prepMethod)
        sortOrder = try c.decode(Int.self, forKey: .sortOrder)
        rawMaterialStockCount = try c.flexibleDoubleIfPresent(forKey: .rawMaterialStockCount)
        rawMaterialReservedCount = try c.flexibleDoubleIfPresent(forKey: .rawMaterialReservedCount)
        rawMaterialUnit = try c.decodeIfPresent(UnitType.self, forKey: .rawMaterialUnit)
    }
}

/// Lightweight byproduct reference carried on the source recipe.
struct RecipeByproductSummary: Decodable, Identifiable, Sendable, Equatable {
    let id: String
    let name: String
}

/// Minimal recipe info for pickers.
struct RecipeSummary: Identifiable, Sendable {
    let id: String
    let name: String
    let type: RecipeType
    let unit: UnitType
    let yieldQuantity: Double
    /// Splits semipreparate vs byproducts in the unified ingredient picker.
    var isByproduct: Bool = false
}

// MARK: - Form State Types

struct IngredientFormItem: Identifiable, Equatable {
    let id = UUID()
    var rawMaterialId: String?
    var semipreparatRecipeId: String?
    var name: String = ""
    var quantity: Double = 0
    var unit: UnitType = .GRAME
    var prepMethod: String = ""

    var isSemipreparat: Bool { semipreparatRecipeId != nil }
}

struct ComponentFormData: Identifiable, Equatable {
    let id = UUID()
    var name: String = ""
    var ingredients: [IngredientFormItem] = []
}

// MARK: - Request Types (Encodable)

struct CreateRecipeRequest: Encodable {
    let name: String
    let unit: UnitType
    let quantityPerPiece: Double
    let yieldQuantity: Double
    let type: RecipeType
    let category: String?
    var estimatedLossPercent: Double?
    /// Finished-batch weight in grams after preparation (nil/0 = not set, clears
    /// on PATCH). Used as the per-100g nutrition denominator.
    var finishedWeightGrams: Double?
    /// Semipreparat piece equivalent (1 bucată = N unit). nil/0 clears the bridge.
    var pieceEquivalentQuantity: Double?
    var pieceEquivalentUnit: UnitType?
    /// Shelf life in whole months (nil = expiry not tracked).
    var shelfLifeMonths: Int?
    let flavors: [String]?
    let components: [CreateComponentRequest]?
    /// When true, the recipe is created as a draft (hidden from default lists
    /// until published). Only meaningful on create; omitted when nil.
    var isDraft: Bool?
    /// Mark as a byproduct semipreparat (server forces type=SEMIPREPARAT).
    /// Omitted when nil.
    var isByproduct: Bool?
    /// The recipe this byproduct is left over from (with isByproduct only).
    var sourceRecipeId: String?

    private enum CodingKeys: String, CodingKey {
        case name, unit, quantityPerPiece, yieldQuantity, type, category
        case estimatedLossPercent, finishedWeightGrams
        case pieceEquivalentQuantity, pieceEquivalentUnit, shelfLifeMonths, flavors, components, isDraft
        case isByproduct, sourceRecipeId
    }

    /// Custom encoding so `shelfLifeMonths` and `finishedWeightGrams` are ALWAYS
    /// present: `nil` serializes as JSON `null`, which the backend PATCH treats as
    /// "clear the field" (a missing key means "leave unchanged"). All other
    /// optionals keep the synthesized behaviour (omitted when nil).
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(unit, forKey: .unit)
        try container.encode(quantityPerPiece, forKey: .quantityPerPiece)
        try container.encode(yieldQuantity, forKey: .yieldQuantity)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(category, forKey: .category)
        try container.encodeIfPresent(estimatedLossPercent, forKey: .estimatedLossPercent)
        try container.encode(finishedWeightGrams, forKey: .finishedWeightGrams)
        try container.encode(pieceEquivalentQuantity, forKey: .pieceEquivalentQuantity)
        try container.encode(pieceEquivalentUnit, forKey: .pieceEquivalentUnit)
        try container.encode(shelfLifeMonths, forKey: .shelfLifeMonths)
        try container.encodeIfPresent(flavors, forKey: .flavors)
        try container.encodeIfPresent(components, forKey: .components)
        try container.encodeIfPresent(isDraft, forKey: .isDraft)
        try container.encodeIfPresent(isByproduct, forKey: .isByproduct)
        try container.encodeIfPresent(sourceRecipeId, forKey: .sourceRecipeId)
    }
}

/// Lightweight partial update request — only sends non-nil fields.
struct UpdateRecipeRequest: Encodable {
    var category: String?
    var estimatedLossPercent: Double?
    var sellingPrice: Double?
    var finishedWeightGrams: Double?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let category { try container.encode(category, forKey: .category) }
        if let estimatedLossPercent {
            try container.encode(estimatedLossPercent, forKey: .estimatedLossPercent)
        }
        if let sellingPrice { try container.encode(sellingPrice, forKey: .sellingPrice) }
        if let finishedWeightGrams {
            try container.encode(finishedWeightGrams, forKey: .finishedWeightGrams)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case category, estimatedLossPercent, sellingPrice, finishedWeightGrams
    }
}

struct CreateComponentRequest: Encodable {
    let name: String
    let sortOrder: Int
    let ingredients: [CreateIngredientRequest]
}

struct CreateIngredientRequest: Encodable {
    let rawMaterialId: String?
    let semipreparatRecipeId: String?
    let name: String
    let quantity: Double
    let unit: UnitType
    let prepMethod: String?
    let sortOrder: Int
}

// MARK: - Query

struct RecipeQuery {
    var page: Int = 1
    var limit: Int = 20
    var search: String?
    var type: RecipeType?
    var category: String?
    /// false (default) → only active recipes; true → only archived.
    var archived: Bool = false
    /// false (default) → drafts hidden; true → only drafts.
    var draft: Bool = false

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        if let type { items.append(URLQueryItem(name: "type", value: type.rawValue)) }
        if let category, !category.isEmpty { items.append(URLQueryItem(name: "category", value: category)) }
        if archived { items.append(URLQueryItem(name: "archived", value: "true")) }
        if draft { items.append(URLQueryItem(name: "draft", value: "true")) }
        return items
    }
}

// MARK: - Yield History

struct RecipeYieldHistoryResponse: Decodable, Identifiable, Sendable {
    let id: String
    let recipeId: String
    let taskId: String
    let targetQuantity: Double
    let actualYield: Double
    let varianceAbsolute: Double
    let variancePercent: Double
    let scaleFactor: Double
    let recordedAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, recipeId, taskId, targetQuantity, actualYield
        case varianceAbsolute, variancePercent, scaleFactor, recordedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        recipeId = try c.decode(String.self, forKey: .recipeId)
        taskId = try c.decode(String.self, forKey: .taskId)
        targetQuantity = try c.flexibleDouble(forKey: .targetQuantity)
        actualYield = try c.flexibleDouble(forKey: .actualYield)
        varianceAbsolute = try c.flexibleDouble(forKey: .varianceAbsolute)
        variancePercent = try c.flexibleDouble(forKey: .variancePercent)
        scaleFactor = try c.flexibleDouble(forKey: .scaleFactor)
        recordedAt = try c.decode(Date.self, forKey: .recordedAt)
    }
}
