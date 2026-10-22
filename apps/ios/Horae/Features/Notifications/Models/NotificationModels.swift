import Foundation

/// A single in-app notification from the inbox.
/// Mirrors the API `Notification` shape: `{ id, type, title, body, data?,
/// readAt: Date?, createdAt: Date }`. The arbitrary `data` payload is not
/// decoded here (extra keys are ignored) — the inbox only needs to render and
/// mark items read.
struct NotificationResponse: Decodable, Identifiable, Sendable {
    let id: String
    let type: String
    let title: String
    let body: String
    let readAt: Date?
    let createdAt: Date

    var isRead: Bool { readAt != nil }

    private enum CodingKeys: String, CodingKey {
        case id, type, title, body, readAt, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type) ?? "GENERIC"
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        readAt = try c.decodeIfPresent(Date.self, forKey: .readAt)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
    }

    /// SF Symbol for the notification, derived from its type keyword.
    var icon: String {
        let t = type.uppercased()
        if t.contains("TASK") { return "checklist" }
        if t.contains("STOCK") || t.contains("MATERIAL") { return "shippingbox.fill" }
        if t.contains("ORDER") { return "cart.fill" }
        if t.contains("TRANSFER") { return "arrow.left.arrow.right" }
        if t.contains("LOW") || t.contains("WARN") { return "exclamationmark.triangle.fill" }
        return "bell.fill"
    }
}

/// Query parameters for the notifications inbox (newest first, paginated).
struct NotificationQuery {
    var page: Int = 1
    var limit: Int = 20

    var queryItems: [URLQueryItem] {
        [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
    }
}

/// `GET /notifications/unread-count` → `{ count }`.
struct UnreadCountResponse: Decodable, Sendable {
    let count: Int
}

/// Body for `POST /api/v1/notifications/device-token`.
struct DeviceTokenRequest: Encodable {
    let token: String
    let platform: String
}
