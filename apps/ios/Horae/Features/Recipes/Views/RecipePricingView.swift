import SwiftUI

@Observable
final class RecipePricingViewModel {
    var margin: RecipeMarginResponse?
    var isLoading = true
    var error: APIError?
    var priceText = ""
    var isSaving = false

    private let service = PricingService.shared
    let recipeId: String

    init(recipeId: String) {
        self.recipeId = recipeId
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            margin = try await service.fetchRecipeMargin(recipeId: recipeId)
            if let sp = margin?.sellingPrice {
                priceText = String(format: "%.2f", sp)
            }
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }

    func savePrice() async {
        guard let price = RoFormat.parseDecimal(priceText) else { return }
        isSaving = true
        do {
            margin = try await service.setSellingPrice(recipeId: recipeId, price: price)
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isSaving = false
    }
}

struct RecipePricingView: View {
    @State private var viewModel: RecipePricingViewModel

    init(recipeId: String) {
        _viewModel = State(initialValue: RecipePricingViewModel(recipeId: recipeId))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                LoadingStateView()
            } else if let m = viewModel.margin {
                List {
                    marginSection(m)
                    sellingPriceSection
                }
                .refreshable { await Task { await viewModel.load() }.value }
            } else {
                EmptyStateView(
                    title: "Eroare la incarcare",
                    systemImage: "exclamationmark.triangle",
                    subtitle: "Marja retetei nu a putut fi incarcata"
                )
            }
        }
        .navigationTitle("Pret & marja")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
    }

    private func marginSection(_ m: RecipeMarginResponse) -> some View {
        Section("Marja") {
            LabeledContent("Reteta", value: m.recipeName)
            if let cost = m.recipeCost {
                LabeledContent("Cost productie", value: cost.ronFormatted)
            } else {
                LabeledContent("Cost productie", value: "Necalculabil")
            }
            if let sp = m.sellingPrice {
                LabeledContent("Pret vanzare", value: sp.ronFormatted)
            }
            if let margin = m.margin, let pct = m.marginPercent {
                LabeledContent("Marja") {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        Text(margin.ronFormatted)
                        MarginBadge(percent: pct)
                    }
                }
            }
        }
    }

    private var sellingPriceSection: some View {
        Section("Seteaza pret vanzare") {
            HStack {
                TextField("Pret (RON)", text: $viewModel.priceText)
                    .keyboardType(.decimalPad)
                if viewModel.isSaving {
                    ProgressView()
                } else {
                    Button {
                        Task { await viewModel.savePrice() }
                    } label: {
                        HStack {
                            Image(systemName: "checkmark.circle")
                                .foregroundStyle(AppTheme.Colors.primaryText)
                            Text("Salveaza")
                                .foregroundStyle(Color.primary)
                        }
                    }
                    .disabled(viewModel.priceText.isEmpty)
                }
            }
        }
    }
}

struct MarginBadge: View {
    let percent: Double

    var body: some View {
        StatusBadge(text: percent.percentFormatted,
                    color: AppTheme.Colors.margin(percent: percent))
    }
}
