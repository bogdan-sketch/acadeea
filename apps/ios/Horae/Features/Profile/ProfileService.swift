import Foundation

/// Company data printed on documents (`GET /organization`, subset).
struct OrganizationDetails: Decodable, Sendable, Equatable {
    let id: String?
    let name: String
    let defaultLocationId: String?
    let vatPayer: Bool?
    let vatRatePercent: Double?
    let cui: String?
    let regCom: String?
    let legalAddress: String?
    let contactPhone: String?
    let contactEmail: String?
    let website: String?
    let administratorName: String?
}

/// Body of `PATCH /organization` for the Companie form (only the company
/// fields — branding stays untouched).
struct UpdateCompanyRequest: Encodable, Sendable {
    var name: String
    var cui: String
    var regCom: String
    var legalAddress: String
    var contactPhone: String
    var contactEmail: String
    var website: String
    var administratorName: String
    var vatPayer: Bool
    var vatRatePercent: Double
}

/// Body of `PATCH /users/:id` for the own name (needs `update User`; there
/// is no "update me" endpoint, same as the web).
private struct UpdateNameRequest: Encodable {
    let firstName: String
    let lastName: String
}

/// API calls of Profil & setări that no other service covers.
actor ProfileService {
    static let shared = ProfileService()

    private var base: String { "\(APIClient.baseURL)/api/v1" }
    private let decoder = APIClient.makeDecoder()
    private let encoder = JSONEncoder()

    func fetchOrganization() async throws -> OrganizationDetails {
        let request = makeRequest("\(base)/organization", method: "GET")
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        return try decoder.decode(OrganizationDetails.self, from: data)
    }

    func updateCompany(_ body: UpdateCompanyRequest) async throws -> OrganizationDetails {
        var request = makeRequest("\(base)/organization", method: "PATCH")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
        return try decoder.decode(OrganizationDetails.self, from: data)
    }

    /// Saves the signed-in user's first/last name.
    func updateName(userId: String, firstName: String, lastName: String) async throws {
        var request = makeRequest("\(base)/users/\(userId)", method: "PATCH")
        request.httpBody = try encoder.encode(UpdateNameRequest(firstName: firstName, lastName: lastName))
        let (data, response) = try await APIClient.authenticatedData(for: request)
        try validate(response, data: data)
    }

    // MARK: - Helpers

    private func makeRequest(_ url: String, method: String) -> URLRequest {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Răspuns invalid")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.from(data: data, statusCode: http.statusCode)
        }
    }
}
