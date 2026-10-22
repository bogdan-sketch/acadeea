import Foundation

struct SupplierMaterial: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let unit: UnitType
    let stockCount: Double
    let minimumStock: Double
    let status: MaterialStatus
    let isLow: Bool
}

struct Supplier: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let contactPerson: String?
    let phone: String?
    let email: String?
    let notes: String?
    let materialCount: Int
    let lowStockCount: Int
    let materials: [SupplierMaterial]
    let createdAt: Date
}

struct CreateSupplierRequest: Encodable {
    let name: String
    var contactPerson: String?
    var phone: String?
    var email: String?
    var notes: String?
}
