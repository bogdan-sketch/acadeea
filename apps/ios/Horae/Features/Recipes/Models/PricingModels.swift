import Foundation

struct RecipeMarginResponse: Decodable, Sendable {
    let recipeId: String
    let recipeName: String
    let sellingPrice: Double?
    let recipeCost: Double?
    let margin: Double?
    let marginPercent: Double?
}

struct PriceHistoryResponse: Decodable, Identifiable, Sendable {
    let id: String
    let rawMaterialId: String?
    let consumableId: String?
    let recipeId: String?
    let priceType: String
    let oldPrice: Double?
    let newPrice: Double
    let changedById: String
    let createdAt: Date
}

struct SetSellingPriceRequest: Encodable {
    let sellingPrice: Double
}

struct OrderRevenueResponse: Decodable, Sendable {
    let orderId: String
    let totalRevenue: Double?
}
