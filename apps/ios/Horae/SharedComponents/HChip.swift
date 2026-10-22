import SwiftUI

/// Filter pill of the redesign: 1px border, card background; selected =
/// primary fill with on-primary text. Optional `count` shown after the title.
/// Use a row of these instead of a Picker/menu (owner's rule: no dropdowns).
struct HChip: View {
    private let title: String
    private let count: Int?
    private let isSelected: Bool
    /// Optional leading status dot (e.g. order status colour); turns
    /// on-primary while selected.
    private let dot: Color?
    private let action: () -> Void

    init(
        _ title: String,
        count: Int? = nil,
        isSelected: Bool,
        dot: Color? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.count = count
        self.isSelected = isSelected
        self.dot = dot
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let dot {
                    Circle()
                        .fill(isSelected ? AppTheme.Colors.onPrimary : dot)
                        .frame(width: 7, height: 7)
                        .accessibilityHidden(true)
                }
                Text(title)
                    .font(AppFont.body(13, weight: .semibold))
                if let count {
                    Text("\(count)")
                        .font(AppFont.body(12, weight: .bold))
                        .monospacedDigit()
                        .opacity(0.7)
                }
            }
            .lineLimit(1)
            .foregroundStyle(isSelected ? AppTheme.Colors.onPrimary : AppTheme.Colors.label)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(isSelected ? AppTheme.Colors.primary : AppTheme.Colors.card, in: Capsule())
            .overlay(
                Capsule().strokeBorder(
                    isSelected ? AppTheme.Colors.primary : AppTheme.Colors.border, lineWidth: 1))
            .contentShape(.interaction, Rectangle().inset(by: -6))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(count.map { "\(title), \($0)" } ?? title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .animation(.snappy(duration: 0.2), value: isSelected)
        .sensoryFeedback(.selection, trigger: isSelected)
    }
}

#Preview("HChip") {
    ScrollView(.horizontal) {
        HStack(spacing: 8) {
            HChip("Toate", count: 24, isSelected: true) {}
            HChip("Noi", count: 5, isSelected: false) {}
            HChip("În lucru", isSelected: false) {}
        }
        .padding()
    }
    .background(AppTheme.Colors.appBackground)
}
