import SwiftUI
import UIKit

/// Redesign typography (same faces as the web app):
/// - **Fraunces** (serif, 600) for screen titles and big numbers;
/// - **DM Sans** for body and UI text.
///
/// Both are bundled as variable TTFs (Resources/Fonts, OFL) and registered via
/// `UIAppFonts`. CoreText exposes each named instance under its own PostScript
/// name, so a weight is picked by name (no variation-axis plumbing). Every
/// font scales with Dynamic Type through `relativeTo:`.
enum AppFont {
    // MARK: - PostScript names

    /// Names as iOS registers the variable fonts' named instances (verified on
    /// the iOS 26 simulator via `UIFont.fontNames(forFamilyName:)`). DM Sans's
    /// default instance is "DMSans-9ptRegular", so its weights are suffixed
    /// "_Medium" etc.; the opsz axis still follows the point size automatically.
    enum Name {
        static let frauncesSemiBold = "Fraunces-SemiBold"
        static let dmSansRegular = "DMSans-9ptRegular_Regular"
        static let dmSansMedium = "DMSans-9ptRegular_Medium"
        static let dmSansSemiBold = "DMSans-9ptRegular_SemiBold"
        static let dmSansBold = "DMSans-9ptRegular_Bold"

        static let all = [frauncesSemiBold, dmSansRegular, dmSansMedium, dmSansSemiBold, dmSansBold]
    }

    /// DM Sans weights used by the design (400/500/600/700).
    enum Weight {
        case regular, medium, semibold, bold

        var postScriptName: String {
            switch self {
            case .regular: Name.dmSansRegular
            case .medium: Name.dmSansMedium
            case .semibold: Name.dmSansSemiBold
            case .bold: Name.dmSansBold
            }
        }
    }

    // MARK: - Fonts

    /// Screen/section titles — Fraunces 600.
    static func title(_ size: CGFloat, relativeTo style: Font.TextStyle? = nil) -> Font {
        .custom(Name.frauncesSemiBold, size: size, relativeTo: style ?? textStyle(for: size))
    }

    /// Big numbers (stat cards, totals) — Fraunces 600.
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle? = nil) -> Font {
        .custom(Name.frauncesSemiBold, size: size, relativeTo: style ?? textStyle(for: size))
    }

    /// Body / UI text — DM Sans at the given weight.
    static func body(
        _ size: CGFloat = 15,
        weight: Weight = .regular,
        relativeTo style: Font.TextStyle? = nil
    ) -> Font {
        .custom(weight.postScriptName, size: size, relativeTo: style ?? textStyle(for: size))
    }

    /// Nearest system text style for a point size, so custom fonts grow and
    /// shrink with Dynamic Type at the same rate as the system scale.
    static func textStyle(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<11.5: .caption2
        case ..<12.5: .caption
        case ..<13.5: .footnote
        case ..<15.5: .subheadline
        case ..<18: .body
        case ..<21: .title3
        case ..<24: .title2
        case ..<31: .title
        default: .largeTitle
        }
    }

    // MARK: - Debug check

    /// DEBUG only: asserts that every PostScript name above resolves to the
    /// bundled font (a typo or a missing `UIAppFonts` entry would otherwise
    /// silently fall back to the system font). Called once at launch.
    static func verifyRegistered() {
        #if DEBUG
        let missing = Name.all.filter { UIFont(name: $0, size: 12) == nil }
        if !missing.isEmpty {
            let names = ["DM Sans", "Fraunces"].map { "\($0): \(UIFont.fontNames(forFamilyName: $0))" }
            assertionFailure("AppFont: missing fonts \(missing); registered: \(names)")
        }
        #endif
    }
}

#Preview("AppFont") {
    VStack(alignment: .leading, spacing: 12) {
        Text("Setări").font(AppFont.title(28))
        Text("1.248").font(AppFont.display(32))
        Text("DM Sans regular").font(AppFont.body(15))
        Text("DM Sans medium").font(AppFont.body(15, weight: .medium))
        Text("DM Sans semibold").font(AppFont.body(15, weight: .semibold))
        Text("DM Sans bold").font(AppFont.body(15, weight: .bold))
    }
    .padding()
}
