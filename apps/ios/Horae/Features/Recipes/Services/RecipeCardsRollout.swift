import SwiftUI

/// THE ONE SWITCH for the web-style recipe card grid (`RecipeCardGrid`).
///
/// Rollout (owner, 17.10.2026):
/// - iPad (pad idiom — the list column can report a COMPACT size class in
///   portrait with the sidebar open — or any regular width), both "Horae" and "Horae Test": card grid.
/// - iPhone, "Horae Test" (`API_TEST` compilation condition, Debug-Test /
///   Release-Test configurations in `project.yml`): card grid.
/// - iPhone, prod "Horae": card grid too since 1.35.4 (owner, 17.10.2026:
///   "pune in prod ce aveam pe test ... si partea de retete").
///
/// REVERT: make `isEnabled` return `false`. Everything falls back to
/// `RecipeRowsList`, which this rollout never touched. To go back to rows on
/// prod iPhone only, restore the `#if API_TEST` branch (git: 1.35.3).
enum RecipeCardsRollout {
    static func isEnabled(horizontalSizeClass: UserInterfaceSizeClass?) -> Bool {
        true
    }
}
