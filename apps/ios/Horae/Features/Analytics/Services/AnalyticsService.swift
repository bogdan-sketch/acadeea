import Foundation

actor AnalyticsService {
    static let shared = AnalyticsService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/analytics" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()

    func fetchProductionAnalytics(from: String? = nil, to: String? = nil) async throws -> ProductionAnalytics {
        var components = URLComponents(string: "\(baseURL)/production")!
        var items: [URLQueryItem] = []
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        if !items.isEmpty { components.queryItems = items }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(ProductionAnalytics.self, from: data)
    }

    func fetchStockAnalytics() async throws -> StockAnalytics {
        let url = URL(string: "\(baseURL)/stock")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(StockAnalytics.self, from: data)
    }

    func fetchOrderAnalytics(from: String? = nil, to: String? = nil) async throws -> OrderAnalytics {
        var components = URLComponents(string: "\(baseURL)/orders")!
        var items: [URLQueryItem] = []
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        if !items.isEmpty { components.queryItems = items }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderAnalytics.self, from: data)
    }

    func fetchUserProductivity() async throws -> [UserProductivity] {
        let url = URL(string: "\(baseURL)/users")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([UserProductivity].self, from: data)
    }

    func fetchSummary() async throws -> AnalyticsSummary {
        let url = URL(string: "\(baseURL)/summary")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(AnalyticsSummary.self, from: data)
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
