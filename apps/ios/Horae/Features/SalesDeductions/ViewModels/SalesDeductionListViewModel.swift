import Foundation
import Observation

/// Jurnalul scăderilor din vânzări (confirmate / anulate / ciorne deschise), paginat.
@Observable
final class SalesDeductionListViewModel {
    var items: [SalesDeduction] = []
    var isLoading = false
    var isLoadingMore = false
    var hasLoaded = false
    var error: APIError?

    private var page = 1
    private var totalPages = 1
    private let limit = 20
    private let service = SalesDeductionService.shared

    var canLoadMore: Bool { page < totalPages }

    func load() async {
        isLoading = true
        defer { isLoading = false; hasLoaded = true }
        do {
            let res = try await service.fetchList(page: 1, limit: limit)
            items = res.data
            page = res.page
            totalPages = res.totalPages
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .unknown("Nu am putut încărca jurnalul")
        }
    }

    /// Infinite scroll: fetches the next page when the last row appears.
    func loadMoreIfNeeded(current item: SalesDeduction) async {
        guard item.id == items.last?.id, canLoadMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let res = try await service.fetchList(page: page + 1, limit: limit)
            let known = Set(items.map(\.id))
            items += res.data.filter { !known.contains($0.id) }
            page = res.page
            totalPages = res.totalPages
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
