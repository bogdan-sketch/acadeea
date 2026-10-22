import Foundation

/// Fetches consolidated dashboard stats from a single API call.
actor DashboardService {
    static let shared = DashboardService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/dashboard" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()

    func fetchStats(locationId: String? = nil) async throws -> DashboardStatsResponse {
        var urlString = "\(baseURL)/stats"
        if let locationId {
            urlString += "?locationId=\(locationId)"
        }
        let url = URL(string: urlString)!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(DashboardStatsResponse.self, from: data)
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

    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.from(data: data, statusCode: httpResponse.statusCode)
        }
    }
}

// MARK: - Response Models

struct DashboardStatsResponse: Decodable {
    let taskCounts: [String: Int]
    let orderCounts: [String: Int]
    let lowStockMaterials: [LowStockMaterial]
    let recentTasks: [DashboardRecentTask]
    let todayTasksDue: Int
    let todayOrdersDue: Int
    let todaySalesAmount: Double?
    let todayDeliveries: Int?
    let todayPickups: Int?
    /// Uncapped alert totals — `lowStockMaterials` is truncated to 10 for display.
    let lowStockCount: Int?
    let outOfStockCount: Int?
}

struct LowStockMaterial: Decodable, Identifiable {
    let id: String
    let name: String
    let status: String
    let currentStock: Double
    let minimumStock: Double
    /// Unitatea de stoc (trimisa de API din 1.11; optional pt. backend vechi).
    let unit: String?
}

struct DashboardRecentTask: Decodable, Identifiable {
    let id: String
    let recipeName: String
    /// Custom task name when set, else the recipe name (nil on an older API).
    let displayName: String?
    let status: String
    let targetQuantity: Double
    let targetUnit: String
    let assignedToName: String?
    let createdAt: Date
}
