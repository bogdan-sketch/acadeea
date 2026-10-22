import SwiftUI

/// Colour band of a yield variance: within ±5 % on target, up to ±15 % warning,
/// beyond that danger. Banded on the percent AS SHOWN (1 decimal): 1,9 of 2 is
/// "-5 %" and on target, even though the Double is -5.000000000000004.
/// Same rule as Android `YieldPreview`.
enum YieldVarianceBand: Equatable {
    case onTarget, warning, danger

    init(percent: Double) {
        let shown = (abs(percent) * 10).rounded() / 10
        if shown <= 5 {
            self = .onTarget
        } else if shown <= 15 {
            self = .warning
        } else {
            self = .danger
        }
    }

    /// (actual − target) / target × 100; nil without a positive target.
    static func percent(actual: Double, target: Double) -> Double? {
        guard target > 0 else { return nil }
        return (actual - target) / target * 100
    }

    var color: Color {
        switch self {
        case .onTarget: AppTheme.Status.fg(.ready)
        case .warning: AppTheme.Status.fg(.warning)
        case .danger: AppTheme.Status.fg(.danger)
        }
    }
}
