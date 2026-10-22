import Foundation

struct RecipeCostIngredient: Decodable, Identifiable, Sendable {
    var id: String { rawMaterialId }
    let rawMaterialId: String
    let name: String
    let quantity: Double
    let unit: String
    let unitPrice: Double?
    let totalCost: Double?
}

struct RecipeCostResponse: Decodable, Sendable {
    let recipeId: String
    let recipeName: String
    let totalCost: Double?
    let sellingPrice: Double?
    let margin: Double?
    let marginPercent: Double?
    let ingredients: [RecipeCostIngredient]
}

struct RecipeVersionResponse: Decodable, Identifiable, Sendable {
    let id: String
    let recipeId: String
    let version: Int
    let changedById: String
    let createdAt: Date
}
