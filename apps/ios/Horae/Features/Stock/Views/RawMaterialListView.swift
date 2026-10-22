import SwiftUI

struct RawMaterialListView: View {
    @State private var viewModel = RawMaterialListViewModel()
    @State private var hasAppearedOnce = false
    /// "Selectează" mode — multi-select + bulk (hard) delete.
    @State private var selection = BulkSelection()
    @State private var showCreate = false

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }

    var body: some View {
        PaginatedListView(
            items: viewModel.materials,
            isLoading: viewModel.isLoading,
            hasNextPage: viewModel.hasNextPage,
            emptyTitle: "Nu există materii prime",
            emptySystemImage: "leaf",
            onLoadMore: { await viewModel.loadMore() },
            onRefresh: { await viewModel.refresh() }
        ) { material in
            BulkSelectRow(id: material.id, selection: selection, route: .rawMaterialDetail(id: material.id)) {
                RawMaterialRowView(material: material)
            }
        }
        .searchable(text: $viewModel.searchText, prompt: "Caută materii prime…")
        .onChange(of: viewModel.searchText) {
            viewModel.searchChanged()
        }
        .task { await viewModel.loadMaterials(reset: true) }
        .onAppear {
            // Refresh when returning from a detail (adjust/receive changed
            // stock there) — .task only runs on the first appearance.
            guard hasAppearedOnce else { hasAppearedOnce = true; return }
            Task { await viewModel.loadMaterials(reset: true) }
        }
        .overlay {
            if viewModel.materials.isEmpty && !viewModel.isLoading {
                StockListEmptyState(
                    searchText: viewModel.searchText,
                    emptyTitle: "Nicio materie primă încă",
                    emptyMessage: "Adaugă făina, zahărul, untul… — apoi le primești în stoc cu „Recepție”.",
                    systemImage: "leaf",
                    actionTitle: permissions.can(.create, .RawMaterial) ? "Adaugă prima materie primă" : nil,
                    action: { showCreate = true }
                )
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                CreateRawMaterialFormView(
                    initialCategory: nil,
                    onCreate: { _ in showCreate = false; Task { await viewModel.loadMaterials(reset: true) } },
                    onCancel: { showCreate = false }
                )
            }
        }
        .errorAlert($viewModel.error)
        .bulkSelectToolbar(selection, isEnabled: (permissions.can(.delete, .RawMaterial) || permissions.can(.update, .RawMaterial)))
        .bulkSelectBar(
            selection,
            allIds: viewModel.materials.map(\.id),
            warning: BulkDeleteWarning.rawMaterials,
            canDelete: permissions.can(.delete, .RawMaterial),
            actions: permissions.can(.update, .RawMaterial) ? BulkActionCatalog.rawMaterials : [],
            onAction: { try await StockService.shared.bulkActionRawMaterials(ids: $0, action: $1, params: $2) },
            onPreview: { try await StockService.shared.bulkDeleteRawMaterialsPreview(ids: $0) },
            onDelete: { try await StockService.shared.bulkDeleteRawMaterials(ids: $0) },
            onDone: { await viewModel.loadMaterials(reset: true) }
        )
    }
}

struct RawMaterialRowView: View {
    let material: RawMaterialResponse

    var body: some View {
        HStack {
            Text(material.title)
                .font(.body)
                .lineLimit(1)
                .foregroundStyle(material.isLowStock ? .red : .primary)
            Spacer()
            Text("\(material.unit.formatQty(material.stockCount))")
                .font(.subheadline)
                .foregroundStyle(material.isLowStock ? .red : .secondary)
            if material.isLowStock {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
    }
}
