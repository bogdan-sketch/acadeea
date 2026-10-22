import Foundation

/// Handles user API calls (for pickers, admin management).
actor UserService {
    static let shared = UserService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/users" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - List

    func fetchUsers(query: UserQuery) async throws -> PaginatedResponse<UserResponse> {
        var components = URLComponents(string: baseURL)!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<UserResponse>.self, from: data)
    }

    /// Search users by name. Used by task assignee picker.
    func searchUsers(name: String) async throws -> [UserSummary] {
        var query = UserQuery()
        query.search = name
        let result = try await fetchUsers(query: query)
        return result.data.map { UserSummary(id: $0.id, firstName: $0.firstName, lastName: $0.lastName, roleName: $0.roleName) }
    }

    // MARK: - My avatar

    /// `POST /users/me/avatar` (multipart field `avatar`) → the new RELATIVE
    /// `avatarUrl`. Only the avatar is decoded so a richer/poorer user payload
    /// never breaks the upload.
    func uploadMyAvatar(data: Data, filename: String, mime: String) async throws -> String? {
        let url = URL(string: "\(baseURL)/me/avatar")!
        let request = MultipartImageRequest.make(url: url, field: "avatar", data: data, filename: filename, mime: mime)
        let (body, response) = try await APIClient.authenticatedData(for: request)
        try MultipartImageRequest.validate(response, data: body)
        return try decoder.decode(AvatarUrlResponse.self, from: body).avatarUrl
    }

    /// `DELETE /users/me/avatar`.
    func deleteMyAvatar() async throws {
        let url = URL(string: "\(baseURL)/me/avatar")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try MultipartImageRequest.validate(response, data: data)
    }

    // MARK: - Get by ID

    func fetchUser(id: String) async throws -> UserResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(UserResponse.self, from: data)
    }

    // MARK: - Invite

    func inviteUser(_ body: InviteUserRequest) async throws -> InvitationResponse {
        let url = URL(string: "\(baseURL)/invite")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(InvitationResponse.self, from: data)
    }

    // MARK: - Role Change

    func changeRole(userId: String, roleId: String) async throws -> UserResponse {
        let url = URL(string: "\(baseURL)/\(userId)/role")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(ChangeRoleRequest(roleId: roleId))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(UserResponse.self, from: data)
    }

    // MARK: - Deactivate / Reactivate

    func deactivateUser(id: String) async throws -> UserResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(UserResponse.self, from: data)
    }

    func reactivateUser(id: String) async throws -> UserResponse {
        let url = URL(string: "\(baseURL)/\(id)/reactivate")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode([:] as [String: String])
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(UserResponse.self, from: data)
    }

    // MARK: - Invitations

    func fetchInvitations() async throws -> [InvitationResponse] {
        let url = URL(string: "\(baseURL)/invitations")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([InvitationResponse].self, from: data)
    }

    // MARK: - Roles

    func fetchRoles() async throws -> [RoleResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/roles")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([RoleResponse].self, from: data)
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
