import Foundation
import Observation

/// Time/assignee scope of the Producție list (chip row under the statuses).
enum TaskListRange: String, CaseIterable, Identifiable {
    case all, today, week, mine

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "Toate"
        case .today: "Azi"
        case .week: "Săptămâna"
        case .mine: "Ale mele"
        }
    }
}

@Observable
final class TaskListViewModel {
    var tasks: [TaskResponse] = []
    var isLoading = false
    var error: APIError?
    var searchText = ""
    var selectedStatus: TaskStatus?
    var range: TaskListRange = .all
    var currentPage = 1
    var hasNextPage = false
    var stats: TaskStatsResponse?

    private let service = TaskService.shared
    private var searchTask: Task<Void, Never>?

    /// Debounced live search: cancels the previous in-flight debounce on each keystroke.
    func searchChanged() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            await self.loadTasks(reset: true)
        }
    }

    var query: TaskQuery {
        var query = TaskQuery(
            page: currentPage,
            status: selectedStatus,
            search: searchText.isEmpty ? nil : searchText
        )
        let cal = RoDate.calendar
        switch range {
        case .all:
            break
        case .today:
            let start = cal.startOfDay(for: .now)
            query.dueAfter = start.iso8601String
            query.dueBefore = cal.date(byAdding: .second, value: 86_399, to: start)?.iso8601String
        case .week:
            let start = RoDate.startOfWeek(.now)
            query.dueAfter = start.iso8601String
            query.dueBefore = cal.date(byAdding: .second, value: 7 * 86_400 - 1, to: start)?.iso8601String
        case .mine:
            query.assignedToId = AuthManager.shared.currentUser?.id
        }
        return query
    }

    // MARK: - Load

    func loadTasks(reset: Bool = false) async {
        // On reset, keep the current rows until fresh data arrives — emptying
        // the List mid-pull-to-refresh strands the UIRefreshControl spinner
        // on screen (the "loader ramane blocat" bug).
        if reset {
            currentPage = 1
        }

        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let result = try await service.fetchTasks(query: query)
            if reset {
                tasks = result.data
            } else {
                tasks.append(contentsOf: result.data)
            }
            hasNextPage = result.hasNextPage
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func loadMore() async {
        guard hasNextPage, !isLoading else { return }
        currentPage += 1
        await loadTasks()
    }

    func refresh() async {
        await loadTasks(reset: true)
    }

    func filterByStatus(_ status: TaskStatus?) {
        selectedStatus = status
        Task { await loadTasks(reset: true) }
    }

    func filterByRange(_ newRange: TaskListRange) {
        range = newRange
        Task { await loadTasks(reset: true) }
    }

    func loadStats() async {
        do {
            stats = try await service.fetchStats()
        } catch {
            // Stats non-critical, silently fail
        }
    }
}
