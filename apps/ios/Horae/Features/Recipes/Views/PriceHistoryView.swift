import SwiftUI

@Observable
final class PriceHistoryViewModel {
    var records: [PriceHistoryResponse] = []
    var isLoading = true
    var error: APIError?

    private let service = PricingService.shared
    var rawMaterialId: String?
    var consumableId: String?
    var recipeId: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            records = try await service.fetchPriceHistory(
                rawMaterialId: rawMaterialId,
                consumableId: consumableId,
                recipeId: recipeId
            )
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }
}

struct PriceHistoryView: View {
    @State private var viewModel = PriceHistoryViewModel()
    var rawMaterialId: String?
    var consumableId: String?
    var recipeId: String?

    var body: some View {
        Group {
            if viewModel.isLoading {
                LoadingStateView()
            } else if viewModel.records.isEmpty {
                EmptyStateView(
                    title: "Niciun istoric",
                    systemImage: "clock",
                    subtitle: "Nu exista modificari de pret"
                )
            } else {
                List(viewModel.records) { record in
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        HStack {
                            Text(record.priceType == "PURCHASE" ? "Preț achiziție" : "Preț vânzare")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Spacer()
                            Text(RoDate.shortDateTime(record.createdAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            if let old = record.oldPrice {
                                Text(RoFormat.number(old))
                                    .strikethrough()
                                    .foregroundStyle(.secondary)
                                Image(systemName: "arrow.right")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Text(record.newPrice.ronFormatted)
                                .fontWeight(.medium)
                        }
                        .font(.subheadline)
                    }
                    .padding(.vertical, AppTheme.Spacing.xxs)
                }
                .refreshable { await Task { await viewModel.load() }.value }
            }
        }
        .navigationTitle("Istoric preturi")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            viewModel.rawMaterialId = rawMaterialId
            viewModel.consumableId = consumableId
            viewModel.recipeId = recipeId
            await viewModel.load()
        }
        .errorAlert($viewModel.error)
    }
}
