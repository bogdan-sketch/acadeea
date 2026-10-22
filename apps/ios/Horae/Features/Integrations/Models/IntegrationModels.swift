import Foundation

// MARK: - Integration

struct Integration: Identifiable, Codable {
    let id: String
    let provider: String       // EBRIZA | WOOCOMMERCE
    let status: String         // INACTIVE | ACTIVE | ERROR
    let config: [String: AnyCodable]?
    let lastSyncAt: String?
    let createdAt: String
    let updatedAt: String
    let mappingsCount: Int

    var providerDisplayName: String {
        switch provider {
        case "EBRIZA": return "eBriza"
        case "WOOCOMMERCE": return "WooCommerce"
        default: return provider
        }
    }

    var statusDisplayName: String {
        switch status {
        case "ACTIVE": return "Activ"
        case "INACTIVE": return "Inactiv"
        case "ERROR": return "Eroare"
        default: return status
        }
    }

    var isActive: Bool { status == "ACTIVE" }
}

// MARK: - Product Mapping

struct ProductMapping: Identifiable, Codable {
    let id: String
    let integrationId: String
    let externalProductId: String
    let externalProductName: String
    let recipeId: String
    let recipeName: String
    let createdAt: String
}

// MARK: - External Order

struct ExternalOrder: Identifiable, Codable {
    let id: String
    let integrationId: String
    let externalId: String
    let orderId: String?
    let syncStatus: String     // PENDING | SYNCED | FAILED | SKIPPED
    let errorMessage: String?
    let createdAt: String

    var syncStatusDisplayName: String {
        switch syncStatus {
        case "PENDING": return "In asteptare"
        case "SYNCED": return "Sincronizat"
        case "FAILED": return "Esuat"
        case "SKIPPED": return "Ignorat"
        default: return syncStatus
        }
    }
}

// MARK: - Request DTOs

struct CreateIntegrationRequest: Encodable {
    let provider: String
    let config: [String: String]?
}

struct UpdateIntegrationRequest: Encodable {
    let status: String?
    let config: [String: String]?
}

struct CreateProductMappingRequest: Encodable {
    let externalProductId: String
    let externalProductName: String
    let recipeId: String
}

struct SyncResult: Codable {
    let synced: Int
    let failed: Int
}

// MARK: - AnyCodable Helper

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else {
            value = ""
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let string = value as? String {
            try container.encode(string)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else if let double = value as? Double {
            try container.encode(double)
        }
    }
}
