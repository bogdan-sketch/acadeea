import SwiftUI

/// Panou (Acasă) — redesign: in-content header (user bubble → Profil & setări,
/// search + notifications), org logo wordmark, 2×2 KPI cards, today's
/// production and orders, amber stock alerts and a "+" FAB for quick create.
/// Accent gradient from the top fading into the paper, like the prod app.
struct DashboardView: View {
    @State private var viewModel = DashboardViewModel()
    @State private var showNotifications = false
    @State private var unreadNotifications = 0
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.routeNavigator) private var navigator
    private var authManager: AuthManager { .shared }
    private var permissions: PermissionManager { authManager.permissionManager }
    private var wsManager: WebSocketManager { .shared }

    /// Width of the dashboard column — on iPad it shrinks while the sidebar
    /// is shown in portrait, so the layout follows the width, not the size class.
    @State private var contentWidth: CGFloat = 0

    /// iPad / wide: sections in two columns (prototype IPadPanou)…
    private var isWide: Bool { sizeClass == .regular && contentWidth >= 720 }
    /// …and the four KPI cards in one row (needs less room than two columns).
    private var kpiInOneRow: Bool { sizeClass == .regular && contentWidth >= 600 }
    private var rowLimit: Int { isWide ? 8 : 4 }
    private var taskRowLimit: Int { isWide ? 6 : 3 }

    private var canSeeStock: Bool {
        permissions.can(.read, .RawMaterial) && permissions.can(.read, .Consumable)
    }

    var body: some View {
        // Sticky top like Producție: the profile bubble + search/notifications
        // bar stays, the panou scrolls under it.
        VStack(alignment: .leading, spacing: 0) {
            DashboardHeader(
                unreadNotifications: unreadNotifications,
                showsSearch: canSeeStock,
                openNotifications: { showNotifications = true }
            )
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.top, AppTheme.Spacing.sm)
            .padding(.bottom, 10)

        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                DashboardOrgWordmark()
                    .padding(.horizontal, 4)
                    .padding(.vertical, 4)

                if viewModel.locations.count > 1 {
                    locationChips
                }

                DashboardKpiGrid(viewModel: viewModel, isWide: kpiInOneRow, canSeeStock: canSeeStock)

                sections
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.top, 2)
            // Room for the FAB over the last card.
            .padding(.bottom, 88)
        }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { contentWidth = $0 }
        .refreshable { await Task { await viewModel.load() }.value }
        .appScreenBackground()
        .overlay {
            if !createActions.isEmpty {
                HFabMenu(
                    label: "Adaugă: task, comandă, rețetă sau stoc",
                    items: createActions.map { action in
                        HFabMenuItem(action.title, systemImage: action.icon) { navigator.push(action.route) }
                    }
                )
            }
        }
        // The header lives in the content; on iPad it also carries the
        // hide/show-sidebar button (SidebarToggleButton).
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showNotifications) {
            NavigationStack {
                NotificationInboxView()
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Gata") { showNotifications = false }
                        }
                    }
            }
            // Refresh the badge once the inbox closes (items may now be read).
            .onDisappear { Task { await refreshUnreadBadge() } }
        }
        .onChange(of: viewModel.selectedLocationId) {
            Task { await viewModel.load() }
        }
        .task {
            await viewModel.loadLocations()
            await viewModel.load()
            wsManager.connect()
            setupWebSocketHandlers()
        }
        // Poll the unread badge on appear + on a light interval.
        .task { await pollUnreadBadge() }
    }

    // MARK: - Sections

    @ViewBuilder
    private var sections: some View {
        let production = DashboardProductionCard(
            tasks: Array(viewModel.recentTasks.prefix(taskRowLimit)),
            inProgress: viewModel.tasksInProgress
        )
        let orders = DashboardOrdersCard(orders: Array(viewModel.todayOrders.prefix(rowLimit)))
        let showsOrders = permissions.can(.read, .Order)
        let stock = DashboardStockAlertsCard(
            materials: Array(viewModel.lowStockMaterials.prefix(rowLimit)),
            outOfStock: viewModel.outOfStockCount,
            lowStock: viewModel.lowStockCount,
            locationId: viewModel.selectedLocationId
        )
        let showsStock = canSeeStock && !viewModel.lowStockMaterials.isEmpty

        if isWide {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 12) {
                    production
                    if showsStock { stock }
                }
                .frame(maxWidth: .infinity, alignment: .top)
                if showsOrders {
                    orders.frame(maxWidth: .infinity, alignment: .top)
                }
            }
        } else {
            production
            if showsOrders { orders }
            if showsStock { stock }
        }
    }

    private var locationChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: AppTheme.Spacing.sm) {
                // "Toate" = no location filter; the selected chip is filled.
                HChip("Toate", isSelected: viewModel.selectedLocationId == nil) {
                    viewModel.selectedLocationId = nil
                }
                ForEach(viewModel.locations) { location in
                    HChip(location.name, isSelected: viewModel.selectedLocationId == location.id) {
                        viewModel.selectedLocationId =
                            viewModel.selectedLocationId == location.id ? nil : location.id
                    }
                }
            }
            .padding(.vertical, 6)
        }
        .scrollClipDisabled()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Locație")
    }

    // MARK: - Quick create (FAB)

    private struct CreateAction {
        let title: String
        let icon: String
        let route: Route
    }

    private var createActions: [CreateAction] {
        var items: [CreateAction] = []
        if permissions.can(.create, .Task) { items.append(.init(title: "Task nou", icon: "list.clipboard", route: .taskCreate)) }
        if permissions.can(.create, .Order) { items.append(.init(title: "Comandă nouă", icon: "bag", route: .orderCreate)) }
        if permissions.can(.create, .Recipe) { items.append(.init(title: "Rețetă nouă", icon: "book", route: .recipeCreate)) }
        if canSeeStock {
            items.append(.init(title: "Intrare în stoc", icon: "arrow.down.to.line", route: .stockMovementCreate))
            items.append(.init(title: "Transfer", icon: "arrow.left.arrow.right", route: .transferCreate))
        }
        return items
    }

    // MARK: - Notifications badge

    /// Fetch the unread notification count once (best-effort).
    private func refreshUnreadBadge() async {
        if let count = try? await NotificationService.shared.fetchUnreadCount() {
            unreadNotifications = count
        }
    }

    /// Refresh the badge immediately, then every 60s while the dashboard is on
    /// screen. Cancelled automatically when the view's task is torn down.
    private func pollUnreadBadge() async {
        await refreshUnreadBadge()
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(60))
            if Task.isCancelled { break }
            await refreshUnreadBadge()
        }
    }

    // MARK: - WebSocket

    private func setupWebSocketHandlers() {
        wsManager.onTaskUpdate = { _ in
            Task { await viewModel.load() }
        }
        wsManager.onStockUpdate = { _ in
            Task { await viewModel.load() }
        }
    }
}

#Preview {
    NavigationStack {
        DashboardView()
    }
}
