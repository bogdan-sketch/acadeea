import Foundation

/// Mirrors TaskResponseDto from the API.
struct TaskResponse: Decodable, Identifiable, Sendable {
    let id: String
    let recipeId: String
    let scaleFactor: Double
    let targetQuantity: Double
    let targetUnit: UnitType
    let status: TaskStatus
    let priority: Int
    let plannedDate: Date?
    let dueDate: Date?
    let notes: String?
    let createdById: String
    let assignedToId: String?
    let startedAt: Date?
    let completedAt: Date?
    let cancelledAt: Date?
    let cancelReason: String?
    let shortages: [TaskShortage]?
    let actualYield: Double?
    let varianceAbsolute: Double?
    let variancePercent: Double?
    let parentTaskId: String?
    /// Family (batch) the task was created in via `POST /tasks/multi`. Null for
    /// tasks created one at a time.
    let groupId: String?
    /// User-facing name of that family, e.g. "Sosuri inghetata".
    let groupLabel: String?
    let recipeName: String
    /// Custom name (nil = recipe name).
    let title: String?
    /// Who sees it besides managers/admins; nil on an older API.
    let visibility: TaskVisibility?
    /// Extra viewers when visibility = SELECTED.
    let visibleToIds: [String]?
    let locationId: String?
    let locationName: String?
    let createdBy: TaskUser
    let assignedTo: TaskUser?
    let subtasks: [SubtaskSummary]
    let statusHistory: [TaskStatusHistory]
    let createdAt: Date
    let updatedAt: Date

    /// Custom title when set, else the recipe name.
    var name: String {
        if let title, !title.trimmingCharacters(in: .whitespaces).isEmpty { return title }
        return recipeName
    }

    /// Computed display name: "targetQuantity name"
    var displayName: String {
        return "\(targetQuantity.qtyFormatted) \(name)"
    }

    var isSubtask: Bool { parentTaskId != nil }
    var hasSubtasks: Bool { !subtasks.isEmpty }
    var subtaskProgress: String {
        let done = subtasks.filter { $0.status == .FINALIZAT || $0.status == .ANULAT }.count
        return "\(done)/\(subtasks.count)"
    }
}

/// Lightweight subtask summary for display in parent task.
struct SubtaskSummary: Decodable, Identifiable, Sendable {
    let id: String
    let recipeId: String
    let recipeName: String
    let title: String?
    let targetQuantity: Double
    let targetUnit: UnitType
    let status: TaskStatus
    let assignedTo: TaskUser?

    var displayName: String {
        let name = (title?.isEmpty == false) ? title! : recipeName
        return "\(targetQuantity.qtyFormatted) \(name)"
    }
}

struct TaskUser: Decodable, Sendable {
    let id: String
    let firstName: String
    let lastName: String

    var fullName: String { "\(firstName) \(lastName)" }
}

struct TaskStatusHistory: Decodable, Identifiable, Sendable {
    let id: String
    let fromStatus: TaskStatus?
    let toStatus: TaskStatus
    let changedBy: TaskUser
    let reason: String?
    let createdAt: Date
}

/// Shortage info for a BLOCAT task.
struct TaskShortage: Decodable, Identifiable, Sendable {
    var id: String { rawMaterialId ?? recipeId ?? UUID().uuidString }
    let rawMaterialId: String?
    let rawMaterialTitle: String?
    let recipeId: String?
    let recipeName: String?
    let needed: Double
    let available: Double
    let unit: String

    var displayTitle: String { rawMaterialTitle ?? recipeName ?? "Material" }
    var shortage: Double { needed - available }
}

/// A material a task will consume, scaled to its target quantity.
/// `needed` is the scaled amount (matches what gets deducted from stock, not the
/// base recipe amount); `currentStock` is the physical stock now and `stockAfter`
/// is what remains once the task is produced.
struct TaskMaterialRequirement: Decodable, Identifiable, Sendable {
    var id: String { rawMaterialId ?? recipeId ?? UUID().uuidString }
    let rawMaterialId: String?
    let recipeId: String?
    let title: String
    let unit: String
    let needed: Double
    let currentStock: Double
    let available: Double
    let stockAfter: Double
    let sufficient: Bool

    /// Localized unit abbreviation when the raw string maps to a known UnitType.
    var unitLabel: String {
        UnitType(rawValue: unit)?.abbreviation ?? unit
    }

    /// Format a quantity (expressed in this requirement's unit) auto-scaled to
    /// the most readable unit, e.g. 950 g → "950 g", 1200 g → "1.2 kg".
    func display(_ value: Double) -> String {
        if let u = UnitType(rawValue: unit) { return u.humanizedString(value) }
        return "\(value.qtyTrimmed) \(unitLabel)"
    }
}

// MARK: - Stats

struct TaskStatsResponse: Decodable, Sendable {
    let statusCounts: [String: Int]
    let totalTasks: Int
}

/// Create task request body.
struct CreateTaskRequest: Encodable {
    let recipeId: String
    let targetQuantity: Double
    let targetUnit: UnitType
    var priority: Int?
    var plannedDate: String?
    var dueDate: String?
    var notes: String?
    var assignedToId: String?
    var locationId: String?
    /// Custom name; nil/empty = recipe name.
    var title: String?
    var visibility: TaskVisibility?
    var visibleToIds: [String]?
}

// MARK: - Multi task (familie de taskuri)

/// One recipe + quantity line of a multi-task batch.
struct MultiTaskItemRequest: Encodable {
    let recipeId: String
    let targetQuantity: Double
    let targetUnit: UnitType
}

/// `POST /tasks/multi` body — one task per item, all sharing a generated
/// groupId and the optional groupLabel.
struct CreateMultiTaskRequest: Encodable {
    let items: [MultiTaskItemRequest]
    var groupLabel: String?
    var includeSemipreparate: Bool?
    var dueDate: String?
    var plannedDate: String?
    var locationId: String?
    var assignedToId: String?
    var priority: Int?
    var notes: String?
}

/// `POST /tasks/multi` response.
struct MultiTaskResponse: Decodable, Sendable {
    let groupId: String
    let tasks: [TaskResponse]
}

/// Update task request body.
struct UpdateTaskRequest: Encodable {
    var recipeId: String?
    var targetQuantity: Double?
    var targetUnit: UnitType?
    var priority: Int?
    var plannedDate: String?
    var dueDate: String?
    var notes: String?
    var assignedToId: String?
    var locationId: String?
    /// "" clears the custom name (server turns it into null = recipe name).
    var title: String?
    var visibility: TaskVisibility?
    var visibleToIds: [String]?
}

/// Transition task status request body.
struct TransitionTaskRequest: Encodable {
    let status: TaskStatus
    var reason: String?
    var actualYield: Double?
    var outputLocationId: String?
}

/// Query parameters for task list.
struct TaskQuery {
    var page: Int = 1
    var limit: Int = 20
    var status: TaskStatus?
    var assignedToId: String?
    var recipeId: String?
    var dueBefore: String?
    var dueAfter: String?
    var search: String?
    /// "Ziua mea" — open tasks assigned to me, relevant today.
    var myDay: Bool = false

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: "\(page)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if let status { items.append(URLQueryItem(name: "status", value: status.rawValue)) }
        if myDay { items.append(URLQueryItem(name: "myDay", value: "true")) }
        if let assignedToId { items.append(URLQueryItem(name: "assignedToId", value: assignedToId)) }
        if let recipeId { items.append(URLQueryItem(name: "recipeId", value: recipeId)) }
        if let dueBefore { items.append(URLQueryItem(name: "dueBefore", value: dueBefore)) }
        if let dueAfter { items.append(URLQueryItem(name: "dueAfter", value: dueAfter)) }
        if let search, !search.isEmpty { items.append(URLQueryItem(name: "search", value: search)) }
        return items
    }
}

// MARK: - Traceability sheet

struct TraceabilityIngredient: Decodable, Identifiable, Sendable {
    var id: String { "\(title)-\(quantity)-\(lotNumber ?? "")" }
    let title: String
    let quantity: Double
    let unit: UnitType
    let kind: String
    let lotNumber: String?
    let expiryDate: Date?
    let supplier: String?
    let invoiceNumber: String?
    /// Exact lots consumed (FIFO), possibly several. Empty for pre-FIFO tasks.
    let lots: [TraceabilityLot]
}

struct TraceabilityLot: Decodable, Identifiable, Sendable {
    var id: String { "\(lotNumber ?? "")-\(invoiceNumber ?? "")-\(quantity)" }
    let lotNumber: String?
    let invoiceNumber: String?
    let supplier: String?
    let quantity: Double
    let expiryDate: Date?
}

struct TraceabilityHistory: Decodable, Identifiable, Sendable {
    var id: String { "\(toStatus)-\(at.timeIntervalSince1970)" }
    let fromStatus: TaskStatus?
    let toStatus: TaskStatus
    let byName: String
    let reason: String?
    let at: Date
}

struct TraceabilitySubtask: Decodable, Identifiable, Sendable {
    var id: String { taskId }
    let taskId: String
    let recipeName: String
    let quantity: Double
    let unit: UnitType
    let completedAt: Date?
    let ingredients: [TraceabilityIngredient]
}

struct TaskTraceability: Decodable, Sendable {
    let taskId: String
    let recipeName: String
    let recipeType: RecipeType
    let status: TaskStatus
    let targetQuantity: Double
    let targetUnit: UnitType
    let actualYield: Double?
    let startedAt: Date?
    let completedAt: Date?
    let createdByName: String
    let assignedToName: String?
    let notes: String?
    let ingredients: [TraceabilityIngredient]
    let subtasks: [TraceabilitySubtask]
    let history: [TraceabilityHistory]
}
