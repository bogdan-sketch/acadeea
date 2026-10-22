import SwiftUI
import Observation

@Observable
final class LocationStockViewModel {
    var location: LocationResponse?
    var stocks: [LocationStockResponse] = []
    var isLoading = false
    var error: APIError?

    private let service = LocationService.shared

    func load(id: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let loc = service.fetchLocation(id: id)
            async let stk = service.fetchLocationStock(id: id)
            location = try await loc
            stocks = try await stk
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct LocationStockView: View {
    let locationId: String
    @State private var viewModel = LocationStockViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.stocks.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.stocks.isEmpty {
                ContentUnavailableView(
                    "Stoc gol",
                    systemImage: "shippingbox",
                    description: Text("Niciun material la această locație")
                )
            } else {
                List(viewModel.stocks) { stock in
                    HStack {
                        Text(stock.rawMaterialTitle)
                            .font(.subheadline.weight(.medium))

                        Spacer()

                        Text(stock.unit.formatQty(stock.quantity))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(stock.quantity <= 0 ? .red : .primary)
                    }
                    .padding(.vertical, AppTheme.Spacing.xs)
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle(viewModel.location?.name ?? "Stoc locație")
        .task { await viewModel.load(id: locationId) }
        .refreshable { await Task { await viewModel.load(id: locationId) }.value }
        .errorAlert($viewModel.error)
    }
}

#Preview {
    NavigationStack {
        LocationStockView(locationId: "preview")
    }
}
