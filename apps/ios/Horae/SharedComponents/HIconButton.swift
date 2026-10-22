import SwiftUI

/// Icon-only square button of the redesign: 40×40 (iPhone) / 42×42 (iPad)
/// at the default text size, scaling with Dynamic Type,
/// radius 12, 1px border. The `label` is mandatory — it becomes the
/// VoiceOver label and the pointer/keyboard tooltip (`.help`), since there is
/// no visible text. The hit area is padded to ≥ 44pt (HIG) without changing
/// the visual size.
struct HIconButton: View {
    enum Variant {
        /// Paper background, ink icon.
        case standard
        /// Filled with the scheme's primary.
        case prominent
        /// Danger-tinted icon (fixed status red).
        case destructive
    }

    private let systemImage: String
    private let label: String
    private let variant: Variant
    private let action: () -> Void

    @Environment(\.horizontalSizeClass) private var sizeClass
    /// Grows with Dynamic Type (40 → max 56) so the button keeps up with the
    /// titles next to it at accessibility sizes.
    @ScaledMetric(relativeTo: .body) private var baseSide: CGFloat = 40
    @ScaledMetric(relativeTo: .body) private var glyph: CGFloat = 16

    init(
        _ systemImage: String,
        label: String,
        variant: Variant = .standard,
        action: @escaping () -> Void
    ) {
        self.systemImage = systemImage
        self.label = label
        self.variant = variant
        self.action = action
    }

    private var side: CGFloat { min(56, baseSide + (sizeClass == .regular ? 2 : 0)) }

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: min(22, glyph), weight: .semibold))
                .imageScale(.medium)
                .foregroundStyle(foreground)
                .frame(width: side, height: side)
                .background(background, in: shape)
                .overlay(shape.strokeBorder(borderColor, lineWidth: 1))
                .contentShape(.interaction, Rectangle().inset(by: -2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .help(label)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
    }

    private var foreground: Color {
        switch variant {
        case .standard: AppTheme.Colors.label
        case .prominent: AppTheme.Colors.onPrimary
        case .destructive: AppTheme.Status.fg(.danger)
        }
    }

    private var background: Color {
        variant == .prominent ? AppTheme.Colors.primary : AppTheme.Colors.appBackground
    }

    private var borderColor: Color {
        variant == .prominent ? AppTheme.Colors.primary : AppTheme.Colors.border
    }
}

#Preview("HIconButton") {
    HStack(spacing: 12) {
        HIconButton("pencil", label: "Editează") {}
        HIconButton("plus", label: "Comandă nouă", variant: .prominent) {}
        HIconButton("trash", label: "Șterge", variant: .destructive) {}
    }
    .padding()
    .background(AppTheme.Colors.card)
}
