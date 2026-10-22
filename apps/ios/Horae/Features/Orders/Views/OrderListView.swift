import SwiftUI

/// Comenzi: eyebrow + Fraunces title, search, Pregătiri | Intrări switch,
/// delivery-method chips, day-grouped orders, FAB for a new order. Statuses
/// are picked from the head's filter menu (default only "Nouă"). The
/// navigation bar is hidden on this root screen — its actions live in the
/// in-content header, which collapses while scrolling down (the switch and
/// the chips stay pinned).
struct OrderListView: View {
    @State private var viewModel = OrderListViewModel()
    /// "Selectează" mode — multi-select + bulk delete.
    @State private var selection = BulkSelection()
    @State private var showAliasEditor = false
    /// Collapsing head (title + search) — hidden while scrolling down.
    @State private var headVisible = true
    @Environment(\.routeNavigator) private var navigator
    @Environment(\.horizontalSizeClass) private var sizeClass

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var canBulk: Bool { permissions.can(.delete, .Order) || permissions.can(.update, .Order) }
    private var area: OrdersAreaState { viewModel.area }

    var body: some View {
        // Collapsing head (title + search) over pinned pill rows (switch +
        // method chips); only the orders scroll and refresh.
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                header
                OrderSearchField(text: $viewModel.searchText)
                    .padding(.horizontal, 16)
            }
            .padding(.top, 8)
            .padding(.bottom, 10)
            .autoCollapsible(headVisible)

            VStack(alignment: .leading, spacing: 10) {
                OrderViewSegmented(selection: area.view) { area.view = $0 }
                    .padding(.horizontal, 16)
                if area.showsMethodFilter {
                    DeliveryMethodChipBar(
                        area: area,
                        canEditAliases: permissions.can(.manage, .Organization)
                    ) { showAliasEditor = true }
                    .padding(.vertical, -6)
                }
            }
            .padding(.top, headVisible ? 0 : 8)
            .padding(.bottom, 10)

            ScrollViewReader { proxy in
                ScrollView {
                    OrderRowsView(viewModel: viewModel, selection: selection, columns: columns)
                        .padding(.horizontal, 16)
                        .padding(.top, 2)
                        .padding(.bottom, 96) // clears the FAB
                }
                // Only the rows refresh: `.refreshable` on the whole screen
                // also reached the header's horizontal chip ScrollView, so a
                // downward drag on the chips pulled-to-refresh the screen.
                .refreshable { await Task { await reload() }.value }
                .autoHideOnScroll($headVisible)
                .onChange(of: viewModel.scrollToTodayRequest) {
                    guard let id = viewModel.focusGroupId else { return }
                    // Next runloop: the new rows must be laid out first.
                    DispatchQueue.main.async { proxy.scrollTo(id, anchor: .top) }
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .overlay { emptyOrLoading }
        .overlay(alignment: .bottomTrailing) { fab }
        .appScreenBackground(showsGradient: false)
        // Actions (and, on iPad, the sidebar toggle) live in the in-content header.
        .toolbar(.hidden, for: .navigationBar)
        .onChange(of: viewModel.searchText) { viewModel.searchChanged() }
        .onChange(of: area.view) { Task { await viewModel.viewChanged() } }
        .onChange(of: area.deliveryFilter) { Task { await viewModel.loadOrders(reset: true) } }
        .onChange(of: area.statusFilter) { Task { await viewModel.loadOrders(reset: true) } }
        .onAppear {
            // Fresh methods on every appearance (new shop methods, renamed/re-kinded).
            Task { await area.loadMethods() }
            // A view/method picked on the calendar while this screen was covered.
            if let loaded = viewModel.loadedKey, loaded != viewModel.areaKey {
                Task { await viewModel.viewChanged() }
            }
        }
        .task { await viewModel.loadOrders(reset: true) }
        .task { await viewModel.loadStats() }
        .sheet(isPresented: $showAliasEditor, onDismiss: { Task { await reload() } }) {
            DeliveryMethodAliasSheet(area: area)
        }
        .bulkSelectBar(
            selection,
            allIds: viewModel.orders.map(\.id),
            warning: BulkDeleteWarning.orders,
            canDelete: permissions.can(.delete, .Order),
            actions: permissions.can(.update, .Order) ? BulkActionCatalog.orders : [],
            onAction: { try await OrderService.shared.bulkAction(ids: $0, action: $1, params: $2) },
            onPreview: { try await OrderService.shared.bulkDeletePreview(ids: $0) },
            onDelete: { try await OrderService.shared.bulkDelete(ids: $0) },
            onDone: { await reload() }
        )
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .bottom, spacing: 8) {
            HScreenTitle("Comenzi", eyebrow: viewModel.summary)
            HIconButton("calendar", label: "Calendar comenzi") { navigator.push(.orderCalendar) }
            OrderStatusFilterButton(area: area, counts: viewModel.stats?.statusCounts)
            HIconButton("chart.bar", label: "Statistici comenzi") { navigator.push(.orderStats) }
            if canBulk {
                HIconButton(
                    selection.isActive ? "xmark" : "checkmark.circle",
                    label: selection.isActive ? "Gata cu selecția" : "Selectează comenzi"
                ) {
                    if selection.isActive { selection.exit() } else { selection.enter() }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private var fab: some View {
        if permissions.can(.create, .Order), !selection.isActive {
            HFab(label: "Comandă nouă") { navigator.push(.orderCreate) }
                .padding(.trailing, 18)
                .padding(.bottom, 18)
        }
    }

    @ViewBuilder
    private var emptyOrLoading: some View {
        if viewModel.orders.isEmpty {
            if viewModel.isLoading {
                ProgressView().id("orders-initial-spinner")
            } else {
                ContentUnavailableView(
                    viewModel.searchText.isEmpty ? "Nu există comenzi" : "Niciun rezultat",
                    systemImage: "shippingbox",
                    description: Text(area.activeStatuses == nil ? "" : "Filtru: \(area.statusSummary).")
                )
                .padding(.top, 160)
            }
        }
    }

    private var columns: [GridItem] {
        sizeClass == .regular
            ? [GridItem(.adaptive(minimum: 320), spacing: 8, alignment: .top)]
            : [GridItem(.flexible())]
    }

    private func reload() async {
        async let methods: Void = area.loadMethods()
        await viewModel.loadOrders(reset: true)
        await viewModel.loadStats()
        await methods
    }
}

// MARK: - Rows

private struct OrderRowsView: View {
    let viewModel: OrderListViewModel
    let selection: BulkSelection
    let columns: [GridItem]

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 8, pinnedViews: [.sectionHeaders]) {
            ForEach(viewModel.groups) { group in
                Section {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(group.orders) { order in
                            BulkSelectRow(id: order.id, selection: selection, route: .orderDetail(id: order.id)) {
                                OrderListRow(order: order)
                                    .masterDetailHighlight(.orderDetail(id: order.id), cornerRadius: 16)
                            }
                            .buttonStyle(.plain)
                            .onAppear { prefetch(order) }
                        }
                    }
                } header: {
                    OrderDayHeader(title: group.title, count: group.orders.count, isToday: group.id == "azi")
                        .id(group.id)
                }
            }
            if viewModel.isLoading, !viewModel.orders.isEmpty {
                ProgressView()
                    .id("orders-spinner-\(viewModel.orders.count)")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
        }
    }

    private func prefetch(_ order: OrderResponse) {
        if viewModel.sortedOrders.isNearEnd(order) {
            Task { await viewModel.loadMore() }
        }
    }
}

/// Sticky day header of the list: "Azi · 4", "luni, 19 oct · 2".
private struct OrderDayHeader: View {
    let title: String
    let count: Int
    let isToday: Bool

    var body: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(AppFont.body(14, weight: .bold))
                .foregroundStyle(isToday ? AppTheme.Colors.primaryText : AppTheme.Colors.label)
            Text("\(count)")
                .font(AppFont.body(12, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.Colors.appBackground)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(RoCount.format(count, one: "comandă", many: "comenzi"))")
        .accessibilityAddTraits(.isHeader)
    }
}

#Preview("OrderListView") {
    NavigationStack {
        OrderListView()
    }
}
