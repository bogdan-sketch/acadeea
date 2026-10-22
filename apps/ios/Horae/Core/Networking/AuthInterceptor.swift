import Foundation

/// Actor-based token refresh coordinator (same contract as web `auth-refresh.ts`
/// and the Android `AuthInterceptor`):
///
/// - Single flight: the server ROTATES the refresh token on every refresh, so
///   concurrent 401s share ONE refresh and every waiter gets ITS outcome — a
///   failed refresh fails all of them (they used to be resumed as if it had
///   worked, retried with the dead token, got 401 and logged the user out even
///   for a 429/5xx).
/// - A late 401 for a request sent with an access token that has since been
///   rotated does not refresh again; the caller just retries.
/// - Only a 401/403 from `/auth/refresh` (or no refresh token) ends the session.
///   429 (shared shop IP), 5xx, offline keep the tokens; the next request retries.
actor AuthInterceptor {
    static let shared = AuthInterceptor()

    private let currentAccessToken: @Sendable () -> String?
    private let performRefresh: @Sendable () async throws -> Void
    private var inFlight: Task<Void, Error>?

    init(
        currentAccessToken: @escaping @Sendable () -> String? = { KeychainService.shared.accessToken },
        performRefresh: @escaping @Sendable () async throws -> Void = { try await AuthInterceptor.refreshWithServer() }
    ) {
        self.currentAccessToken = currentAccessToken
        self.performRefresh = performRefresh
    }

    /// Call before retrying a 401 response. `rejectedToken` = the access token
    /// the 401'd request was sent with. Refreshes once, coalescing concurrent
    /// callers; throws the refresh failure to every one of them.
    func refreshIfNeeded(rejectedToken: String? = nil) async throws {
        if let inFlight {
            return try await inFlight.value
        }
        if let rejectedToken, let current = currentAccessToken(), current != rejectedToken {
            return // already rotated by another request
        }
        let task = Task { try await performRefresh() }
        inFlight = task
        defer { inFlight = nil }
        try await task.value
    }

    /// Outcome of a `/auth/refresh` status: nil = success; `.tokenExpired` ends
    /// the session (401/403); anything else is transient.
    static func failure(forRefreshStatus status: Int) -> APIError? {
        switch status {
        case 200...299: nil
        case 401, 403: .tokenExpired
        default: .serverError(status)
        }
    }

    /// The real refresh against the API (the default `performRefresh`).
    static func refreshWithServer() async throws {
        guard let refreshToken = KeychainService.shared.refreshToken else {
            throw APIError.authRequired
        }

        let url = URL(string: "\(APIClient.baseURL)/api/v1/auth/refresh")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["refreshToken": refreshToken])

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError(0)
        }
        if let failure = failure(forRefreshStatus: httpResponse.statusCode) {
            // The refresh token itself is invalid or revoked: the session is over.
            if case .tokenExpired = failure { KeychainService.shared.clearTokens() }
            throw failure
        }

        struct TokenResponse: Decodable {
            let accessToken: String
            let refreshToken: String
        }

        // A captive portal answers 200 with HTML: transient, keep the tokens.
        guard let tokens = try? JSONDecoder().decode(TokenResponse.self, from: data) else {
            throw APIError.serverError(httpResponse.statusCode)
        }
        KeychainService.shared.accessToken = tokens.accessToken
        KeychainService.shared.refreshToken = tokens.refreshToken
    }
}
