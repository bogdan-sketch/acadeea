import SwiftUI

/// Small uppercase section label (11pt bold, +0.5 tracking, muted) with an
/// optional trailing view (hint text, "Vezi tot" link…).
struct HSectionHeader<Trailing: View>: View {
    private let title: String
    private let trailing: Trailing

    init(_ title: String, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title.uppercased())
                .font(AppFont.body(11, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .accessibilityAddTraits(.isHeader)
                .accessibilityLabel(title)
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 4)
        .textCase(nil)
    }
}

extension HSectionHeader where Trailing == EmptyView {
    init(_ title: String) {
        self.init(title) { EmptyView() }
    }
}

#Preview("HSectionHeader") {
    VStack(spacing: 16) {
        HSectionHeader("Organizație")
        HSectionHeader("Temă") {
            Text("Atelier · luminos")
                .font(AppFont.body(11))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
        }
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
