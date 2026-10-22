import Foundation

/// Runtime configuration for observability SDKs (Sentry + PostHog).
///
/// Values are read from `Bundle.main.infoDictionary`, fed by an xcconfig
/// (`Config/Observability.xcconfig`, git-ignored) → generated Info.plist keys.
/// See `Config/Observability.example.xcconfig` for the placeholders and
/// `apps/ios/CLAUDE.md` for where to put real values.
///
/// Missing / empty value ⇒ that SDK stays disabled (complete no-op). No keys
/// are ever hardcoded here.
enum ObservabilityConfig {
    /// Sentry DSN. Empty ⇒ Sentry disabled.
    static let sentryDSN: String = string(for: "SENTRY_DSN")

    /// PostHog project API key. Empty ⇒ PostHog disabled.
    static let posthogKey: String = string(for: "POSTHOG_KEY")

    /// PostHog ingestion host. Falls back to the EU cloud host.
    ///
    /// xcconfig treats `//` as a comment, so the host is stored without a
    /// scheme (e.g. `eu.i.posthog.com`) and `https://` is prepended here. A
    /// value that already carries a scheme is passed through unchanged.
    static let posthogHost: String = {
        let host = string(for: "POSTHOG_HOST")
        guard !host.isEmpty else { return "https://eu.i.posthog.com" }
        if host.hasPrefix("http://") || host.hasPrefix("https://") { return host }
        return "https://\(host)"
    }()

    /// True when a non-empty Sentry DSN is configured.
    static var isSentryEnabled: Bool { !sentryDSN.isEmpty }

    /// True when a non-empty PostHog key is configured.
    static var isPostHogEnabled: Bool { !posthogKey.isEmpty }

    // MARK: - Plist reader

    /// Reads a String from Info.plist, trimming whitespace. Returns "" if absent.
    private static func string(for key: String) -> String {
        let raw = Bundle.main.infoDictionary?[key] as? String ?? ""
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
