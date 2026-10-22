import SwiftUI

/// Card surface of the redesign: scheme card colour, 1px border, radius 16.
struct HCard<Content: View>: View {
    private let padding: CGFloat
    private let content: Content

    init(padding: CGFloat = 14, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.Colors.card, in: shape)
            .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
    }
}

#Preview("HCard") {
    HCard {
        VStack(alignment: .leading, spacing: 4) {
            Text("Anca Pop").font(AppFont.body(15, weight: .bold))
            Text("Administrator · Acadeea")
                .font(AppFont.body(12))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
        }
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
