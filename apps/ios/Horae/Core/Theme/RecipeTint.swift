import SwiftUI

/// Category tints for recipe cards — the web `--cat-1…8` / `--cat-N-ink`
/// palette from `globals.css`, repainted per scheme. Slots: 1 rose,
/// 2 apricot, 3 sky, 4 caramel, 5 lilac, 6 pistachio, 7 coral, 8 teal.
/// Slot 0 = no category (web `--muted` / `--muted-foreground`). The scheme
/// ink (`AppScheme.ink`) on every tint holds ≥8.6:1 in all six schemes.
struct RecipeTint: Equatable {
    /// Tile surface.
    let fill: Color
    /// Art, category dot and corner glow.
    let ink: Color

    /// Tint for a category name in the given scheme.
    static func forCategory(_ category: String?, scheme: AppScheme) -> RecipeTint {
        let slot = RecipeCategoryKey.slot(category)
        guard slot > 0 else {
            let (fill, ink) = scheme.mutedPair
            return RecipeTint(fill: .hex(fill), ink: .hex(ink))
        }
        let pair = scheme.categoryPalette[slot - 1]
        return RecipeTint(fill: .hex(pair.0), ink: .hex(pair.1))
    }
}

/// Category name → normalised key, colour slot and drawing (web `recipe-ui.tsx`
/// `categoryKey`/`categorySlot` and `category-art.tsx` `categoryArt`).
enum RecipeCategoryKey {
    /// Lowercase, no diacritics: "Monoporții" → "monoportii".
    static func key(_ category: String?) -> String {
        (category ?? "")
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private static func starts(_ key: String, _ prefixes: [String]) -> Bool {
        prefixes.contains { key.hasPrefix($0) }
    }

    /// 1–8, 0 for no category. Known catalogue categories are pinned so
    /// neighbours differ; anything else hashes to a stable slot (same hash as web).
    static func slot(_ category: String?) -> Int {
        let k = key(category)
        guard !k.isEmpty else { return 0 }
        if k.contains("tort") { return 1 }
        if starts(k, ["monopor"]) { return 2 }
        if starts(k, ["macaron"]) { return 3 }
        if starts(k, ["cookie", "biscui", "fursec"]) { return 4 }
        if starts(k, ["felii"]) { return 5 }
        if starts(k, ["tart", "insert"]) { return 6 }
        if starts(k, ["praji", "pralin"]) { return 7 }
        if starts(k, ["semi", "crem", "mouss", "ganache"]) { return 8 }
        if starts(k, ["blat"]) { return 4 }
        if starts(k, ["crocant", "caramel"]) { return 2 }
        if starts(k, ["glazur", "candy"]) || k == "bar" { return 5 }
        // JS `charCodeAt` walks UTF-16 code units; `>>> 0` keeps it unsigned 32-bit.
        var h: UInt32 = 0
        for unit in k.utf16 { h = h &* 31 &+ UInt32(unit) }
        return Int(h % 8) + 1
    }

    static func art(_ category: String?, recipeType: RecipeType?) -> CategoryArtKind {
        let k = key(category)
        if !k.isEmpty {
            if k.contains("tort") { return .cake }
            if starts(k, ["monopor"]) { return .mono }
            if starts(k, ["macaron"]) { return .macaron }
            if starts(k, ["cookie", "biscui", "fursec"]) { return .cookie }
            if starts(k, ["tart"]) { return .tart }
            if starts(k, ["felii"]) { return .slice }
            if starts(k, ["praji", "patiser", "croissant", "viennois"]) { return .croissant }
            if starts(k, ["semi", "crem", "blat", "glazur", "insert", "mouss", "ganache", "pralin"]) { return .bowl }
        }
        return recipeType == .SEMIPREPARAT ? .bowl : .cupcake
    }
}

// MARK: - Palette per scheme

extension AppScheme {
    /// (fill, ink) for slots 1…8 — same hex as web `--cat-N` / `--cat-N-ink`.
    var categoryPalette: [(UInt32, UInt32)] {
        switch self {
        case .atelier:
            [(0xF4C9D6, 0xA8325C), (0xF9D3A5, 0xA65A12), (0xC7DCF6, 0x2C63AA), (0xEBCFAE, 0x8A5424),
             (0xDCCBF3, 0x6A43B0), (0xD2E5BF, 0x4A7A2C), (0xF8C5B4, 0xAE4426), (0xBCE2DA, 0x23766A)]
        case .lapte:
            [(0xF6CFDD, 0xB0335F), (0xFBDDB0, 0xA85F10), (0xCFE0FA, 0x2D5FC4), (0xEDD9C2, 0x85532A),
             (0xE0D3F7, 0x6643BA), (0xD5EBCB, 0x3F7A2E), (0xF9CFC2, 0xB0452B), (0xC6E8E3, 0x1F7368)]
        case .miere:
            [(0xF2C3C9, 0xA33445), (0xF7CD8E, 0x9C5410), (0xCCDDEE, 0x2F619B), (0xE8C79E, 0x7F4C1C),
             (0xE0CBE6, 0x7A3F92), (0xD8E2AE, 0x5A7120), (0xF5BFA0, 0xA6441E), (0xC3DFCB, 0x2E7350)]
        case .cacao:
            [(0x5C2338, 0xF497B8), (0x5E3A12, 0xF6B867), (0x1F3A5E, 0x8DB9F2), (0x4E3320, 0xE2B07F),
             (0x3E2A62, 0xBEA2F2), (0x2F4422, 0xA9D98A), (0x5E2A1C, 0xF59E80), (0x17463F, 0x7FD6C6)]
        case .ardezie:
            [(0x4F2440, 0xEE9AC4), (0x523A1A, 0xF0BE75), (0x1B3D63, 0x8FC0F5), (0x43352A, 0xD9B48C),
             (0x352D66, 0xB7A8F5), (0x24452F, 0x9FD8A4), (0x55302A, 0xF2A38D), (0x124843, 0x7DD9CB)]
        case .piper:
            [(0x5E1E36, 0xFF8FB5), (0x613A0C, 0xFFB860), (0x1A3966, 0x86B6FF), (0x4F311A, 0xE8AE76),
             (0x3D2566, 0xC1A0FF), (0x2B4718, 0xA6DE7E), (0x64261A, 0xFF9A7A), (0x0F4A42, 0x6EDCC8)]
        }
    }

    /// Web `--muted` (surface) / `--muted-foreground` — the uncategorised tile.
    var mutedPair: (UInt32, UInt32) {
        switch self {
        case .atelier: (0xEFEBE7, 0x6B6369)
        case .lapte: (0xEEEFF3, 0x666B78)
        case .miere: (0xF1E7D3, 0x74674F)
        case .cacao: (0x272025, 0xA79BA1)
        case .ardezie: (0x222A30, 0xA3AFB8)
        case .piper: (0x242426, 0xA9A49C)
        }
    }
}
