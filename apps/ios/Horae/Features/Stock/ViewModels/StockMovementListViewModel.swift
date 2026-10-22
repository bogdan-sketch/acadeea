import Foundation
import Observation

@Observable
final class StockMovementListViewModel {
    var movements: [StockMovementResponse] = []
    var isLoading = false
    var hasNextPage = false
    var selectedType: StockMovementType?
    var error: APIError?
    /// Excel of the shown movements (last 30 days by default), ready for ShareLink.
    var exportURL: URL?
    var isExporting = false

    private var currentPage = 1
    private let service = StockService.shared

    func loadMovements(reset: Bool = false) async {
        if reset { currentPage = 1 }
        isLoading = true
        defer { isLoading = false }

        do {
            var query = StockMovementQuery()
            query.page = currentPage
            query.movementType = selectedType

            let result = try await service.fetchMovements(query: query)
            if reset {
                movements = result.data
            } else {
                movements.append(contentsOf: result.data)
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
        await loadMovements()
    }

    func refresh() async {
        exportURL = nil
        await loadMovements(reset: true)
    }

    func exportXlsx() async {
        isExporting = true
        defer { isExporting = false }
        do {
            var query = StockMovementQuery()
            query.movementType = selectedType
            let data = try await service.fetchMovementsXlsx(query: query)
            let date = ISO8601DateFormatter().string(from: Date()).prefix(10)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("miscari-stoc-\(date).xlsx")
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
