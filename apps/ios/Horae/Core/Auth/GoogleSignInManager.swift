import Foundation
import UIKit
import GoogleSignIn

/// Thin wrapper around the GoogleSignIn SDK.
///
/// CONFIG (owner must provide — see `project.yml` `info:` block):
///   - Info.plist `GIDClientID` = the iOS OAuth client id from Google Cloud
///     Console, e.g. `1234567890-abc.apps.googleusercontent.com`.
///   - Info.plist `CFBundleURLTypes` must include the REVERSED client id as a
///     URL scheme, e.g. `com.googleusercontent.apps.1234567890-abc`.
///
/// Until the real client id is in place, `isConfigured` is `false` and callers
/// (the login + linked-accounts screens) HIDE the Google button — nothing here
/// runs, so the app can never crash on the placeholder.
@MainActor
enum GoogleSignInManager {
    /// The placeholder shipped in `project.yml`. Matching it (or empty) ⇒ unconfigured.
    private static let placeholder = "GOOGLE_IOS_CLIENT_ID_PLACEHOLDER"

    /// The configured iOS OAuth client id, or `nil` when still a placeholder.
    static var clientID: String? {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
            !value.isEmpty,
            value != placeholder
        else { return nil }
        return value
    }

    /// Whether Google Sign-In is usable. Drives button visibility.
    static var isConfigured: Bool { clientID != nil }

    /// Presents Google Sign-In and returns the OIDC `idToken` for `POST /auth/google`.
    /// Throws `APIError.unknown` if unconfigured, cancelled, or no id token is returned.
    static func signIn() async throws -> String {
        guard let clientID else {
            throw APIError.unknown("Google Sign-In nu este configurat.")
        }
        // Configure explicitly from the Info.plist client id (idempotent).
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

        guard let presenter = topViewController() else {
            throw APIError.unknown("Nu s-a putut deschide fereastra Google.")
        }

        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else {
            throw APIError.unknown("Token Google lipsă.")
        }
        return idToken
    }

    /// Forwards the OAuth callback URL to the SDK (called from `.onOpenURL`).
    @discardableResult
    static func handle(_ url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }

    // MARK: - Presenter lookup

    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let root = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
        return root.map(topMost(of:))
    }

    private static func topMost(of controller: UIViewController) -> UIViewController {
        if let presented = controller.presentedViewController {
            return topMost(of: presented)
        }
        if let nav = controller as? UINavigationController, let visible = nav.visibleViewController {
            return topMost(of: visible)
        }
        if let tab = controller as? UITabBarController, let selected = tab.selectedViewController {
            return topMost(of: selected)
        }
        return controller
    }
}
