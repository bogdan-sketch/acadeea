import SwiftUI

struct RecipeYieldHistoryView: View {
    let recipeId: String
    @State private var viewModel: RecipeYieldHistoryViewModel

    init(recipeId: String) {
        self.recipeId = recipeId
        self._viewModel = State(initialValue: RecipeYieldHistoryViewModel(recipeId: recipeId))
    }

    var body: some View {
        Group {
            if viewModel.entries.isEmpty && viewModel.isLoading {
                LoadingStateView()
            } else if viewModel.entries.isEmpty {
                EmptyStateView(
                    title: "Niciun istoric",
                    systemImage: "chart.bar.xaxis",
                    subtitle: "Randamentul se înregistrează la finalizarea producției"
                )
            } else {
                List {
                    ForEach(viewModel.entries) { entry in
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            HStack {
                                Text(RoPercent.format(entry.variancePercent, signed: true))
                                    .font(.headline.bold())
                                    .foregroundStyle(varianceColor(entry.variancePercent))
                                Spacer()
                                Text(RoDate.shortDateTime(entry.recordedAt))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            HStack(spacing: AppTheme.Spacing.lg) {
                                LabeledValue(label: "Tinta", value: entry.targetQuantity.qtyFormatted)
                                LabeledValue(label: "Real", value: entry.actualYield.qtyFormatted)
                                LabeledValue(label: "Scala", value: "\(entry.scaleFactor.qtyFormatted)x")
                            }
                        }
                        .padding(.vertical, AppTheme.Spacing.xxs)
                        .onAppear {
                            if viewModel.entries.isNearEnd(entry) {
                                Task { await viewModel.loadMore() }
                            }
                        }
                    }

                    if viewModel.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .navigationTitle("Istoric randament")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadInitial() }
        .errorAlert($viewModel.error)
    }

    private func varianceColor(_ pct: Double) -> Color {
        YieldVarianceBand(percent: pct).color
    }
}

// MARK: - Helper

private struct LabeledValue: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline)
        }
    }
}
