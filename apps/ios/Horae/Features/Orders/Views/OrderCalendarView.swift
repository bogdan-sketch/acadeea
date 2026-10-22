import SwiftUI

enum CalendarViewMode: String, CaseIterable, Identifiable {
    case day = "Zi"
    case week = "Săptămână"
    case month = "Lună"

    var id: String { rawValue }
}

@Observable
final class OrderCalendarViewModel {
    var calendar: [String: [OrderResponse]] = [:]
    var isLoading = true
    var error: APIError?
    /// Every open starts on today's day view (owner's rule).
    var viewMode: CalendarViewMode = .day
    var currentDate = Date()
    /// Pregătiri/Intrări + status + method filter, shared with the list.
    let area = OrdersAreaState.shared

    /// Monday-first (RoDate.calendar) regardless of the device region.
    var dateRange: (from: Date, to: Date) {
        let cal = RoDate.calendar
        let today = cal.startOfDay(for: currentDate)
        switch viewMode {
        case .day:
            return (today, today)
        case .week:
            let start = RoDate.startOfWeek(currentDate)
            return (start, cal.date(byAdding: .day, value: 6, to: start) ?? start)
        case .month:
            let start = cal.dateInterval(of: .month, for: currentDate)?.start ?? today
            let next = cal.date(byAdding: .month, value: 1, to: start) ?? start
            return (start, cal.date(byAdding: .day, value: -1, to: next) ?? start)
        }
    }

    var sortedDates: [String] {
        calendar.keys.sorted()
    }

    var totalOrders: Int {
        calendar.values.reduce(0) { $0 + $1.count }
    }

    var rangeLabel: String {
        switch viewMode {
        case .day:
            return "\(RoDate.longDay(currentDate)) \(RoDate.calendar.component(.year, from: currentDate))"
        case .week:
            let (start, end) = dateRange
            return "\(RoDate.weekRange(RoDate.weekDays(containing: start))) \(RoDate.calendar.component(.year, from: end))"
        case .month:
            return RoDate.capitalizedFirst(Self.monthFormatter.string(from: currentDate))
        }
    }

    private static let monthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = RoDate.locale
        f.calendar = RoDate.calendar
        f.dateFormat = "LLLL yyyy"
        return f
    }()

    func load() async {
        isLoading = true
        error = nil
        let (from, to) = dateRange
        do {
            calendar = try await OrderService.shared.fetchCalendar(
                from: RoDate.isoDay(from),
                to: RoDate.isoDay(to),
                status: area.activeStatuses,
                view: area.view,
                deliveryMethod: area.activeDeliveryMethod,
                deliveryKind: area.activeDeliveryKind
            )
        } catch {
            self.error = error as? APIError ?? .unknown(error.localizedDescription)
        }
        isLoading = false
    }

    func navigate(_ direction: Int) {
        let component: Calendar.Component = switch viewMode {
        case .day: .day
        case .week: .weekOfYear
        case .month: .month
        }
        currentDate = RoDate.calendar.date(byAdding: component, value: direction, to: currentDate) ?? currentDate
    }

    func goToday() {
        currentDate = Date()
    }
}

struct OrderCalendarView: View {
    @State private var viewModel = OrderCalendarViewModel()
    @State private var showAliasEditor = false
    /// Collapsing head (period navigation + summary) — hidden while scrolling down.
    @State private var headVisible = true

    private var area: OrdersAreaState { viewModel.area }

    var body: some View {
        VStack(spacing: 0) {
            // Pinned: same view switch + method filter as the list (shared
            // state) and the Zi / Săptămână / Lună picker.
            OrderViewSegmented(selection: area.view) { area.view = $0 }
                .padding(.horizontal, AppTheme.Spacing.lg)
                .padding(.top, AppTheme.Spacing.sm)
            if area.showsMethodFilter {
                DeliveryMethodChipBar(
                    area: area,
                    canEditAliases: AuthManager.shared.permissionManager.can(.manage, .Organization)
                ) { showAliasEditor = true }
            }

            // View mode picker
            Picker("Vizualizare", selection: $viewModel.viewMode) {
                ForEach(CalendarViewMode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.vertical, AppTheme.Spacing.sm)

            periodHead
                .autoCollapsible(headVisible)

            Divider()

            // Content
            Group {
                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.calendar.isEmpty {
                    ContentUnavailableView(
                        "Nimic programat",
                        systemImage: "calendar",
                        description: Text(viewModel.area.view == .livrari
                    ? "Nu există comenzi de pregătit în această perioadă (\(area.statusSummary.lowercased()))"
                    : "Nu au intrat comenzi în această perioadă (\(area.statusSummary.lowercased()))")
                    )
                } else {
                    List {
                        ForEach(viewModel.sortedDates, id: \.self) { dateKey in
                            if let orders = viewModel.calendar[dateKey] {
                                Section(header: dateSectionHeader(dateKey)) {
                                    ForEach(orders) { order in
                                        NavigationLink(value: Route.orderDetail(id: order.id)) {
                                            CalendarOrderRow(order: order)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable { await Task { await reload() }.value }
                    .autoHideOnScroll($headVisible)
                }
            }
        }
        .navigationTitle(area.view == .livrari ? "Calendar pregătiri" : "Calendar intrări")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                OrderStatusFilterButton(area: area, inToolbar: true)
            }
        }
        .onChange(of: viewModel.viewMode) {
            Task { await viewModel.load() }
        }
        .onChange(of: viewModel.currentDate) {
            Task { await viewModel.load() }
        }
        .onChange(of: area.view) {
            Task { await viewModel.load() }
        }
        .onChange(of: area.deliveryFilter) {
            Task { await viewModel.load() }
        }
        .onChange(of: area.statusFilter) {
            Task { await viewModel.load() }
        }
        .task { await viewModel.load() }
        .task { await area.loadMethods() }
        .sheet(isPresented: $showAliasEditor, onDismiss: { Task { await reload() } }) {
            DeliveryMethodAliasSheet(area: area)
        }
        .errorAlert($viewModel.error)
    }

    /// ‹ Azi › + the range label + the count — collapses on scroll down.
    private var periodHead: some View {
        VStack(spacing: 0) {
            // Navigation bar
            HStack {
                Button { viewModel.navigate(-1) } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Perioada anterioară")

                Spacer()

                Button { viewModel.goToday() } label: {
                    Text("Azi")
                        .font(.subheadline.weight(.medium))
                        .frame(minWidth: 44, minHeight: 44)
                }

                Spacer()

                Button { viewModel.navigate(1) } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Perioada următoare")
            }
            .padding(.horizontal, AppTheme.Spacing.lg)
            .padding(.bottom, AppTheme.Spacing.xs)

            // Range label
            Text(viewModel.rangeLabel)
                .font(.subheadline.weight(.semibold))
                .padding(.bottom, AppTheme.Spacing.xs)

            // Summary
            Text(RoCount.format(viewModel.totalOrders, one: "comandă", many: "comenzi") + " · " + area.statusSummary)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.bottom, AppTheme.Spacing.sm)
        }
    }

    /// Pull-to-refresh / editor closed: calendar + a fresh method list.
    private func reload() async {
        async let methods: Void = area.loadMethods()
        await viewModel.load()
        await methods
    }

    private func dateSectionHeader(_ iso: String) -> some View {
        let date = RoDate.date(fromISODay: iso)
        let isToday = date.map { RoDate.calendar.isDateInToday($0) } ?? false
        let label = date.map {
            viewModel.viewMode == .month
                ? RoDate.capitalizedFirst(Self.monthDayFormatter.string(from: $0))
                : RoDate.longDay($0)
        } ?? iso
        let count = viewModel.calendar[iso]?.count ?? 0

        return HStack {
            Text(label)
            if isToday {
                Text("Azi")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(AppTheme.Colors.primary, in: Capsule())
                    .foregroundStyle(AppTheme.Colors.onPrimary)
            }
            Spacer()
            Text(RoCount.format(count, one: "comandă", many: "comenzi"))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

private extension OrderCalendarView {
    static let monthDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = RoDate.locale
        f.calendar = RoDate.calendar
        f.dateFormat = "EEE d"
        return f
    }()
}

struct CalendarOrderRow: View {
    let order: OrderResponse

    private var statusColor: Color {
        AppTheme.Status.fg(order.status.kind)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            HStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 10, height: 10)
                    .accessibilityHidden(true)
                Text(order.productsLine)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                if order.hasDueTime, let due = order.dueDate {
                    Text(RoDate.time(due))
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                Spacer()
                // Status colour lives in the dot; the label stays in ink for contrast.
                Text(order.status.displayName)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(AppTheme.Colors.label)
            }

            HStack(spacing: AppTheme.Spacing.sm) {
                if let customer = order.rowCustomer {
                    Label(customer, systemImage: "person.crop.circle")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(AppTheme.Colors.label)
                        .lineLimit(1)
                }
                if order.customerName?.isEmpty == false, let point = order.displayDeliveryPoint {
                    Label(point, systemImage: "mappin")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            if let assignee = order.assignedTo {
                Label(assignee.fullName, systemImage: "person")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, AppTheme.Spacing.xxs)
    }
}

#Preview {
    NavigationStack {
        OrderCalendarView()
    }
}
