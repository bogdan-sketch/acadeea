import SwiftUI

struct ConsumableListView: View {
    @State private var viewModel = ConsumableListViewModel()
    @State private var hasAppearedOnce = false
    /// "Selectează" mode — multi-select + bulk (hard) delete.
    @State private var selection = BulkSelection()
    @State private var showCreate = false

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        PaginatedListView(
            items: viewModel.consumables,
            isLoading: viewModel.isLoading,
            hasNextPage: viewModel.hasNextPage,
            emptyTitle: "Nu există consumabile",
            emptySystemImage: "cube.box",
            onLoadMore: { await viewModel.loadMore() },
            onRefresh: { await viewModel.refresh() }
        ) { consumable in
            BulkSelectRow(id: consumable.id, selection: selection, route: .consumableDetail(id: consumable.id)) {
                ConsumableRowView(consumable: consumable)
            }
        }
        .searchable(text: $viewModel.searchText, prompt: "Caută consumabile…")
        .onChange(of: viewModel.searchText) {
            viewModel.searchChanged()
        }
        .task { await viewModel.loadConsumables(reset: true) }
        .onAppear {
            // Refresh when returning from a detail (adjust/receive changed
            // stock there) — .task only runs on the first appearance.
            guard hasAppearedOnce else { hasAppearedOnce = true; return }
            Task { await viewModel.loadConsumables(reset: true) }
        }
        .overlay {
            if viewModel.consumables.isEmpty && !viewModel.isLoading {
                StockListEmptyState(
                    searchText: viewModel.searchText,
                    emptyTitle: "Niciun consumabil încă",
                    emptyMessage: "Cutii, pungi, etichete — tot ce folosești la ambalare, cu stoc minim și alertă.",
                    systemImage: "cube.box",
                    actionTitle: permissions.can(.create, .Consumable) ? "Adaugă primul consumabil" : nil,
                    action: { showCreate = true }
                )
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                CreateConsumableFormView(
                    initialCategory: nil,
                    onCreate: { _ in showCreate = false; Task { await viewModel.loadConsumables(reset: true) } },
                    onCancel: { showCreate = false }
                )
            }
        }
        .errorAlert($viewModel.error)
        .bulkSelectToolbar(selection, isEnabled: (permissions.can(.delete, .Consumable) || permissions.can(.update, .Consumable)))
        .bulkSelectBar(
            selection,
            allIds: viewModel.consumables.map(\.id),
            warning: BulkDeleteWarning.consumables,
            canDelete: permissions.can(.delete, .Consumable),
            actions: permissions.can(.update, .Consumable) ? BulkActionCatalog.consumables : [],
            onAction: { try await StockService.shared.bulkActionConsumables(ids: $0, action: $1, params: $2) },
            onPreview: { try await StockService.shared.bulkDeleteConsumablesPreview(ids: $0) },
            onDelete: { try await StockService.shared.bulkDeleteConsumables(ids: $0) },
            onDone: { await viewModel.loadConsumables(reset: true) }
        )
    }
}

struct ConsumableRowView: View {
    let consumable: ConsumableResponse

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Text(consumable.title)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                StatusBadge(materialStatus: consumable.status)
            }

            HStack(spacing: AppTheme.Spacing.lg) {
                Label("\(consumable.stockCount.qtyFormatted) în stoc", systemImage: "shippingbox")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if consumable.reservedCount > 0 {
                    Label("\(consumable.reservedCount) rezervate", systemImage: "lock")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            if consumable.stockCount <= consumable.minimumStock && consumable.minimumStock > 0 {
                Label("Sub stocul minim (\(consumable.minimumStock))", systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
    }
}
