import SwiftUI

/// One-time "Ce e nou" popup shown after an app update (Horae Test builds only).
/// Presents the highlights of the current version; the full list lives in
/// Settings → Noutăți.
struct WhatsNewSheet: View {
    let entry: ChangelogEntry
    let onDismiss: () -> Void

    /// Full multi-version changelog, opened from the popup's link.
    @State private var showFullChangelog = false

    var body: some View {
        VStack(spacing: AppTheme.Spacing.lg) {
            VStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "sparkles")
                    .font(.system(size: 40))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                Text("Ce e nou în v\(entry.version)")
                    .font(.title2.bold())
                Text(entry.title)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, AppTheme.Spacing.xl)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                ForEach(entry.highlights, id: \.self) { highlight in
                    HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(AppTheme.Colors.primaryText)
                            .padding(.top, 2)
                        Text(highlight)
                            .font(.subheadline)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, AppTheme.Spacing.lg)

            Spacer()

            VStack(spacing: AppTheme.Spacing.sm) {
                Button {
                    onDismiss()
                } label: {
                    Text("Am înțeles")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, AppTheme.Spacing.md)
                }
                .buttonStyle(.borderedProminent)

                // Full detailed changelog (all versions) — same list as
                // Settings → Noutati, so tracking works from the popup too.
                Button("Vezi changelog-ul detaliat") {
                    showFullChangelog = true
                }
                .font(.subheadline)
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.lg)
        }
        .sheet(isPresented: $showFullChangelog) {
            NavigationStack {
                ChangelogView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Închide") { showFullChangelog = false }
                        }
                    }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(false)
    }
}
