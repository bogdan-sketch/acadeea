import SwiftUI

@Observable
final class RecipeCostViewModel {
    var cost: RecipeCostResponse?
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
            cost = try await service.fetchRecipeCost(id: recipeId)
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }
}

struct RecipeCostView: View {
    @State private var viewModel: RecipeCostViewModel

    init(recipeId: String) {
        _viewModel = State(initialValue: RecipeCostViewModel(recipeId: recipeId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                LoadingStateView()
            } else if let cost = viewModel.cost {
                List {
                    summarySection(cost)
                    ingredientsSection(cost)
                }
                .refreshable { await Task { await viewModel.load() }.value }
            } else {
                EmptyStateView(
                    title: "Eroare la incarcare",
                    systemImage: "exclamationmark.triangle",
                    subtitle: "Costul retetei nu a putut fi calculat"
                )
            }
        }
        .navigationTitle("Cost reteta")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
    }

    private func summarySection(_ cost: RecipeCostResponse) -> some View {
        Section("Sumar") {
            LabeledContent("Reteta", value: cost.recipeName)
            if let total = cost.totalCost {
                LabeledContent("Cost total", value: total.ronFormatted)
            } else {
                LabeledContent("Cost total", value: "Necalculabil")
            }
            if let selling = cost.sellingPrice {
                LabeledContent("Pret vanzare", value: selling.ronFormatted)
            }
            if let margin = cost.margin, let pct = cost.marginPercent {
                LabeledContent("Marja") {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        Text(margin.ronFormatted)
                        MarginBadge(percent: pct)
                    }
                }
            }
        }
    }

    private func ingredientsSection(_ cost: RecipeCostResponse) -> some View {
        Section("Ingrediente") {
            ForEach(cost.ingredients) { ing in
                HStack {
                    VStack(alignment: .leading) {
                        Text(ing.name).font(.subheadline)
                        Text("\(ing.quantity, specifier: "%.2f") \(ing.unit)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let total = ing.totalCost {
                        Text(total.ronFormatted)
                            .font(.subheadline).fontWeight(.medium)
                    } else {
                        Text("N/A").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}
