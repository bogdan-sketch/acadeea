import Observation
import SwiftUI

/// The six colour schemes of the redesign — the same tokens as the web app
/// (`globals.css` `:root[data-scheme=…]`) and the Setări board. Three light
/// (Atelier, Lapte, Miere), three dark (Cacao, Ardezie, Piper).
///
/// Rule shared with web (decision 17.10.2026): ONLY these six designed schemes.
/// Every scheme has its own accent; no organisation accent, font or token set
/// overrides them. White text on every accent (≥4.5:1, see `primary`).
enum AppScheme: String, CaseIterable, Identifiable, Sendable {
    case atelier, lapte, miere, cacao, ardezie, piper

    var id: String { rawValue }

    static let `default`: AppScheme = .atelier

    var name: String {
        switch self {
        case .atelier: "Atelier"
        case .lapte: "Lapte"
        case .miere: "Miere"
        case .cacao: "Cacao"
        case .ardezie: "Ardezie"
        case .piper: "Piper"
        }
    }

    var isDark: Bool {
        switch self {
        case .atelier, .lapte, .miere: false
        case .cacao, .ardezie, .piper: true
        }
    }

    /// "Luminos" / "Întunecat".
    var kindLabel: String { isDark ? "Întunecat" : "Luminos" }

    var colorScheme: ColorScheme { isDark ? .dark : .light }

    // MARK: - Tokens

    var background: Color {
        switch self {
        case .atelier: .hex(0xF6F3EE)
        case .lapte: .hex(0xF7F7F9)
        case .miere: .hex(0xFBF4E6)
        case .cacao: .hex(0x1A1416)
        case .ardezie: .hex(0x121619)
        case .piper: .hex(0x0F0F10)
        }
    }

    var card: Color {
        switch self {
        case .atelier, .lapte: .hex(0xFFFFFF)
        case .miere: .hex(0xFFFCF5)
        case .cacao: .hex(0x241C1F)
        case .ardezie: .hex(0x1A2024)
        case .piper: .hex(0x19191B)
        }
    }

    /// Foreground text ("ink").
    var ink: Color {
        switch self {
        case .atelier: .hex(0x1C1719)
        case .lapte: .hex(0x15171C)
        case .miere: .hex(0x241B10)
        case .cacao: .hex(0xF3ECEE)
        case .ardezie: .hex(0xE9EEF2)
        case .piper: .hex(0xF2EFEA)
        }
    }

    var muted: Color {
        switch self {
        case .atelier: .hex(0x6B6369)
        case .lapte: .hex(0x666B78)
        case .miere: .hex(0x74674F)
        case .cacao: .hex(0xA79BA1)
        case .ardezie: .hex(0xA3AFB8)
        case .piper: .hex(0xA9A49C)
        }
    }

    var border: Color {
        switch self {
        case .atelier: .hex(0xE8E2DC)
        case .lapte: .hex(0xE3E5EB)
        case .miere: .hex(0xE7DCC3)
        case .cacao, .ardezie: .white.opacity(0.08)
        case .piper: .white.opacity(0.09)
        }
    }

    /// The scheme's accent — same hex as web `--primary`. White on it:
    /// atelier 5.43, lapte 5.85, miere 5.16, cacao 4.93, ardezie 5.02,
    /// piper 4.69 (all ≥4.5:1).
    var primaryHex: UInt32 {
        switch self {
        case .atelier: 0xC2305B
        case .lapte: 0x2F5BD6
        case .miere: 0xA8580D
        case .cacao: 0xC9386A
        case .ardezie: 0x3568DE
        case .piper: 0x9C6A0B
        }
    }

    var primary: Color { .hex(primaryHex) }

    /// Text/icon on a `primary` fill — white on all six (web `--primary-foreground`).
    var onPrimary: Color { .white }

    /// The accent AS TEXT (links, active labels, tinted badges) — web
    /// `--primary-text`: OKLCH lightness capped at 0.48 on light schemes,
    /// floored at 0.78 on dark ones. Contrast on card / page / 10–20 % tint:
    /// atelier 7.3/6.6/6.2, lapte 6.9/6.5/6.0, miere 6.6/6.2/5.8,
    /// cacao 7.0/7.6/5.8, ardezie 7.5/8.3/6.2, piper 8.7/9.5/7.1.
    var primaryText: Color {
        switch self {
        case .atelier: .hex(0xAA1249)
        case .lapte: .hex(0x264FC9)
        case .miere: .hex(0x934500)
        case .cacao: .hex(0xFF7EA9)
        case .ardezie: .hex(0x77B2FF)
        case .piper: .hex(0xE2AD5D)
        }
    }

    /// Tab bar / dock surface.
    var tabBar: Color {
        switch self {
        case .atelier: .hex(0xFBF9F6)
        case .lapte: .hex(0xFFFFFF)
        case .miere: .hex(0xFFFCF5)
        case .cacao: .hex(0x1F181B)
        case .ardezie: .hex(0x161B1F)
        case .piper: .hex(0x141415)
        }
    }
}

// MARK: - Store

/// The user's chosen scheme, persisted in UserDefaults under `horae-scheme`
/// (same key as the web app's localStorage). Observable, so every view that
/// reads `AppTheme.Colors.*` re-renders live when the scheme changes.
@Observable
final class AppSchemeStore {
    static let shared = AppSchemeStore()
    static let storageKey = "horae-scheme"

    var scheme: AppScheme {
        didSet { defaults.set(scheme.rawValue, forKey: Self.storageKey) }
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.string(forKey: Self.storageKey)
        self.scheme = stored.flatMap(AppScheme.init(rawValue:)) ?? .default
    }
}

// MARK: - Hex helper

extension Color {
    /// Compile-time hex literal (0xRRGGBB) in sRGB.
    static func hex(_ value: UInt32, opacity: Double = 1) -> Color {
        Color(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255,
            opacity: opacity)
    }
}

extension AppScheme {
    /// "#RRGGBB" of the accent, for helpers that take a hex string.
    var primaryHexString: String { String(format: "#%06X", primaryHex) }
}
