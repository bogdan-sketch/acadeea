import SwiftUI

@Observable
final class RecipeVersionHistoryViewModel {
    var versions: [RecipeVersionResponse] = []
    var isLoading = true
    var error: APIError?

    private let service = RecipeService.shared
    let recipeId: String

    init(recipeId: String) {
        self.recipeId = recipeId
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            versions = try await service.fetchRecipeVersions(id: recipeId)
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }
}

struct RecipeVersionHistoryView: View {
    @State private var viewModel: RecipeVersionHistoryViewModel

    init(recipeId: String) {
        _viewModel = State(initialValue: RecipeVersionHistoryViewModel(recipeId: recipeId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                LoadingStateView()
            } else if viewModel.versions.isEmpty {
                EmptyStateView(
                    title: "Nicio versiune",
                    systemImage: "clock.arrow.circlepath",
                    subtitle: "Reteta nu are versiuni anterioare"
                )
            } else {
                List(viewModel.versions) { version in
                    HStack {
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            Text("Versiunea \(version.version)")
                                .font(.headline)
                            Text(RoDate.shortDateTime(version.createdAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "doc.text")
                            .foregroundStyle(.secondary)
                    }
                }
                .refreshable { await Task { await viewModel.load() }.value }
            }
        }
        .navigationTitle("Istoric versiuni")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
    }
}
