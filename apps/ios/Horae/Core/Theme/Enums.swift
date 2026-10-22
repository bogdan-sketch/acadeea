import Foundation

/// Mirrors: packages/shared-types/src/enums.ts

enum UnitType: String, Codable, CaseIterable, Identifiable {
    case MILIGRAME, GRAME, KILOGRAME, MILILITRI, LITRI, BUCATI
    case LINGURITE, LINGURI, CANI, OUNCES, POUNDS

    var id: String { rawValue }

    /// Units offered in pickers — metric only, same list as web
    /// `selectableUnits`. Grouped by measure via `units(for:)`.
    static let allCases: [UnitType] = [
        .MILIGRAME, .GRAME, .KILOGRAME,
        .MILILITRI, .LITRI,
        .BUCATI, .LINGURI, .LINGURITE,
    ]

    /// Legacy units (web `LEGACY_UNITS`): still decoded and DISPLAYED for rows
    /// stored with them, never offered for new input.
    static let legacy: Set<UnitType> = [.OUNCES, .POUNDS, .CANI]

    var isLegacy: Bool { Self.legacy.contains(self) }

    var abbreviation: String {
        switch self {
        case .MILIGRAME: "mg"
        case .GRAME: "g"
        case .KILOGRAME: "kg"
        case .MILILITRI: "ml"
        case .LITRI: "l"
        case .BUCATI: "buc"
        case .LINGURITE: "linguriță"
        case .LINGURI: "lingură"
        case .CANI: "cană"
        case .OUNCES: "oz"
        case .POUNDS: "lbs"
        }
    }

    /// Unit a purchase price refers to: prices are per COMMERCIAL unit —
    /// RON/kg for mass, RON/l for volume, RON/<unit> otherwise — even when
    /// stock is tracked in grams/ml. Mirrors api unit-conversions/price-unit.ts.
    var priceUnitLabel: String {
        switch self {
        case .MILIGRAME, .GRAME, .KILOGRAME: "kg"
        case .MILILITRI, .LITRI: "l"
        default: abbreviation
        }
    }

    /// How the material is measured — used to narrow the unit dropdown.
    enum Measure: String, CaseIterable, Identifiable {
        case solid, liquid, count
        var id: String { rawValue }
        var displayName: String {
            switch self {
            case .solid: "Solid (greutate)"
            case .liquid: "Lichid (volum)"
            case .count: "Bucăți"
            }
        }

        /// Short label for compact segmented controls (no parenthetical).
        var shortLabel: String {
            switch self {
            case .solid: "Solid"
            case .liquid: "Lichid"
            case .count: "Bucăți"
            }
        }

        /// SF Symbol representing the measure family.
        var icon: String {
            switch self {
            case .solid: "scalemass"
            case .liquid: "drop"
            case .count: "number"
            }
        }
    }

    var measure: Measure {
        switch self {
        case .MILIGRAME, .GRAME, .KILOGRAME, .POUNDS: .solid
        case .MILILITRI, .LITRI, .OUNCES: .liquid
        case .BUCATI, .LINGURI, .LINGURITE, .CANI: .count
        }
    }

    /// Selectable (metric) units of a measure family.
    static func units(for measure: Measure) -> [UnitType] {
        allCases.filter { $0.measure == measure }
    }

    /// Selectable units of a family plus `current` when it is a stored legacy
    /// unit (web `unitsForMeasure(m, unit)`), so editing never drops it.
    static func units(for measure: Measure, keeping current: UnitType) -> [UnitType] {
        let base = units(for: measure)
        return current.measure == measure && current.isLegacy ? base + [current] : base
    }

    /// Quantity + abbreviation for DISPLAY: "2 buc", "1,5 kg". General rule:
    /// metric mass/volume auto-scales to the most readable unit ("1000 g" →
    /// "1 kg", "100000 mg" → "100 g" — see `humanized`). Whole numbers drop
    /// their decimals; fractional piece counts keep their real value.
    /// NEVER use on inputs/payloads — those stay in the stock unit.
    func formatQty(_ quantity: Double) -> String {
        humanizedString(quantity)
    }

    /// Value of 1 of this unit in its family's base (grams for solid, ml for
    /// liquid). `nil` for units with no fixed factor (buc, spoons, cups).
    var metricFactor: Double? {
        switch self {
        case .MILIGRAME: 0.001
        case .GRAME: 1
        case .KILOGRAME: 1000
        case .POUNDS: 453.592
        case .MILILITRI: 1
        case .LITRI: 1000
        case .OUNCES: 29.5735
        case .BUCATI, .LINGURI, .LINGURITE, .CANI: nil
        }
    }

    /// Convert `value` from this unit to `target` when both share a fixed metric
    /// base (same family). Returns nil if not convertible by a fixed factor.
    func convert(_ value: Double, to target: UnitType) -> Double? {
        guard measure == target.measure,
              let from = metricFactor,
              let to = target.metricFactor
        else { return nil }
        return value * from / to
    }

    /// Metric units of a family, smallest→largest, used to auto-scale a display
    /// value to its most readable unit (imperial units excluded on purpose).
    private var displayLadder: [UnitType]? {
        switch measure {
        case .solid: [.MILIGRAME, .GRAME, .KILOGRAME]
        case .liquid: [.MILILITRI, .LITRI]
        case .count: nil
        }
    }

    /// Display value + unit for a quantity kept in `self` — ALWAYS the item's
    /// own unit (0,596 kg stays "0,596 kg", never "596 g"). Owner rule: what
    /// the stock, the lots and the movement journal show for an item uses ONE
    /// unit, otherwise "+600 kg" in the journal and "598 g" in stock read as
    /// two different things. Inputs may take another unit but convert
    /// explicitly. Paper documents pick their own unit (`documentScaled`).
    func humanized(_ value: Double) -> (value: Double, unit: UnitType) {
        guard value.isFinite else { return (0, self) }
        return (value, self)
    }

    /// Most readable (value, unit) for a printed document (aviz / delivery
    /// note): steps up to a larger unit only when the value is ≥ 1 of it, so
    /// 200 g stays "200 g" while 1200 g becomes "1,2 kg". Count/imperial units
    /// pass through unchanged. Not for stock screens — see `humanized`.
    func documentScaled(_ value: Double) -> (value: Double, unit: UnitType) {
        guard value != 0, value.isFinite else { return (0, self) }
        guard let ladder = displayLadder, let base = metricFactor else { return (value, self) }
        let baseValue = value * base
        var chosen = ladder.first ?? self
        for u in ladder {
            // abs: negative deltas (ex. randament sub tinta) scale like positives.
            guard let f = u.metricFactor, abs(baseValue) >= f else { continue }
            chosen = u
        }
        let factor = chosen.metricFactor ?? base
        return (baseValue / factor, chosen)
    }

    /// `humanized` formatted as a compact string in the item's unit, e.g.
    /// "1,2 kg", "0,596 kg", "200 g". kg / l keep three decimals (gram / ml
    /// precision), the rest two.
    func humanizedString(_ value: Double) -> String {
        let h = humanized(value)
        let digits = (h.unit == .KILOGRAME || h.unit == .LITRI) ? 3 : 2
        return "\(h.value.qtyFormatted(maxDecimals: digits)) \(h.unit.abbreviation)"
    }

    /// Same display rule for API fields that carry the unit as a raw String.
    /// Unknown strings pass through unscaled with the raw label.
    static func formatQty(_ value: Double, unitRaw: String) -> String {
        if let u = UnitType(rawValue: unitRaw) { return u.humanizedString(value) }
        return "\(value.qtyFormatted) \(unitRaw)"
    }
}

enum StorageType: String, Codable, CaseIterable, Identifiable {
    case COLD, WARM, FROZEN
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .COLD: "Frigider"
        case .WARM: "Temperatură ambientală"
        case .FROZEN: "Congelator"
        }
    }
}

enum MaterialStatus: String, Codable, CaseIterable, Identifiable {
    case ACTIVE, LOW_STOCK, OUT_OF_STOCK, DISCONTINUED
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .ACTIVE: "Activ"
        case .LOW_STOCK: "Stoc scăzut"
        case .OUT_OF_STOCK: "Fără stoc"
        case .DISCONTINUED: "Întrerupt"
        }
    }

    /// The single colour mapping (web materialStatusColors); nil = neutral.
    var kind: AppTheme.Status.Kind? {
        switch self {
        case .ACTIVE: .ready
        case .LOW_STOCK: .warning
        case .OUT_OF_STOCK: .danger
        case .DISCONTINUED: nil
        }
    }
}

enum RecipeType: String, Codable, CaseIterable, Identifiable {
    case FINAL, SEMIPREPARAT
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .FINAL: "Final"
        case .SEMIPREPARAT: "Semipreparat"
        }
    }
}


/// Who sees a task besides managers/admins (they always see everything).
enum TaskVisibility: String, Codable, CaseIterable, Identifiable {
    case ASSIGNED, EVERYONE, SELECTED

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .ASSIGNED: "Doar cine e asignat"
        case .EVERYONE: "Toată lumea"
        case .SELECTED: "Anumite persoane"
        }
    }

    var icon: String {
        switch self {
        case .ASSIGNED: "person"
        case .EVERYONE: "person.3"
        case .SELECTED: "person.2.badge.gearshape"
        }
    }
}

enum TaskStatus: String, Codable, CaseIterable, Identifiable {
    case DE_FACUT, BLOCAT, IN_LUCRU, FINALIZAT, ANULAT

    var id: String { rawValue }

    /// The single label set (web taskStatusLabels), with diacritics.
    var displayName: String {
        switch self {
        case .DE_FACUT: "De făcut"
        case .BLOCAT: "Blocat"
        case .IN_LUCRU: "În lucru"
        case .FINALIZAT: "Finalizat"
        case .ANULAT: "Anulat"
        }
    }

    /// The single colour mapping; nil = neutral (not started).
    var kind: AppTheme.Status.Kind? {
        switch self {
        case .DE_FACUT: nil
        case .IN_LUCRU: .inProgress
        case .BLOCAT: .warning
        case .FINALIZAT: .ready
        case .ANULAT: .danger
        }
    }

    /// Valid transitions from this status.
    var allowedTransitions: [TaskStatus] {
        switch self {
        case .DE_FACUT: [.IN_LUCRU, .ANULAT]
        case .BLOCAT: [.IN_LUCRU, .DE_FACUT, .ANULAT]
        case .IN_LUCRU: [.FINALIZAT, .ANULAT]
        case .FINALIZAT: []
        case .ANULAT: []
        }
    }
}

/// List vs Board view toggle for tasks.
enum TaskViewMode: String, CaseIterable {
    case list, board
}

enum StockMovementType: String, Codable, CaseIterable, Identifiable {
    case INTRARE, IESIRE_PRODUCTIE, INTRARE_PRODUCTIE, AJUSTARE, REZERVARE, ELIBERARE
    /// Materii prime/consumabile consumate pentru teste (R&D) — fara task.
    case IESIRE_TESTE
    /// Produse finite vandute (scadere din vanzari: eBriza / manual / site).
    case IESIRE_VANZARE
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .INTRARE: "Intrare"
        case .IESIRE_PRODUCTIE: "Ieșire producție"
        case .INTRARE_PRODUCTIE: "Intrare din producție"
        case .AJUSTARE: "Ajustare"
        case .REZERVARE: "Rezervare"
        case .ELIBERARE: "Eliberare"
        case .IESIRE_TESTE: "Consum teste"
        case .IESIRE_VANZARE: "Vânzare"
        }
    }

    /// Only these can be manually created.
    static var manualTypes: [StockMovementType] {
        [.INTRARE, .AJUSTARE]
    }
}

enum PieceType: String, Codable, CaseIterable, Identifiable {
    case SAC, CUTIE, BIDON, PUNGA, RECIPIENT, BUCATA
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .SAC: "Sac"
        case .CUTIE: "Cutie"
        case .BIDON: "Bidon"
        case .PUNGA: "Pungă"
        case .RECIPIENT: "Recipient"
        case .BUCATA: "Bucată"
        }
    }
}

enum LocationType: String, Codable, CaseIterable, Identifiable {
    case DEPOZIT, FRIGIDER, CONGELATOR, LABORATOR, MAGAZIN, PUNCT_LUCRU

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .DEPOZIT: "Depozit"
        case .FRIGIDER: "Frigider"
        case .CONGELATOR: "Congelator"
        case .LABORATOR: "Laborator"
        case .MAGAZIN: "Magazin"
        case .PUNCT_LUCRU: "Punct de lucru"
        }
    }

    var icon: String {
        switch self {
        case .DEPOZIT: "building.2"
        case .FRIGIDER: "refrigerator"
        case .CONGELATOR: "snowflake"
        case .LABORATOR: "flask"
        case .MAGAZIN: "storefront"
        case .PUNCT_LUCRU: "hammer"
        }
    }
}

enum TransferStatus: String, Codable, CaseIterable, Identifiable {
    case IN_ASTEPTARE, IN_TRANZIT, FINALIZAT, ANULAT

    var id: String { rawValue }

    /// The single label set (web transferStatusLabels), with diacritics.
    var displayName: String {
        switch self {
        case .IN_ASTEPTARE: "În așteptare"
        case .IN_TRANZIT: "În tranzit"
        case .FINALIZAT: "Finalizat"
        case .ANULAT: "Anulat"
        }
    }

    /// The single colour mapping (web: orange / blue / green / red).
    var kind: AppTheme.Status.Kind {
        switch self {
        case .IN_ASTEPTARE: .warning
        case .IN_TRANZIT: .inProgress
        case .FINALIZAT: .ready
        case .ANULAT: .danger
        }
    }
}

enum OrderStatus: String, Codable, CaseIterable, Identifiable {
    case NOUA, IN_PREGATIRE, PREGATITA, IN_TRANZIT, LIVRATA, ANULATA

    var id: String { rawValue }

    /// The single label set (web orderStatusLabels), with diacritics.
    var displayName: String {
        switch self {
        case .NOUA: "Nouă"
        case .IN_PREGATIRE: "În pregătire"
        case .PREGATITA: "Pregătită"
        case .IN_TRANZIT: "În tranzit"
        case .LIVRATA: "Livrată"
        case .ANULATA: "Anulată"
        }
    }

    /// The single colour mapping: în tranzit blue, livrată green (web stepper).
    var kind: AppTheme.Status.Kind {
        switch self {
        case .NOUA: .new
        case .IN_PREGATIRE, .IN_TRANZIT: .inProgress
        case .PREGATITA, .LIVRATA: .ready
        case .ANULATA: .danger
        }
    }

    var allowedTransitions: [OrderStatus] {
        switch self {
        case .NOUA: [.IN_PREGATIRE, .ANULATA]
        case .IN_PREGATIRE: [.PREGATITA, .ANULATA]
        case .PREGATITA: [.IN_TRANZIT, .ANULATA]
        case .IN_TRANZIT: [.LIVRATA]
        case .LIVRATA: []
        case .ANULATA: []
        }
    }
}

enum OrderItemStatus: String, Codable, CaseIterable, Identifiable {
    case IN_PREGATIRE, GATA, IN_TRANZIT, LIVRAT

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .IN_PREGATIRE: "În pregătire"
        case .GATA: "Gata"
        case .IN_TRANZIT: "În tranzit"
        case .LIVRAT: "Livrat"
        }
    }

    /// Same colours as the order status it mirrors.
    var kind: AppTheme.Status.Kind {
        switch self {
        case .IN_PREGATIRE, .IN_TRANZIT: .inProgress
        case .GATA, .LIVRAT: .ready
        }
    }
}

/// EU-14 allergens (Reg. UE 1169/2011) — mirror of shared-types `Allergen`.
/// Declared per raw material; recipes derive theirs from the resolved tree.
enum Allergen: String, Codable, CaseIterable, Identifiable {
    case GLUTEN, CRUSTACEE, OUA, PESTE, ARAHIDE, SOIA, LAPTE
    case NUCI, TELINA, MUSTAR, SUSAN, SULFITI, LUPIN, MOLUSTE

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .GLUTEN: "Gluten"
        case .CRUSTACEE: "Crustacee"
        case .OUA: "Ouă"
        case .PESTE: "Pește"
        case .ARAHIDE: "Arahide"
        case .SOIA: "Soia"
        case .LAPTE: "Lapte (lactoza)"
        case .NUCI: "Fructe cu coajă (nuci)"
        case .TELINA: "Țelină"
        case .MUSTAR: "Muștar"
        case .SUSAN: "Susan"
        case .SULFITI: "Dioxid de sulf / sulfiți"
        case .LUPIN: "Lupin"
        case .MOLUSTE: "Moluste"
        }
    }
}

// MARK: - Sales deductions (Vanzari → stoc)

/// Where a sales deduction's lines came from. Mirrors Prisma `SalesDeductionSource`.
enum SalesDeductionSource: String, Codable, CaseIterable, Identifiable {
    case EXCEL, MANUAL, WOOCOMMERCE

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .EXCEL: "Raport Excel"
        case .MANUAL: "Manual"
        case .WOOCOMMERCE: "Site (WooCommerce)"
        }
    }

    var icon: String {
        switch self {
        case .EXCEL: "tablecells"
        case .MANUAL: "square.and.pencil"
        case .WOOCOMMERCE: "globe"
        }
    }
}

/// Lifecycle of a sales deduction. Mirrors Prisma `SalesDeductionStatus`.
enum SalesDeductionStatus: String, Codable, CaseIterable, Identifiable {
    case DRAFT, CONFIRMED, ANULAT

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .DRAFT: "Neconfirmată"
        case .CONFIRMED: "Confirmată"
        case .ANULAT: "Anulată"
        }
    }
}

/// Per-line decision in the confirmer. Mirrors Prisma `SalesDeductionDecision`.
enum SalesDeductionDecision: String, Codable, CaseIterable, Identifiable {
    case ACCEPT, CREATE_NEW, DECLINE

    var id: String { rawValue }

    /// Segmented-control label (web wording).
    var displayName: String {
        switch self {
        case .ACCEPT: "Scade"
        case .CREATE_NEW: "Produs nou"
        case .DECLINE: "Ignoră"
        }
    }
}
