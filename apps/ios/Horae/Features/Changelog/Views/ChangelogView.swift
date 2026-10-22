import SwiftUI

/// "Noutăți" — the curated release notes, one section per version.
/// Reachable from Settings (Horae Test builds only).
struct ChangelogView: View {
    @State private var entries: [ChangelogEntry] = []
    @State private var isLoading = false
    @State private var error: APIError?

    var body: some View {
        List {
            ForEach(entries) { entry in
                Section {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            Text("v\(entry.version)")
                                .font(.subheadline.bold())
                                .padding(.horizontal, AppTheme.Spacing.sm)
                                .padding(.vertical, AppTheme.Spacing.xxs)
                                .background(Color.accentColor.opacity(0.14), in: Capsule())
                                .foregroundStyle(Color.primary)
                            Text(entry.formattedDate)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Text(entry.title)
                            .font(.headline)

                        changeGroup("Nou", items: entry.nou, color: Color.accentColor)
                        changeGroup("Îmbunătățiri", items: entry.imbunatatiri, color: .blue)
                        changeGroup("Reparat", items: entry.reparat, color: .green)
                    }
                    .padding(.vertical, AppTheme.Spacing.xs)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Noutăți")
        .overlay {
            if isLoading && entries.isEmpty {
                ProgressView()
            } else if !isLoading && entries.isEmpty {
                EmptyStateView(title: "Nicio noutate încă", systemImage: "sparkles")
            }
        }
        .task { await load() }
        .refreshable { await Task { await load() }.value }
        .errorAlert($error)
    }

    @ViewBuilder
    private func changeGroup(_ title: String, items: [ChangelogItem], color: Color) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text(title.uppercased())
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)
                    .padding(.top, AppTheme.Spacing.xs)
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                        Circle()
                            .fill(color)
                            .frame(width: 6, height: 6)
                            .padding(.top, 6)
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                            Text(item.text)
                                .font(.subheadline)
                            HStack(spacing: AppTheme.Spacing.xxs) {
                                ForEach(item.platforms, id: \.self) { platform in
                                    Text(ChangelogPlatformLabel.label(platform).uppercased())
                                        .font(.system(size: 9, weight: .semibold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color(.systemGray5), in: Capsule())
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            entries = try await ChangelogService.shared.fetchChangelog().entries
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = .unknown(error.localizedDescription)
        }
    }
}

#Preview {
    NavigationStack { ChangelogView() }
}
