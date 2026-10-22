import SwiftUI
import Observation

@Observable
final class ActivityFeedViewModel {
    var activities: [ActivityResponse] = []
    var isLoading = false
    var error: APIError?

    private let service = ActivityService.shared

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await service.fetchActivity(query: ActivityQuery(page: 1, limit: 50))
            activities = result.data
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct ActivityFeedView: View {
    @State private var viewModel = ActivityFeedViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.activities.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.activities.isEmpty {
                ContentUnavailableView(
                    "Nicio activitate",
                    systemImage: "bell.slash",
                    description: Text("Nu exista activitate recenta")
                )
            } else {
                List {
                    ForEach(Array(viewModel.activities.enumerated()), id: \.element.id) { index, activity in
                        ActivityRowView(activity: activity, index: index)
                    }
                }
                .listStyle(.plain)
            }
        }
        .task { await viewModel.load() }
        .refreshable { await Task { await viewModel.load() }.value }
    }
}

// MARK: - Activity Row

private struct ActivityRowView: View {
    let activity: ActivityResponse
    /// Position in the feed — non-semantic rows alternate primary/secondary
    /// brand tints by index (mirrors the web activity feed).
    let index: Int

    var body: some View {
        HStack(alignment: .top, spacing: AppTheme.Spacing.md) {
            Image(systemName: activity.type.icon)
                .font(.title3)
                .foregroundStyle(iconColor)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                Text(activity.title)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)

                Text(activity.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Text(activity.timestamp.relativeString)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, AppTheme.Spacing.xs)
    }

    private var iconColor: Color {
        switch activity.type {
        // Semantic severities keep their colors; everything else alternates
        // the brand's primary/secondary tints by row index (like the web).
        case .LOW_STOCK: .orange
        case .STOCK_AVAILABLE: .green
        case .TASK_TRANSITION, .STOCK_MOVEMENT, .ORDER_CREATED, .ORDER_STATUS:
            index.isMultiple(of: 2)
                ? AppTheme.Colors.primary
                : AppTheme.Colors.secondaryAccent
        }
    }
}

#Preview {
    NavigationStack {
        ActivityFeedView()
            .navigationTitle("Activitate")
    }
}
