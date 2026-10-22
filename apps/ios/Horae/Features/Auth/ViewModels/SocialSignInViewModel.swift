import Foundation
import Observation
import AuthenticationServices
import GoogleSignIn

/// Drives the "Continuă cu Apple / Google" buttons. On success it delegates to
/// `AuthManager`, which bootstraps the session exactly like password login — the
/// app then navigates in automatically (`HoraeApp` observes `isAuthenticated`).
///
/// `invitationToken` is passed through to the backend so the SAME buttons work as
/// the invite-accept / sign-up path when an invitation is being redeemed.
@Observable
@MainActor
final class SocialSignInViewModel {
    var errorMessage: String?
    var isBusy = false

    /// Present only on an invite-acceptance flow; nil on the plain login screen.
    let invitationToken: String?

    /// RAW nonce for the in-flight Apple request (hashed form goes in the request).
    private var currentNonce: String?
    private let log = AppLogger.shared

    init(invitationToken: String? = nil) {
        self.invitationToken = invitationToken
    }

    // MARK: - Apple

    /// Configure the Apple authorization request: request name+email and attach
    /// the SHA-256 of a fresh random nonce. Returns nothing — mutates the request.
    func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = SignInNonce.randomNonceString()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = SignInNonce.sha256(nonce)
    }

    /// Handle the SwiftUI `SignInWithAppleButton` completion.
    func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let identityToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = "Autentificarea Apple a eșuat."
                return
            }
            let rawNonce = currentNonce
            // Apple only returns the name on the FIRST authorization.
            let firstName = credential.fullName?.givenName
            let lastName = credential.fullName?.familyName

            run {
                try await AuthManager.shared.signInWithApple(
                    identityToken: identityToken,
                    nonce: rawNonce,
                    firstName: firstName,
                    lastName: lastName,
                    invitationToken: self.invitationToken
                )
            }

        case .failure(let error):
            // User-cancelled → silent; anything else → surface a message.
            if let authError = error as? ASAuthorizationError, authError.code == .canceled {
                return
            }
            log.log("Apple sign-in failed: \(error)", level: .error)
            errorMessage = "Autentificarea Apple a eșuat."
        }
    }

    // MARK: - Google

    func signInWithGoogle() {
        run {
            let idToken = try await GoogleSignInManager.signIn()
            try await AuthManager.shared.signInWithGoogle(
                identityToken: idToken,
                invitationToken: self.invitationToken
            )
        }
    }

    // MARK: - Shared runner

    /// Runs an async sign-in step with unified busy/error handling. Silently
    /// ignores user-cancellation from the Google SDK.
    private func run(_ operation: @escaping () async throws -> Void) {
        errorMessage = nil
        isBusy = true
        Task {
            defer { isBusy = false }
            do {
                try await operation()
            } catch let apiError as APIError {
                errorMessage = apiError.errorDescription
            } catch let gid as GIDSignInError where gid.code == .canceled {
                // User dismissed the Google sheet — not an error.
            } catch {
                log.log("Social sign-in failed: \(error)", level: .error)
                errorMessage = "Autentificarea a eșuat. Încearcă din nou."
            }
        }
    }
}
