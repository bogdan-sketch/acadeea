import Foundation

struct UserRoleInfo: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let slug: String
    let name: String
}

struct UserResponse: Decodable, Identifiable, Sendable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    let role: UserRoleInfo?
    let isActive: Bool
    let createdAt: Date
    /// RELATIVE image path (`/api/v1/images/<uuid>`); resolve via `APIClient.absoluteURL(for:)`.
    var avatarUrl: String? = nil

    var fullName: String { "\(firstName) \(lastName)" }
    var roleName: String { role?.name ?? "—" }
}

/// Minimal decode of the user returned by the avatar endpoints.
struct AvatarUrlResponse: Decodable, Sendable {
    let avatarUrl: String?
}

struct UserQuery {
    var page: Int = 1
    var limit: Int = 20
    var isActive: Bool? = true
    var roleId: String?
    var search: String?

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let isActive { items.append(URLQueryItem(name: "isActive", value: "\(isActive)")) }
        if let roleId { items.append(URLQueryItem(name: "roleId", value: roleId)) }
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        return items
    }
}

struct InviteUserRequest: Encodable {
    let email: String
    let roleId: String
}

struct ChangeRoleRequest: Encodable {
    let roleId: String
}

struct InvitationResponse: Decodable, Identifiable, Sendable {
    let id: String
    let email: String
    let role: UserRoleInfo?
    let createdById: String
    let expiresAt: Date
    let acceptedAt: Date?
    let createdAt: Date
}

/// Role as returned by GET /api/v1/roles
struct RoleResponse: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let slug: String
    let isSystem: Bool
    let description: String?
    let userCount: Int
    let permissions: [PermissionRule]
    let createdAt: Date
}
