import SwiftUI

/// Producție — redesign: eyebrow + Fraunces title with calendar / shopping
/// list icon buttons, status chips (with counts) and range chips instead of a
/// filter sheet, task cards, and a "+" FAB. On iPad the list ⇄ board toggle
/// stays; on iPhone the status chips replace the board.
struct TaskListView: View {
    @State private var viewModel = TaskListViewModel()
    @State private var searchText = ""
    @State private var hasAppearedOnce = false
    @AppStorage("taskViewMode") private var viewMode: TaskViewMode = .list
    /// "Selectează" mode — multi-select + bulk delete (lista only).
    @State private var selection = BulkSelection()
    /// Collapsing head (title + icon buttons) — hidden while the list scrolls
    /// down; the status / range pills stay pinned.
    @State private var headVisible = true
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.routeNavigator) private var navigator

    private var permissions: PermissionManager { AuthManager.shared.permissionManager }
    private var isWide: Bool { sizeClass == .regular }
    private var effectiveMode: TaskViewMode { isWide ? viewMode : .list }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 20)
                .padding(.bottom, 10)
                .autoCollapsible(headVisible || effectiveMode != .list)

            if effectiveMode == .list {
                filterChips
                    .padding(.top, headVisible ? 0 : 8)
                listContent
                    .autoHideOnScroll($headVisible)
                    // An empty list has nothing to scroll back up — show the head.
                    .onChange(of: viewModel.tasks.isEmpty) { _, isEmpty in
                        if isEmpty { headVisible = true }
                    }
                    .collapsedSearch(text: $viewModel.searchText, prompt: "Caută taskuri…")
                    .onChange(of: viewModel.searchText) {
                        viewModel.searchChanged()
                    }
            } else {
                TaskBoardView(searchText: $searchText)
                    .collapsedSearch(text: $searchText, prompt: "Caută taskuri…")
            }
        }
        .appScreenBackground(showsGradient: false)
        .overlay(alignment: .bottomTrailing) {
            if permissions.can(.create, .Task) && !selection.isActive {
                HFab(label: "Task nou") { navigator.push(.taskCreate) }
                    .padding(AppTheme.Spacing.lg)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadTasks(reset: true) }
        .task { await viewModel.loadStats() }
        .onAppear {
            // Back from a form (new task / batch / edit): the list must show
            // the result — .task only runs the first time.
            guard hasAppearedOnce else { hasAppearedOnce = true; return }
            Task {
                await viewModel.loadTasks(reset: true)
                await viewModel.loadStats()
            }
        }
        .errorAlert($viewModel.error)
        .bulkSelectToolbar(selection, isEnabled: effectiveMode == .list && (permissions.can(.delete, .Task) || permissions.can(.update, .Task)))
        .bulkSelectBar(
            selection,
            allIds: viewModel.tasks.map(\.id),
            warning: BulkDeleteWarning.tasks,
            canDelete: permissions.can(.delete, .Task),
            actions: permissions.can(.update, .Task) ? BulkActionCatalog.tasks : [],
            onAction: { try await TaskService.shared.bulkAction(ids: $0, action: $1, params: $2) },
            onPreview: { try await TaskService.shared.bulkDeletePreview(ids: $0) },
            onDelete: { try await TaskService.shared.bulkDelete(ids: $0) },
            onDone: {
                await viewModel.loadTasks(reset: true)
                await viewModel.loadStats()
            }
        )
        .onChange(of: viewMode) { if selection.isActive { selection.exit() } }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .bottom, spacing: 8) {
            HScreenTitle("Producție", eyebrow: eyebrow)
            NavigationLink(value: Route.productionCalendar) {
                IconChrome(systemImage: "calendar")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Calendar producție")
            .help("Calendar producție")
            NavigationLink(value: Route.shoppingList) {
                IconChrome(systemImage: "cart")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lista de cumpărături")
            .help("Lista de cumpărături: ce lipsește pentru taskuri")
            if isWide {
                HIconButton(
                    viewMode == .list ? "rectangle.split.3x1" : "list.bullet",
                    label: viewMode == .list ? "Vezi board" : "Vezi lista"
                ) {
                    viewMode = viewMode == .list ? .board : .list
                }
            }
        }
    }

    private var eyebrow: String {
        let day = RoDate.shortDay(.now)
        guard let stats = viewModel.stats else { return day }
        let done = stats.statusCounts[TaskStatus.FINALIZAT.rawValue] ?? 0
        let total = RoCount.format(stats.totalTasks, one: "task", many: "taskuri")
        return "\(day) · \(total), \(done) finalizate"
    }

    // MARK: - Filters

    /// Statuses always offered; "Anulat" only when there are cancelled tasks.
    private var chipStatuses: [TaskStatus] {
        let base: [TaskStatus] = [.DE_FACUT, .IN_LUCRU, .BLOCAT, .FINALIZAT]
        let cancelled = viewModel.stats?.statusCounts[TaskStatus.ANULAT.rawValue] ?? 0
        return cancelled > 0 ? base + [.ANULAT] : base
    }

    private var filterChips: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(chipStatuses) { status in
                        DotFilterChip(
                            title: status.displayName,
                            dot: status.hColor,
                            count: viewModel.stats?.statusCounts[status.rawValue] ?? 0,
                            isSelected: viewModel.selectedStatus == status
                        ) {
                            // Tap the active chip again → back to every status.
                            viewModel.filterByStatus(viewModel.selectedStatus == status ? nil : status)
                        }
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, 2)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(TaskListRange.allCases) { range in
                        HChip(range.title, isSelected: viewModel.range == range) {
                            viewModel.filterByRange(range)
                        }
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.vertical, 2)
            }
        }
        .padding(.bottom, 6)
    }

    // MARK: - List

    private var listContent: some View {
        PaginatedListView(
            items: viewModel.tasks,
            isLoading: viewModel.isLoading,
            hasNextPage: viewModel.hasNextPage,
            emptyTitle: "Nu există taskuri",
            emptySystemImage: "checklist",
            onLoadMore: { await viewModel.loadMore() },
            onRefresh: {
                await viewModel.refresh()
                await viewModel.loadStats()
            }
        ) { task in
            TaskCardRow(task: task, selection: selection)
                .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
                .listRowBackground(Color.clear)
        }
        .safeAreaPadding(.bottom, 72)
    }
}

/// `HIconButton` chrome for icon buttons that are NavigationLinks.
struct IconChrome: View {
    let systemImage: String

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        Image(systemName: systemImage)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(AppTheme.Colors.label)
            .frame(width: 40, height: 40)
            .background(AppTheme.Colors.card, in: shape)
            .overlay(shape.strokeBorder(AppTheme.Colors.border, lineWidth: 1))
            .contentShape(.interaction, Rectangle().inset(by: -2))
    }
}

#Preview {
    NavigationStack {
        TaskListView()
    }
}
