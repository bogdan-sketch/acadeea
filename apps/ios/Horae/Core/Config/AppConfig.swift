import Foundation

/// Build-environment configuration.
///
/// Selected at compile time via the `API_TEST` Swift active-compilation condition,
/// set per build configuration in `project.yml`:
///   - Horae      (prod) → Debug / Release            → hits api.horae.ca
///   - Horae Test (test) → Debug-Test / Release-Test  → hits api-test.horae.ca  (defines API_TEST)
///
/// The two apps ship with different bundle ids + display names, so they install side by side.
///
/// Standalone builds (one organization on its own server, e.g. Acadeea on
/// api.acadeea.ro) set the `API_BASE_URL` + `BRAND_NAME` Info.plist keys from
/// build settings in project.yml; empty = the Horae defaults below.
enum AppConfig {
    private static func infoString(_ key: String) -> String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !value.isEmpty, !value.hasPrefix("$(") else { return nil }
        return value
    }

    #if API_TEST
    static let defaultBaseURL = infoString("API_BASE_URL") ?? "https://api-test.horae.ca"
    static let environment = "test"
    #else
    static let defaultBaseURL = infoString("API_BASE_URL") ?? "https://api.horae.ca"
    static let environment = "prod"
    #endif

    /// Product name in the UI ("Horae", or the org's own name on a standalone build).
    static let brandName = infoString("BRAND_NAME") ?? "Horae"
    /// The one organization of a standalone build (public branding is fetched
    /// for it before login, so a fresh install already shows its logo + colours).
    static let standaloneOrgSlug = infoString("ORG_SLUG")
    /// True on a standalone (single-organization, on-prem) build.
    static let isStandalone = infoString("BRAND_NAME") != nil

    /// Debug-only override for Simulator runs against a local API:
    /// `SIMCTL_CHILD_HORAE_API_URL=http://localhost:3077 xcrun simctl launch booted <bundle id>`.
    /// Release builds ignore it.
    static let baseURL: String = {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["HORAE_API_URL"],
           !override.isEmpty {
            return override
        }
        #endif
        return defaultBaseURL
    }()

    static var serverDisplay: String {
        baseURL.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    /// True when running the Horae Test (test) build. Use to show a test badge, etc.
    static var isTest: Bool { environment == "test" }
}
