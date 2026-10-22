import Foundation

// MARK: - Snapshot

/// Snapshot logic al datelor organizatiei ("Salveaza starea") —
/// `GET /api/v1/backups/snapshots`. Doar pentru admini (`manage all`).
///
/// `sizeBytes` vine ca **String** din API: Prisma stocheaza dimensiunea ca
/// `BigInt`, iar `JSON.stringify` nu poate serializa BigInt, deci backendul
/// il trimite prin `.toString()`.
struct OrgSnapshot: Decodable, Identifiable, Hashable {
    let id: String
    /// Eticheta manuala (ex. "inainte de inventar"). Mereu `nil` pentru cele automate.
    let label: String?
    /// `true` = snapshot facut de jobul de noapte, `false` = salvare manuala.
    let auto: Bool
    let sizeBytes: String
    /// Numarul de randuri per model, ex. `["Order": 120, "Recipe": 85]`.
    let summary: [String: Int]?
    /// Numele utilizatorului care a facut salvarea manuala (`nil` pentru automate).
    let createdByName: String?
    let createdAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, label, auto, sizeBytes, summary, createdAt
        case createdBy, createdByName
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        label = try container.decodeIfPresent(String.self, forKey: .label)
        auto = try container.decodeIfPresent(Bool.self, forKey: .auto) ?? false
        summary = try container.decodeIfPresent([String: Int].self, forKey: .summary)
        createdAt = try container.decode(Date.self, forKey: .createdAt)

        // BigInt serializat ca string; toleram si un numar, in caz ca backendul
        // schimba vreodata serializarea.
        if let text = try? container.decode(String.self, forKey: .sizeBytes) {
            sizeBytes = text
        } else if let number = try? container.decode(Int64.self, forKey: .sizeBytes) {
            sizeBytes = String(number)
        } else {
            sizeBytes = "0"
        }

        // API-ul trimite `createdBy` (nume concatenat); tipul din web e numit
        // `createdByName` — acceptam ambele ca sa nu depindem de care ajunge.
        let fromCreatedBy = try? container.decodeIfPresent(String.self, forKey: .createdBy)
        let fromCreatedByName = try? container.decodeIfPresent(String.self, forKey: .createdByName)
        createdByName = (fromCreatedBy ?? nil) ?? (fromCreatedByName ?? nil)
    }

    // MARK: Display helpers

    /// "08.08.2026 01:30" — data completa afisata in lista si in confirmari.
    var displayDate: String { createdAt.dottedDateTime }

    /// Dimensiune umana: "1,4 MB" / "812 KB" / "430 B".
    var displaySize: String { Self.formatSize(sizeBytes) }

    /// Eticheta scurta pentru rand: eticheta manuala sau nimic (badge-ul
    /// "Automat" acopera cazul automat).
    var displayLabel: String? {
        guard let label, !label.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return label
    }

    /// ["Comenzi: 120", "Retete: 85", …] — doar modelele cu randuri, cele mai mari primele.
    var summaryLines: [String] { SnapshotModelLabels.lines(from: summary ?? [:]) }

    /// Nume de fisier pentru share sheet: "snapshot-08-08-2026_01-30.json.gz".
    var downloadFileName: String {
        let stamp = displayDate
            .replacingOccurrences(of: ".", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: " ", with: "_")
        return "snapshot-\(stamp).json.gz"
    }

    static func formatSize(_ sizeBytes: String) -> String {
        let bytes = Double(sizeBytes) ?? 0
        if bytes >= 1024 * 1024 {
            return String(format: "%.1f MB", bytes / (1024 * 1024))
                .replacingOccurrences(of: ".", with: ",")
        }
        if bytes >= 1024 {
            return String(format: "%.0f KB", bytes / 1024)
        }
        return "\(Int(bytes)) B"
    }
}

// MARK: - Request / response bodies

struct CreateSnapshotRequest: Encodable {
    let label: String?
}

struct RestoreSnapshotRequest: Encodable {
    /// Trebuie sa fie exact `RESTAUREAZA` — backendul refuza orice altceva.
    let confirm: String
}

struct RestoreSnapshotResponse: Decodable {
    /// Numarul de randuri reinserate per model.
    let restored: [String: Int]
}

// MARK: - Model labels

/// Nume de modele traduse in romana acolo unde e evident; restul raman ca in API.
/// Oglindeste `MODEL_LABELS_RO` din pagina web `settings/backups`.
enum SnapshotModelLabels {
    static let map: [String: String] = [
        "Order": "Comenzi",
        "OrderItem": "Articole comanda",
        "Recipe": "Retete",
        "Task": "Taskuri",
        "RawMaterial": "Materii prime",
        "Consumable": "Consumabile",
        "User": "Utilizatori",
        "UserInvitation": "Invitatii",
        "Role": "Roluri",
        "Location": "Locatii",
        "Supplier": "Furnizori",
        "Equipment": "Echipamente",
        "Notification": "Notificari",
        "StockMovement": "Miscari de stoc",
        "StockTransfer": "Transferuri",
        "DeliveryNote": "Avize de livrare",
        "ConformityCertificate": "Certificate de conformitate",
        "Integration": "Integrari",
    ]

    static func label(for model: String) -> String { map[model] ?? model }

    /// ["Comenzi: 120", …] — doar modelele cu randuri, descrescator dupa numar.
    static func lines(from summary: [String: Int]) -> [String] {
        summary
            .filter { $0.value > 0 }
            .sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
            .map { "\(label(for: $0.key)): \($0.value)" }
    }
}
