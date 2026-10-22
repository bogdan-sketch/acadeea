import SwiftUI

/// Tab identifiers.
enum AppTab: String, Hashable {
    case dashboard, orders, tasks, stock, recipes

    /// Sections that run master → detail on iPad (list + detail pane).
    /// iPad list + detail side by side. Stoc is NOT split: its quick actions
    /// (Recepție, Transfer, Revizie…) are full screens, and opening them in the
    /// detail column next to the list was confusing (owner, 17.10.2026).
    var isMasterDetail: Bool { self == .orders }
}

/// One main section as shown in the iPhone tab bar and the iPad dock:
/// Acasă · Producție · Comenzi · Stoc · Rețete (prototype order).
struct AppTabItem {
    let tab: AppTab
    let title: String
    let icon: String

    /// The sections the signed-in role can open, in tab-bar order.
    static var visible: [AppTabItem] {
        let permissions = AuthManager.shared.permissionManager
        var items = [AppTabItem(tab: .dashboard, title: "Acasă", icon: "house")]
        if permissions.can(.read, .Task) {
            items.append(AppTabItem(tab: .tasks, title: "Producție", icon: "list.clipboard"))
        }
        if permissions.can(.read, .Order) {
            items.append(AppTabItem(tab: .orders, title: "Comenzi", icon: "bag"))
        }
        if permissions.can(.read, .RawMaterial) && permissions.can(.read, .Consumable) {
            items.append(AppTabItem(tab: .stock, title: "Stoc", icon: "cube"))
        }
        if permissions.can(.read, .Recipe) {
            items.append(AppTabItem(tab: .recipes, title: "Rețete", icon: "book"))
        }
        return items
    }
}

/// Role-adaptive root. Compact width (iPhone): a TabView, one NavigationStack
/// per tab. Regular width (iPad): a NavigationSplitView whose sidebar lists
/// the same sections plus the tools/admin screens, and whose detail column
/// hosts the selected section's stack. The per-section paths live in
/// `AppRouter`, so both layouts share navigation state and the same Route
/// resolver.
struct AppTabView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var selectedTab: AppTab = .dashboard
    @State private var sidebarSelection: SidebarItem? = .tab(.dashboard)
    /// iPad sidebar shown / hidden — the user's choice, persisted.
    @State private var sidebarHidden: Bool =
        UserDefaults.standard.bool(forKey: AppTabView.sidebarHiddenKey)
    private static let sidebarHiddenKey = "ipadSidebarHidden"
    @State private var router = AppRouter()

    /// "Ce e nou" popup — shown once per version after an update (test builds only).
    @AppStorage("lastSeenWhatsNewVersion") private var lastSeenWhatsNewVersion = ""
    @State private var whatsNewEntry: ChangelogEntry?

    private var authManager: AuthManager { .shared }

    private var permissions: PermissionManager { authManager.permissionManager }

    private var canSeeStock: Bool {
        permissions.can(.read, .RawMaterial) && permissions.can(.read, .Consumable)
    }

    var body: some View {
        Group {
            if sizeClass == .regular {
                splitLayout
            } else {
                tabLayout
            }
        }
        .onChange(of: StockDeepLink.shared.requestID) {
            // Card quick-info de stoc de pe homepage — sari pe tabul Stoc;
            // StockOverviewView consuma filtrul + locatia. Rolurile fara acces
            // la stoc nu au tabul — a comuta pe un tag inexistent lasa
            // TabView-ul fara selectie.
            guard canSeeStock else { return }
            select(.stock)
        }
        .onChange(of: selectedTab) { previousTab, _ in
            // Switching tabs starts the new tab at its root screen — leaving a
            // sub-page (e.g. a material's detail) behind on another tab reads
            // as "the app got stuck where I was". Reset the tab being LEFT so
            // the switch itself stays animation-free.
            router.popToRoot(tab: previousTab)
        }
        .onChange(of: sidebarSelection) { _, item in
            guard let item else { return }
            activate(item)
        }
        .onChange(of: sizeClass) {
            // Rotating / multitasking between layouts: keep the sidebar
            // highlight on the section the stack is showing.
            sidebarSelection = .tab(selectedTab)
        }
        .toastOverlay()
        .tutorialOverlay()
        .task {
            // Per-user tutorial preference: load whoever just logged in.
            TutorialCenter.shared.syncCurrentUser()
            #if DEBUG
            if let target = await DebugLaunchRoute.resolve() {
                select(target.tab)
                if let route = target.route {
                    try? await Task.sleep(for: .milliseconds(400))
                    router.open(route, on: target.tab)
                    if sizeClass == .regular { sidebarSelection = .route(route, host: target.tab) }
                }
                return
            }
            #endif
            await checkWhatsNew()
        }
        .sheet(item: $whatsNewEntry) { entry in
            WhatsNewSheet(entry: entry) {
                lastSeenWhatsNewVersion = entry.version
                whatsNewEntry = nil
            }
        }
    }

    // MARK: - Compact: TabView

    private var tabLayout: some View {
        TabView(selection: $selectedTab) {
            // Acasă · Producție · Comenzi · Stoc · Rețete, filtered by role.
            ForEach(AppTabItem.visible, id: \.tab) { item in
                tab(item.tab, item.title, icon: item.icon)
            }
        }
        // Selected tab: the scheme accent as text (readable on dark schemes too).
        .tint(AppTheme.Colors.primaryText)
    }

    private func tab(_ tab: AppTab, _ title: String, icon: String) -> some View {
        sectionStack(for: tab)
            .tabItem {
                Label(title, systemImage: icon)
                    .environment(\.symbolVariants, .none)
            }
            .tag(tab)
    }

    // MARK: - Regular: sidebar + detail

    /// Fixed sidebar width from the design (232pt). A plain HStack instead of
    /// `NavigationSplitView`: on iOS 26 the system sidebar is a floating glass
    /// panel ~330pt wide that ignores `navigationSplitViewColumnWidth`.
    static let sidebarWidth: CGFloat = 232

    private var splitLayout: some View {
        HStack(spacing: 0) {
            if !sidebarHidden {
                AppSidebarView(
                    selection: $sidebarSelection,
                    // Panou draws the org header in its own content header;
                    // the rail shows it on every other section — never twice.
                    showsOrgHeader: selectedTab != .dashboard || !router.dashboardPath.isEmpty
                )
                .frame(width: Self.sidebarWidth)
                .transition(.move(edge: .leading))
            }
            VStack(spacing: 0) {
                sectionContent(for: selectedTab)
                    // A fresh stack per section: the root view (and its view
                    // model) belongs to that section, like a tab on iPhone.
                    .id(selectedTab)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if sidebarHidden {
                    // Sidebar ascuns: navigarea vine jos, centrat, ca un dock.
                    // Sta SUB continut (nu peste el), deci nici lista master,
                    // nici detaliul, nici FAB-ul nu ajung sub el.
                    AppDockView(
                        selectedTab: $selectedTab,
                        showSidebar: { setSidebar(hidden: false) },
                        selectSection: { activate(.tab($0)); sidebarSelection = .tab($0) }
                    )
                    .frame(maxWidth: .infinity)
                    .background(AppTheme.Colors.appBackground.ignoresSafeArea(edges: .bottom))
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .background(AppTheme.Colors.appBackground.ignoresSafeArea())
        .onChange(of: sidebarHidden) { _, hidden in
            UserDefaults.standard.set(hidden, forKey: Self.sidebarHiddenKey)
        }
    }

    private func setSidebar(hidden: Bool) {
        if reduceMotion {
            sidebarHidden = hidden
        } else {
            withAnimation(.snappy) { sidebarHidden = hidden }
        }
    }

    /// Handed to the section roots on iPad: `SidebarToggleButton` in their
    /// in-content header renders it.
    private var sidebarToggle: SidebarToggle? {
        guard sizeClass == .regular else { return nil }
        return SidebarToggle(isHidden: sidebarHidden) { setSidebar(hidden: !sidebarHidden) }
    }

    /// Pushed screens on iPad keep a navigation bar (back button); the
    /// hide/show-sidebar button sits next to it there.
    @ViewBuilder
    private func sidebarToggleToolbar<Content: View>(_ content: Content, enabled: Bool) -> some View {
        if enabled, let toggle = sidebarToggle {
            content.toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: toggle.toggle) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel(toggle.label)
                    .help(toggle.label)
                    .accessibilityIdentifier("toolbar.sidebarToggle")
                }
            }
        } else {
            content
        }
    }

    /// Sidebar tap → switch section and, for a tool/admin entry, push its
    /// route on top of the host section's root.
    private func activate(_ item: SidebarItem) {
        switch item {
        case .tab(let tab):
            if tab == selectedTab {
                // Re-tapping the current section returns to its root.
                router.popToRoot(tab: tab)
            } else {
                selectedTab = tab
            }
        case .route(let route, let host):
            router.popToRoot(tab: host)
            selectedTab = host
            // Push after the stack for `host` is on screen — appending while
            // the detail column swaps roots can drop the push.
            DispatchQueue.main.async {
                router.open(route, on: host)
            }
        }
    }

    /// Programmatic section switch (deep links) that keeps the sidebar in sync.
    private func select(_ tab: AppTab) {
        selectedTab = tab
        if sidebarSelection != .tab(tab) {
            sidebarSelection = .tab(tab)
        }
    }

    // MARK: - Section stacks

    /// The NavigationStack of one section: its root list + the shared Route
    /// resolver + the `routeNavigator` so sheets can push onto this stack.
    private func sectionStack(for tab: AppTab) -> some View {
        NavigationStack(path: router.path(for: tab)) {
            rootView(for: tab)
                .environment(\.sidebarToggle, sidebarToggle)
                .navigationDestination(for: Route.self) { route in
                    trackedDestination(for: route)
                }
        }
        .environment(\.routeNavigator, navigator(for: tab))
    }

    /// iPad: Stoc and Comenzi run master → detail when the detail column is
    /// wide enough (sidebar hidden in portrait, or landscape); narrower, they
    /// fall back to the single stack like every other section.
    @ViewBuilder
    private func sectionContent(for tab: AppTab) -> some View {
        if sizeClass == .regular, tab.isMasterDetail {
            GeometryReader { proxy in
                if proxy.size.width >= Self.masterDetailMinWidth {
                    MasterDetailSection(
                        tab: tab,
                        router: router,
                        sidebarToggle: sidebarToggle,
                        availableWidth: proxy.size.width,
                        master: { rootView(for: tab) },
                        detail: { trackedDestination(for: $0, toolbarToggle: false) }
                    )
                } else {
                    sectionStack(for: tab)
                }
            }
        } else {
            sectionStack(for: tab)
        }
    }

    private static let masterDetailMinWidth: CGFloat = 720

    @ViewBuilder
    private func rootView(for tab: AppTab) -> some View {
        switch tab {
        case .dashboard: DashboardView()
        case .orders: OrderListView()
        case .tasks: TaskListView()
        case .stock: StockOverviewView()
        case .recipes: RecipeListView()
        }
    }

    private func navigator(for tab: AppTab) -> RouteNavigator {
        RouteNavigator { [router] route in router.push(route, on: tab) }
    }


    /// After an update, show the current version's highlights once.
    private func checkWhatsNew() async {
        let installed = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        guard !installed.isEmpty, installed != lastSeenWhatsNewVersion else { return }
        guard let entry = try? await ChangelogService.shared.fetchChangelog().entries.first,
              entry.version == installed, !entry.highlights.isEmpty else {
            // No matching entry — don't nag again for this version.
            lastSeenWhatsNewVersion = installed
            return
        }
        // Mark seen at presentation time: a swipe-dismiss must not re-trigger
        // the popup on every launch (the button callback isn't the only exit).
        lastSeenWhatsNewVersion = entry.version
        whatsNewEntry = entry
    }

    // MARK: - Route Resolver

    /// Resolves a Route to its view, records a PostHog screen view on appear
    /// (no-op when analytics is disabled) and, on iPad, centres form/detail
    /// screens in a readable column (lists/boards keep the full width).
    @ViewBuilder
    private func trackedDestination(for route: Route, toolbarToggle: Bool = true) -> some View {
        Group {
            if route.prefersFullWidth {
                sidebarToggleToolbar(destinationView(for: route), enabled: toolbarToggle)
                    .trackScreen(route.screenName)
            } else {
                sidebarToggleToolbar(destinationView(for: route), enabled: toolbarToggle)
                    .trackScreen(route.screenName)
                    .readableWidth()
            }
        }
        // Pushed screens carry the toggle in their bar, not in their title.
        .environment(\.sidebarToggle, nil)
    }

    @ViewBuilder
    private func destinationView(for route: Route) -> some View {
        switch route {
        // Tasks
        case .taskList: TaskListView()
        case .taskDetail(let id): TaskDetailView(taskId: id)
        case .taskCreate: TaskFormView(mode: .create)
        case .taskCreateFromRecipe(let recipeId): TaskFormView(mode: .create, preselectedRecipeId: recipeId)
        case .taskEdit(let id): TaskFormView(mode: .edit(id))
        case .productionCalendar: ProductionCalendarView()
        case .stockHistory(let materialId, let materialTitle): StockHistoryChartView(materialId: materialId, materialTitle: materialTitle)

        // Recipes
        case .recipeList: RecipeListView()
        case .recipeDetail(let id): RecipeDetailView(recipeId: id)
        case .recipeCreate: RecipeFormView(mode: .create)
        case .recipeEdit(let id): RecipeFormView(mode: .edit(id))
        case .recipeYieldHistory(let id): RecipeYieldHistoryView(recipeId: id)
        case .recipeCost(let id): RecipeCostView(recipeId: id)
        case .recipeVersionHistory(let id): RecipeVersionHistoryView(recipeId: id)
        case .recipePricing(let id): RecipePricingView(recipeId: id)
        case .priceHistory: PriceHistoryView()

        // Stock
        case .rawMaterialList: RawMaterialListView()
        case .rawMaterialDetail(let id): RawMaterialDetailView(materialId: id)
        case .consumableList: ConsumableListView()
        case .consumableDetail(let id): ConsumableDetailView(consumableId: id)
        case .stockMovements: StockMovementListView()
        case .stockReview: StockReviewView()
        case .stockMovementCreate: StockMovementFormView()
        case .recipeStockDetail(let id): RecipeStockDetailView(recipeId: id)
        case .expiryTracking: ExpiryTrackingView()
        case .batchReceive: BatchReceiveView()
        case .testConsumption: TestConsumptionView()
        case .requirementsPlan: RequirementsPlanView()
        case .stockSearch: StockSearchView()
        case .suppliers: SuppliersListView()
        case .salesDeductions: SalesDeductionListView()
        case .salesDeductionDetail(let id): SalesDeductionDetailView(deductionId: id)

        // Orders
        case .orderList: OrderListView()
        case .orderDetail(let id): OrderDetailView(orderId: id)
        case .orderCreate: CreateOrderSheet { _ in }
        case .orderDeliveryNote(let id): DeliveryNoteView(orderId: id)
        case .orderStats: OrderStatsView()
        case .orderCalendar: OrderCalendarView()

        // Users
        case .userList: UserListView()
        case .userDetail(let id): UserDetailView(userId: id)

        // Roles
        case .roleList: RoleListView()
        case .roleDetail(let id): RoleDetailView(roleId: id)
        case .roleCreate: RoleFormView(mode: .create)

        // Settings
        case .settings: ProfileView()
        case .companyEdit: CompanyEditView()
        case .brandingSettings: BrandingSettingsView()
        case .categoryManagement: CategoryManagementView()
        case .changelog: ChangelogView()
        case .linkedAccounts: LinkedAccountsView()
        case .backupSettings: BackupSettingsView()
        case .dataReset: DataResetView()

        // Help / tutorial
        case .helpCenter: HelpCenterView()

        // Locations & Transfers
        case .locationList: LocationListView()
        case .locationCreate: CreateLocationView()
        case .locationEdit(let id): EditLocationView(locationId: id)
        case .locationStock(let id): LocationStockView(locationId: id)
        case .locationDashboard(let id): LocationDashboardView(locationId: id)
        case .locationUsers(let id): LocationUsersView(locationId: id)
        case .myLocations: LocationListView()
        case .transferList: TransferListView()
        case .transferDetail(let id): TransferDetailView(transferId: id)
        case .transferCreate: CreateTransferView()
        case .transferApproval(let id): TransferApprovalView(transferId: id)

        // Analytics
        case .analyticsDashboard: AnalyticsDashboardView()

        // Integrations
        case .integrationList: IntegrationsListView()
        case .integrationDetail(let id): IntegrationDetailView(integrationId: id)

        // Shopping list
        case .shoppingList: ShoppingListView()

        // Activity
        case .activityFeed: ActivityFeedView()

        // Notifications
        case .notificationInbox: NotificationInboxView()
        }
    }
}

#Preview {
    AppTabView()
}
