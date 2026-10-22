import Foundation
import Observation

@Observable
final class SemipreparateListViewModel {
    var items: [RecipeStockResponse] = []
    var isLoading = false
    var error: APIError?
    var hasMore = true
    var search = ""

    private let service = StockService.shared
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

    func loadInitial() async {
        currentPage = 1
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            var query = RecipeStockQuery()
            query.type = .SEMIPREPARAT
            query.search = search.isEmpty ? nil : search
            let result = try await service.fetchRecipeStock(query: query)
            items = result.data
            hasMore = result.hasNextPage
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
            query.type = .SEMIPREPARAT
            query.search = search.isEmpty ? nil : search
            let result = try await service.fetchRecipeStock(query: query)
            items.append(contentsOf: result.data)
            hasMore = result.hasNextPage
            currentPage = nextPage
        } catch {
            // Silently fail on pagination
        }
    }
}
