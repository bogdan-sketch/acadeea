import Foundation

// MARK: - Requirements plan (necesar MP)

/// One product line in the plan request: "make `quantity` of this recipe".
struct RequirementsPlanRequestItem: Encodable, Sendable {
    let recipeId: String
    let quantity: Double
}

struct RequirementsPlanRequest: Encodable, Sendable {
    let items: [RequirementsPlanRequestItem]
}

struct PlanProduct: Decodable, Identifiable, Sendable {
    var id: String { recipeId }
    let recipeId: String
    let recipeName: String
    let quantity: Double
    let unit: String
}

struct PlanRequirement: Decodable, Identifiable, Sendable {
    var id: String { "\(rawMaterialId)-\(unit)" }
    let rawMaterialId: String
    let title: String
    let category: String?
    let needed: Double
    let unit: String
    let currentStock: Double
    let available: Double
    let deficit: Double
    let supplierId: String?
    let supplierName: String?
}

struct RequirementsPlanResult: Decodable, Sendable {
    let products: [PlanProduct]
    let requirements: [PlanRequirement]
}
