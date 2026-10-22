import SwiftUI

/// Large in-content screen title: Fraunces 28, -0.3 tracking, with an
/// optional small muted eyebrow above (date, location, count…).
struct HScreenTitle: View {
    private let title: String
    private let eyebrow: String?

    init(_ title: String, eyebrow: String? = nil) {
        self.title = title
        self.eyebrow = eyebrow
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // iPad section roots: hide/show-sidebar button left of the title.
            SidebarToggleButton()
            titleStack
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var titleStack: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let eyebrow {
                Text(eyebrow)
                    .font(AppFont.body(12, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            Text(title)
                .font(AppFont.title(28))
                .tracking(-0.3)
                .foregroundStyle(AppTheme.Colors.label)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

#Preview("HScreenTitle") {
    VStack(spacing: 24) {
        HScreenTitle("Setări")
        HScreenTitle("Comenzi", eyebrow: "Vineri, 17 octombrie")
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
