import SwiftUI

/// Search bar with debounce support.
struct SearchBar: View {
    @Binding var text: String
    let placeholder: String
    var onCommit: (() -> Void)?

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            TextField(placeholder, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { onCommit?() }

            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(AppTheme.Spacing.sm)
        .background(.quaternary)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
    }
}
