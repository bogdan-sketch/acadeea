import Foundation
import Observation
import AuthenticationServices

/// State for the "Conturi conectate" screen: which providers are linked, and the
/// link / unlink actions. Linking obtains a FRESH identity token (Apple via the
/// native button, Google via the SDK) and posts it to `POST /auth/link/:provider`;
/// unlinking calls `DELETE /auth/link/:provider`.
@Observable
@MainActor
final class LinkedAccountsViewModel {
    var linkedProviders: [String] = []
    var isLoading = false
    var isBusy = false
    var errorMessage: String?

    private var appleNonce: String?
    private let log = AppLogger.shared

    var appleLinked: Bool { linkedProviders.contains("apple") }
    var googleLinked: Bool { linkedProviders.contains("google") }
    var isGoogleConfigured: Bool { GoogleSignInManager.isConfigured }

    // MARK: - Load

    func load() async {
        // Seed from the cached user immediately, then refresh authoritatively.
        linkedProviders = AuthManager.shared.currentUser?.providers ?? []
        isLoading = true
        defer { isLoading = false }
        do {
            let providers = try await AuthProviderService.shared.fetchLinkedProviders()
            linkedProviders = providers
            AuthManager.shared.updateLinkedProviders(providers)
        } catch {
            log.log("LinkedAccounts.load failed: \(error)", level: .error)
        }
    }

    // MARK: - Unlink guard

    /// Whether unlinking `provider` is allowed from the client. Disabled only when
    /// it is the SOLE provider AND we KNOW there is no password (`hasPassword ==
    /// false`); if password state is unknown we let the server guard it
    /// (`LAST_LOGIN_METHOD`) rather than falsely disabling the button.
    func canUnlink(_ provider: String) -> Bool {
        let others = linkedProviders.filter { $0 != provider }
        if !others.isEmpty { return true }
        return AuthManager.shared.currentUser?.hasPassword ?? true
    }

    // MARK: - Apple link

    func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = SignInNonce.randomNonceString()
        appleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = SignInNonce.sha256(nonce)
    }

    func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let identityToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = "Conectarea Apple a eșuat."
                return
            }
            let rawNonce = appleNonce
            run {
                try await AuthProviderService.shared.link(
                    provider: "apple",
                    identityToken: identityToken,
                    nonce: rawNonce
                )
            }
        case .failure(let error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled { return }
            log.log("Apple link failed: \(error)", level: .error)
            errorMessage = "Conectarea Apple a eșuat."
        }
    }

    // MARK: - Google link

    func linkGoogle() {
        run {
            let idToken = try await GoogleSignInManager.signIn()
            return try await AuthProviderService.shared.link(
                provider: "google",
                identityToken: idToken,
                nonce: nil
            )
        }
    }

    // MARK: - Unlink

    func unlink(_ provider: String) {
        run {
            try await AuthProviderService.shared.unlink(provider: provider)
        }
    }

    // MARK: - Shared runner

    /// Runs a link/unlink call that returns the updated provider list, applies it,
    /// and keeps `AuthManager` in sync. Handles busy/error uniformly.
    private func run(_ operation: @escaping () async throws -> [String]) {
        errorMessage = nil
        isBusy = true
        Task {
            defer { isBusy = false }
            do {
                let providers = try await operation()
                linkedProviders = providers
                AuthManager.shared.updateLinkedProviders(providers)
            } catch let apiError as APIError {
                errorMessage = apiError.errorDescription
            } catch {
                log.log("LinkedAccounts action failed: \(error)", level: .error)
                errorMessage = "Operațiunea a eșuat. Încearcă din nou."
            }
        }
    }
}
