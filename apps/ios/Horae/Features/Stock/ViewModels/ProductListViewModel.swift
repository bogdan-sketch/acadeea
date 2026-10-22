import Foundation
import Observation

@Observable
final class ProductListViewModel {
    var items: [RecipeStockResponse] = []
    var isLoading = false
    var error: APIError?
    var hasMore = true
    var search = ""
    var selectedCategory: String?

    /// When true, category was pre-set from parent — hide chips.
    let hasPredefinedCategory: Bool

    // Multi-select
    var isSelecting = false
    var selectedIds: Set<String> = []

    private let service = StockService.shared
    private let recipeService = RecipeService.shared
    private var currentPage = 1
    private var searchTask: Task<Void, Never>?

    /// Debounced live search: cancels the previous in-flight debounce on each keystroke.
    func searchChanged() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            await self.loadInitial()
        }
    }

    init(category: String? = nil) {
        self.selectedCategory = category
        self.hasPredefinedCategory = category != nil
    }

    var categories: [String] = []
    /// Every category with its parent (carousel), for the group order.
    var dialCategories: [CarouselCategory] = []
    /// The two-tile dial (Semipreparate / Produse finite); nil = both.
    var selectedType: RecipeType?
    /// Totals per type for the dial, from two one-row queries.
    var kindCounts: [(key: String, count: Int)] = []
    /// Categories with at least one product of the chosen type (chips with 0 are hidden).
    var chipCategories: [CarouselCategory] = []

    var selectedItems: [RecipeStockResponse] {
        items.filter { selectedIds.contains($0.id) }
    }

    func toggleSelection(_ id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
        if selectedIds.isEmpty { isSelecting = false }
    }

    func exitSelection() {
        isSelecting = false
        selectedIds.removeAll()
    }

    func bulkSetCategory(_ category: String) async {
        for id in selectedIds {
            _ = try? await recipeService.updateRecipePartial(id: id, UpdateRecipeRequest(category: category))
        }
        exitSelection()
        await loadInitial()
    }

    /// Totals per type (same search/category filter) for the dial tiles.
    func loadKindCounts() async {
        var counts: [(key: String, count: Int)] = []
        for type in RecipeType.allCases {
            var q = RecipeStockQuery()
            q.limit = 1
            q.type = type
            q.search = search.isEmpty ? nil : search
            // Not the chip: the tiles always stay.
            let total = (try? await service.fetchRecipeStock(query: q))?.total ?? 0
            counts.append((key: type == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT", count: total))
        }
        kindCounts = counts
        await loadChipCategories()
    }

    /// One wide fetch of the chosen type (no chip filter) → which categories hold products.
    func loadChipCategories() async {
        guard let type = selectedType else { chipCategories = []; return }
        var q = RecipeStockQuery()
        q.limit = 500
        q.type = type
        q.search = search.isEmpty ? nil : search
        let cats = ((try? await service.fetchRecipeStock(query: q))?.data ?? []).map(\.category)
        let kind = type == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT"
        let rows = dialCategories.filter { $0.kind == kind }
        chipCategories = rows.filter { row in
            cats.contains { c in c == row.name || rows.contains { $0.name == c && $0.parentName == row.name } }
        }
    }

    /// Loaded items grouped by category (carousel order, "Fără categorie" last) for the list.
    var groupedItems: [(category: String, kind: String, items: [RecipeStockResponse])] {
        var order: [String] = []
        var byCat: [String: [RecipeStockResponse]] = [:]
        for item in items {
            let key = item.category.flatMap { $0.isEmpty ? nil : $0 } ?? StockText.noCategory
            if byCat[key] == nil { order.append(key) }
            byCat[key, default: []].append(item)
        }
        let rank = Dictionary(uniqueKeysWithValues: dialCategories.enumerated().map { ($1.name, $0) })
        order.sort { a, b in
            if a == StockText.noCategory { return false }
            if b == StockText.noCategory { return true }
            return (rank[a] ?? Int.max) < (rank[b] ?? Int.max)
        }
        return order.map { cat in
            let list = byCat[cat] ?? []
            let kind = list.first?.type == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT"
            return (category: cat, kind: kind, items: list)
        }
    }

    func loadCategories() async {
        do {
            categories = try await RecipeService.shared.fetchCategories()
        } catch {
            // fallback empty
        }
        let carousel = (try? await RecipeService.shared.fetchCategoryCarousel()) ?? []
        // Products = finished goods (and semipreparate); raw-material categories don't belong here.
        dialCategories = carousel.filter { $0.kind != "MATERIE_PRIMA" }
    }

    func loadInitial() async {
        currentPage = 1
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            var query = RecipeStockQuery()
            query.search = search.isEmpty ? nil : search
            query.category = selectedCategory
            query.type = selectedType
            let result = try await service.fetchRecipeStock(query: query)
            items = result.data
            hasMore = result.hasNextPage
            await loadKindCounts()


        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        let nextPage = currentPage + 1
        do {
            var query = RecipeStockQuery()
            query.page = nextPage
            query.search = search.isEmpty ? nil : search
            query.category = selectedCategory
            let result = try await service.fetchRecipeStock(query: query)
            items.append(contentsOf: result.data)
            hasMore = result.hasNextPage
            currentPage = nextPage
        } catch {
            // Silently fail on pagination
        }
    }


}
