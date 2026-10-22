import Foundation
import Observation

@Observable
final class TaskDetailViewModel {
    var task: TaskResponse?
    var materialRequirements: [TaskMaterialRequirement] = []
    var availableLocations: [LocationResponse] = []
    var isLoading = false
    var error: APIError?
    var isTransitioning = false

    private let taskId: String
    private let service = TaskService.shared
    private let locationService = LocationService.shared

    init(taskId: String) {
        self.taskId = taskId
    }

    var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var canUpdate: Bool {
        permissions.can(.update, .Task)
    }

    var allowedTransitions: [TaskStatus] {
        task?.status.allowedTransitions ?? []
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            task = try await service.fetchTask(id: taskId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }

        // Best-effort: scaled material requirements. A failure here must not
        // hide the task itself, so it is loaded separately and errors swallowed.
        await loadMaterialRequirements()
        await loadLocations()
    }

    private func loadMaterialRequirements() async {
        do {
            materialRequirements = try await service.fetchMaterialRequirements(id: taskId)
        } catch {
            materialRequirements = []
        }
    }

    /// Locations available as a finalize destination (produce here, ship there).
    private func loadLocations() async {
        do {
            var locations = try await locationService.fetchMyLocations()
            if locations.isEmpty {
                locations = try await locationService.fetchLocations().filter { $0.isActive }
            }
            availableLocations = locations
        } catch {
            availableLocations = []
        }
    }

    // MARK: - Transition

    func transition(
        to status: TaskStatus,
        reason: String? = nil,
        actualYield: Double? = nil,
        outputLocationId: String? = nil
    ) async {
        isTransitioning = true
        error = nil
        defer { isTransitioning = false }

        do {
            let body = TransitionTaskRequest(
                status: status,
                reason: reason,
                actualYield: actualYield,
                outputLocationId: outputLocationId
            )
            task = try await service.transitionTask(id: taskId, body)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    // MARK: - Visibility

    /// "Cine vede taskul" chips — Doar alocații / Toată lumea. ("Anumite
    /// persoane" needs a people picker and goes through the edit form.)
    func setVisibility(_ visibility: TaskVisibility) async {
        guard let task, task.visibility != visibility else { return }
        error = nil
        do {
            var body = UpdateTaskRequest()
            body.visibility = visibility
            self.task = try await service.updateTask(id: task.id, body)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    // MARK: - Assign

    func assign(to userId: String) async {
        do {
            task = try await service.assignTask(id: taskId, assignedToId: userId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
