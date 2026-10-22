import Foundation
import Observation

@Observable
final class ConsumableListViewModel {
    var consumables: [ConsumableResponse] = []
    var isLoading = false
    var hasNextPage = false
    var searchText = ""
    var selectedStatus: MaterialStatus?
    var error: APIError?

    private var currentPage = 1
    private let service = StockService.shared
    private var searchTask: Task<Void, Never>?

    /// Debounced live search: cancels the previous in-flight debounce on each keystroke.
    func searchChanged() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            await self.loadConsumables(reset: true)
        }
    }

    func loadConsumables(reset: Bool = false) async {
        if reset { currentPage = 1 }
        isLoading = true
        defer { isLoading = false }

        do {
            var query = ConsumableQuery()
            query.page = currentPage
            query.search = searchText.isEmpty ? nil : searchText
            query.status = selectedStatus

            let result = try await service.fetchConsumables(query: query)
            if reset {
                consumables = result.data
            } else {
                consumables.append(contentsOf: result.data)
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
        await loadConsumables()
    }

    func refresh() async {
        await loadConsumables(reset: true)
    }
}
