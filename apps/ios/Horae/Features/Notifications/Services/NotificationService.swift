import Foundation

actor NotificationService {
    static let shared = NotificationService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/notifications" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()

    // MARK: - Inbox

    /// Paginated inbox, newest first.
    func fetchNotifications(query: NotificationQuery) async throws -> PaginatedResponse<NotificationResponse> {
        var components = URLComponents(string: baseURL)!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<NotificationResponse>.self, from: data)
    }

    /// Number of unread notifications. `GET /notifications/unread-count` → `{ count }`.
    func fetchUnreadCount() async throws -> Int {
        let url = URL(string: "\(baseURL)/unread-count")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(UnreadCountResponse.self, from: data).count
    }

    /// Mark a single notification read. `PATCH /notifications/:id/read`.
    func markRead(id: String) async throws {
        let url = URL(string: "\(baseURL)/\(id)/read")!
        let request = authenticatedRequest(url: url, method: "PATCH")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
    }

    /// Mark every notification read. `PATCH /notifications/read-all`.
    func markAllRead() async throws {
        let url = URL(string: "\(baseURL)/read-all")!
        let request = authenticatedRequest(url: url, method: "PATCH")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
    }

    // MARK: - Push device token

    /// Register this device's APNs token so the server can push to it.
    /// `POST /api/v1/notifications/device-token { token, platform: "ios" }`.
    func uploadDeviceToken(_ token: String) async throws {
        let url = URL(string: "\(baseURL)/device-token")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try JSONEncoder().encode(DeviceTokenRequest(token: token, platform: "ios"))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
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

    /// Accepts any 2xx status (the read/mark endpoints may return 200 or 204).
    private func validateResponse(_ response: URLResponse, data: Data, expectedStatus: Int = 200) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.from(data: data, statusCode: httpResponse.statusCode)
        }
    }
}
