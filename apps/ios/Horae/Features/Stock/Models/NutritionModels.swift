import Foundation

// MARK: - Nutrition (feature-gated by Organization.nutritionEnabled)

/// Nutrition per 100g (solids) / 100ml (liquids) of a raw material.
/// All fields optional — fill what the label provides.
struct NutritionValues: Codable, Sendable {
    var calories: Double?
    var protein: Double?
    var carbs: Double?
    var sugars: Double?
    var fat: Double?
    var saturatedFat: Double?
    var fiber: Double?
    var salt: Double?

    var isEmpty: Bool {
        [calories, protein, carbs, sugars, fat, saturatedFat, fiber, salt]
            .allSatisfy { $0 == nil }
    }
}

/// Aggregated nutrition for a recipe (GET /recipes/:id/nutrition).
struct RecipeNutritionResult: Decodable, Sendable {
    let recipeId: String
    let recipeName: String
    let yieldQuantity: Double
    let yieldUnit: String
    let total: NutritionValues
    let perPiece: NutritionValues
    let per100g: NutritionValues?
    let coveredWeightGrams: Double
    let missing: [MissingIngredient]
    let coveredCount: Int
    let ingredientCount: Int
    /// Denominator basis for the per-100g values: "finished" (recipe's finished
    /// batch weight) or "ingredients" (summed raw ingredient weight). Defaults to
    /// "ingredients" when the server omits it.
    let per100Basis: String
    /// Finished-batch weight in grams used as the per-100g denominator when
    /// `per100Basis == "finished"`.
    let finishedWeightGrams: Double?
    /// Allergens propagated from raw materials (empty for older APIs).
    let allergens: [AllergenEntry]

    struct MissingIngredient: Decodable, Identifiable, Sendable {
        var id: String { rawMaterialId }
        let rawMaterialId: String
        let title: String
    }

    /// EU-14 allergen propagated from the tree + the materials that carry it.
    struct AllergenEntry: Decodable, Identifiable, Sendable {
        var id: String { allergen }
        let allergen: String
        let sources: [String]
    }

    private enum CodingKeys: String, CodingKey {
        case recipeId, recipeName, yieldQuantity, yieldUnit, total, perPiece, per100g
        case coveredWeightGrams, missing, coveredCount, ingredientCount
        case per100Basis, finishedWeightGrams, allergens
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        recipeId = try c.decode(String.self, forKey: .recipeId)
        recipeName = try c.decode(String.self, forKey: .recipeName)
        yieldQuantity = try c.flexibleDouble(forKey: .yieldQuantity)
        yieldUnit = try c.decode(String.self, forKey: .yieldUnit)
        total = try c.decode(NutritionValues.self, forKey: .total)
        perPiece = try c.decode(NutritionValues.self, forKey: .perPiece)
        per100g = try c.decodeIfPresent(NutritionValues.self, forKey: .per100g)
        coveredWeightGrams = try c.flexibleDouble(forKey: .coveredWeightGrams)
        missing = try c.decodeIfPresent([MissingIngredient].self, forKey: .missing) ?? []
        coveredCount = try c.flexibleInt(forKey: .coveredCount)
        ingredientCount = try c.flexibleInt(forKey: .ingredientCount)
        per100Basis = try c.decodeIfPresent(String.self, forKey: .per100Basis) ?? "ingredients"
        finishedWeightGrams = try c.flexibleDoubleIfPresent(forKey: .finishedWeightGrams)
        allergens = try c.decodeIfPresent([AllergenEntry].self, forKey: .allergens) ?? []
    }
}
