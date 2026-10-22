import SwiftUI

/// Neutral, product-owner brand lockup shown pre-login and whenever no tenant
/// logo is set. Deliberately independent of `BrandingManager` tenant fields so it
/// always renders the plain "horae.ca" brand.
///
/// It is a styled SwiftUI wordmark (not a raster asset) so it adapts to light and
/// dark automatically, scales with Dynamic Type, and never ships a stale bitmap.
/// The raspberry ".ca" echoes the clock hand in the app icon.
struct HoraeWordmark: View {
    /// Cap height of the wordmark. Login uses the default; callers can scale it.
    var size: CGFloat = 40

    var body: some View {
        if AppConfig.isStandalone {
            Text(AppConfig.brandName)
                .foregroundStyle(.primary)
                .font(.system(size: size, weight: .semibold, design: .serif))
                .tracking(0.5)
        } else {
            horae
        }
    }

    private var horae: some View {
        (Text("Horae")
            .foregroundStyle(.primary)
            + Text(".ca")
            .foregroundStyle(Color(hex: "#D4527B") ?? .pink))
            .font(.system(size: size, weight: .semibold, design: .serif))
            .tracking(0.5)
            .accessibilityLabel("Horae.ca")
    }
}

#Preview("Light") {
    HoraeWordmark()
        .preferredColorScheme(.light)
}

#Preview("Dark") {
    HoraeWordmark()
        .preferredColorScheme(.dark)
}
