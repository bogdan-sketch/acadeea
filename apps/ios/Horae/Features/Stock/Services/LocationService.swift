import Foundation

actor LocationService {
    static let shared = LocationService()

    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - Locations

    func fetchLocations() async throws -> [LocationResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([LocationResponse].self, from: data)
    }

    func fetchLocation(id: String) async throws -> LocationResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(LocationResponse.self, from: data)
    }

    func createLocation(_ body: CreateLocationRequest) async throws -> LocationResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(LocationResponse.self, from: data)
    }

    func updateLocation(id: String, _ body: CreateLocationRequest) async throws -> LocationResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(LocationResponse.self, from: data)
    }

    func deleteLocation(id: String, force: Bool = false) async throws {
        var urlString = "\(APIClient.baseURL)/api/v1/locations/\(id)"
        if force { urlString += "?force=true" }
        let url = URL(string: urlString)!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 204 else {
            throw APIError.from(data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
    }

    func fetchLocationStock(id: String) async throws -> [LocationStockResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(id)/stock")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([LocationStockResponse].self, from: data)
    }

    func fetchLocationRecipeStock(id: String) async throws -> [LocationRecipeStockResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(id)/recipe-stock")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([LocationRecipeStockResponse].self, from: data)
    }

    // MARK: - My Locations

    func fetchMyLocations() async throws -> [LocationResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/my-locations")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([LocationResponse].self, from: data)
    }

    // MARK: - Location Users

    func fetchLocationUsers(locationId: String) async throws -> [LocationUserResponse] {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(locationId)/users")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([LocationUserResponse].self, from: data)
    }

    func assignUser(to locationId: String, body: AssignUserLocationRequest) async throws -> LocationUserResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(locationId)/users")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(LocationUserResponse.self, from: data)
    }

    func removeUser(from locationId: String, userId: String) async throws {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(locationId)/users/\(userId)")!
        let request = authenticatedRequest(url: url, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 204 else {
            throw APIError.from(data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
    }

    // MARK: - Location Dashboard

    func fetchLocationDashboard(id: String) async throws -> LocationDashboardResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/locations/\(id)/dashboard")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(LocationDashboardResponse.self, from: data)
    }

    // MARK: - Transfer Approval

    func updateTransferApproval(transferId: String, body: UpdateTransferApprovalRequest) async throws -> TransferResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/\(transferId)/approval")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TransferResponse.self, from: data)
    }

    // MARK: - Transfers

    func fetchTransfers(query: TransferQuery) async throws -> PaginatedResponse<TransferResponse> {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/stock/transfers")!
        components.queryItems = query.queryItems
        let request = authenticatedRequest(url: components.url!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(PaginatedResponse<TransferResponse>.self, from: data)
    }

    /// `POST /stock/transfers/bulk-delete/preview` — what a cascade delete of `ids` would also touch.
    func bulkDeleteTransfersPreview(ids: [String]) async throws -> BulkDeletePreview {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/bulk-delete/preview")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeletePreviewRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeletePreview.self, from: data)
    }

    /// `POST /stock/transfers/bulk-delete` — cascade delete (user confirmed the preview); per-row failures come back in `failed`.
    func bulkDeleteTransfers(ids: [String]) async throws -> BulkDeleteResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/bulk-delete")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkDeleteRequest(ids: ids))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkDeleteResult.self, from: data)
    }

    /// `POST …/bulk-action` — one action (status, assign, …) on many rows; per-row failures come back in `failed`.
    func bulkActionTransfers(ids: [String], action: String, params: BulkParams) async throws -> BulkActionResult {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/bulk-action")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(BulkActionRequest(ids: ids, action: action, params: params))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(BulkActionResult.self, from: data)
    }

    func fetchTransfer(id: String) async throws -> TransferResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/\(id)")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TransferResponse.self, from: data)
    }

    /// Printable aviz payload; the backend assigns + persists the serial on
    /// the first call so reprints keep the same serie/număr.
    func fetchTransferAviz(id: String) async throws -> TransferAvizResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/\(id)/aviz")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TransferAvizResponse.self, from: data)
    }

    /// Conformity declaration payload; serial persisted on first call.
    func fetchTransferConformity(id: String) async throws -> TransferConformityResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/\(id)/conformity")!
        let request = authenticatedRequest(url: url, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TransferConformityResponse.self, from: data)
    }

    func createTransfer(_ body: CreateTransferRequest) async throws -> TransferResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers")!
        var request = authenticatedRequest(url: url, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(TransferResponse.self, from: data)
    }

    func updateTransferStatus(id: String, _ body: UpdateTransferStatusRequest) async throws -> TransferResponse {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/stock/transfers/\(id)")!
        var request = authenticatedRequest(url: url, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(TransferResponse.self, from: data)
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
