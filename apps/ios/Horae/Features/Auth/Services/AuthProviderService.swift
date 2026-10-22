import Foundation

/// Authenticated linked-account management: link / unlink a social provider to
/// the CURRENT user and read the fresh linked-provider list. Public sign-in
/// (`/auth/apple`, `/auth/google`) lives on `AuthManager` because it bootstraps
/// the session; these endpoints require an existing Bearer token so they follow
/// the standard feature-service pattern (`APIClient.authenticatedData`).
actor AuthProviderService {
    static let shared = AuthProviderService()
    private init() {}

    private var baseURL: String { APIClient.baseURL }
    private var token: String { KeychainService.shared.accessToken ?? "" }

    /// `POST /auth/link/:provider` — links (provider, identity) to the current user.
    /// Returns the updated linked-provider list. Maps `409 PROVIDER_ALREADY_LINKED`.
    func link(provider: String, identityToken: String, nonce: String?) async throws -> [String] {
        let url = URL(string: "\(baseURL)/api/v1/auth/link/\(provider)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(
            LinkProviderRequest(identityToken: identityToken, nonce: nonce)
        )

        let (data, response) = try await APIClient.authenticatedData(for: request)
        try Self.validate(data: data, response: response)
        return try JSONDecoder().decode(LinkedProvidersResponse.self, from: data).linkedProviders
    }

    /// `DELETE /auth/link/:provider` — unlinks the provider from the current user.
    /// Maps `400 LAST_LOGIN_METHOD` when it would leave no login method.
    func unlink(provider: String) async throws -> [String] {
        let url = URL(string: "\(baseURL)/api/v1/auth/link/\(provider)")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await APIClient.authenticatedData(for: request)
        try Self.validate(data: data, response: response)
        return try JSONDecoder().decode(LinkedProvidersResponse.self, from: data).linkedProviders
    }

    /// `GET /auth/me` — used to (re)load the authoritative linked-provider list.
    func fetchLinkedProviders() async throws -> [String] {
        let url = URL(string: "\(baseURL)/api/v1/auth/me")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await APIClient.authenticatedData(for: request)
        try Self.validate(data: data, response: response)
        let user = try JSONDecoder().decode(AuthUser.self, from: data)
        return user.providers
    }

    private static func validate(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.from(data: data, statusCode: http.statusCode)
        }
    }
}
