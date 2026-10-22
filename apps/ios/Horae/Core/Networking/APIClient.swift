import Foundation

/// Central API configuration.
/// When OpenAPI spec is exported and codegen runs, this will wrap the generated Client.
/// For now, provides base URL used by all service classes.
enum APIClient {
    static let baseURL = AppConfig.baseURL

    /// Shared JSON decoder that handles ISO 8601 dates with fractional seconds.
    /// Prisma/PostgreSQL returns dates like `2024-01-15T10:30:00.123Z` which
    /// the standard `.iso8601` strategy cannot parse.
    /// Perform authenticated request with automatic 401 → token refresh → retry.
    static func authenticatedData(for request: URLRequest) async throws -> (Data, URLResponse) {
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 401 else {
            return (data, response)
        }

        // 401 — refresh (shared single flight). Pass the token this request was
        // sent with, so a late 401 after another request already rotated it
        // just retries instead of rotating again.
        let sentToken = request.value(forHTTPHeaderField: "Authorization")
            .map { $0.replacingOccurrences(of: "Bearer ", with: "") }
        do {
            try await AuthInterceptor.shared.refreshIfNeeded(rejectedToken: sentToken)
        } catch APIError.tokenExpired {
            // Refresh token invalid/revoked — force logout → LoginView
            await AuthManager.shared.logout()
            throw APIError.tokenExpired
        } catch APIError.authRequired {
            await AuthManager.shared.logout()
            throw APIError.authRequired
        } catch {
            // Transient refresh failure (429/5xx/offline): keep the session.
            throw error
        }

        // Retry with new token
        var retry = request
        if let token = KeychainService.shared.accessToken {
            retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (retryData, retryResponse) = try await URLSession.shared.data(for: retry)

        // If retry also 401, token is invalid — force logout
        if let retryHttp = retryResponse as? HTTPURLResponse, retryHttp.statusCode == 401 {
            await AuthManager.shared.logout()
            throw APIError.tokenExpired
        }

        return (retryData, retryResponse)
    }

    /// Shared JSON decoder that handles ISO 8601 dates with fractional seconds.
    /// Prisma/PostgreSQL returns dates like `2024-01-15T10:30:00.123Z` which
    /// the standard `.iso8601` strategy cannot parse.
    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            // Try with fractional seconds first (most common from Prisma)
            let withFrac = ISO8601DateFormatter()
            withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = withFrac.date(from: string) { return date }

            // Fallback: without fractional seconds
            let withoutFrac = ISO8601DateFormatter()
            withoutFrac.formatOptions = [.withInternetDateTime]
            if let date = withoutFrac.date(from: string) { return date }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(string)"
            )
        }
        return decoder
    }
}
