import SwiftUI
import Observation

@Observable
final class TransferListViewModel {
    var transfers: [TransferResponse] = []
    var isLoading = false
    var error: APIError?

    private let service = LocationService.shared

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await service.fetchTransfers(query: TransferQuery(limit: 50))
            transfers = result.data
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}

struct TransferListView: View {
    @State private var viewModel = TransferListViewModel()
    /// "Selectează" mode — multi-select + bulk delete.
    @State private var selection = BulkSelection()

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.transfers.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.transfers.isEmpty {
                ContentUnavailableView(
                    "Niciun transfer",
                    systemImage: "arrow.left.arrow.right",
                    description: Text("Nu există transferuri de stoc")
                )
            } else {
                List(viewModel.transfers) { transfer in
                    BulkSelectRow(id: transfer.id, selection: selection, route: .transferDetail(id: transfer.id)) {
                        TransferRow(transfer: transfer)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Transferuri")
        .toolbar {
            if permissions.can(.create, .StockTransfer) {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(value: Route.transferCreate) {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .task { await viewModel.load() }
        .refreshable { await Task { await viewModel.load() }.value }
        .errorAlert($viewModel.error)
        .bulkSelectToolbar(selection, isEnabled: (permissions.can(.delete, .StockTransfer) || permissions.can(.update, .StockTransfer)))
        .bulkSelectBar(
            selection,
            allIds: viewModel.transfers.map(\.id),
            warning: BulkDeleteWarning.transfers,
            canDelete: permissions.can(.delete, .StockTransfer),
            actions: permissions.can(.update, .StockTransfer) ? BulkActionCatalog.transfers : [],
            onAction: { try await LocationService.shared.bulkActionTransfers(ids: $0, action: $1, params: $2) },
            onPreview: { try await LocationService.shared.bulkDeleteTransfersPreview(ids: $0) },
            onDelete: { try await LocationService.shared.bulkDeleteTransfers(ids: $0) },
            onDone: { await viewModel.load() }
        )
    }
}

private struct TransferRow: View {
    let transfer: TransferResponse

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Text("\(transfer.fromLocation.name) → \(transfer.toLocation.name)")
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)

                if transfer.adhocDestination {
                    Text("Eveniment")
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.purple.opacity(0.15))
                        .foregroundStyle(.purple)
                        .clipShape(Capsule())
                }

                Spacer()

                Text(transfer.status.displayName)
                    .font(.caption)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(transferStatusColor(transfer.status).opacity(0.15))
                    .foregroundStyle(transferStatusColor(transfer.status))
                    .clipShape(Capsule())
            }

            HStack {
                Text("\(transfer.items.count) produs\(transfer.items.count == 1 ? "" : "e")")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(StockDate.shortTime(transfer.createdAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xs)
    }

    func transferStatusColor(_ status: TransferStatus) -> Color {
        switch status {
        case .IN_ASTEPTARE: .orange
        case .IN_TRANZIT: .blue
        case .FINALIZAT: .green
        case .ANULAT: .red
        }
    }
}

#Preview {
    NavigationStack {
        TransferListView()
    }
}
