import Foundation
import Observation

@Observable
final class TaskBoardViewModel {
    var allTasks: [TaskResponse] = []
    var isLoading = false
    var error: APIError?
    var searchText = ""
    var isTransitioning = false
    /// "Ziua mea" filter — persisted so the board opens how you left it.
    var myDayOnly = UserDefaults.standard.bool(forKey: "board.myDay") {
        didSet {
            UserDefaults.standard.set(myDayOnly, forKey: "board.myDay")
            Task { await load() }
        }
    }

    private let service = TaskService.shared

    /// Tasks grouped by status, filtered by search.
    var tasksByStatus: [TaskStatus: [TaskResponse]] {
        let filtered: [TaskResponse]
        if searchText.isEmpty {
            filtered = allTasks
        } else {
            let term = searchText.lowercased()
            filtered = allTasks.filter {
                $0.displayName.lowercased().contains(term) ||
                ($0.assignedTo?.fullName.lowercased().contains(term) ?? false)
            }
        }

        var grouped: [TaskStatus: [TaskResponse]] = [:]
        for status in TaskStatus.allCases {
            grouped[status] = filtered.filter { $0.status == status }
        }
        return grouped
    }

    /// Column ordering.
    static let columnOrder: [TaskStatus] = [.DE_FACUT, .BLOCAT, .IN_LUCRU, .FINALIZAT, .ANULAT]

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            var query = TaskQuery()
            query.limit = 100
            query.myDay = myDayOnly
            let result = try await service.fetchTasks(query: query)
            allTasks = result.data
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func moveTask(_ taskId: String, to newStatus: TaskStatus, reason: String? = nil, actualYield: Double? = nil) async {
        guard let task = allTasks.first(where: { $0.id == taskId }) else { return }
        guard task.status.allowedTransitions.contains(newStatus) else { return }

        isTransitioning = true
        error = nil
        defer { isTransitioning = false }

        do {
            let body = TransitionTaskRequest(status: newStatus, reason: reason, actualYield: actualYield)
            let updated = try await service.transitionTask(id: taskId, body)
            // Backend may return BLOCAT instead of IN_LUCRU if stock insufficient
            if let idx = allTasks.firstIndex(where: { $0.id == taskId }) {
                allTasks[idx] = updated
            }
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func canTransition(taskId: String, to newStatus: TaskStatus) -> Bool {
        guard let task = allTasks.first(where: { $0.id == taskId }) else { return false }
        return task.status.allowedTransitions.contains(newStatus)
    }
}
