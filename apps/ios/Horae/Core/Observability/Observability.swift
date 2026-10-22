import Foundation
import PostHog
import Sentry
import SwiftUI

/// Single entry point for app observability: Sentry (errors / crash / perf) and
/// PostHog (product analytics).
///
/// Keys come from `ObservabilityConfig` (Info.plist ← xcconfig). Each SDK is
/// guarded: an empty DSN / key means that SDK never initialises and every call
/// here is a safe no-op. Nothing is hardcoded.
enum Observability {

    /// Initialise the SDKs. Call once, as early as possible in app launch.
    static func start() {
        startSentry()
        startPostHog()
    }

    // MARK: - Sentry

    private static func startSentry() {
        guard ObservabilityConfig.isSentryEnabled else {
            AppLogger.shared.log("Observability: Sentry disabled (no DSN)")
            return
        }

        SentrySDK.start { options in
            options.dsn = ObservabilityConfig.sentryDSN
            options.environment = AppConfig.environment
            options.tracesSampleRate = 0.1
            #if DEBUG
            options.debug = false
            #endif
        }
        AppLogger.shared.log("Observability: Sentry started (env=\(AppConfig.environment))")
    }

    // MARK: - PostHog

    private static func startPostHog() {
        guard ObservabilityConfig.isPostHogEnabled else {
            AppLogger.shared.log("Observability: PostHog disabled (no key)")
            return
        }

        let config = PostHogConfig(
            apiKey: ObservabilityConfig.posthogKey,
            host: ObservabilityConfig.posthogHost
        )
        // Automatic screen-view + interaction capture (UIKit/SwiftUI bridge).
        config.captureScreenViews = true
        config.captureApplicationLifecycleEvents = true

        PostHogSDK.shared.setup(config)
        AppLogger.shared.log("Observability: PostHog started (host=\(ObservabilityConfig.posthogHost))")
    }

    // MARK: - Identity

    /// Associate the current session with a user. No-op when SDKs are disabled.
    static func identify(userId: String, email: String, role: String) {
        if ObservabilityConfig.isPostHogEnabled {
            PostHogSDK.shared.identify(
                userId,
                userProperties: ["email": email, "role": role]
            )
        }
        if ObservabilityConfig.isSentryEnabled {
            let user = Sentry.User(userId: userId)
            user.email = email
            user.data = ["role": role]
            SentrySDK.setUser(user)
        }
    }

    /// Clear the current user on logout. No-op when SDKs are disabled.
    static func clearIdentity() {
        if ObservabilityConfig.isPostHogEnabled {
            PostHogSDK.shared.reset()
        }
        if ObservabilityConfig.isSentryEnabled {
            SentrySDK.setUser(nil)
        }
    }

    // MARK: - Screen tracking

    /// Manually record a screen view. PostHog autocapture covers most cases;
    /// use this for screens it can't infer (e.g. a Route-driven destination).
    static func track(screen name: String) {
        guard ObservabilityConfig.isPostHogEnabled else { return }
        PostHogSDK.shared.screen(name)
    }
}

// MARK: - Screen-tracking modifier

private struct TrackScreenModifier: ViewModifier {
    let name: String
    func body(content: Content) -> some View {
        content.onAppear { Observability.track(screen: name) }
    }
}

extension View {
    /// Record a PostHog screen view when this view appears. No-op when
    /// PostHog is disabled. Used at the Route resolver to name SwiftUI
    /// `NavigationStack` destinations that autocapture can't infer.
    func trackScreen(_ name: String) -> some View {
        modifier(TrackScreenModifier(name: name))
    }
}
