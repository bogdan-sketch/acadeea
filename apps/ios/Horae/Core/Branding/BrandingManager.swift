import SwiftUI
import UIKit

// MARK: - Branding tokens (Organization.brandingTokens)

/// One scheme's color overrides — mirrors the API whitelist
/// (BRANDING_COLOR_KEYS in organization.service.ts). All optional; a missing
/// key falls back to the app default for that variable.
struct BrandingColorSet: Codable, Equatable {
    var accent: String?
    var accentPressed: String?
    var textPrimary: String?
    var textSecondary: String?
    var background: String?
    var card: String?
    var separator: String?
    var secondary: String?
    var tertiary: String?

    var isEmpty: Bool {
        [accent, accentPressed, textPrimary, textSecondary, background,
         card, separator, secondary, tertiary].allSatisfy { $0 == nil }
    }

    /// Values from `self`, holes filled from `other` (legacy flat set).
    func filling(from other: BrandingColorSet) -> BrandingColorSet {
        BrandingColorSet(
            accent: accent ?? other.accent,
            accentPressed: accentPressed ?? other.accentPressed,
            textPrimary: textPrimary ?? other.textPrimary,
            textSecondary: textSecondary ?? other.textSecondary,
            background: background ?? other.background,
            card: card ?? other.card,
            separator: separator ?? other.separator,
            secondary: secondary ?? other.secondary,
            tertiary: tertiary ?? other.tertiary
        )
    }
}

/// The `ios` platform block: `{light?, dark?}` — LEGACY payloads may carry the
/// colors flat on the block itself; those apply to both schemes.
struct BrandingPlatformTokens: Codable, Equatable {
    var light: BrandingColorSet?
    var dark: BrandingColorSet?

    private enum CodingKeys: String, CodingKey { case light, dark }

    init(light: BrandingColorSet? = nil, dark: BrandingColorSet? = nil) {
        self.light = light
        self.dark = dark
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let light = try container.decodeIfPresent(BrandingColorSet.self, forKey: .light)
        let dark = try container.decodeIfPresent(BrandingColorSet.self, forKey: .dark)
        // Legacy flat colors sit directly on the platform object.
        let flat = (try? BrandingColorSet(from: decoder)) ?? BrandingColorSet()
        self.light = (light ?? BrandingColorSet()).filling(from: flat)
        self.dark = (dark ?? BrandingColorSet()).filling(from: flat)
        if self.light?.isEmpty == true { self.light = nil }
        if self.dark?.isEmpty == true { self.dark = nil }
    }

    func color(for scheme: ColorScheme) -> BrandingColorSet? {
        scheme == .dark ? dark : light
    }
}

@Observable
final class BrandingManager {
    static let shared = BrandingManager()

    /// Neutral fallback brand shown pre-login / before an org is fetched.
    var organizationName: String = AppConfig.brandName
    var slug: String?
    var accentColorHex: String = "#D4527B"
    /// Second data-series/highlight color (nil = derived from the accent).
    var secondaryColorHex: String?
    /// Third data-series color (nil = derived from the accent).
    var tertiaryColorHex: String?
    /// White-label font key: "inter" | "manrope" | "lora" | "poppins" | "system" | nil.
    /// See `brandFontName` for how it maps to an actual font.
    var fontFamily: String?
    var logoUrl: String?
    var logoLightUrl: String?
    var logoDarkUrl: String?
    var appLogoLightUrl: String?
    var appLogoDarkUrl: String?
    var appIconName: String?
    /// Admin-set location every operation starts on (Stoc › Locații › Implicită); nil = none.
    var defaultLocationId: String? = UserDefaults.standard.string(forKey: "branding.defaultLocationId")
    /// Feature switch: nutrition values UI (per-material + recipe aggregate).
    var nutritionEnabled: Bool = false
    /// Feature switch "Livrări din magazinul online": Woo delivery date/method
    /// (Pickupia), location external id + main unit, delivery-method filters.
    var wooDeliveryEnabled: Bool = false
    /// VAT settings — drive the cu/fara TVA toggle default on price inputs.
    var vatPayer: Bool = true
    var vatRatePercent: Double = 21
    /// Parsed `brandingTokens.ios` — per-scheme variable overrides consumed by
    /// AppTheme. iOS applies ONLY its own platform block.
    var iosTokens: BrandingPlatformTokens?

    /// Bumped on every `apply()` so an in-flight async logo download can detect
    /// it was superseded by a newer apply (e.g. a clear/remove) and NOT re-set
    /// a logo the newer apply already cleared.
    private var applyGeneration = 0

    /// UI accent = the chosen SCHEME's accent (web decision 17.10.2026: only
    /// the six designed schemes, no tenant colour). The org's stored
    /// `accentColorHex` / `iosTokens` are kept for the API round-trip but no
    /// longer colour the app — branding is logo + name only.
    var accentColor: Color { AppSchemeStore.shared.scheme.primary }

    /// Dynamic (light/dark-aware) color for a branding token, falling back to
    /// the given system defaults when the org didn't override that variable.
    func tokenColor(
        _ key: KeyPath<BrandingColorSet, String?>,
        lightFallback: UIColor,
        darkFallback: UIColor
    ) -> Color {
        let tokens = iosTokens
        return Color(UIColor { traits in
            let isDark = traits.userInterfaceStyle == .dark
            let set = isDark ? tokens?.dark : tokens?.light
            if let hex = set?[keyPath: key], let c = Color(hex: hex) {
                return UIColor(c)
            }
            return isDark ? darkFallback : lightFallback
        })
    }

    /// Per-scheme resolved color for a data-series token: each scheme uses its
    /// OWN override when present, else the supplied `derived` color (resolved per
    /// scheme). Fixes the drift where overriding only one scheme made the other
    /// fall back to the accent instead of the derived brand color.
    func seriesColor(_ key: KeyPath<BrandingColorSet, String?>, derived: Color) -> Color {
        let tokens = iosTokens
        let derivedUI = UIColor(derived)
        return Color(UIColor { traits in
            let isDark = traits.userInterfaceStyle == .dark
            let set = isDark ? tokens?.dark : tokens?.light
            if let hex = set?[keyPath: key], let c = Color(hex: hex) {
                return UIColor(c)
            }
            return derivedUI.resolvedColor(with: traits)
        })
    }

    /// Second data-series colour — derived from the scheme accent (hue +45°).
    var secondaryColor: Color { AppTheme.Colors.secondaryAccent }

    /// Third data-series colour — derived from the scheme accent (hue −45°).
    var tertiaryColor: Color { AppTheme.Colors.tertiaryAccent }

    /// Derive a harmonious data-series color from an accent hex by rotating its
    /// hue (keeping saturation). `lightModeBrightnessScale` lets a series drop
    /// lightness a touch in LIGHT mode only (dark mode keeps the base brightness).
    static func derivedSeriesColor(
        accentHex: String,
        hueDegrees: Double,
        lightModeBrightnessScale: CGFloat = 1
    ) -> Color {
        let base = UIColor(Color(hex: accentHex) ?? .pink)
        var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
        base.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
        var rotated = (hue + CGFloat(hueDegrees / 360)).truncatingRemainder(dividingBy: 1)
        if rotated < 0 { rotated += 1 }
        let dynamic = UIColor { traits in
            let scale: CGFloat =
                traits.userInterfaceStyle == .dark ? 1 : lightModeBrightnessScale
            return UIColor(
                hue: rotated,
                saturation: saturation,
                brightness: min(max(brightness * scale, 0), 1),
                alpha: alpha
            )
        }
        return Color(dynamic)
    }

    /// Resolved font family name for the current `fontFamily` key, or nil for the
    /// system font (SF Pro).
    ///
    /// TODO: inter / manrope / lora / poppins are NOT bundled — adding them means
    /// shipping the font files + `UIAppFonts` entries. Until then every non-system
    /// key falls back to the system font so type stays Dynamic-Type friendly and
    /// honest. When a matching font is bundled, return its PostScript name here and
    /// the app-wide `.brandFont()` modifier will pick it up automatically.
    var brandFontName: String? {
        // No custom fonts are bundled yet; always use the system default.
        nil
    }

    /// Logoul brandului pentru schema data. Model simplificat: STRICT
    /// logoLightUrl/logoDarkUrl — fara fallback pe campurile legacy
    /// (logoUrl / appLogo*), unde zac imagini vechi care faceau ca
    /// "remove" sa para ca nu functioneaza.
    func logo(for scheme: ColorScheme) -> Image? {
        Self.image(fromDataUri: scheme == .dark ? logoDarkUrl : logoLightUrl)
    }

    /// Un singur set de logo-uri peste tot — "in-app" e acelasi logo.
    func appLogo(for scheme: ColorScheme) -> Image? {
        logo(for: scheme)
    }

    /// True cand un logo e efectiv AFISABIL (data URI descarcat) — folosit de
    /// preloader ca sa-si ancoreze fereastra de 2.5s pe aparitia logoului.
    var hasDisplayableLogo: Bool {
        (logoDarkUrl?.hasPrefix("data:") ?? false)
            || (logoLightUrl?.hasPrefix("data:") ?? false)
    }

    static func image(fromDataUri uri: String?) -> Image? {
        guard let uri,
              let comma = uri.firstIndex(of: ","),
              uri.hasPrefix("data:"),
              let data = Data(base64Encoded: String(uri[uri.index(after: comma)...])),
              let uiImage = UIImage(data: data)
        else { return nil }
        return Image(uiImage: uiImage)
    }

    private let decoder: JSONDecoder = APIClient.makeDecoder()

    /// UserDefaults keys that persist a tenant's cached branding.
    private static let cacheKeys = [
        "branding.name", "branding.slug", "branding.accentColor",
        "branding.secondaryColor", "branding.tertiaryColor", "branding.fontFamily",
        "branding.logoUrl", "branding.logoLightUrl", "branding.logoDarkUrl",
        "branding.appLogoLightUrl", "branding.appLogoDarkUrl", "branding.appIconName",
        "branding.nutritionEnabled", "branding.wooDeliveryEnabled",
        "branding.vatPayer", "branding.vatRatePercent",
        "branding.tokensIos",
    ]

    private init() {
        // The device stays branded to the LAST organization that logged in —
        // across relaunches AND logouts — until a different org signs in
        // (`apply` overwrites) . Only a true first use (nothing cached) shows
        // the neutral Horae.ca brand.

        // Restore cached values so relaunch shows the right brand immediately
        // (accent tint, name, logos) before the network fetch resolves.
        if let cached = UserDefaults.standard.string(forKey: "branding.name") {
            organizationName = cached
        }
        slug = UserDefaults.standard.string(forKey: "branding.slug")
        if let cached = UserDefaults.standard.string(forKey: "branding.accentColor") {
            accentColorHex = cached
        }
        secondaryColorHex = UserDefaults.standard.string(forKey: "branding.secondaryColor")
        tertiaryColorHex = UserDefaults.standard.string(forKey: "branding.tertiaryColor")
        fontFamily = UserDefaults.standard.string(forKey: "branding.fontFamily")
        logoUrl = UserDefaults.standard.string(forKey: "branding.logoUrl")
        logoLightUrl = UserDefaults.standard.string(forKey: "branding.logoLightUrl")
        logoDarkUrl = UserDefaults.standard.string(forKey: "branding.logoDarkUrl")
        appLogoLightUrl = UserDefaults.standard.string(forKey: "branding.appLogoLightUrl")
        appLogoDarkUrl = UserDefaults.standard.string(forKey: "branding.appLogoDarkUrl")
        appIconName = UserDefaults.standard.string(forKey: "branding.appIconName")
        nutritionEnabled = UserDefaults.standard.bool(forKey: "branding.nutritionEnabled")
        wooDeliveryEnabled = UserDefaults.standard.bool(forKey: "branding.wooDeliveryEnabled")
        if UserDefaults.standard.object(forKey: "branding.vatPayer") != nil {
            vatPayer = UserDefaults.standard.bool(forKey: "branding.vatPayer")
        }
        let cachedRate = UserDefaults.standard.double(forKey: "branding.vatRatePercent")
        if cachedRate > 0 { vatRatePercent = cachedRate }
        if let data = UserDefaults.standard.data(forKey: "branding.tokensIos") {
            iosTokens = try? JSONDecoder().decode(BrandingPlatformTokens.self, from: data)
        }
    }

    /// Clear ALL cached + in-memory tenant branding and revert to the neutral
    /// "Horae" brand (name/accent/logos/font) and the default app icon. Called on
    /// logout so the next (pre-login) screen shows no trace of the previous org.
    @MainActor
    func reset() {
        organizationName = AppConfig.brandName
        slug = nil
        accentColorHex = "#D4527B"
        secondaryColorHex = nil
        tertiaryColorHex = nil
        fontFamily = nil
        logoUrl = nil
        logoLightUrl = nil
        logoDarkUrl = nil
        appLogoLightUrl = nil
        appLogoDarkUrl = nil
        appIconName = nil
        nutritionEnabled = false
        wooDeliveryEnabled = false
        vatPayer = true
        vatRatePercent = 21
        iosTokens = nil

        let defaults = UserDefaults.standard
        for key in Self.cacheKeys { defaults.removeObject(forKey: key) }

        // Revert to the default (neutral Horae) app icon.
        AppIconManager.apply(nil)
    }

    /// Apply a fetched organization's branding to the running app + persist it so
    /// the next launch restores the same brand immediately. Called from `load()`,
    /// after login, and on session restore. `nutritionEnabled` is only overwritten
    /// when the payload carries it (login/me branding omits it).
    @MainActor
    func apply(_ org: OrganizationBranding) {
        applyGeneration &+= 1
        organizationName = org.name
        slug = org.slug
        accentColorHex = org.accentColor
        secondaryColorHex = org.secondaryColor
        tertiaryColorHex = org.tertiaryColor
        fontFamily = org.fontFamily
        // Logo-urile: FARA blink. Serverul trimite cai relative (nu bytes);
        // pastram pe ecran data URI-ul cached si il inlocuim abia dupa ce
        // varianta proaspata s-a descarcat. nil = sters pe server.
        applyLogoField(\.logoUrl, cacheKey: "branding.logoUrl", server: org.logoUrl)
        applyLogoField(\.logoLightUrl, cacheKey: "branding.logoLightUrl", server: org.logoLightUrl)
        applyLogoField(\.logoDarkUrl, cacheKey: "branding.logoDarkUrl", server: org.logoDarkUrl)
        applyLogoField(
            \.appLogoLightUrl, cacheKey: "branding.appLogoLightUrl", server: org.appLogoLightUrl)
        applyLogoField(
            \.appLogoDarkUrl, cacheKey: "branding.appLogoDarkUrl", server: org.appLogoDarkUrl)
        appIconName = org.appIconName
        if org.defaultLocationIdPresent {
            defaultLocationId = org.defaultLocationId
            UserDefaults.standard.set(org.defaultLocationId, forKey: "branding.defaultLocationId")
        }
        if let nutrition = org.nutritionEnabled {
            nutritionEnabled = nutrition
        }
        if let woo = org.wooDeliveryEnabled {
            wooDeliveryEnabled = woo
        }
        if let payer = org.vatPayer { vatPayer = payer }
        if let rate = org.vatRatePercent, rate > 0 { vatRatePercent = rate }
        // brandingTokens is present on /organization + PATCH responses (possibly
        // JSON null = cleared); login/me OMIT the field entirely. Only touch the
        // cached tokens when the field is PRESENT — otherwise a present-but-null
        // (theme cleared, incl. from another platform) could never un-theme the
        // device, and an absent field (login/me) must keep the cached tokens.
        if org.brandingTokensPresent {
            let ios = org.brandingTokens?["ios"]
            iosTokens = ios
            if let ios, !(ios.light == nil && ios.dark == nil),
               let data = try? JSONEncoder().encode(ios) {
                UserDefaults.standard.set(data, forKey: "branding.tokensIos")
            } else {
                UserDefaults.standard.removeObject(forKey: "branding.tokensIos")
            }
        }
        // Apply the org-selected app icon to every device (whitelabel).
        AppIconManager.apply(org.appIconName)

        let defaults = UserDefaults.standard
        defaults.set(org.name, forKey: "branding.name")
        defaults.set(org.slug, forKey: "branding.slug")
        defaults.set(org.accentColor, forKey: "branding.accentColor")
        defaults.set(org.secondaryColor, forKey: "branding.secondaryColor")
        defaults.set(org.tertiaryColor, forKey: "branding.tertiaryColor")
        defaults.set(org.fontFamily, forKey: "branding.fontFamily")
        // Logo-urile se persista in applyLogoField (doar data URI afisabile).
        defaults.set(org.appIconName, forKey: "branding.appIconName")
        if let nutrition = org.nutritionEnabled {
            defaults.set(nutrition, forKey: "branding.nutritionEnabled")
        }
        if let woo = org.wooDeliveryEnabled {
            defaults.set(woo, forKey: "branding.wooDeliveryEnabled")
        }
        if let payer = org.vatPayer { defaults.set(payer, forKey: "branding.vatPayer") }
        if let rate = org.vatRatePercent, rate > 0 {
            defaults.set(rate, forKey: "branding.vatRatePercent")
        }

    }

    /// Aplica UN camp de logo din raspunsul serverului, fara flicker:
    /// - nil → sters (curata camp + cache);
    /// - "data:..." → afisabil direct (seteaza + cacheaza);
    /// - cale relativa ("/api/v1/...") → NU atinge valoarea afisata (cached);
    ///   descarca in fundal si inlocuieste doar cand bytes-ii au sosit.
    @MainActor
    private func applyLogoField(
        _ keyPath: ReferenceWritableKeyPath<BrandingManager, String?>,
        cacheKey: String,
        server: String?
    ) {
        guard let server else {
            self[keyPath: keyPath] = nil
            UserDefaults.standard.removeObject(forKey: cacheKey)
            return
        }
        if server.hasPrefix("data:") {
            self[keyPath: keyPath] = server
            UserDefaults.standard.set(server, forKey: cacheKey)
            return
        }
        // Capture the current generation; a later apply() (ex. un "remove") bumps
        // it, so a slow download that resolves afterwards is ignored instead of
        // resurrecting a logo the newer apply already cleared.
        let gen = applyGeneration
        Task { @MainActor in
            if let uri = await Self.downloadLogo(path: server) {
                guard gen == self.applyGeneration else { return }
                self[keyPath: keyPath] = uri
                UserDefaults.standard.set(uri, forKey: cacheKey)
            } else if gen == self.applyGeneration,
                      self[keyPath: keyPath]?.hasPrefix("data:") != true {
                // Nu avem nici cache afisabil, nici download — curata calea.
                self[keyPath: keyPath] = nil
            }
        }
    }

    private static func downloadLogo(path: String) async -> String? {
        guard path.hasPrefix("/"),
              let url = URL(string: "\(APIClient.baseURL)\(path)") else { return nil }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            let mime = http.mimeType ?? "image/png"
            return "data:\(mime);base64,\(data.base64EncodedString())"
        } catch {
            return nil
        }
    }

    func load() async {
        // `/organization` now REQUIRES auth. Pre-login there's no token, so skip
        // the fetch and stay on the cached/neutral Horae brand (iOS has no slug
        // pre-login to hit the public by-slug endpoint).
        guard KeychainService.shared.hasTokens else {
            await loadStandaloneBranding()
            return
        }
        do {
            let url = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            // Without the bearer every cold start answered 401 and forced a
            // token refresh (throttled per IP) — QA B1, 17.10.2026.
            if let token = KeychainService.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (data, response) = try await APIClient.authenticatedData(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return
            }

            let org = try decoder.decode(OrganizationBranding.self, from: data)
            await apply(org)
        } catch {
            // Silent fail — use cached/default values
        }
    }

    /// Standalone build, logged out: the org is known at build time, so apply its
    /// PUBLIC branding (logo, accent, font) — the login looks like that org's
    /// login on Horae instead of the neutral brand.
    private func loadStandaloneBranding() async {
        guard let slug = AppConfig.standaloneOrgSlug,
              let url = URL(string: "\(APIClient.baseURL)/api/v1/organization/by-slug/\(slug)") else { return }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return }
            let org = try decoder.decode(OrganizationBranding.self, from: data)
            await apply(org)
        } catch {
            // Silent fail — cached/default values stay
        }
    }

    /// Upload a logo for a variant ("light" | "dark"); stores it as a data URI server-side.
    func uploadLogo(_ data: Data, mimeType: String, variant: String) async throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        let url = URL(string: "\(APIClient.baseURL)/api/v1/organization/logo")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let ext = mimeType.contains("png") ? "png" : "jpg"
        var body = Data()
        func append(_ s: String) { body.append(s.data(using: .utf8)!) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"variant\"\r\n\r\n")
        append("\(variant)\r\n")
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"logo\"; filename=\"logo.\(ext)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        append("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        let (respData, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard http.statusCode == 200 else {
            throw APIError.from(data: respData, statusCode: http.statusCode)
        }

        let org = try decoder.decode(OrganizationBranding.self, from: respData)
        await apply(org)
    }

    /// Admin: the location every operation starts on (nil clears it). PATCH
    /// sends an explicit null so the server really clears the column.
    func setDefaultLocation(_ locationId: String?) async throws {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String?] = ["defaultLocationId": locationId]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
        let org = try decoder.decode(OrganizationBranding.self, from: data)
        await apply(org)
    }

    /// Admin: the "Livrări din magazinul online" switch (PATCH /organization).
    func setWooDeliveryEnabled(_ enabled: Bool) async throws {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["wooDeliveryEnabled": enabled])

        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
        let org = try decoder.decode(OrganizationBranding.self, from: data)
        await apply(org)
    }

    /// Admin sets the org-wide app icon (alternate icon name, "" = default).
    func setAppIcon(_ name: String) async throws {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONEncoder().encode(["appIconName": name])

        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
        await MainActor.run {
            self.appIconName = name
            UserDefaults.standard.set(name, forKey: "branding.appIconName")
            AppIconManager.apply(name)
        }
    }

    /// Reset a logo variant to the bundled default. Pe langa varianta ceruta,
    /// sterge best-effort si perechea ei legacy ("default" + app-*) — pe un
    /// API mai vechi acele coloane raman altfel populate cu imagini antice.
    func resetLogo(variant: String) async throws {
        var org = try await deleteLogo(variant: variant)
        let legacySiblings: [String] = switch variant {
        case "login-light": ["app-light", "default"]
        case "login-dark": ["app-dark", "default"]
        default: []
        }
        for sibling in legacySiblings {
            if let cleaned = try? await deleteLogo(variant: sibling) { org = cleaned }
        }
        await apply(org)
    }

    private func deleteLogo(variant: String) async throws -> OrganizationBranding {
        var components = URLComponents(string: "\(APIClient.baseURL)/api/v1/organization/logo")!
        components.queryItems = [URLQueryItem(name: "variant", value: variant)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "DELETE"
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (respData, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(data: respData, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
        return try decoder.decode(OrganizationBranding.self, from: respData)
    }

    /// PATCH DOAR blocul `ios` din brandingTokens (+ optional fontFamily),
    /// pastrand blocurile web/android exact cum sunt pe server (Json-ul se
    /// trimite intreg, deci facem read-modify-write pe raspunsul brut).
    func updateIosTokens(
        _ tokens: BrandingPlatformTokens?,
        fontFamily newFont: String?? = nil
    ) async throws {
        let getURL = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var getReq = URLRequest(url: getURL)
        getReq.httpMethod = "GET"
        let (rawData, rawResp) = try await APIClient.authenticatedData(for: getReq)
        guard (rawResp as? HTTPURLResponse)?.statusCode == 200,
              var full = ((try? JSONSerialization.jsonObject(with: rawData)) as? [String: Any])
                  .map({ ($0["brandingTokens"] as? [String: Any]) ?? [:] })
        else { throw APIError.unknown("Invalid response") }

        if let tokens,
           let data = try? JSONEncoder().encode(tokens),
           let dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           !dict.isEmpty {
            full["ios"] = dict
        } else {
            full.removeValue(forKey: "ios")
        }

        var body: [String: Any] = ["brandingTokens": full.isEmpty ? NSNull() : full]
        if let newFont { body["fontFamily"] = newFont ?? NSNull() }

        let url = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(
                data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
        let org = try decoder.decode(OrganizationBranding.self, from: data)
        await apply(org)
    }

    /// ONE atomic PATCH for the whole iOS branding form: name, trio, iOS theme
    /// tokens (merged into the existing web/android blocks read fresh so a
    /// concurrent web edit isn't clobbered) and font. Single request — a partial
    /// failure can no longer leave the name saved but the tokens not (the old two
    /// dependent PATCHes could). Outer optional = omit; inner nil = explicit null.
    func updateBranding(
        name: String?,
        accentColor: String?,
        secondaryColor: String??,
        tertiaryColor: String??,
        iosTokens tokens: BrandingPlatformTokens?,
        fontFamily newFont: String??
    ) async throws {
        // Read current brandingTokens fresh to preserve the web/android blocks.
        let getURL = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var getReq = URLRequest(url: getURL)
        getReq.httpMethod = "GET"
        let (rawData, rawResp) = try await APIClient.authenticatedData(for: getReq)
        guard (rawResp as? HTTPURLResponse)?.statusCode == 200,
              var full = ((try? JSONSerialization.jsonObject(with: rawData)) as? [String: Any])
                  .map({ ($0["brandingTokens"] as? [String: Any]) ?? [:] })
        else { throw APIError.unknown("Invalid response") }

        if let tokens,
           let data = try? JSONEncoder().encode(tokens),
           let dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
           !dict.isEmpty {
            full["ios"] = dict
        } else {
            full.removeValue(forKey: "ios")
        }

        var body: [String: Any] = [:]
        if let name { body["name"] = name }
        if let accentColor { body["accentColor"] = accentColor }
        if let secondaryColor { body["secondaryColor"] = secondaryColor ?? NSNull() as Any }
        if let tertiaryColor { body["tertiaryColor"] = tertiaryColor ?? NSNull() as Any }
        body["brandingTokens"] = full.isEmpty ? NSNull() : full
        if let newFont { body["fontFamily"] = newFont ?? NSNull() as Any }

        let url = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await APIClient.authenticatedData(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.from(
                data: data, statusCode: (response as? HTTPURLResponse)?.statusCode ?? 500)
        }
        let org = try decoder.decode(OrganizationBranding.self, from: data)
        await apply(org)
    }

    /// PATCH the organization's branding. For `secondaryColor` / `tertiaryColor`
    /// the OUTER optional means "omit from the request" and the INNER optional
    /// means "send explicit null" (reset to the client default palette).
    func update(
        name: String?,
        accentColor: String?,
        secondaryColor: String?? = nil,
        tertiaryColor: String?? = nil
    ) async throws {
        let url = URL(string: "\(APIClient.baseURL)/api/v1/organization")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = KeychainService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body: [String: Any] = [:]
        if let name { body["name"] = name }
        if let accentColor { body["accentColor"] = accentColor }
        if let secondaryColor { body["secondaryColor"] = secondaryColor ?? NSNull() as Any }
        if let tertiaryColor { body["tertiaryColor"] = tertiaryColor ?? NSNull() as Any }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await APIClient.authenticatedData(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown("Invalid response")
        }
        guard httpResponse.statusCode == 200 else {
            throw APIError.from(data: data, statusCode: httpResponse.statusCode)
        }

        let org = try decoder.decode(OrganizationBranding.self, from: data)
        await apply(org)
    }
}

// MARK: - Response Model

/// Branding payload shared by `GET /organization`, the login response's
/// `organization` object, and `GET /auth/me`'s `user.organization`. All decode
/// through the same shape; extra fields (handoffCode, legal identity, …) are
/// ignored by Codable. `nutritionEnabled` is only present on `/organization`.
struct OrganizationBranding: Decodable {
    let id: String?
    let name: String
    let slug: String?
    let accentColor: String
    /// Second data-series/highlight color; null = derived from the accent (+45° hue).
    let secondaryColor: String?
    /// Third data-series color; null = derived from the accent (−45° hue).
    let tertiaryColor: String?
    let fontFamily: String?
    let logoUrl: String?
    let logoLightUrl: String?
    let logoDarkUrl: String?
    let appLogoLightUrl: String?
    let appLogoDarkUrl: String?
    let appIconName: String?
    let nutritionEnabled: Bool?
    /// "Livrări din magazinul online" switch — only on `/organization`; older
    /// APIs omit it (nil → cached value kept, false on a fresh install).
    let wooDeliveryEnabled: Bool?
    /// VAT payer — purchase prices are stored fara TVA (net); non-payers cu TVA.
    let vatPayer: Bool?
    let vatRatePercent: Double?
    /// Extended per-platform theme overrides; iOS consumes only `["ios"]`.
    /// nil = either the field was absent (login/me) OR present-but-null (cleared)
    /// — use `brandingTokensPresent` to tell them apart.
    let brandingTokens: [String: BrandingPlatformTokens]?

    /// True when the `brandingTokens` KEY existed in the payload (even as JSON
    /// null). Distinguishes "cleared on the server" (present → un-theme) from
    /// "omitted by this endpoint" (absent → keep cached). Codable's
    /// `decodeIfPresent` collapses both to nil, so we track presence explicitly.
    let brandingTokensPresent: Bool
    /// Admin-set default location (null = none); `defaultLocationIdPresent` tells
    /// "cleared" (present, null) from "omitted by this endpoint" (login/me).
    let defaultLocationId: String?
    let defaultLocationIdPresent: Bool

    private enum CodingKeys: String, CodingKey {
        case id, name, slug, accentColor, secondaryColor, tertiaryColor, fontFamily
        case logoUrl, logoLightUrl, logoDarkUrl, appLogoLightUrl, appLogoDarkUrl
        case appIconName, nutritionEnabled, wooDeliveryEnabled
        case vatPayer, vatRatePercent, brandingTokens, defaultLocationId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        slug = try c.decodeIfPresent(String.self, forKey: .slug)
        accentColor = try c.decode(String.self, forKey: .accentColor)
        secondaryColor = try c.decodeIfPresent(String.self, forKey: .secondaryColor)
        tertiaryColor = try c.decodeIfPresent(String.self, forKey: .tertiaryColor)
        fontFamily = try c.decodeIfPresent(String.self, forKey: .fontFamily)
        logoUrl = try c.decodeIfPresent(String.self, forKey: .logoUrl)
        logoLightUrl = try c.decodeIfPresent(String.self, forKey: .logoLightUrl)
        logoDarkUrl = try c.decodeIfPresent(String.self, forKey: .logoDarkUrl)
        appLogoLightUrl = try c.decodeIfPresent(String.self, forKey: .appLogoLightUrl)
        appLogoDarkUrl = try c.decodeIfPresent(String.self, forKey: .appLogoDarkUrl)
        appIconName = try c.decodeIfPresent(String.self, forKey: .appIconName)
        nutritionEnabled = try c.decodeIfPresent(Bool.self, forKey: .nutritionEnabled)
        wooDeliveryEnabled = try c.decodeIfPresent(Bool.self, forKey: .wooDeliveryEnabled)
        vatPayer = try c.decodeIfPresent(Bool.self, forKey: .vatPayer)
        vatRatePercent = try c.decodeIfPresent(Double.self, forKey: .vatRatePercent)
        brandingTokens = try c.decodeIfPresent(
            [String: BrandingPlatformTokens].self, forKey: .brandingTokens)
        brandingTokensPresent = c.contains(.brandingTokens)
        defaultLocationId = try c.decodeIfPresent(String.self, forKey: .defaultLocationId)
        defaultLocationIdPresent = c.contains(.defaultLocationId)
    }
}
