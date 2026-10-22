import Foundation

// Source: apps/api/src/modules/sales-deductions/dto/sales-deduction.dto.ts
// Decoded with APIClient.makeDecoder() (fractional-second ISO 8601 dates).

// MARK: - Responses

/// `GET /sales-deductions/feature` — the env-level rollout switch (test-only for now).
struct SalesDeductionFeatureResponse: Decodable, Sendable {
    let enabled: Bool
}

/// A sellable product (active FINAL + SEMIPREPARAT recipe) with its stock at
/// the deduction's location — the confirmer's product picker.
struct SalesProductOption: Decodable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    let unit: UnitType
    let type: String
    let category: String?
    /// Stock at the requested location.
    let stock: Double
}

/// A name-match suggestion for a draft line (DRAFT only).
struct SalesMatchCandidate: Decodable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String
    let score: Double
    let kind: String
}

struct SalesDeductionLine: Decodable, Identifiable, Sendable {
    let id: String
    let position: Int
    let rawName: String
    let rawUnit: String?
    let quantityReported: Double?
    let recipeId: String?
    let recipeName: String?
    let recipeUnit: UnitType?
    let matchScore: Double?
    /// ALIAS | MAPPING | EXACT | CONTAINS | FUZZY | MANUAL | NONE — kept as a
    /// String so a new server-side kind never breaks decoding.
    let matchKind: String?
    let decision: SalesDeductionDecision
    let quantity: Double?
    let stockOverride: Double?
    let shortfall: Double?
    let stockBefore: Double?
    let stockAfter: Double?
    /// DRAFT only: live stock of the matched product at the location.
    let currentStock: Double?
    /// DRAFT only: best name matches.
    let candidates: [SalesMatchCandidate]

    private enum CodingKeys: String, CodingKey {
        case id, position, rawName, rawUnit, quantityReported, recipeId, recipeName
        case recipeUnit, matchScore, matchKind, decision, quantity, stockOverride
        case shortfall, stockBefore, stockAfter, currentStock, candidates
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        position = try c.decodeIfPresent(Int.self, forKey: .position) ?? 0
        rawName = try c.decode(String.self, forKey: .rawName)
        rawUnit = try c.decodeIfPresent(String.self, forKey: .rawUnit)
        quantityReported = try c.decodeIfPresent(Double.self, forKey: .quantityReported)
        recipeId = try c.decodeIfPresent(String.self, forKey: .recipeId)
        recipeName = try c.decodeIfPresent(String.self, forKey: .recipeName)
        recipeUnit = try? c.decodeIfPresent(UnitType.self, forKey: .recipeUnit)
        matchScore = try c.decodeIfPresent(Double.self, forKey: .matchScore)
        matchKind = try c.decodeIfPresent(String.self, forKey: .matchKind)
        decision = try c.decode(SalesDeductionDecision.self, forKey: .decision)
        quantity = try c.decodeIfPresent(Double.self, forKey: .quantity)
        stockOverride = try c.decodeIfPresent(Double.self, forKey: .stockOverride)
        shortfall = try c.decodeIfPresent(Double.self, forKey: .shortfall)
        stockBefore = try c.decodeIfPresent(Double.self, forKey: .stockBefore)
        stockAfter = try c.decodeIfPresent(Double.self, forKey: .stockAfter)
        currentStock = try c.decodeIfPresent(Double.self, forKey: .currentStock)
        candidates = try c.decodeIfPresent([SalesMatchCandidate].self, forKey: .candidates) ?? []
    }
}

struct SalesDeductionSummary: Decodable, Sendable {
    let total: Int
    let accepted: Int
    let declined: Int
    let created: Int
    let shortfalls: Int
    let overrides: Int
    let unmatched: Int
}

struct SalesDeduction: Decodable, Identifiable, Sendable {
    let id: String
    let locationId: String
    let locationName: String
    let source: SalesDeductionSource
    let status: SalesDeductionStatus
    let fileName: String?
    let periodFrom: Date?
    let periodTo: Date?
    let note: String?
    let createdByName: String
    let confirmedByName: String?
    let createdAt: Date
    let confirmedAt: Date?
    let revertedAt: Date?
    /// Earlier CONFIRMED sessions built from the same file (same sha256).
    let duplicateOf: [String]
    let summary: SalesDeductionSummary
    /// Present on `GET /:id` (and create/confirm/revert), absent in the log list.
    let lines: [SalesDeductionLine]?

    private enum CodingKeys: String, CodingKey {
        case id, locationId, locationName, source, status, fileName, periodFrom, periodTo
        case note, createdByName, confirmedByName, createdAt, confirmedAt, revertedAt
        case duplicateOf, summary, lines
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        locationId = try c.decode(String.self, forKey: .locationId)
        locationName = try c.decodeIfPresent(String.self, forKey: .locationName) ?? ""
        source = try c.decode(SalesDeductionSource.self, forKey: .source)
        status = try c.decode(SalesDeductionStatus.self, forKey: .status)
        fileName = try c.decodeIfPresent(String.self, forKey: .fileName)
        periodFrom = try c.decodeIfPresent(Date.self, forKey: .periodFrom)
        periodTo = try c.decodeIfPresent(Date.self, forKey: .periodTo)
        note = try c.decodeIfPresent(String.self, forKey: .note)
        createdByName = try c.decodeIfPresent(String.self, forKey: .createdByName) ?? ""
        confirmedByName = try c.decodeIfPresent(String.self, forKey: .confirmedByName)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        confirmedAt = try c.decodeIfPresent(Date.self, forKey: .confirmedAt)
        revertedAt = try c.decodeIfPresent(Date.self, forKey: .revertedAt)
        duplicateOf = try c.decodeIfPresent([String].self, forKey: .duplicateOf) ?? []
        summary = try c.decode(SalesDeductionSummary.self, forKey: .summary)
        lines = try c.decodeIfPresent([SalesDeductionLine].self, forKey: .lines)
    }

    /// Log row date: confirmation time once confirmed, else creation time.
    var displayDate: Date { confirmedAt ?? createdAt }

    /// Log-row summary text — mirrors web `SummaryText`.
    var summaryText: String {
        if status == .DRAFT { return "\(summary.total) produse de verificat" }
        var parts = ["\(summary.accepted) scăzute"]
        if summary.shortfalls > 0 { parts.append("\(summary.shortfalls) stoc insuficient") }
        if summary.created > 0 { parts.append("\(summary.created) noi") }
        if summary.declined > 0 { parts.append("\(summary.declined) ignorate") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Requests

struct CreateManualSalesDeductionRequest: Encodable {
    let locationId: String
}

struct CreateWooSalesDeductionRequest: Encodable {
    let locationId: String
    /// ISO date-time, inclusive.
    let from: String
    /// ISO date-time, inclusive.
    let to: String
}

/// `newProduct` of a CREATE_NEW line — a minimal FINAL recipe + its stock.
struct SalesNewProductPayload: Encodable {
    let name: String
    let unit: UnitType
    /// PRODUS_FINIT category (nil = Misc).
    let category: String?
    let initialStock: Double
}

/// One reviewed line. The confirm body is authoritative: omitted lines are dropped.
/// Optional fields are omitted from the JSON when nil (the API whitelists fields).
struct ConfirmSalesDeductionLine: Encodable {
    /// Existing draft line id (nil for lines added by hand).
    let id: String?
    let rawName: String
    let decision: SalesDeductionDecision
    let recipeId: String?
    /// Signed: >0 scade, <0 adaugă înapoi (retur/corecție).
    let quantity: Double?
    /// Absolute stock to leave at the location after this line.
    let stockOverride: Double?
    /// Selling more than in stock was acknowledged — stock is clamped at 0.
    let acceptShortfall: Bool?
    let newProduct: SalesNewProductPayload?
}

struct ConfirmSalesDeductionRequest: Encodable {
    let lines: [ConfirmSalesDeductionLine]
    let note: String?
}
