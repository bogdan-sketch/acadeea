import SwiftUI

// Labels mirror web stock/sales/labels.ts.

/// How confident the report-name → product match is.
struct SalesMatchBadge: View {
    let kind: String?
    let score: Double?

    var body: some View {
        let style = Self.style(kind: kind, score: score)
        StatusBadge(text: style.label, color: style.color)
            .accessibilityLabel("Potrivire: \(style.label)")
    }

    static func style(kind: String?, score: Double?) -> (label: String, color: Color) {
        switch kind {
        case "ALIAS": ("Învățat", .green)
        case "MAPPING": ("Mapat site", .green)
        case "MANUAL": ("Manual", .blue)
        case "NONE", nil: ("Negăsit", .red)
        default: (score ?? 0) >= 0.85 ? ("Sigur", .green) : ("De verificat", .orange)
        }
    }
}

extension StatusBadge {
    init(salesStatus: SalesDeductionStatus) {
        self.init(text: salesStatus.displayName, color: AppTheme.Colors.salesDeductionStatus(salesStatus))
    }
}

#Preview {
    VStack(spacing: AppTheme.Spacing.sm) {
        SalesMatchBadge(kind: "ALIAS", score: 1)
        SalesMatchBadge(kind: "FUZZY", score: 0.6)
        SalesMatchBadge(kind: nil, score: nil)
        StatusBadge(salesStatus: .DRAFT)
        StatusBadge(salesStatus: .CONFIRMED)
    }
}
