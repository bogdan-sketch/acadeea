import Foundation
import Observation

/// Drives `CategoryReorderView`: ONE global flat list of every category across all
/// super-categories, dragged anywhere. The dragged order is THE display order
/// everywhere (stock carousel + filters on every client).
///
/// Initial order comes from `GET /recipes/categories/carousel` (already sorted by the
/// global ordinal — NEVER re-sort client-side). A move PATCHes the whole flat list to
/// `/recipes/categories/reorder-global`, optimistic with rollback + toast on failure.
@Observable
@MainActor
final class CategoryReorderViewModel {
    // MARK: - State

    /// The flat, globally-ordered list of categories (each keeps its super colour).
    var categories: [CarouselCategory] = []
    /// kind → super-category display name, for the row's secondary label.
    private(set) var superNameByKind: [String: String] = [:]

    var isLoading = true
    var loadError: String?
    var toast: String?

    /// True once at least one reorder persisted, so the presenter can refresh on dismiss.
    private(set) var didReorder = false
    /// Toggled on a failed save to drive `.sensoryFeedback(.warning)`.
    var failureTrigger = false

    // MARK: - Loading

    func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            async let carousel = RecipeService.shared.fetchCategoryCarousel()
            async let supers = RecipeService.shared.fetchSuperCategories()
            let (fetchedCategories, fetchedSupers) = try await (carousel, supers)
            categories = fetchedCategories
            superNameByKind = Dictionary(
                fetchedSupers.map { ($0.kind, $0.name) },
                uniquingKeysWith: { first, _ in first }
            )
        } catch {
            loadError = "Nu s-au putut incarca categoriile."
        }
    }

    func superName(for kind: String) -> String {
        superNameByKind[kind] ?? kind
    }

    // MARK: - Global reordering

    func move(from source: IndexSet, to destination: Int) {
        let previous = categories
        categories.move(fromOffsets: source, toOffset: destination)
        Task { await persist(previous: previous) }
    }

    private func persist(previous: [CarouselCategory]) async {
        let items = categories.map { CategoryOrderItem(name: $0.name, kind: $0.kind) }
        do {
            let updated = try await RecipeService.shared.reorderAllCategories(items: items)
            categories = updated
            didReorder = true
        } catch {
            categories = previous
            failureTrigger.toggle()
            toast = "Nu s-a putut salva ordinea."
        }
    }
}
