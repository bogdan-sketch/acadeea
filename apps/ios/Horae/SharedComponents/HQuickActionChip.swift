import SwiftUI

/// Quick-action pill of the redesign's horizontal action rows (Stoc:
/// Recepție, Transfer, Mișcări…): a small glyph tile + label in a 1px-bordered
/// capsule. Navigates (`destination`) or runs an action; `isActive` fills it
/// with the scheme primary — used by toggle filters such as "Fără stoc".
struct HQuickActionChip: View {
    private let label: String
    private let systemImage: String
    private let help: String?
    private let glyphTone: AppTheme.Status.Kind?
    private let destination: Route?
    private let isActive: Bool
    private let action: (() -> Void)?

    /// Navigation chip (pushes `destination` on the current stack).
    init(_ label: String, systemImage: String, help: String? = nil, destination: Route) {
        self.label = label
        self.systemImage = systemImage
        self.help = help
        self.glyphTone = nil
        self.destination = destination
        self.isActive = false
        self.action = nil
    }

    /// Action / toggle chip. `glyphTone` tints the glyph tile in a status colour.
    init(
        _ label: String,
        systemImage: String,
        help: String? = nil,
        glyphTone: AppTheme.Status.Kind? = nil,
        isActive: Bool = false,
        action: @escaping () -> Void
    ) {
        self.label = label
        self.systemImage = systemImage
        self.help = help
        self.glyphTone = glyphTone
        self.destination = nil
        self.isActive = isActive
        self.action = action
    }

    var body: some View {
        Group {
            if let destination {
                NavigationLink(value: destination) { content }
            } else {
                Button { action?() } label: { content }
                    .accessibilityAddTraits(isActive ? .isSelected : [])
            }
        }
        .buttonStyle(.plain)
        .help(help ?? label)
        .accessibilityHint(help ?? "")
    }

    private var content: some View {
        HStack(spacing: 7) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(glyphForeground)
                .frame(width: 26, height: 26)
                .background(glyphBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)
            Text(label)
                .font(AppFont.body(13, weight: .semibold))
                .lineLimit(1)
                .foregroundStyle(isActive ? AppTheme.Colors.onPrimary : AppTheme.Colors.label)
        }
        .padding(.leading, 6)
        .padding(.trailing, 12)
        .frame(minHeight: 38)
        .background(isActive ? AppTheme.Colors.primary : AppTheme.Colors.card, in: Capsule())
        .overlay(Capsule().strokeBorder(isActive ? AppTheme.Colors.primary : AppTheme.Colors.border, lineWidth: 1))
        .contentShape(.interaction, Rectangle().inset(by: -3))
        .animation(.snappy(duration: 0.2), value: isActive)
    }

    private var glyphForeground: Color {
        if isActive { return AppTheme.Colors.onPrimary }
        if let glyphTone { return AppTheme.Status.fg(glyphTone) }
        return AppTheme.Colors.label
    }

    private var glyphBackground: Color {
        if isActive { return AppTheme.Colors.onPrimary.opacity(0.2) }
        if let glyphTone { return AppTheme.Status.bg(glyphTone) }
        return AppTheme.Colors.appBackground
    }
}

/// Inline search field of the redesign (card surface, 1px border, radius 12),
/// shown under a screen title when its search icon button is tapped.
struct HInlineSearchField: View {
    @Binding var text: String
    let prompt: String
    var focusOnAppear = true
    var onClose: (() -> Void)?

    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .accessibilityHidden(true)
            TextField(prompt, text: $text)
                .font(AppFont.body(15))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($focused)
            if !text.isEmpty || onClose != nil {
                Button {
                    if text.isEmpty { onClose?() } else { text = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(text.isEmpty ? "Închide căutarea" : "Șterge textul")
                .help(text.isEmpty ? "Închide căutarea" : "Șterge textul")
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, 4)
        .frame(minHeight: 44)
        .background(AppTheme.Colors.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(AppTheme.Colors.border, lineWidth: 1))
        .onAppear { if focusOnAppear { focused = true } }
    }
}

#Preview("HQuickActionChip") {
    NavigationStack {
        VStack(alignment: .leading, spacing: 16) {
            ScrollView(.horizontal) {
                HStack(spacing: 6) {
                    HQuickActionChip("Recepție", systemImage: "arrow.down", destination: .batchReceive)
                    HQuickActionChip("Fără stoc", systemImage: "exclamationmark.triangle",
                                     glyphTone: .danger, isActive: false) {}
                    HQuickActionChip("Fără stoc", systemImage: "exclamationmark.triangle",
                                     glyphTone: .danger, isActive: true) {}
                }
                .padding(.horizontal)
            }
            HInlineSearchField(text: .constant(""), prompt: "Caută produs", focusOnAppear: false) {}
                .padding(.horizontal)
        }
        .padding(.vertical)
        .background(AppTheme.Colors.appBackground)
    }
}
