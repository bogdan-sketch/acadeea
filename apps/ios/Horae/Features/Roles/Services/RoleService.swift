import Foundation

/// API calls for role management (admin).
actor RoleService {
    static let shared = RoleService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/roles" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - List

    func fetchRoles() async throws -> [RoleResponse] {
        let url = URL(string: baseURL)!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([RoleResponse].self, from: data)
    }

    // MARK: - Get

    func fetchRole(id: String) async throws -> RoleResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RoleResponse.self, from: data)
    }

    // MARK: - Create

    func createRole(name: String, description: String?) async throws -> RoleResponse {
        let url = URL(string: baseURL)!
        var request = authenticatedRequest(url: url, method: "POST")
        let body = CreateRoleRequest(name: name, description: description)
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(RoleResponse.self, from: data)
    }

    // MARK: - Update

    func updateRole(id: String, name: String?, description: String?) async throws -> RoleResponse {
        let url = URL(string: "\(baseURL)/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        let body = UpdateRoleRequest(name: name, description: description)
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RoleResponse.self, from: data)
    }

    // MARK: - Delete

    func deleteRole(id: String) async throws {
        let url = URL(string: "\(baseURL)/\(id)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 204)
    }

    // MARK: - Set Permissions

    func setPermissions(roleId: String, permissions: [PermissionRule]) async throws -> RoleResponse {
        let url = URL(string: "\(baseURL)/\(roleId)/permissions")!
        var request = authenticatedRequest(url: url, method: "PUT")
        let body = SetPermissionsRequest(permissions: permissions)
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RoleResponse.self, from: data)
    }

    // MARK: - Subjects meta

    func fetchSubjects() async throws -> [SubjectMeta] {
        let url = URL(string: "\(baseURL)/subjects")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        let raw = try decoder.decode(SubjectsResponse.self, from: data)
        return raw.subjects.map { SubjectMeta(subject: $0, actions: raw.actions) }
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

// MARK: - Request DTOs

struct CreateRoleRequest: Encodable {
    let name: String
    let description: String?
}

struct UpdateRoleRequest: Encodable {
    let name: String?
    let description: String?
}

struct SetPermissionsRequest: Encodable {
    let permissions: [PermissionRule]
}

/// Raw response from GET /roles/subjects
private struct SubjectsResponse: Decodable {
    let subjects: [String]
    let actions: [String]
}

struct SubjectMeta: Identifiable {
    let subject: String
    let actions: [String]

    var id: String { subject }
}
