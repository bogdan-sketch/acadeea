import Foundation

/// Mirrors CASL ability rules — now driven by permissions array from login response.

enum CASLAction: String, Codable {
    case manage, create, read, update, delete
}

enum CASLSubject: String, Codable {
    case all
    case User, RawMaterial, Consumable, Recipe, RecipeCost
    case Task, StockMovement, StockReservation
    case Order, OrderItem, DeliveryNote
    case Location, StockTransfer
    case Organization, Role
    case UserInvitation
}

/// Permission rule received from backend login/me response.
struct PermissionRule: Codable, Equatable {
    let action: String
    let subject: String
}

/// Role info received from backend.
struct RoleInfo: Codable, Equatable {
    let slug: String
    let name: String
}

struct PermissionManager {
    let permissions: [PermissionRule]

    func can(_ action: CASLAction, _ subject: CASLSubject) -> Bool {
        // "manage all" short-circuit
        if permissions.contains(where: { $0.action == "manage" && $0.subject == "all" }) {
            return true
        }

        // "manage <subject>" grants all actions on that subject
        if permissions.contains(where: { $0.action == "manage" && $0.subject == subject.rawValue }) {
            return true
        }

        return permissions.contains { $0.action == action.rawValue && $0.subject == subject.rawValue }
    }

    /// Whether this user has full admin access.
    var isAdmin: Bool {
        permissions.contains { $0.action == "manage" && $0.subject == "all" }
    }
}
