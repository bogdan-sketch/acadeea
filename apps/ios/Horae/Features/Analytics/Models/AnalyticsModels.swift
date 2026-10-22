import Foundation

struct AnalyticsPeriod: Decodable, Sendable {
    let from: Date
    let to: Date
}

struct ProductionAnalytics: Decodable, Sendable {
    let period: AnalyticsPeriod?
    let totalTasksCompleted: Int
    let totalTasksCancelled: Int
    let averageCompletionHours: Double?
    let yieldVarianceAvg: Double?
}

struct StockAnalyticsTopMaterial: Decodable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let totalConsumed: Double
    let unit: String
}

struct StockAnalytics: Decodable, Sendable {
    let topConsumedMaterials: [StockAnalyticsTopMaterial]
    let lowStockCount: Int
    let totalMovements: Int
}

struct OrderAnalyticsProduct: Decodable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let quantity: Double
}

struct OrderAnalytics: Decodable, Sendable {
    let totalOrders: Int
    let ordersByStatus: [String: Int]
    let onTimeRate: Double?
    let popularProducts: [OrderAnalyticsProduct]
}

struct UserProductivity: Decodable, Identifiable, Sendable {
    let userId: String
    let firstName: String
    let lastName: String
    let tasksCompleted: Int
    let avgCompletionHours: Double?

    var id: String { userId }
    var fullName: String { "\(firstName) \(lastName)" }
}

struct AnalyticsSummary: Decodable, Sendable {
    let tasksCompletedToday: Int
    let ordersToday: Int
    let lowStockItems: Int
    let activeUsers: Int
}
