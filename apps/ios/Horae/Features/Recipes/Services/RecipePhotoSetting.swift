import Foundation

/// Recipe photos — code-level feature flag, OFF for now (owner, 17.10.2026).
/// No client uses recipe photos yet; the whole feature (photo cards in
/// Rețete, the photo hero on the recipe, upload/replace/delete) stays
/// compiled and ready. Flip to `true` for a client that wants it.
/// OFF: Rețete shows Stoc-like rows, the recipe shows its tags instead of the
/// photo hero, and there is no upload entry point anywhere.
enum RecipePhotos {
    static let enabled = false
}
