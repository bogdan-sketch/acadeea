import SwiftUI

/// Icon + label quick-action button used on stock item detail screens
/// (Receptie / Transfer / Ajustare). Mirrors the StockOverviewView quick
/// actions but triggers a sheet instead of a Route push.
struct StockQuickActionButton: View {
    let label: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: AppTheme.Spacing.xs) {
                Image(systemName: icon)
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(Color.accentColor.opacity(0.12))
                    .foregroundStyle(AppTheme.Colors.primary)
                    .clipShape(Circle())
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

/// Transparent list section hosting a horizontal row of quick actions at the
/// top of a detail List.
struct StockQuickActionsSection<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        Section {
            HStack(spacing: AppTheme.Spacing.md) {
                content
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(
                top: AppTheme.Spacing.xs,
                leading: AppTheme.Spacing.md,
                bottom: AppTheme.Spacing.xs,
                trailing: AppTheme.Spacing.md
            ))
        }
    }
}
