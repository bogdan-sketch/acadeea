import SwiftUI

/// Labeled form field wrapper with optional error display.
struct FormField<Content: View>: View {
    let label: String
    var isRequired: Bool = false
    var error: String?
    var help: String?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack(spacing: 2) {
                Text(label)
                    .font(.subheadline.weight(.medium))
                if isRequired {
                    Text("*")
                        .foregroundStyle(.red)
                }
            }

            content()

            if let help {
                Text(help)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }
}
