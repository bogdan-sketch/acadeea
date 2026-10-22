import Foundation
import Observation

@Observable
final class RecipeListViewModel {
    var recipes: [RecipeResponse] = []
    var isLoading = false
    var hasNextPage = false
    var searchText = ""
    var selectedType: RecipeType?
    var selectedCategory: String?
    /// true → the list shows the archive instead of the active recipes.
    var showArchived = false
    /// true → the list shows drafts instead of the active recipes.
    /// Mutually exclusive with `showArchived`.
    var showDrafts = false
    var availableCategories: [String] = []
    /// Statistici pe categorii pentru cardurile-filtru (doar cele cu retete,
    /// in ordinea din carusel, cu culoarea super-categoriei).
    var categoryStats: [RecipeCategoryStat] = []
    /// Carousel rows of the active type(s): parents + their sub-categories, admin order.
    var dialCategories: [CarouselCategory] = []
    /// Recipes per category for the bento tiles ("" = uncategorized).
    var categoryCounts: [String: Int] = [:]
    var error: APIError?

    private var currentPage = 1
    private let service = RecipeService.shared
    private var searchTask: Task<Void, Never>?

    /// Debounced live search: cancels the previous in-flight debounce on each keystroke.
    func searchChanged() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            await self.refresh()
        }
    }

    /// Categories for the active type filter (final vs semipreparat use separate lists).
    func loadCategories() async {
        let kind = selectedType == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT"
        // No type selected → merge both lists so the filter still works.
        if selectedType == nil {
            let finals = (try? await service.fetchCategories(kind: "PRODUS_FINIT")) ?? []
            let semis = (try? await service.fetchCategories(kind: "SEMIPREPARAT")) ?? []
            availableCategories = Array(Set(finals + semis)).sorted()
        } else {
            availableCategories = (try? await service.fetchCategories(kind: kind)) ?? []
        }
    }

    func loadRecipes(reset: Bool = false) async {
        if reset { currentPage = 1 }
        isLoading = true
        defer { isLoading = false }

        do {
            var query = RecipeQuery()
            query.page = currentPage
            // Rows are grouped by category: a page large enough that a
            // group is not split across pages for a normal shop.
            query.limit = 100
            query.search = searchText.isEmpty ? nil : searchText
            query.type = selectedType
            query.category = selectedCategory
            query.archived = showArchived
            query.draft = showDrafts

            let result = try await service.fetchRecipes(query: query)
            if reset {
                recipes = result.data
            } else {
                let known = Set(recipes.map(\.id))
                recipes.append(contentsOf: result.data.filter { !known.contains($0.id) })
            }
            hasNextPage = currentPage < result.totalPages
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func loadMore() async {
        guard hasNextPage, !isLoading else { return }
        currentPage += 1
        await loadRecipes()
    }

    func refresh() async {
        await loadRecipes(reset: true)
    }

    /// Carduri-statistica pe categorii: counts din retetele tipului curent
    /// (fetch larg, o pagina de 500) + culorile/ordinea din carusel.
    func loadCategoryStats() async {
        let carousel = (try? await service.fetchCategoryCarousel()) ?? []
        let kinds: Set<String> = switch selectedType {
        case .SEMIPREPARAT: ["SEMIPREPARAT"]
        case .FINAL: ["PRODUS_FINIT"]
        default: ["PRODUS_FINIT", "SEMIPREPARAT"]
        }
        dialCategories = carousel.filter { kinds.contains($0.kind) }
        var query = RecipeQuery()
        query.limit = 500
        query.type = selectedType
        query.archived = showArchived
        query.draft = showDrafts
        let all = (try? await service.fetchRecipes(query: query))?.data ?? []
        var counts: [String: Int] = [:]
        for r in all {
            if let c = r.category, !c.isEmpty { counts[c, default: 0] += 1 } else { counts["", default: 0] += 1 }
        }
        categoryCounts = counts
        var seen = Set<String>()
        var stats: [RecipeCategoryStat] = []
        for c in carousel {
            guard let n = counts[c.name], n > 0, seen.insert(c.name).inserted else { continue }
            stats.append(RecipeCategoryStat(name: c.name, colorHex: c.color, count: n))
        }
        for (name, n) in counts.sorted(by: { $0.key < $1.key }) where !seen.contains(name) {
            stats.append(RecipeCategoryStat(name: name, colorHex: nil, count: n))
        }
        categoryStats = stats
    }

    func filterByType(_ type: RecipeType?) {
        selectedType = type
        // Category list depends on the type; drop a now-invalid selection.
        selectedCategory = nil
        Task {
            await loadCategoryStats()
            await loadCategories()
            await refresh()
        }
    }

    func filterByCategory(_ category: String?) {
        selectedCategory = category
        Task { await refresh() }
    }

    func toggleArchived() {
        showArchived.toggle()
        // Archived and drafts are mutually exclusive views.
        if showArchived { showDrafts = false }
        Task {
            await loadCategoryStats()
            await refresh()
        }
    }

    func toggleDrafts() {
        showDrafts.toggle()
        // Drafts and archived are mutually exclusive views.
        if showDrafts { showArchived = false }
        Task {
            await loadCategoryStats()
            await refresh()
        }
    }
}

extension RecipeListViewModel {
    /// Culoarea categoriei (din carusel) pentru barele randurilor — aceeasi
    /// sursa ca la cardurile de statistici, ca sa NU difere culorile.
    func categoryColorHex(_ name: String?) -> String? {
        guard let name else { return nil }
        return categoryStats.first { $0.name == name }?.colorHex
    }
}

struct RecipeCategoryStat: Identifiable {
    let name: String
    let colorHex: String?
    let count: Int
    var id: String { name }
}
