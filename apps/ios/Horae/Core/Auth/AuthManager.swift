import Foundation
import Observation

/// Manages authentication state: login, logout, token refresh, session restore.
@Observable
final class AuthManager {
    static let shared = AuthManager()

    var isAuthenticated = false
    var currentUser: AuthUser?
    var isLoading = false
    var error: APIError?

    private let keychain = KeychainService.shared
    private let log = AppLogger.shared
    private var baseURL: String { APIClient.baseURL }

    private init() {}

    /// Current user's permissions from login/me response.
    var permissions: [PermissionRule] {
        currentUser?.permissions ?? []
    }

    /// Convenience PermissionManager for current user.
    var permissionManager: PermissionManager {
        PermissionManager(permissions: permissions)
    }

    // MARK: - Session Restore

    /// Attempt to restore session from Keychain on app launch.
    @MainActor
    func restoreSession() async {
        log.log("restoreSession: hasTokens=\(keychain.hasTokens)")
        guard keychain.hasTokens else {
            log.log("restoreSession: no tokens, skipping")
            return
        }

        isLoading = true
        defer { isLoading = false }
        if await attemptRestore() { return }
        // Transient failure (offline, 429, 5xx): the tokens were kept. Keep
        // trying quietly; the app switches from LoginView to the tabs as soon
        // as the API answers, without asking for the password again.
        Task { @MainActor in
            for delay in [2, 5, 10, 20, 30] {
                try? await Task.sleep(for: .seconds(delay))
                guard !isAuthenticated, keychain.hasTokens else { return }
                if await attemptRestore() { return }
            }
        }
    }

    /// One `/auth/me` round. true when done (signed in, or the session is
    /// definitively over); false after a transient failure worth retrying.
    @MainActor
    private func attemptRestore() async -> Bool {
        do {
            let user = try await fetchCurrentUser()
            currentUser = user
            isAuthenticated = true
            identifyForObservability(user)
            if let org = user.organization {
                BrandingManager.shared.apply(org)
            }
            log.log("restoreSession: success, user=\(user.email)")
            return true
        } catch {
            log.log("restoreSession: failed — \(error)", level: .error)
            // Only a definitive auth answer ends the session. Opening the app
            // offline / on a 429 or 5xx used to wipe the tokens and force a new
            // login; now they stay.
            // isAuthenticated / currentUser are untouched: still false/nil before
            // a restore, and a background retry must not undo a manual login.
            let over = Self.endsSession(error)
            if over { keychain.clearTokens() }
            return over
        }
    }

    /// True when `error` means the session is really over (refresh token
    /// rejected, or `/auth/me` answered 401/403); false for transient failures
    /// (offline, timeouts, 429, 5xx).
    static func endsSession(_ error: Error) -> Bool {
        switch error as? APIError {
        case .tokenExpired, .tokenRevoked, .authRequired: true
        default: false
        }
    }

    // MARK: - Login

    @MainActor
    func login(email: String, password: String) async throws {
        log.log("login: email=\(email)")
        // NOTE: don't toggle the app-level `isLoading` here — HoraeApp swaps
        // LoginView for a splash while it's true, which remounts LoginView on
        // failure and wipes the error message. The login button drives its own
        // spinner via LoginViewModel.isLoading.
        error = nil

        let url = URL(string: "\(baseURL)/api/v1/auth/login")!
        log.log("login: POST \(url.absoluteString)")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = LoginRequest(email: email, password: password)
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            log.log("login: not HTTPURLResponse", level: .error)
            throw APIError.unknown("Invalid response")
        }

        log.log("login: status=\(httpResponse.statusCode)")

        guard httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
            let responseBody = String(data: data, encoding: .utf8) ?? "(non-utf8)"
            log.log("login: error body=\(responseBody)", level: .error)

            // Try to parse error code from response
            let errorBody = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            log.log("login: errorCode=\(errorBody?.errorCode ?? "nil"), message=\(errorBody?.message ?? "nil")", level: .error)

            let apiError: APIError
            if let code = errorBody?.errorCode, code != "UNAUTHORIZED" {
                apiError = APIError.from(code: code)
            } else if httpResponse.statusCode == 401 {
                // A failed login with no specific code = wrong email/password.
                apiError = .invalidCredentials
            } else {
                apiError = APIError.from(statusCode: httpResponse.statusCode, message: errorBody?.message)
            }
            self.error = apiError
            throw apiError
        }

        let responseBody = String(data: data, encoding: .utf8) ?? "(non-utf8)"
        log.log("login: success body=\(String(responseBody.prefix(200)))")

        let decoder = JSONDecoder()
        let authResponse = try decoder.decode(AuthResponse.self, from: data)
        bootstrap(authResponse)
        log.log("login: authenticated user=\(authResponse.user.email) role=\(authResponse.user.role.slug)")
    }

    // MARK: - Social sign-in (Apple / Google)

    /// Sign in (or invite-sign-up) with Apple. `identityToken` is Apple's signed
    /// `id_token`, `nonce` is the RAW (unhashed) nonce that was SHA-256'd into the
    /// authorization request, and `firstName`/`lastName` are only sent by Apple on
    /// the FIRST authorization (nil afterwards). `invitationToken`, when present,
    /// lets a brand-new invited account be created. Same bootstrap as password login.
    @MainActor
    func signInWithApple(
        identityToken: String,
        nonce: String?,
        firstName: String?,
        lastName: String?,
        invitationToken: String? = nil
    ) async throws {
        let body = AppleSignInRequest(
            identityToken: identityToken,
            nonce: nonce,
            invitationToken: invitationToken,
            firstName: firstName,
            lastName: lastName
        )
        let authResponse = try await performProviderSignIn(
            path: "/api/v1/auth/apple",
            body: body,
            providerDisplayName: "Apple"
        )
        bootstrap(authResponse)
        log.log("signInWithApple: authenticated user=\(authResponse.user.email)")
    }

    /// Sign in (or invite-sign-up) with Google. `identityToken` is Google's
    /// `id_token` from the GoogleSignIn SDK. Same bootstrap as password login.
    @MainActor
    func signInWithGoogle(
        identityToken: String,
        invitationToken: String? = nil
    ) async throws {
        let body = GoogleSignInRequest(
            identityToken: identityToken,
            nonce: nil,
            invitationToken: invitationToken
        )
        let authResponse = try await performProviderSignIn(
            path: "/api/v1/auth/google",
            body: body,
            providerDisplayName: "Google"
        )
        bootstrap(authResponse)
        log.log("signInWithGoogle: authenticated user=\(authResponse.user.email)")
    }

    /// POSTs a provider sign-in body to a PUBLIC auth endpoint and decodes the
    /// shared `AuthResponse`. Maps `401 PROVIDER_NO_ACCOUNT` to a provider-specific
    /// Romanian error so the login screen can explain that an invitation is needed.
    @MainActor
    private func performProviderSignIn<Body: Encodable>(
        path: String,
        body: Body,
        providerDisplayName: String
    ) async throws -> AuthResponse {
        error = nil
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        log.log("providerSignIn \(path): status=\(http.statusCode)")

        guard http.statusCode == 200 || http.statusCode == 201 else {
            let errorBody = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            let apiError: APIError
            if errorBody?.errorCode == "PROVIDER_NO_ACCOUNT" {
                apiError = .providerNoAccount(provider: providerDisplayName)
            } else if let code = errorBody?.errorCode {
                apiError = APIError.from(code: code)
            } else {
                apiError = APIError.from(statusCode: http.statusCode, message: errorBody?.message)
            }
            self.error = apiError
            throw apiError
        }

        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    /// Shared session bootstrap used by password login AND social sign-in: store
    /// tokens, set the current user, flip `isAuthenticated`, wire observability,
    /// and apply the org's white-label branding.
    @MainActor
    private func bootstrap(_ authResponse: AuthResponse) {
        keychain.accessToken = authResponse.accessToken
        keychain.refreshToken = authResponse.refreshToken
        currentUser = authResponse.user
        isAuthenticated = true
        identifyForObservability(authResponse.user)

        // Apply the org's white-label branding right after login so the accent
        // tint / logos / app icon switch immediately (the launch-time
        // BrandingManager.load() ran pre-auth and had no token). Prefer the
        // top-level `organization`, fall back to the nested user one.
        if let org = authResponse.organization ?? authResponse.user.organization {
            BrandingManager.shared.apply(org)
        }
    }

    /// Replace the current user's linked-provider list in place (after link/unlink).
    @MainActor
    func updateAvatarUrl(_ url: String?) {
        currentUser?.avatarUrl = url
    }

    @MainActor
    func updateLinkedProviders(_ providers: [String]) {
        currentUser?.linkedProviders = providers
    }

    // MARK: - Password reset

    /// Request a password-reset email. Always resolves (no account enumeration);
    /// the emailed link opens the web reset page.
    func requestPasswordReset(email: String) async throws {
        let url = URL(string: "\(baseURL)/api/v1/auth/forgot-password")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email])
        _ = try await URLSession.shared.data(for: request)
    }

    // MARK: - Logout

    @MainActor
    func logout() {
        log.log("logout")

        // Capture tokens before clearing
        let refreshToken = keychain.refreshToken
        let token = keychain.accessToken

        // Clear state immediately — UI switches to LoginView
        keychain.clearTokens()
        isAuthenticated = false
        currentUser = nil
        Observability.clearIdentity()
        // Tenant branding deliberately SURVIVES logout: the device stays on the
        // last organization's brand (app icon, accent, name, login logo) until a
        // user from a DIFFERENT org signs in. Only a fresh install is neutral.

        // Fire-and-forget: notify server (non-blocking)
        if let refreshToken, let token {
            let url = URL(string: "\(baseURL)/api/v1/auth/logout")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.httpBody = try? JSONEncoder().encode(["refreshToken": refreshToken])
            Task { _ = try? await URLSession.shared.data(for: request) }
        }

        log.log("logout: done")
    }

    // MARK: - Account Deletion (self-service)

    /// `DELETE /api/v1/auth/account` — permanently deletes the current user's own
    /// account after confirming their password. The server anonymizes PII, revokes
    /// every session and unlinks social identities. On success we log out locally
    /// (same path as "Deconectare"), returning the app to `LoginView`.
    ///
    /// Throws `APIError` on failure (e.g. `INVALID_PASSWORD`, `LAST_ACTIVE_ADMIN`)
    /// so the caller can surface the localized message; the session is left intact.
    @MainActor
    func deleteAccount(password: String) async throws {
        log.log("deleteAccount: requested")

        let url = URL(string: "\(baseURL)/api/v1/auth/account")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(
            "Bearer \(keychain.accessToken ?? "")", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(["password": password])

        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard (200...299).contains(http.statusCode) else {
            throw APIError.from(data: data, statusCode: http.statusCode)
        }

        log.log("deleteAccount: success — logging out")
        WebSocketManager.shared.disconnect()
        logout()
    }

    // MARK: - Observability identity

    /// Tie the authenticated user to Sentry + PostHog. No-op when disabled.
    private func identifyForObservability(_ user: AuthUser) {
        Observability.identify(
            userId: user.id,
            email: user.email,
            role: user.role.slug
        )
    }

    // MARK: - Fetch Current User

    private func fetchCurrentUser() async throws -> AuthUser {
        let url = URL(string: "\(baseURL)/api/v1/auth/me")!
        log.log("fetchCurrentUser: GET \(url.absoluteString)")

        var request = URLRequest(url: url)
        request.setValue("Bearer \(keychain.accessToken ?? "")", forHTTPHeaderField: "Authorization")

        let (data, response) = try await APIClient.authenticatedData(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError(0)
        }

        log.log("fetchCurrentUser: status=\(httpResponse.statusCode)")

        guard httpResponse.statusCode == 200 else {
            let body = String(data: data, encoding: .utf8) ?? ""
            log.log("fetchCurrentUser: error body=\(body)", level: .error)
            // 401/403 = the session is gone; 429/5xx = transient, keep it.
            switch httpResponse.statusCode {
            case 401, 403: throw APIError.authRequired
            default: throw APIError.serverError(httpResponse.statusCode)
            }
        }

        return try JSONDecoder().decode(AuthUser.self, from: data)
    }
}

// MARK: - DTOs

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

/// Body for `POST /auth/apple`. `nil` fields are omitted by the encoder default,
/// but the backend also tolerates explicit nulls.
struct AppleSignInRequest: Encodable {
    let identityToken: String
    let nonce: String?
    let invitationToken: String?
    let firstName: String?
    let lastName: String?
}

/// Body for `POST /auth/google`.
struct GoogleSignInRequest: Encodable {
    let identityToken: String
    let nonce: String?
    let invitationToken: String?
}

/// Body for `POST /auth/link/:provider` (Apple carries a nonce; Google doesn't).
struct LinkProviderRequest: Encodable {
    let identityToken: String
    let nonce: String?
}

/// Response of `POST`/`DELETE /auth/link/:provider`.
struct LinkedProvidersResponse: Decodable {
    let linkedProviders: [String]
}

struct AuthResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let user: AuthUser
    /// White-label branding of the user's organization (new). Optional so older
    /// servers / decoders keep working.
    let organization: OrganizationBranding?
    // `handoffCode` (web-only) is intentionally not decoded — extra keys are ignored.
}

struct AuthUser: Decodable, Equatable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    let role: RoleInfo
    let permissions: [PermissionRule]
    /// Branding of the user's organization, present on `/auth/me` (new). Optional.
    let organization: OrganizationBranding?
    /// Which social providers are linked to this account (`["apple", "google"]`).
    /// Optional/`var` so older servers keep decoding and the Settings screen can
    /// refresh it in place after a link/unlink. Absent ⇒ nil ⇒ treat as `[]`.
    var linkedProviders: [String]?
    /// Whether the account has a password login method. Optional — not all
    /// responses include it; used only to decide if unlinking the last provider
    /// is safe (the real guard is server-side `LAST_LOGIN_METHOD`).
    var hasPassword: Bool?
    /// RELATIVE avatar path (`/api/v1/images/<uuid>`), nil = initials. `var` so
    /// the profile screen can update it in place after upload/delete.
    var avatarUrl: String?

    var fullName: String { "\(firstName) \(lastName)" }

    /// Non-optional accessor for the linked provider list.
    var providers: [String] { linkedProviders ?? [] }

    static func == (lhs: AuthUser, rhs: AuthUser) -> Bool {
        lhs.id == rhs.id
            && lhs.email == rhs.email
            && lhs.firstName == rhs.firstName
            && lhs.lastName == rhs.lastName
            && lhs.role == rhs.role
            && lhs.permissions == rhs.permissions
            && lhs.avatarUrl == rhs.avatarUrl
    }
}

/// For parsing error responses from the API.
struct APIErrorResponse: Decodable {
    let statusCode: Int?
    let message: String?
    let errorCode: String?
    let error: String?
}
