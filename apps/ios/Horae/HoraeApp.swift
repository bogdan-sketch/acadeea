import SwiftUI
import UserNotifications

@main
struct HoraeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    private var authManager: AuthManager { .shared }
    private var branding: BrandingManager { .shared }
    /// Setări › Temă — one of six colour schemes, persisted as `horae-scheme`.
    private var schemeStore: AppSchemeStore { .shared }
    /// Preloaderul (SplashView) ramane pe ecran un timp FIX, nu doar cat
    /// dureaza restaurarea sesiunii — designerul l-a gandit ca moment de brand.
    /// Dupa formare, daca userul e DELOGAT, splashul se transforma in login
    /// (logoul urca, apare formularul) in loc sa dispara.
    @State private var formationDone = false
    @State private var splashHidden = false
    /// True once the launch-time session restore has finished: a sign-in
    /// after that is a real login (the only moment we may ask for push).
    @State private var restoreFinished = false

    init() {
        // Errors/crash/perf (Sentry) + product analytics (PostHog). Each SDK
        // is a no-op unless its key is configured (see ObservabilityConfig).
        Observability.start()
        AppFont.verifyRegistered()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                if authManager.isAuthenticated {
                    AppTabView()
                } else if formationDone && !AppConfig.isStandalone {
                    // Login on the scheme's paper (redesign), revealed when
                    // the splash fades out — and directly after a logout.
                    LoginView()
                        .transition(.opacity)
                }

                if AppConfig.isStandalone && !authManager.isAuthenticated {
                    // Acadeea: the login lives ON the splash — the logo lifts,
                    // centred, and the form fades in on the accent gradient.
                    SplashView(showLogin: formationDone)
                        .transition(.opacity)
                        .zIndex(1)
                } else if !splashHidden {
                    // Brand moment only; the login form lives in LoginView.
                    SplashView(showLogin: false)
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            // Scheme-aware accent: org accent on Atelier/Cacao, the scheme's own
            // primary on the other four.
            .tint(AppTheme.Colors.primary)
            .environment(schemeStore)
            // Light/dark follows the chosen scheme so system components
            // (sheets, alerts, keyboards, Lists) match its paper tone.
            .preferredColorScheme(schemeStore.scheme.colorScheme)
            // Forward the Google Sign-In OAuth callback URL to the SDK. No-op for
            // any other URL / when Google is unconfigured.
            .onOpenURL { url in
                _ = GoogleSignInManager.handle(url)
            }
            .task {
                await branding.load()
                #if DEBUG
                // Headless login screenshots: HORAE_DEBUG_LOGOUT=1 drops the
                // stored session (the simulator keychain survives uninstall).
                if ProcessInfo.processInfo.environment["HORAE_DEBUG_LOGOUT"] == "1" {
                    KeychainService.shared.clearTokens()
                }
                #endif
                await authManager.restoreSession()
                restoreFinished = true
                if authManager.isAuthenticated {
                    // Restored session: re-register silently if already
                    // allowed; never prompt here.
                    PushRegistration.register(allowPrompt: false)
                }
                #if DEBUG
                // Simulator/UI-test convenience: HORAE_DEBUG_LOGIN="email:password"
                // (set via SIMCTL_CHILD_… or XCUIApplication.launchEnvironment).
                if !authManager.isAuthenticated,
                   let creds = ProcessInfo.processInfo.environment["HORAE_DEBUG_LOGIN"],
                   let sep = creds.firstIndex(of: ":") {
                    try? await authManager.login(
                        email: String(creds[..<sep]), password: String(creds[creds.index(after: sep)...]))
                }
                #endif
                // Daca logoul inca se descarca, asteapta-l putin — fereastra
                // de 2.5s porneste DIN momentul in care apare logoul.
                let grace = Date().addingTimeInterval(1.2)
                while !branding.hasDisplayableLogo, Date() < grace {
                    try? await Task.sleep(for: .milliseconds(100))
                }
                try? await Task.sleep(for: .seconds(2.5))
                withAnimation(.easeInOut(duration: 1)) { formationDone = true }
                finishSplash()
            }
            .onChange(of: authManager.isAuthenticated) { _, authed in
                // Logout needs nothing here: `formationDone` stays true, so
                // LoginView replaces AppTabView directly.
                guard authed, restoreFinished else { return }
                // A real sign-in: ask for push once (remembered), then register
                // so the device token is tied to this session.
                PushRegistration.register(allowPrompt: true)
            }
        }
    }

    /// Dupa formare, splashul se estompeaza si dezvaluie aplicatia sau loginul.
    private func finishSplash() {
        guard formationDone, !splashHidden else { return }
        withAnimation(.easeOut(duration: 0.45)) { splashHidden = true }
    }
}

// MARK: - Push registration

/// Central helper for requesting notification authorization and registering for
/// remote notifications. Registration completes in `AppDelegate`, which hex-
/// encodes the APNs token and uploads it to the device-token endpoint.
enum PushRegistration {
    /// Set once the system prompt has been shown — we never ask twice.
    private static let askedKey = "pushPermissionAsked"

    /// Registers for remote notifications when the user allowed them. The
    /// system prompt appears at most once per install, and only when
    /// `allowPrompt` (right after a real sign-in) and the status is still
    /// undetermined; a decided status (allowed or denied) is respected.
    static func register(allowPrompt: Bool) {
        #if DEBUG
        // Headless screenshot runs: no system prompt over the screen.
        if DebugLaunchRoute.isActive { return }
        #endif
        Task {
            let center = UNUserNotificationCenter.current()
            let status = await center.notificationSettings().authorizationStatus
            switch status {
            case .authorized, .provisional, .ephemeral:
                await registerRemote()
            case .notDetermined:
                let defaults = UserDefaults.standard
                guard allowPrompt, !defaults.bool(forKey: askedKey) else { return }
                defaults.set(true, forKey: askedKey)
                let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
                if granted { await registerRemote() }
            case .denied:
                return
            @unknown default:
                return
            }
        }
    }

    @MainActor
    private static func registerRemote() {
        UIApplication.shared.registerForRemoteNotifications()
    }
}

/// Minimal app delegate — bridges the APNs registration callbacks that SwiftUI's
/// `App` lifecycle does not expose.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        AppLogger.shared.log("push: registered device token \(token.prefix(12))…")
        Task {
            do {
                try await NotificationService.shared.uploadDeviceToken(token)
                AppLogger.shared.log("push: device token uploaded")
            } catch {
                AppLogger.shared.log("push: device token upload failed — \(error)", level: .error)
            }
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        AppLogger.shared.log("push: remote registration failed — \(error)", level: .error)
    }
}
