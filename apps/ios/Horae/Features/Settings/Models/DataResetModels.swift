import Foundation

// MARK: - Resetare date

/// Categoriile resetabile — `GET /api/v1/data-reset/preview`. Cheile vin din
/// API (`data-reset.categories.ts`); le pastram ca string ca o categorie noua
/// pe server sa nu rupa decodarea.
struct ResetCategoryPreview: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    let description: String
    /// Categorii incluse automat (dependente FK) cand aceasta e selectata.
    let requires: [String]
    /// Date de baza (retete / materii prime) — avertisment suplimentar.
    let danger: Bool
    /// Randuri per model care ar fi sterse, ex. `["Task": 120]`.
    let counts: [String: Int]
    let total: Int

    var id: String { key }

    /// „Taskuri: 120 · Rezervari: 3" — doar modelele cu randuri, cele mai mari primele.
    var countLines: String {
        counts
            .filter { $0.value > 0 }
            .sorted { $0.value > $1.value }
            .map { "\(ResetModelLabels.label(for: $0.key)): \($0.value)" }
            .joined(separator: " · ")
    }
}

struct DataResetPreviewResponse: Decodable {
    let categories: [ResetCategoryPreview]
}

struct RunDataResetRequest: Encodable {
    let categories: [String]
    let confirm: String
}

struct DataResetResult: Decodable {
    let categories: [String]
    let snapshotId: String?
    let deleted: [String: Int]
    let total: Int
}

/// Etichete romanesti pentru modelele din sumar (restul raman ca in API).
enum ResetModelLabels {
    private static let labels: [String: String] = [
        "Task": "Taskuri",
        "TaskStatusHistory": "Istoric taskuri",
        "RecipeYieldHistory": "Randamente",
        "StockReservation": "Rezervari",
        "LotConsumption": "Consumuri loturi",
        "EquipmentReservation": "Rezervari echipamente",
        "StockMovement": "Miscari de stoc",
        "StockLot": "Loturi",
        "RecipeStockLot": "Loturi produse",
        "MaterialStock": "Stoc pe locatii",
        "RecipeStock": "Stoc produse pe locatii",
        "StockTransfer": "Transferuri",
        "StockTransferItem": "Articole transfer",
        "TransferApproval": "Aprobari transfer",
        "Order": "Comenzi",
        "OrderItem": "Articole comanda",
        "OrderStatusHistory": "Istoric comenzi",
        "DeliveryNote": "Avize de livrare",
        "ConformityCertificate": "Certificate",
        "ExternalOrderSource": "Comenzi externe",
        "SalesDeduction": "Scaderi din vanzari",
        "SalesDeductionLine": "Linii vanzari",
        "Notification": "Notificari",
        "Recipe": "Retete",
        "RecipeComponent": "Componente retete",
        "RecipeIngredient": "Ingrediente",
        "RecipeVersion": "Versiuni retete",
        "PriceHistory": "Istoric preturi",
        "ProductMapping": "Mapari produse",
        "SalesProductAlias": "Aliasuri vanzari",
        "RawMaterial": "Materii prime",
        "Consumable": "Consumabile",
        "UnitConversion": "Conversii unitati",
    ]

    static func label(for model: String) -> String { labels[model] ?? model }
}
