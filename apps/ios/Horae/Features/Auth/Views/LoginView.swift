import SwiftUI

/// Login on the scheme's paper (redesign): logo, Fraunces title, DM Sans
/// labels above 44pt fields, one primary button, then Apple / Google.
/// Shown by `HoraeApp` once the splash fades out, and right after a logout.
struct LoginView: View {
    @State private var viewModel = LoginViewModel()
    @State private var socialViewModel = SocialSignInViewModel()
    @State private var showPassword = false
    @State private var showForgotSheet = false
    @FocusState private var focus: Field?
    @Environment(\.colorScheme) private var colorScheme
    private var branding: BrandingManager { .shared }

    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xl) {
                header
                form
                SocialSignInButtons(viewModel: socialViewModel)
            }
            .padding(.horizontal, AppTheme.Spacing.xl)
            .padding(.vertical, 48)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .sheet(isPresented: $showForgotSheet) {
            ForgotPasswordSheet(email: viewModel.email)
        }
    }

    // MARK: - Pieces

    private var header: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Group {
                if let logo = branding.logo(for: colorScheme) {
                    logo
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 200, maxHeight: 56, alignment: .leading)
                } else {
                    HoraeWordmark(size: 36)
                }
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text("Bine ai revenit")
                    .font(AppFont.title(32, relativeTo: .largeTitle))
                    .tracking(-0.4)
                    .foregroundStyle(AppTheme.Colors.label)
                    .accessibilityAddTraits(.isHeader)
                Text("Toată producția ta, într-un singur loc.")
                    .font(AppFont.body(15))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        }
        .padding(.top, AppTheme.Spacing.xl)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
            AuthField(label: "Email") {
                TextField("", text: $viewModel.email, prompt: AuthPrompt.email)
                    .accessibilityLabel("Email")
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($focus, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focus = .password }
            }

            AuthField(label: "Parolă") {
                HStack(spacing: AppTheme.Spacing.sm) {
                    Group {
                        if showPassword {
                            TextField("", text: $viewModel.password, prompt: AuthPrompt.password)
                        } else {
                            SecureField("", text: $viewModel.password, prompt: AuthPrompt.password)
                        }
                    }
                    .textContentType(.password)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($focus, equals: .password)
                    .accessibilityLabel("Parolă")
                    .submitLabel(.go)
                    .onSubmit(submit)

                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, -12)
                    .accessibilityLabel(showPassword ? "Ascunde parola" : "Arată parola")
                    .help(showPassword ? "Ascunde parola" : "Arată parola")
                }
            }

            Button("Ai uitat parola?") { showForgotSheet = true }
                .font(AppFont.body(14, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.primaryText)
                .frame(minHeight: 44)
                .frame(maxWidth: .infinity, alignment: .trailing)

            if let errorMessage = viewModel.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(AppFont.body(13, weight: .medium))
                    .foregroundStyle(AppTheme.Status.fg(.danger))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            AuthPrimaryButton(
                title: "Autentificare",
                isEnabled: viewModel.isFormValid,
                isLoading: viewModel.isLoading,
                action: submit
            )
        }
    }

    private func submit() {
        guard viewModel.isFormValid, !viewModel.isLoading else { return }
        focus = nil
        Task { await viewModel.login() }
    }
}

// MARK: - Auth building blocks

/// Field placeholders in the muted ink (verbatim: an email-looking
/// placeholder would otherwise be detected and tinted as a link).
enum AuthPrompt {
    static var email: Text {
        Text(verbatim: "nume@firma.ro").foregroundStyle(AppTheme.Colors.secondaryLabel)
    }
    static var password: Text {
        Text("Parola ta").foregroundStyle(AppTheme.Colors.secondaryLabel)
    }
}

/// Label above a 44pt field on the card colour with a 1pt border.
struct AuthField<Content: View>: View {
    let label: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(AppFont.body(13, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            content()
                .font(AppFont.body(16))
                .foregroundStyle(AppTheme.Colors.label)
                .padding(.horizontal, 14)
                .frame(minHeight: AuthMetrics.control)
                .background(AppTheme.Colors.card, in: AuthMetrics.shape)
                .overlay(AuthMetrics.shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
        }
    }
}

/// Primary button of the auth screens. Disabled reads clearly as disabled:
/// outlined, muted text — not a faded accent.
struct AuthPrimaryButton: View {
    let title: String
    let isEnabled: Bool
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView().tint(AppTheme.Colors.onPrimary)
                } else {
                    Text(title).font(AppFont.body(16, weight: .bold))
                }
            }
            .frame(maxWidth: .infinity, minHeight: AuthMetrics.control)
            .foregroundStyle(isEnabled ? AppTheme.Colors.onPrimary : AppTheme.Colors.secondaryLabel)
            .background(isEnabled ? AppTheme.Colors.primary : AppTheme.Colors.card, in: AuthMetrics.shape)
            .overlay(AuthMetrics.shape.strokeBorder(isEnabled ? .clear : AppTheme.Colors.border, lineWidth: 1))
            .contentShape(AuthMetrics.shape)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
        .sensoryFeedback(.impact(weight: .light), trigger: isLoading) { _, new in new }
    }
}

/// Request a password-reset link by email. The emailed link opens the web
/// reset page; no account enumeration (always shows success). Internal so the
/// splash (`SplashView`) can present it too.
struct ForgotPasswordSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email: String
    @State private var isLoading = false
    @State private var sent = false

    init(email: String = "") {
        _email = State(initialValue: email)
    }

    private var isValid: Bool { email.contains("@") }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    if sent {
                        Image(systemName: "envelope.badge")
                            .font(.largeTitle)
                            .foregroundStyle(AppTheme.Status.fg(.ready))
                            .accessibilityHidden(true)
                        Text("Verifică emailul")
                            .font(AppFont.title(24, relativeTo: .title))
                            .foregroundStyle(AppTheme.Colors.label)
                        Text("Dacă există un cont pentru acest email, ai primit un link de resetare a parolei. Linkul expiră în 1 oră.")
                            .font(AppFont.body(15))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        AuthPrimaryButton(title: "Închide", isEnabled: true, isLoading: false) { dismiss() }
                    } else {
                        Text("Introdu adresa de email și îți trimitem un link pentru a-ți seta o parolă nouă.")
                            .font(AppFont.body(15))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        AuthField(label: "Email") {
                            TextField("", text: $email, prompt: AuthPrompt.email)
                                .accessibilityLabel("Email")
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                                .submitLabel(.send)
                                .onSubmit { if isValid { Task { await send() } } }
                        }
                        AuthPrimaryButton(title: "Trimite linkul", isEnabled: isValid, isLoading: isLoading) {
                            Task { await send() }
                        }
                    }
                }
                .padding(AppTheme.Spacing.xl)
            }
            .background(AppTheme.Colors.appBackground.ignoresSafeArea())
            .navigationTitle("Resetare parolă")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anulează") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func send() async {
        isLoading = true
        defer { isLoading = false }
        // Always show success regardless of outcome (no enumeration).
        try? await AuthManager.shared.requestPasswordReset(email: email)
        sent = true
    }
}

#Preview("Login") {
    LoginView()
}
