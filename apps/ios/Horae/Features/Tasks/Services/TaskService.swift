import Foundation

/// Handles all task API calls.
actor TaskService {
    static let shared = TaskService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/tasks" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - List

    func fetchTasks(query: TaskQuery) async throws -> PaginatedResponse<TaskResponse> {
        var components = URLComponents(string: baseURL)!
        components.queryItems = query.queryItems

        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<TaskResponse>.self, from: data)
    }

    // MARK: - Get by ID

    func fetchTask(id: String) async throws -> TaskResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TaskResponse.self, from: data)
    }

    func fetchTraceability(id: String) async throws -> TaskTraceability {
        let url = URL(string: "\(baseURL)/\(id)/traceability")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TaskTraceability.self, from: data)
    }

    func fetchMaterialRequirements(id: String) async throws -> [TaskMaterialRequirement] {
        let url = URL(string: "\(baseURL)/\(id)/material-requirements")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([TaskMaterialRequirement].self, from: data)
    }

    /// Preview scaled material requirements for a recipe at a target quantity,
    /// before a task exists — drives the task-create form's live stock recalc.
    func previewRequirements(
        recipeId: String,
        targetQuantity: Double,
        targetUnit: UnitType,
        locationId: String? = nil
    ) async throws -> [TaskMaterialRequirement] {
        var components = URLComponents(string: "\(baseURL)/preview-requirements")!
        components.queryItems = [
            URLQueryItem(name: "recipeId", value: recipeId),
            URLQueryItem(name: "targetQuantity", value: String(targetQuantity)),
            URLQueryItem(name: "targetUnit", value: targetUnit.rawValue),
        ]
        if let locationId {
            components.queryItems?.append(URLQueryItem(name: "locationId", value: locationId))
        }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([TaskMaterialRequirement].self, from: data)
    }

    // MARK: - Create

    func createTask(_ body: CreateTaskRequest) async throws -> TaskResponse {
        let url = URL(string: baseURL)!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(TaskResponse.self, from: data)
    }

    /// Create a whole batch of tasks at once — one per recipe line, all stamped
    /// with the same groupId/groupLabel (a "familie"). With
    /// `includeSemipreparate` the backend also creates the semipreparat
    /// subtasks of every final recipe.
    func createMultiTasks(_ body: CreateMultiTaskRequest) async throws -> MultiTaskResponse {
        let url = URL(string: "\(baseURL)/multi")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(MultiTaskResponse.self, from: data)
    }

    // MARK: - Update

    func updateTask(id: String, _ body: UpdateTaskRequest) async throws -> TaskResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TaskResponse.self, from: data)
    }

    // MARK: - Transition

    func transitionTask(id: String, _ body: TransitionTaskRequest) async throws -> TaskResponse {
        let url = URL(string: "\(baseURL)/\(id)/transition")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TaskResponse.self, from: data)
    }

    // MARK: - Assign

    func assignTask(id: String, assignedToId: String) async throws -> TaskResponse {
        let url = URL(string: "\(baseURL)/\(id)/assign")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(["assignedToId": assignedToId])
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TaskResponse.self, from: data)
    }

    // MARK: - Delete

    func deleteTask(id: String) async throws -> TaskResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TaskResponse.self, from: data)
    }

    /// `POST /tasks/bulk-delete/preview` — what a cascade delete of `ids` would also touch.
    func bulkDeletePreview(ids: [String]) async throws -> BulkDeletePreview {
        let url = URL(string: "\(baseURL)/bulk-delete/preview")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeletePreviewRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeletePreview.self, from: data)
    }

    /// `POST /tasks/bulk-delete` — cascade delete (user confirmed the preview); per-row failures come back in `failed`.
    func bulkDelete(ids: [String]) async throws -> BulkDeleteResult {
        let url = URL(string: "\(baseURL)/bulk-delete")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeleteRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeleteResult.self, from: data)
    }

    /// `POST …/bulk-action` — one action (status, assign, …) on many rows; per-row failures come back in `failed`.
    func bulkAction(ids: [String], action: String, params: BulkParams) async throws -> BulkActionResult {
        let url = URL(string: "\(baseURL)/bulk-action")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkActionRequest(ids: ids, action: action, params: params))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkActionResult.self, from: data)
    }

    // MARK: - Stats

    func fetchStats() async throws -> TaskStatsResponse {
        let url = URL(string: "\(baseURL)/stats")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TaskStatsResponse.self, from: data)
    }

    // MARK: - Shopping List

    func fetchShoppingList() async throws -> [ShoppingListItem] {
        let url = URL(string: "\(baseURL)/shopping-list")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        let result = try decoder.decode(ShoppingListResponse.self, from: data)
        return result.items
    }

    // MARK: - Calendar

    func fetchCalendar(from: String? = nil, to: String? = nil) async throws -> [String: [TaskResponse]] {
        var components = URLComponents(string: "\(baseURL)/calendar")!
        var items: [URLQueryItem] = []
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        if !items.isEmpty { components.queryItems = items }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([String: [TaskResponse]].self, from: data)
    }

    // MARK: - Helpers

    private func authenticatedRequest(url: URL, method: String) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func validateResponse(_ response: URLResponse, data: Data, expectedStatus: Int = 200) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard httpResponse.statusCode == expectedStatus else {
            throw APIError.from(data: data, statusCode: httpResponse.statusCode)
        }
    }
}
