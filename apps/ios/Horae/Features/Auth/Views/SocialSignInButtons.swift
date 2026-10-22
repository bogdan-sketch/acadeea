import SwiftUI
import AuthenticationServices

/// "Continuă cu Apple / Google" under the password form (login, and ready
/// for an invite-accept flow — pass a view model created with an
/// `invitationToken`).
///
/// - Apple: `AppleIDButton`, our own button in Romanian that runs the same
///   `ASAuthorizationController` flow as `SignInWithAppleButton` (the system
///   button follows the device language → "Continue with Apple" on an English
///   iPhone next to Romanian text). Black on light schemes, white on dark,
///   Apple logo + label, as the Apple guidelines ask.
/// - Google is shown ONLY when `GoogleSignInManager.isConfigured`.
struct SocialSignInButtons: View {
    var viewModel: SocialSignInViewModel

    var body: some View {
        // Standalone (on-prem) builds sign in with email + password only — their
        // bundle id isn't registered for Apple/Google sign-in on the API.
        if !AppConfig.isStandalone {
            buttons
        }
    }

    private var buttons: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            HStack(spacing: AppTheme.Spacing.md) {
                divider
                Text("sau")
                    .font(AppFont.body(12, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                divider
            }
            .accessibilityHidden(true)

            AppleIDButton(
                title: "Continuă cu Apple",
                configure: { viewModel.configureAppleRequest($0) },
                completion: { viewModel.handleAppleCompletion($0) }
            )

            if GoogleSignInManager.isConfigured {
                Button {
                    viewModel.signInWithGoogle()
                } label: {
                    HStack(spacing: AppTheme.Spacing.sm) {
                        Image("GoogleLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 18, height: 18)
                            .accessibilityHidden(true)
                        Text("Continuă cu Google")
                            .font(AppFont.body(15, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity, minHeight: AuthMetrics.control)
                    .foregroundStyle(AppTheme.Colors.label)
                    .background(AppTheme.Colors.card, in: AuthMetrics.shape)
                    .overlay(AuthMetrics.shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
                    .contentShape(AuthMetrics.shape)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Continuă cu Google")
            }

            if let message = viewModel.errorMessage {
                Text(message)
                    .font(AppFont.body(13))
                    .foregroundStyle(AppTheme.Status.fg(.danger))
                    .multilineTextAlignment(.center)
            }
        }
        .disabled(viewModel.isBusy)
        .overlay {
            if viewModel.isBusy {
                ProgressView()
            }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(AppTheme.Colors.border)
            .frame(height: 1)
    }
}

// MARK: - Shared metrics

/// Control height and shape of the auth screens (42pt, like the web).
enum AuthMetrics {
    static let control: CGFloat = 44
    static let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
}

// MARK: - Apple button (Romanian)

/// Sign in with Apple in Romanian: same request/completion contract as
/// `SignInWithAppleButton`, so the view models stay unchanged.
struct AppleIDButton: View {
    let title: String
    let configure: (ASAuthorizationAppleIDRequest) -> Void
    let completion: (Result<ASAuthorization, Error>) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var coordinator = AppleIDCoordinator()

    var body: some View {
        let dark = colorScheme == .dark
        Button {
            coordinator.start(configure: configure, completion: completion)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "apple.logo")
                    .font(.system(size: 17, weight: .semibold))
                    .accessibilityHidden(true)
                Text(title)
                    .font(AppFont.body(15, weight: .semibold))
            }
            .frame(maxWidth: .infinity, minHeight: AuthMetrics.control)
            .foregroundStyle(dark ? Color.black : Color.white)
            .background(dark ? Color.white : Color.black, in: AuthMetrics.shape)
            .contentShape(AuthMetrics.shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

/// Runs one `ASAuthorizationController` request and forwards the result.
@MainActor
final class AppleIDCoordinator: NSObject, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    private var completion: ((Result<ASAuthorization, Error>) -> Void)?

    func start(
        configure: (ASAuthorizationAppleIDRequest) -> Void,
        completion: @escaping (Result<ASAuthorization, Error>) -> Void
    ) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        configure(request)
        self.completion = completion
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        MainActor.assumeIsolated {
            completion?(.success(authorization))
            completion = nil
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        MainActor.assumeIsolated {
            completion?(.failure(error))
            completion = nil
        }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}

#Preview("SocialSignInButtons") {
    SocialSignInButtons(viewModel: SocialSignInViewModel())
        .padding()
        .background(AppTheme.Colors.appBackground)
}
