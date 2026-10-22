import SwiftUI

/// Shared filter pill — mirrors the web/android chips: a tinted capsule with an
/// optional SF Symbol icon on the left + label. Selected = solid accent fill +
/// white text; idle = soft tint wash + tinted border. Promoted from the private
/// `CategoryChip` in StockOverviewView so every list screen filters the same way.
struct FilterChip: View {
    let title: String
    var icon: String? = nil
    var tint: Color = AppTheme.Colors.primary
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon {
                    // Icon reads as a transparent/tinted glyph when idle (matches
                    // the web/android look), white when the chip is filled.
                    Image(systemName: icon)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(isSelected ? .white : tint)
                }
                Text(title)
            }
            .font(.subheadline.weight(isSelected ? .semibold : .medium))
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.xs)
            .background(isSelected ? tint : tint.opacity(0.14))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
            .overlay(
                Capsule().strokeBorder(tint.opacity(isSelected ? 0 : 0.3), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .animation(.snappy(duration: 0.2), value: isSelected)
    }
}
