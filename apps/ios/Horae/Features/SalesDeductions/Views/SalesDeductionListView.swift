import SwiftUI

/// "Vânzări → stoc" — jurnalul scăderilor de stoc pe bază de vânzări + pornirea
/// uneia noi (pas 1: locația, pas 2: sursa). iOS twin of web `stock/sales`.
struct SalesDeductionListView: View {
    @State private var viewModel = SalesDeductionListViewModel()
    @State private var showNew = false
    @State private var hasAppearedOnce = false
    /// "Selectează" mode — multi-select + bulk delete.
    @State private var selection = BulkSelection()
    @Environment(\.routeNavigator) private var navigator

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var canCreate: Bool { permissions.can(.create, .StockMovement) }

    var body: some View {
        Group {
            if viewModel.items.isEmpty && viewModel.hasLoaded && !viewModel.isLoading {
                emptyState
            } else if viewModel.items.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                list
            }
        }
        .appScreenBackground()
        .navigationTitle("Vânzări → stoc")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canCreate {
                ToolbarItem(placement: .primaryAction) {
                    Button { showNew = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Scădere nouă")
                }
            }
        }
        .task { await viewModel.load() }
        .onAppear {
            // Back from a confirmer: the draft may now be confirmed/discarded.
            if hasAppearedOnce { Task { await viewModel.load() } }
            hasAppearedOnce = true
        }
        .refreshable { await Task { await viewModel.load() }.value }
        .errorAlert($viewModel.error)
        .sheet(isPresented: $showNew) {
            NewSalesDeductionSheet { created in
                showNew = false
                navigator.push(.salesDeductionDetail(id: created.id))
            }
        }
        .bulkSelectToolbar(selection, isEnabled: (permissions.can(.delete, .StockMovement) || permissions.can(.create, .StockMovement)))
        .bulkSelectBar(
            selection,
            allIds: viewModel.items.map(\.id),
            warning: BulkDeleteWarning.sales,
            canDelete: permissions.can(.delete, .StockMovement),
            actions: permissions.can(.create, .StockMovement) ? BulkActionCatalog.sales : [],
            onAction: { try await SalesDeductionService.shared.bulkAction(ids: $0, action: $1, params: $2) },
            onPreview: { try await SalesDeductionService.shared.bulkDeletePreview(ids: $0) },
            onDelete: { try await SalesDeductionService.shared.bulkDelete(ids: $0) },
            onDone: { await viewModel.load() }
        )
    }

    private var list: some View {
        List {
            Section {
                ForEach(viewModel.items) { item in
                    BulkSelectRow(id: item.id, selection: selection, route: .salesDeductionDetail(id: item.id)) {
                        SalesDeductionRow(deduction: item)
                    }
                    .task { await viewModel.loadMoreIfNeeded(current: item) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().frame(maxWidth: .infinity)
                }
            } footer: {
                Text("Scade din stocul de produse ce s-a vândut: raport eBriza, manual sau comenzi de pe site.")
            }
        }
        .listStyle(.insetGrouped)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Nicio scădere încă", systemImage: "receipt")
        } description: {
            Text("Încarcă raportul de vânzări din eBriza sau introdu vânzările manual.")
        } actions: {
            if canCreate {
                Button("Scădere nouă") { showNew = true }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.Colors.primary)
            }
        }
    }
}

/// One log row: date, source (+ file/note), location, status, summary, author.
struct SalesDeductionRow: View {
    let deduction: SalesDeduction

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Label(deduction.source.displayName, systemImage: deduction.source.icon)
                    .font(.headline)
                Spacer(minLength: AppTheme.Spacing.sm)
                StatusBadge(salesStatus: deduction.status)
            }
            if let detail = deduction.fileName ?? deduction.note, !detail.isEmpty {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Text(deduction.summaryText)
                .font(.subheadline)
                .foregroundStyle(deduction.status == .DRAFT ? .secondary : .primary)
            Text("\(deduction.displayDate.dottedDateTime) · \(deduction.locationName) · \(deduction.confirmedByName ?? deduction.createdByName)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    NavigationStack {
        SalesDeductionListView()
    }
}
