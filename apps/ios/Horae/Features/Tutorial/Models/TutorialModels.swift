import Foundation

/// One step of a walkthrough. `id` is a STABLE anchor key (e.g.
/// `tasks.create.selectRecipe`) that a client maps to a real UI element via
/// `.tutorialAnchor(id:)`. When no element carries the id on this platform the
/// step still renders — just as a centered card with no spotlight.
struct TutorialStep: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let body: String
}

/// A walkthrough: an ordered list of steps, grouped in the help center by
/// `category`. `platforms` says which clients have this feature AT ALL — a
/// `["web"]` flow (e.g. Excel import/export) is never listed on iOS.
struct TutorialFlow: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let category: String
    let platforms: [String]
    let steps: [TutorialStep]

    /// True when this flow's feature exists on iOS.
    var supportsIOS: Bool { platforms.contains("ios") }

    /// Free-text match over the flow title and every step's title + body —
    /// backs the help center's `.searchable`.
    func matches(query: String) -> Bool {
        let needle = query.folding(
            options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        guard !needle.isEmpty else { return true }
        let haystack = ([title, category] + steps.flatMap { [$0.title, $0.body] })
            .joined(separator: " ")
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
        return haystack.contains(needle)
    }
}

/// Response of the public `GET /api/v1/tutorial/content` endpoint.
struct TutorialContentResponse: Codable {
    let flows: [TutorialFlow]
}
