import Foundation

actor SupplierService {
    static let shared = SupplierService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/suppliers" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    func fetchSuppliers() async throws -> [Supplier] {
        let request = authenticatedRequest(url: URL(string: baseURL)!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([Supplier].self, from: data)
    }

    func createSupplier(_ body: CreateSupplierRequest) async throws -> Supplier {
        var request = authenticatedRequest(url: URL(string: baseURL)!, method: "POST")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(Supplier.self, from: data)
    }

    func updateSupplier(id: String, _ body: CreateSupplierRequest) async throws -> Supplier {
        var request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)")!, method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(Supplier.self, from: data)
    }

    func deleteSupplier(id: String) async throws {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)")!, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 204)
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
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard http.statusCode == expectedStatus else {
            throw APIError.from(data: data, statusCode: http.statusCode)
        }
    }
}
