import SwiftUI
import Observation

@Observable
final class LocationDashboardViewModel {
    var dashboard: LocationDashboardResponse?
    var isLoading = true
    var error: APIError?

    private let service = LocationService.shared

    func load(id: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            dashboard = try await service.fetchLocationDashboard(id: id)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct LocationDashboardView: View {
    let locationId: String
    @State private var viewModel = LocationDashboardViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.dashboard == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let dash = viewModel.dashboard {
                ScrollView {
                    VStack(spacing: AppTheme.Spacing.md) {
                        statsGrid(dash)
                        lowStockSection(dash)
                    }
                    .padding()
                }
            } else {
                ContentUnavailableView(
                    "Eroare",
                    systemImage: "exclamationmark.triangle",
                    description: Text("Nu s-au putut încărca datele")
                )
            }
        }
        .navigationTitle(viewModel.dashboard?.locationName ?? "Dashboard locație")
        .task { await viewModel.load(id: locationId) }
        .refreshable { await Task { await viewModel.load(id: locationId) }.value }
        .errorAlert($viewModel.error)
    }

    // MARK: - Stats Grid

    @ViewBuilder
    private func statsGrid(_ dash: LocationDashboardResponse) -> some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
        ], spacing: AppTheme.Spacing.sm) {
            statCard("Materiale", value: "\(dash.totalMaterials)", icon: "shippingbox.fill", color: .blue)
            statCard("Utilizatori", value: "\(dash.assignedUsers)", icon: "person.2.fill", color: .purple)
            statCard("Transferuri primite", value: "\(dash.pendingInboundTransfers)", icon: "arrow.down.circle.fill", color: .green)
            statCard("Transferuri out", value: "\(dash.pendingOutboundTransfers)", icon: "arrow.up.circle.fill", color: .orange)
        }
    }

    private func statCard(_ title: String, value: String, icon: String, color: Color) -> some View {
        VStack(spacing: AppTheme.Spacing.xs) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
            Text(value)
                .font(.title.weight(.bold))
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Low Stock

    @ViewBuilder
    private func lowStockSection(_ dash: LocationDashboardResponse) -> some View {
        if !dash.lowStockMaterials.isEmpty {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Label("Stoc scăzut", systemImage: "exclamationmark.triangle.fill")
                    .font(.headline)
                    .foregroundStyle(.red)

                ForEach(dash.lowStockMaterials) { mat in
                    HStack {
                        Text(mat.title)
                            .font(.subheadline)
                        Spacer()
                        Text(UnitType.formatQty(mat.quantity, unitRaw: mat.unit))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.red)
                    }
                    .padding(.vertical, AppTheme.Spacing.xxs)
                }
            }
            .padding()
            .background(.background, in: RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
            .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        }
    }
}

#Preview {
    NavigationStack {
        LocationDashboardView(locationId: "preview")
    }
}
