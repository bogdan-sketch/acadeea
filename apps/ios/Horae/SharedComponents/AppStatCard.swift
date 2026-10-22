import SwiftUI

/// Card de statistica din capul paginilor de lista (Stoc / Comenzi / Productie),
/// folosit si ca FILTRU: tap → lista arata doar segmentul lui; tap pe cardul
/// deja activ → inapoi la "toate". Cu valoare 0 nu e tappable. Selectat =
/// contur in culoarea valorii.
struct AppStatCard: View {
    let label: String
    let value: String
    let valueColor: Color
    var isSelected: Bool = false
    var isEnabled: Bool = true
    var action: (() -> Void)? = nil

    var body: some View {
        Button { action?() } label: {
            VStack(spacing: AppTheme.Spacing.xs) {
                Text(value)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(valueColor)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(AppTheme.Colors.card)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.CornerRadius.lg)
                    .strokeBorder(isSelected ? valueColor : .clear, lineWidth: 2)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Cardul SELECTAT ramane mereu tappable (altfel un filtru activ cu
        // valoare 0 nu mai poate fi scos decat din alt card).
        .disabled((!isEnabled && !isSelected) || action == nil)
        .animation(.snappy(duration: 0.2), value: isSelected)
        .accessibilityLabel("\(label): \(value)")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
