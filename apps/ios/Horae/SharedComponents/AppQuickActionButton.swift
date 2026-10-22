import SwiftUI

/// Buton de quick-action (cerc cu tinta de accent + eticheta dedesubt) —
/// pattern-ul randului orizontal din Stoc, promovat ca componenta comuna
/// pentru "quick actions in susul paginii" pe orice ecran de lista.
/// Suporta fie navigare (`destination: Route`), fie o actiune locala
/// (`action:` — ex. toggle de filtru, cu `isActive` pentru starea selectata).
struct AppQuickActionButton: View {
    let label: String
    let icon: String
    var destination: Route? = nil
    var isActive: Bool = false
    var action: (() -> Void)? = nil

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if let destination {
            NavigationLink(value: destination) { content }
        } else {
            Button { action?() } label: { content }
        }
    }

    private var content: some View {
        VStack(spacing: AppTheme.Spacing.xs) {
            Image(systemName: icon)
                .font(.title3)
                .frame(width: 44, height: 44)
                .background(isActive ? AppTheme.Colors.primary : AppTheme.Colors.primary.opacity(0.12))
                .foregroundStyle(isActive ? Color.white : AppTheme.Colors.primary)
                .clipShape(Circle())
            Text(label)
                .font(.caption2)
                .foregroundStyle(isActive ? Color.primary : .secondary)
                // La marimi de accesibilitate eticheta nu mai incape pe un
                // rand in 60pt — lasa butonul sa creasca si textul pe 2 randuri.
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                .multilineTextAlignment(.center)
        }
        // Latime care se muleaza pe eticheta (min 60) — "Reteta noua" etc.
        // nu se mai trunchiaza in 60pt.
        .frame(minWidth: 60, maxWidth: dynamicTypeSize.isAccessibilitySize ? 120 : nil)
    }
}
