import Foundation

/// Activity types matching backend ActivityType.
enum ActivityType: String, Codable, Sendable {
    case TASK_TRANSITION
    case STOCK_MOVEMENT
    case ORDER_CREATED
    case ORDER_STATUS
    case LOW_STOCK
    case STOCK_AVAILABLE

    var icon: String {
        switch self {
        case .TASK_TRANSITION: "checklist"
        case .STOCK_MOVEMENT: "shippingbox.fill"
        case .ORDER_CREATED, .ORDER_STATUS: "truck.box.fill"
        case .LOW_STOCK: "exclamationmark.triangle.fill"
        case .STOCK_AVAILABLE: "checkmark.circle.fill"
        }
    }
}

/// Mirrors ActivityResponseDto from the API.
struct ActivityResponse: Decodable, Identifiable, Sendable {
    let id: String
    let type: ActivityType
    let title: String
    let description: String
    let timestamp: Date
    let metadata: ActivityMetadata
}

struct ActivityMetadata: Decodable, Sendable {
    let taskId: String?
    let orderId: String?
    let materialId: String?
    let userId: String?
    let userName: String?
}

/// Query parameters for activity feed.
struct ActivityQuery {
    var page: Int = 1
    var limit: Int = 20

    var queryItems: [URLQueryItem] {
        [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
    }
}
