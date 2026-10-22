import SwiftUI

struct EmptyStateView: View {
    let title: String
    let systemImage: String
    var subtitle: String?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let subtitle {
                Text(subtitle)
            }
        }
    }
}

/// Centered loading indicator filling available space.
struct LoadingStateView: View {
    var body: some View {
        ProgressView()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    EmptyStateView(
        title: "Nu exista task-uri",
        systemImage: "checklist",
        subtitle: "Creati un task nou pentru a incepe"
    )
}
