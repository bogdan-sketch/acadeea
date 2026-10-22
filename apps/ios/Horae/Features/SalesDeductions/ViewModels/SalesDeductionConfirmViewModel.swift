import Foundation
import Observation

// MARK: - Editable row model (mirrors web stock/sales/[id] `Row`)

/// How a line treats stock beyond a plain deduction.
enum SalesStockMode: Equatable {
    /// Plain deduction (blocked when selling more than in stock).
    case normal
    /// Selling more than in stock acknowledged — stock stops at 0 (`acceptShortfall`).
    case clamp
    /// Absolute stock left after this line (`stockOverride`).
    case override
}

struct SalesLineDraft: Identifiable, Equatable {
    /// Local key (the draft line id, or a fresh UUID for hand-added rows).
    let id: String
    /// Existing draft line id; nil for rows added by hand.
    let lineId: String?
    var rawName: String
    let rawUnit: String?
    let quantityReported: Double?
    let matchKind: String?
    let matchScore: Double?
    let candidates: [SalesMatchCandidate]
    var decision: SalesDeductionDecision
    var recipeId: String?
    /// Signed text (>0 scade, <0 adaugă înapoi) so "2," can be typed.
    var qty: String
    var stockMode: SalesStockMode = .normal
    var override: String = ""
    var newName: String
    var newUnit: UnitType = .BUCATI
    var newCategory: String?
    var newStock: String = ""

    var isManual: Bool { matchKind == "MANUAL" }

    init(line: SalesDeductionLine) {
        id = line.id
        lineId = line.id
        rawName = line.rawName
        rawUnit = line.rawUnit
        quantityReported = line.quantityReported
        matchKind = line.matchKind
        matchScore = line.matchScore
        candidates = line.candidates
        decision = line.decision
        recipeId = line.recipeId
        qty = line.quantity.map(SalesNumber.text) ?? ""
        newName = line.rawName
    }

    /// Empty row "Adăugat manual", ready to fill.
    init() {
        id = UUID().uuidString
        lineId = nil
        rawName = ""
        rawUnit = nil
        quantityReported = nil
        matchKind = "MANUAL"
        matchScore = nil
        candidates = []
        decision = .ACCEPT
        recipeId = nil
        qty = "1"
        newName = ""
    }

    /// Lines worth a second look — mirrors web `needsReview`.
    var needsReview: Bool {
        if decision != .ACCEPT { return decision == .CREATE_NEW && !isManual }
        if recipeId == nil { return true }
        return matchKind == "FUZZY" || (matchKind == "CONTAINS" && (matchScore ?? 0) < 0.85)
    }
}

/// Live stock preview of one row.
struct SalesLineComputed: Equatable {
    var before: Double = 0
    var after: Double = 0
    var qty: Double?
    var shortfall: Double = 0
    /// Shortfall without a clamp/override decision yet.
    var unresolved = false
    /// What is missing (nil = row is complete).
    var invalid: String?
}

enum SalesLineFilter: String, CaseIterable, Identifiable {
    case all, review, stock, new, declined
    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "Toate"
        case .review: "De verificat"
        case .stock: "Probleme stoc"
        case .new: "Produse noi"
        case .declined: "Ignorate"
        }
    }
}

/// RO keyboards type decimals with a comma.
enum SalesNumber {
    static func parse(_ s: String) -> Double? {
        RoFormat.parseDecimal(s)
    }

    static func round3(_ n: Double) -> Double { (n * 1000).rounded() / 1000 }

    /// Editable text for a number ("1,5", "-2").
    static func text(_ n: Double) -> String {
        let r = round3(n)
        if r == r.rounded() { return String(format: "%.0f", r) }
        return String(r).replacingOccurrences(of: ".", with: ",")
    }
}

// MARK: - View model

@Observable
final class SalesDeductionConfirmViewModel {
    let deduction: SalesDeduction

    /// Mutated only through the methods below, each of which re-runs `recompute()`.
    private(set) var rows: [SalesLineDraft]
    private(set) var products: [SalesProductOption] = []
    private(set) var productById: [String: SalesProductOption] = [:]
    private(set) var computed: [String: SalesLineComputed] = [:]
    var finishedCategories: [String] = []

    var filter: SalesLineFilter = .all
    var showInvalid = false
    var isDiscarding = false
    var isConfirming = false
    var error: APIError?

    private let service = SalesDeductionService.shared

    init(deduction: SalesDeduction) {
        self.deduction = deduction
        let lines = deduction.lines ?? []
        // Manual sessions start with one empty row ready to fill.
        rows = deduction.source == .MANUAL && lines.isEmpty
            ? [SalesLineDraft()]
            : lines.map(SalesLineDraft.init(line:))
        recompute()
    }

    // MARK: Loading

    func loadProducts() async {
        do {
            products = try await service.fetchProducts(locationId: deduction.locationId)
            recompute()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .unknown("Nu am putut încărca produsele")
        }
        if finishedCategories.isEmpty {
            finishedCategories = (try? await RecipeService.shared.fetchCategories(kind: "PRODUS_FINIT")) ?? []
        }
    }

    // MARK: Editing

    func row(_ key: String) -> SalesLineDraft? { rows.first { $0.id == key } }

    func update(_ key: String, _ change: (inout SalesLineDraft) -> Void) {
        guard let i = rows.firstIndex(where: { $0.id == key }) else { return }
        var copy = rows[i]
        change(&copy)
        if copy != rows[i] {
            rows[i] = copy
            recompute()
        }
    }

    func setDecision(_ key: String, _ decision: SalesDeductionDecision) {
        update(key) { r in
            r.decision = decision
            if r.newName.isEmpty { r.newName = r.rawName }
        }
    }

    func selectProduct(_ key: String, _ product: SalesProductOption) {
        update(key) { r in
            r.recipeId = product.id
            if r.rawName.trimmingCharacters(in: .whitespaces).isEmpty { r.rawName = product.name }
        }
    }

    /// ± stepper: works both ways — below zero adds stock back (retur).
    func step(_ key: String, by delta: Double) {
        update(key) { r in
            let cur = SalesNumber.parse(r.qty) ?? 0
            r.qty = SalesNumber.text(cur + delta)
        }
    }

    func addManualRow() {
        rows.append(SalesLineDraft())
        recompute()
        filter = .all
    }

    func remove(_ key: String) {
        rows.removeAll { $0.id == key }
        recompute()
    }

    // MARK: Derived

    /// Stock preview walking rows in order, so the same product twice compounds.
    private func recompute() {
        productById = Dictionary(products.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var running: [String: Double] = [:]
        var out: [String: SalesLineComputed] = [:]
        for r in rows {
            let qty = SalesNumber.parse(r.qty)
            switch r.decision {
            case .DECLINE:
                out[r.id] = SalesLineComputed(qty: qty)
            case .CREATE_NEW:
                let stock = SalesNumber.parse(r.newStock)
                let invalid: String? = r.newName.trimmingCharacters(in: .whitespaces).isEmpty
                    ? "Numele produsului nou"
                    : (stock == nil || stock! < 0) ? "Stocul actual al produsului nou" : nil
                out[r.id] = SalesLineComputed(after: stock ?? 0, qty: qty, invalid: invalid)
            case .ACCEPT:
                guard let id = r.recipeId, let product = productById[id] else {
                    out[r.id] = SalesLineComputed(qty: qty, invalid: "Alege produsul")
                    continue
                }
                let before = running[product.id] ?? product.stock
                let override = SalesNumber.parse(r.override)
                let isOverride = r.stockMode == .override
                var invalid: String?
                if qty == nil && !isOverride { invalid = "Cantitatea" }
                if isOverride && (override == nil || override! < 0) { invalid = "Stocul suprascris" }
                let q = qty ?? 0
                let after = isOverride && override != nil
                    ? override!
                    : max(0, SalesNumber.round3(before - q))
                let shortfall = !isOverride && q > before ? SalesNumber.round3(q - before) : 0
                running[product.id] = after
                out[r.id] = SalesLineComputed(
                    before: before, after: after, qty: qty, shortfall: shortfall,
                    unresolved: shortfall > 0 && r.stockMode != .clamp, invalid: invalid
                )
            }
        }
        computed = out
    }

    func isStockIssue(_ r: SalesLineDraft) -> Bool {
        guard let c = computed[r.id] else { return false }
        return c.shortfall > 0 || r.stockMode == .override
    }

    var acceptCount: Int { rows.filter { $0.decision == .ACCEPT }.count }
    var createdCount: Int { rows.filter { $0.decision == .CREATE_NEW }.count }
    var declinedCount: Int { rows.filter { $0.decision == .DECLINE }.count }
    var unresolvedCount: Int { rows.filter { computed[$0.id]?.unresolved == true }.count }
    var invalidCount: Int { rows.filter { computed[$0.id]?.invalid != nil }.count }

    func count(for filter: SalesLineFilter) -> Int {
        switch filter {
        case .all: rows.count
        case .review: rows.filter(\.needsReview).count
        case .stock: rows.filter(isStockIssue).count
        case .new: createdCount
        case .declined: declinedCount
        }
    }

    var visibleRows: [SalesLineDraft] {
        rows.filter { r in
            switch filter {
            case .all: true
            case .review: r.needsReview || computed[r.id]?.invalid != nil
            case .stock: isStockIssue(r)
            case .new: r.decision == .CREATE_NEW
            case .declined: r.decision == .DECLINE
            }
        }
    }

    /// Display name of a row in summaries: matched product, else the report name.
    func name(of r: SalesLineDraft) -> String {
        if r.decision == .CREATE_NEW, !r.newName.isEmpty { return r.newName }
        if let id = r.recipeId, let p = productById[id] { return p.name }
        return r.rawName.isEmpty ? "Produs" : r.rawName
    }

    // MARK: Confirm

    /// Validates before opening the bulk-confirm sheet. Returns false (and jumps
    /// to "De verificat") when rows are incomplete.
    func prepareConfirm() -> Bool {
        if rows.isEmpty {
            error = .validationError("Nu există niciun produs de confirmat")
            return false
        }
        let invalid = invalidCount
        if invalid > 0 {
            showInvalid = true
            filter = .review
            error = .validationError("\(invalid) \(invalid == 1 ? "rând are" : "rânduri au") date lipsă")
            return false
        }
        return true
    }

    /// Sends every row (the body is authoritative). `ackAll` clamps every
    /// still-unresolved shortfall to 0. Returns the confirmed deduction.
    func confirm(note: String, ackAll: Bool) async -> SalesDeduction? {
        isConfirming = true
        defer { isConfirming = false }
        let snapshot = computed
        if ackAll {
            for r in rows where snapshot[r.id]?.unresolved == true {
                update(r.id) { $0.stockMode = .clamp }
            }
        }
        let lines = rows.map { r -> ConfirmSalesDeductionLine in
            let c = snapshot[r.id]
            let trimmed = r.rawName.trimmingCharacters(in: .whitespaces)
            let rawName = trimmed.isEmpty ? name(of: r) : trimmed
            switch r.decision {
            case .CREATE_NEW:
                let category = r.newCategory?.trimmingCharacters(in: .whitespaces)
                return ConfirmSalesDeductionLine(
                    id: r.lineId, rawName: rawName, decision: .CREATE_NEW, recipeId: nil,
                    quantity: nil, stockOverride: nil, acceptShortfall: nil,
                    newProduct: SalesNewProductPayload(
                        name: r.newName.trimmingCharacters(in: .whitespaces),
                        unit: r.newUnit,
                        category: (category?.isEmpty ?? true) ? nil : category,
                        initialStock: SalesNumber.parse(r.newStock) ?? 0
                    )
                )
            case .DECLINE:
                return ConfirmSalesDeductionLine(
                    id: r.lineId, rawName: rawName, decision: .DECLINE, recipeId: r.recipeId,
                    quantity: nil, stockOverride: nil, acceptShortfall: nil, newProduct: nil
                )
            case .ACCEPT:
                let clamp = r.stockMode == .clamp || (ackAll && c?.unresolved == true)
                return ConfirmSalesDeductionLine(
                    id: r.lineId, rawName: rawName, decision: .ACCEPT, recipeId: r.recipeId,
                    quantity: c?.qty ?? 0,
                    stockOverride: r.stockMode == .override ? (SalesNumber.parse(r.override) ?? 0) : nil,
                    acceptShortfall: clamp ? true : nil,
                    newProduct: nil
                )
            }
        }
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let result = try await service.confirm(
                id: deduction.id, lines: lines, note: trimmedNote.isEmpty ? nil : trimmedNote
            )
            let s = result.summary
            await ToastCenter.shared.show(
                "Stocul a fost actualizat",
                lines: ["\(s.accepted) scăzute · \(s.created) noi · \(s.declined) ignorate"]
            )
            return result
        } catch let err as APIError {
            error = err
            // Stock moved under us (SALES_001) — refresh the live numbers.
            if case .salesExceedsStock = err { await loadProducts() }
            return nil
        } catch {
            self.error = .networkError(error)
            return nil
        }
    }

    /// Drops the draft; stock untouched.
    func discard() async -> Bool {
        isDiscarding = true
        defer { isDiscarding = false }
        do {
            try await service.discard(id: deduction.id)
            await ToastCenter.shared.show("Scăderea a fost abandonată — stocul nu s-a modificat")
            return true
        } catch let err as APIError {
            error = err
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }
}
