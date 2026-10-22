import Foundation

actor PricingService {
    static let shared = PricingService()

    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    func fetchRecipeMargin(recipeId: String) async throws -> RecipeMarginResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/recipes/\(recipeId)/margin")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeMarginResponse.self, from: data)
    }

    func setSellingPrice(recipeId: String, price: Double) async throws -> RecipeMarginResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/recipes/\(recipeId)/selling-price")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(SetSellingPriceRequest(sellingPrice: price))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(RecipeMarginResponse.self, from: data)
    }

    func fetchPriceHistory(rawMaterialId: String? = nil, consumableId: String? = nil, recipeId: String? = nil) async throws -> [PriceHistoryResponse] {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/pricing/history")!
        var items: [URLQueryItem] = []
        if let rawMaterialId { items.append(URLQueryItem(name: "rawMaterialId", value: rawMaterialId)) }
        if let consumableId { items.append(URLQueryItem(name: "consumableId", value: consumableId)) }
        if let recipeId { items.append(URLQueryItem(name: "recipeId", value: recipeId)) }
        if !items.isEmpty { components.queryItems = items }
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([PriceHistoryResponse].self, from: data)
    }

    func fetchOrderRevenue(orderId: String) async throws -> OrderRevenueResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/orders/\(orderId)/revenue")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(OrderRevenueResponse.self, from: data)
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
