import SwiftUI

/// Floating action button: 54pt circle in the scheme's primary with a soft
/// shadow. Icon-only, so `label` (VoiceOver + tooltip) is required.
struct HFab: View {
    private let systemImage: String
    private let label: String
    private let action: () -> Void

    @State private var taps = 0

    init(_ systemImage: String = "plus", label: String, action: @escaping () -> Void) {
        self.systemImage = systemImage
        self.label = label
        self.action = action
    }

    var body: some View {
        Button {
            taps += 1
            action()
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.onPrimary)
                .frame(width: 54, height: 54)
                .background(AppTheme.Colors.primary, in: Circle())
                .shadow(color: AppTheme.Colors.primary.opacity(0.35), radius: 12, y: 6)
                .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .help(label)
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
    }
}

#Preview("HFab") {
    ZStack(alignment: .bottomTrailing) {
        AppTheme.Colors.appBackground.ignoresSafeArea()
        HFab(label: "Comandă nouă") {}
            .padding(20)
    }
}
