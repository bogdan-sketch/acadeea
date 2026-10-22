import SwiftUI
import UIKit

/// Centralized design tokens.
enum AppTheme {
    // MARK: - Colors

    /// TOATE variabilele tematizabile vin din branding (Organization.
    /// brandingTokens.ios, per schema light/dark) cu fallback pe defaulturile
    /// de mai jos. Culorile SEMANTICE (status/destructive/success/warning)
    /// nu sunt tematizabile — niciodata.
    ///
    /// Schema de culori (AppScheme, Setări › Temă) inlocuieste fallback-urile
    /// de sistem: Atelier (implicita) lasa token-urile explicite ale org-ului
    /// sa castige, celelalte cinci scheme impun suprafetele lor. Primary:
    /// Atelier + Cacao pastreaza accentul org-ului, restul impun primary-ul
    /// schemei (aceeasi regula ca pe web).
    /// Colours come ONLY from the six designed schemes (`AppScheme`, Setări ›
    /// Temă) — the same token set as web. No organisation accent, font or
    /// `brandingTokens` override them (web decision 17.10.2026); BrandingManager
    /// keeps only the logo and the name. Status colours live in `Status`.
    enum Colors {
        /// Read from the @Observable store, so every view that uses the colours
        /// below re-renders live when the scheme changes.
        private static var scheme: AppScheme { AppSchemeStore.shared.scheme }

        /// The scheme's accent: buttons, selected chips, FAB, tint. Read directly
        /// (not `Color.accentColor`): `.buttonStyle(.plain)` resets the
        /// environment tint and accentColor would fall back to system blue.
        static var primary: Color { scheme.primary }
        /// Text/icon colour on a `primary` fill (white on all six schemes).
        static var onPrimary: Color { scheme.onPrimary }
        /// The accent as TEXT on cards/page/tints (≥4.5:1 on every scheme).
        static var primaryText: Color { scheme.primaryText }
        /// Tab bar / dock surface of the current scheme.
        static var tabBar: Color { scheme.tabBar }
        /// 1px borders on cards, chips and icon buttons.
        static var border: Color { scheme.border }
        /// Pressed state of the accent (web `--primary-pressed`, L × 0.82).
        static var primaryPressed: Color {
            var h: CGFloat = 0, sat: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            UIColor(primary).getHue(&h, saturation: &sat, brightness: &b, alpha: &a)
            return Color(UIColor(hue: h, saturation: sat, brightness: b * 0.82, alpha: a))
        }
        /// Chart series 2 — derived from the scheme accent (hue +45°, as web).
        static var secondaryAccent: Color {
            BrandingManager.derivedSeriesColor(accentHex: scheme.primaryHexString, hueDegrees: 45)
        }
        /// Chart series 3 — derived from the scheme accent (hue −45°, as web).
        static var tertiaryAccent: Color {
            BrandingManager.derivedSeriesColor(
                accentHex: scheme.primaryHexString, hueDegrees: -45, lightModeBrightnessScale: 0.92)
        }
        /// Ex-systemBackground: the "solid" surface = the scheme card.
        static var background: Color { scheme.card }
        /// Page background.
        static var appBackground: Color { scheme.background }
        /// Card / list surface on the page background.
        static var card: Color { scheme.card }
        static var secondaryBackground: Color { card }
        static var groupedBackground: Color { appBackground }
        /// Primary text (ink).
        static var label: Color { scheme.ink }
        /// Subtitles, metadata.
        static var secondaryLabel: Color { scheme.muted }
        /// Custom separator lines.
        static var separator: Color { scheme.border }
        /// Semantic colours = the fixed status palette (light/dark variants).
        static var destructive: Color { Status.fg(.danger) }
        static var success: Color { Status.fg(.ready) }
        static var warning: Color { Status.fg(.warning) }

        // Status colours: ONE mapping per enum (`kind` in Enums.swift); these
        // helpers only resolve it, neutral statuses use the muted ink.

        static func taskStatus(_ status: TaskStatus) -> Color { Status.color(status.kind) }
        static func materialStatus(_ status: MaterialStatus) -> Color { Status.color(status.kind) }
        static func transferStatus(_ status: TransferStatus) -> Color { Status.color(status.kind) }
        static func orderStatus(_ status: OrderStatus) -> Color { Status.color(status.kind) }

        /// Recipe type colours (same as the stock kind tiles: semi = blue, final = rose).
        static func recipeType(_ type: RecipeType) -> Color {
            switch type {
            case .FINAL: Status.fg(.new)
            case .SEMIPREPARAT: Status.fg(.inProgress)
            }
        }

        /// Sales deduction (Vânzări → stoc) — web st-orange/green/gray.
        static func salesDeductionStatus(_ status: SalesDeductionStatus) -> Color {
            switch status {
            case .DRAFT: Status.fg(.warning)
            case .CONFIRMED: Status.fg(.ready)
            case .ANULAT: secondaryLabel
            }
        }

        /// Margin health by percent thresholds.
        static func margin(percent: Double) -> Color { Status.fg(Status.marginKind(percent)) }

        /// Preset palette offered when picking a category colour.
        static let categoryPresets: [String] = [
            "#D4527B", // Rose pink
            "#E91E63", // Hot pink
            "#9C27B0", // Purple
            "#673AB7", // Deep purple
            "#3F51B5", // Indigo
            "#2196F3", // Blue
            "#009688", // Teal
            "#4CAF50", // Green
            "#FF9800", // Orange
            "#795548", // Brown
            "#607D8B", // Blue grey
            "#F44336", // Red
        ]

        /// Resolve a category hex colour, falling back to the accent colour.
        static func category(hex: String?) -> Color {
            guard let hex, let color = Color(hex: hex) else { return primary }
            return color
        }
    }

    // MARK: - Status

    /// Status colours of the redesign — FIXED hues, never themed by the accent,
    /// with a light and a dark variant (web `--st-*`). `fg` = text/dot, `bg` =
    /// chip wash. Measured (WCAG, 11pt bold text):
    /// - light, fg on its wash: new 4.65, inProgress 5.98, ready 5.58,
    ///   warning 5.47, danger 5.58 (≥5.3 on every light card);
    /// - dark, fg on card (cacao / ardezie / piper): new 6.5/6.4/6.8,
    ///   inProgress 7.2/7.2/7.6, ready 7.3/7.2/7.7, warning 8.1/8.0/8.5,
    ///   danger 6.6/6.5/7.0; fg on its 20 % wash ≥4.58 everywhere.
    enum Status {
        enum Kind: CaseIterable, Sendable {
            /// New / accent.
            case new
            case inProgress
            case ready
            case warning
            case danger
        }

        private static var isDark: Bool { AppSchemeStore.shared.scheme.isDark }

        static func fg(_ kind: Kind) -> Color {
            isDark ? darkFg(kind) : lightFg(kind)
        }

        /// Chip / tile wash: pastel on light schemes, the fg at 20 % on dark
        /// ones (composited over whatever card it sits on).
        static func bg(_ kind: Kind) -> Color {
            isDark ? darkFg(kind).opacity(0.2) : lightBg(kind)
        }

        /// `fg` for a kind, the muted ink for a neutral (nil) status.
        static func color(_ kind: Kind?) -> Color {
            kind.map(fg) ?? Colors.secondaryLabel
        }

        /// Margin health: ≥30 % ready, ≥15 % warning, else danger.
        static func marginKind(_ percent: Double) -> Kind {
            if percent >= 30 { return .ready }
            if percent >= 15 { return .warning }
            return .danger
        }

        private static func lightFg(_ kind: Kind) -> Color {
            switch kind {
            case .new: .hex(0xC2305B)
            case .inProgress: .hex(0x2456B0)
            case .ready: .hex(0x1F6B48)
            case .warning: .hex(0x8A5411)
            case .danger: .hex(0xB42323)
            }
        }

        private static func lightBg(_ kind: Kind) -> Color {
            switch kind {
            case .new: .hex(0xFBE9EF)
            case .inProgress: .hex(0xE7EFFB)
            case .ready: .hex(0xE3F2EA)
            case .warning: .hex(0xFBEEDC)
            case .danger: .hex(0xFDE8E8)
            }
        }

        private static func darkFg(_ kind: Kind) -> Color {
            switch kind {
            case .new: .hex(0xF27CA0)
            case .inProgress: .hex(0x7BB0E0)
            case .ready: .hex(0x46C266)
            case .warning: .hex(0xFF9F0A)
            case .danger: .hex(0xFF7A7F)
            }
        }
    }

    /// Readable text on an arbitrary fill (category colours): white when it
    /// reaches 4.5:1, otherwise the dark ink.
    static func readableText(on fill: Color) -> Color {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(fill).getRed(&r, green: &g, blue: &b, alpha: &a)
        func lin(_ c: CGFloat) -> CGFloat { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        let lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        return 1.05 / (lum + 0.05) >= 4.5 ? .white : .hex(0x1C1719)
    }

    // MARK: - Spacing

    enum Spacing {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    // MARK: - Corner Radius

    enum CornerRadius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 16
    }
}

// MARK: - Number Formatting

extension Double {
    /// Quantity for display: whole numbers without decimals ("2"), fractional
    /// values with a Romanian comma and up to two decimals ("1,5", "0,95").
    var qtyFormatted: String { qtyFormatted(maxDecimals: 2) }

    /// `qtyFormatted` with a chosen precision (3 for kg / l = gram precision).
    func qtyFormatted(maxDecimals: Int) -> String {
        let p = pow(10.0, Double(maxDecimals))
        var r = (self * p).rounded() / p
        if r == 0, self != 0 {
            // Small-but-real quantities (0,004 kg = 4 g) must not display as
            // "0" — fall back to more precision instead of rounding them away.
            r = (self * 1_000_000).rounded() / 1_000_000
        }
        if r == 0 { r = 0 } // normalize -0 so "-0" (and "+-0") never renders
        if r == r.rounded() { return String(format: "%.0f", r) }
        let s = String(format: "%.6f", r).replacingOccurrences(
            of: "0+$", with: "", options: .regularExpression)
        return s.replacingOccurrences(of: ".", with: ",")
    }

    /// Legacy alias of `qtyFormatted` — same trimmed display.
    var qtyTrimmed: String { qtyFormatted }

    /// Price in RON with two decimals and a Romanian comma, e.g. "24,50 RON".
    var ronFormatted: String {
        String(format: "%.2f RON", self).replacingOccurrences(of: ".", with: ",")
    }

    /// Percent, Romanian style: comma decimal, space before % ("12,5 %",
    /// "30 %"). See `RoFormat.percent`.
    var percentFormatted: String { RoFormat.percent(self) }
}
