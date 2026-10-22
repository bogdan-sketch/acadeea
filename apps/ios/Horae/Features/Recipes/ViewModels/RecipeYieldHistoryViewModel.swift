import Foundation
import Observation

@Observable
final class RecipeYieldHistoryViewModel {
    var entries: [RecipeYieldHistoryResponse] = []
    var isLoading = false
    var error: APIError?
    var hasMore = true

    private let recipeId: String
    private let service = RecipeService.shared
    private var currentPage = 1

    init(recipeId: String) {
        self.recipeId = recipeId
    }

    func loadInitial() async {
        currentPage = 1
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let result = try await service.fetchYieldHistory(recipeId: recipeId, page: 1)
            entries = result.data
            hasMore = result.hasNextPage
            currentPage = 1
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
            let result = try await service.fetchYieldHistory(recipeId: recipeId, page: nextPage)
            entries.append(contentsOf: result.data)
            hasMore = result.hasNextPage
            currentPage = nextPage
        } catch {
            // Silently fail on pagination
        }
    }
}
