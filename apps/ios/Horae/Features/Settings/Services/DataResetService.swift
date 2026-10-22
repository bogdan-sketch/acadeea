import Foundation

/// Resetare date — `/api/v1/data-reset`. Ambele rute cer `manage all` (admin)
/// si sunt scopate pe organizatia din JWT. Serverul salveaza un snapshot
/// inainte de stergere.
actor DataResetService {
    static let shared = DataResetService()

    static let confirmWord = "RESETEAZA"

    private let decoder: JSONDecoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    private var baseURL: String { "\(APIClient.baseURL)/api/v1/data-reset" }

    func fetchPreview() async throws -> [ResetCategoryPreview] {
        let request = authenticatedRequest(url: URL(string: "\(baseURL)/preview")!, method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        return try decoder.decode(DataResetPreviewResponse.self, from: data).categories
    }

    /// Sterge categoriile alese (+ dependentele lor, rezolvate server-side).
    func run(categories: [String]) async throws -> DataResetResult {
        var request = authenticatedRequest(url: URL(string: baseURL)!, method: "POST")
        request.httpBody = try encoder.encode(
            RunDataResetRequest(categories: categories, confirm: Self.confirmWord)
        )
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        return try decoder.decode(DataResetResult.self, from: data)
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

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Raspuns invalid")
        }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.from(data: data, statusCode: http.statusCode)
        }
    }
}
