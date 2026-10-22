import SwiftUI

/// Stat tile: small label with a coloured dot, a big Fraunces 32 value and an
/// optional hint line. Read by VoiceOver as one element.
struct HStatCard: View {
    private let label: String
    private let value: String
    private let hint: String?
    private let dot: Color?

    init(_ label: String, value: String, hint: String? = nil, dot: Color? = nil) {
        self.label = label
        self.value = value
        self.hint = hint
        self.dot = dot
    }

    var body: some View {
        HCard {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    if let dot {
                        Circle().fill(dot).frame(width: 8, height: 8).accessibilityHidden(true)
                    }
                    Text(label)
                        .font(AppFont.body(12, weight: .semibold))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .lineLimit(1)
                }
                Text(value)
                    .font(AppFont.display(32))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let hint {
                    Text(hint)
                        .font(AppFont.body(12))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .lineLimit(2)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview("HStatCard") {
    HStack(spacing: 12) {
        HStatCard("Comenzi azi", value: "12", hint: "3 de livrat", dot: AppTheme.Status.fg(.new))
        HStatCard("În lucru", value: "5", dot: AppTheme.Status.fg(.inProgress))
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
