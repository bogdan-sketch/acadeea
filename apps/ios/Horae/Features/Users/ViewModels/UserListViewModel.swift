import Foundation
import Observation

enum UserListTab: String, CaseIterable {
    case active = "Activi"
    case inactive = "Inactivi"
    case invited = "Invitati"
}

@Observable
final class UserListViewModel {
    var users: [UserResponse] = []
    var invitations: [InvitationResponse] = []
    var isLoading = false
    var error: APIError?
    var hasMore = true
    var search = ""
    var selectedTab: UserListTab = .active

    private let service = UserService.shared
    private var currentPage = 1
    private var searchTask: Task<Void, Never>?

    var showActive: Bool { selectedTab == .active }

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
        // Clear immediately so the previous tab's rows don't linger while the new tab loads.
        users = []
        invitations = []
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            if selectedTab == .invited {
                let all = try await service.fetchInvitations()
                // Filter by search if needed
                if search.isEmpty {
                    invitations = all
                } else {
                    invitations = all.filter { $0.email.localizedCaseInsensitiveContains(search) }
                }
            } else {
                var query = UserQuery()
                query.isActive = showActive
                query.search = search.isEmpty ? nil : search
                let result = try await service.fetchUsers(query: query)
                users = result.data
                hasMore = result.hasNextPage
            }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func loadMore() async {
        guard selectedTab != .invited, hasMore, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        let nextPage = currentPage + 1
        do {
            var query = UserQuery()
            query.page = nextPage
            query.isActive = showActive
            query.search = search.isEmpty ? nil : search
            let result = try await service.fetchUsers(query: query)
            users.append(contentsOf: result.data)
            hasMore = result.hasNextPage
            currentPage = nextPage
        } catch {
            // Silently fail on pagination
        }
    }
}
