import Foundation

actor IntegrationService {
    static let shared = IntegrationService()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/integrations" }
    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    // MARK: - Integrations CRUD

    func fetchAll() async throws -> [Integration] {
        let request = authenticatedRequest(url: URL(string: baseURL)!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([Integration].self, from: data)
    }

    func fetch(id: String) async throws -> Integration {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)")!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(Integration.self, from: data)
    }

    func create(_ dto: CreateIntegrationRequest) async throws -> Integration {
        var request = authenticatedRequest(url: URL(string: baseURL)!, method: "POST")
        request.httpBody = try encoder.encode(dto)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(Integration.self, from: data)
    }

    func update(id: String, dto: UpdateIntegrationRequest) async throws -> Integration {
        var request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)")!, method: "PATCH")
        request.httpBody = try encoder.encode(dto)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(Integration.self, from: data)
    }

    func delete(id: String) async throws {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(id)")!, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
    }

    // MARK: - Product Mappings

    func fetchMappings(integrationId: String) async throws -> [ProductMapping] {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(integrationId)/mappings")!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([ProductMapping].self, from: data)
    }

    func createMapping(integrationId: String, dto: CreateProductMappingRequest) async throws -> ProductMapping {
        var request = authenticatedRequest(url: URL(string: "\(baseURL)/\(integrationId)/mappings")!, method: "POST")
        request.httpBody = try encoder.encode(dto)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data, expectedStatus: 201)
        return try decoder.decode(ProductMapping.self, from: data)
    }

    func deleteMapping(integrationId: String, mappingId: String) async throws {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(integrationId)/mappings/\(mappingId)")!, method: "DELETE")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
    }

    // MARK: - External Orders

    func fetchExternalOrders(integrationId: String) async throws -> [ExternalOrder] {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(integrationId)/orders")!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode([ExternalOrder].self, from: data)
    }

    // MARK: - Sync

    func triggerSync(integrationId: String) async throws -> SyncResult {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/\(integrationId)/sync")!, method: "POST")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validateResponse(response, data: data)
        return try decoder.decode(SyncResult.self, from: data)
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
