import SwiftUI

/// "Trasabilitate" — every production task that used (or, for recipes,
/// produced) one stock item, newest first, over a chosen period.
/// Filters sit pinned above the list (outside the pull-to-refresh, horizontal
/// scroll only — owner's rule for pill rows).
struct ProductTraceabilityView: View {
    let kind: TraceabilityItemKind
    let itemId: String
    let itemName: String

    @State private var viewModel: ProductTraceabilityViewModel
    @State private var showRangeSheet = false

    init(kind: TraceabilityItemKind, itemId: String, itemName: String) {
        self.kind = kind
        self.itemId = itemId
        self.itemName = itemName
        _viewModel = State(initialValue: ProductTraceabilityViewModel(kind: kind, itemId: itemId))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            filterRow
            content
        }
        .appScreenBackground(showsGradient: false)
        .navigationTitle("Trasabilitate")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .errorAlert($viewModel.error)
        .sheet(isPresented: $showRangeSheet) {
            TraceabilityRangeSheet(
                from: viewModel.customFrom,
                to: viewModel.customTo
            ) { from, to in
                viewModel.select(.custom(from: from, to: to))
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: - Header (item + totals)

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(viewModel.data?.item.name ?? itemName)
                .font(AppFont.title(22, relativeTo: .title2))
                .foregroundStyle(AppTheme.Colors.label)
                .lineLimit(2)
            Text(totalsLine)
                .font(AppFont.body(13))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private var totalsLine: String {
        guard let data = viewModel.data else { return viewModel.period.label }
        func qty(_ v: Double) -> String { UnitType.formatQty(v, unitRaw: data.item.unit) }
        var parts: [String] = []
        if data.totals.consumed > 0 { parts.append("folosit \(qty(data.totals.consumed))") }
        if data.totals.reserved > 0 { parts.append("rezervat \(qty(data.totals.reserved))") }
        if data.totals.produced > 0 { parts.append("produs \(qty(data.totals.produced))") }
        let tasks = data.totals.taskCount == 1 ? "1 task" : "\(data.totals.taskCount) taskuri"
        let period = viewModel.period == .all ? [] : [viewModel.period.label]
        return ([tasks] + parts + period).joined(separator: " · ")
    }

    // MARK: - Pinned filters

    private var filterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TraceabilityPeriod.presets, id: \.self) { period in
                    HChip(period.label, isSelected: viewModel.period == period) {
                        viewModel.select(period)
                    }
                }
                HChip(viewModel.period.isCustom ? viewModel.period.label : "Interval…",
                      isSelected: viewModel.period.isCustom) {
                    showRangeSheet = true
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
    }

    // MARK: - List

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.data == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let rows = viewModel.data?.rows, !rows.isEmpty {
            List(rows) { row in
                NavigationLink(value: Route.taskDetail(id: row.taskId)) {
                    TraceabilityRowView(row: row)
                }
                .listRowBackground(AppTheme.Colors.card)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .contentMargins(.top, 4, for: .scrollContent)
            .refreshable { await viewModel.load() }
        } else {
            ScrollView {
                ContentUnavailableView(
                    "Niciun task în perioada aleasă",
                    systemImage: "point.3.connected.trianglepath.dotted",
                    description: Text("Alege altă perioadă sau „Tot” ca să vezi tot istoricul.")
                )
                .padding(.top, 40)
            }
            .refreshable { await viewModel.load() }
        }
    }
}

// MARK: - Row

private struct TraceabilityRowView: View {
    let row: TraceabilityRow

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(row.taskName)
                    .font(AppFont.body(15, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .lineLimit(2)
                Spacer(minLength: 8)
                Text(quantity)
                    .font(AppFont.body(15, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.Colors.label)
            }
            HStack(spacing: 6) {
                HStatusChip(kindLabel, kind: kindTone)
                if let status = TaskStatus(rawValue: row.taskStatus) {
                    Text(status.displayName)
                        .font(AppFont.body(12, weight: .medium))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                }
                Spacer(minLength: 0)
                Text(row.date.dottedDateTime)
                    .font(AppFont.body(12))
                    .monospacedDigit()
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
            if !meta.isEmpty {
                Text(meta)
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineLimit(2)
            }
            if !lotsLine.isEmpty {
                Label(lotsLine, systemImage: "shippingbox")
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .lineLimit(3)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var quantity: String {
        UnitType.formatQty(row.quantity, unitRaw: row.unit)
    }

    private var kindLabel: String {
        switch row.kind {
        case .consumed: "Folosit"
        case .reserved: "Rezervat"
        case .produced: "Produs"
        }
    }

    private var kindTone: AppTheme.Status.Kind {
        switch row.kind {
        case .consumed: .inProgress
        case .reserved: .warning
        case .produced: .ready
        }
    }

    /// "Rețetă · Laborator · Ana P." — the recipe only when the task has a custom name.
    private var meta: String {
        [row.taskName == row.recipeName ? nil : row.recipeName, row.locationName, row.assignedToName]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var lotsLine: String {
        row.lots.map { lot in
            let q = UnitType.formatQty(lot.quantity, unitRaw: row.unit)
            return "Lot \(lot.lotNumber ?? "fără număr") · \(q)"
        }
        .joined(separator: ", ")
    }
}

// MARK: - Custom range sheet

private struct TraceabilityRangeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var from: Date
    @State private var to: Date
    let onApply: (Date, Date) -> Void

    init(from: Date?, to: Date?, onApply: @escaping (Date, Date) -> Void) {
        let today = Date()
        _from = State(initialValue: from ?? Calendar.traceability.date(byAdding: .day, value: -30, to: today) ?? today)
        _to = State(initialValue: to ?? today)
        self.onApply = onApply
    }

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("De la", selection: $from, in: ...to, displayedComponents: .date)
                DatePicker("Până la", selection: $to, in: from..., displayedComponents: .date)
            }
            .environment(\.locale, Locale(identifier: "ro_RO"))
            .environment(\.calendar, Calendar.traceability)
            .navigationTitle("Interval")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Anulează") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Aplică") {
                        onApply(from, to)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Period + view model

enum TraceabilityPeriod: Hashable {
    case all, last7, last30, thisMonth
    case custom(from: Date, to: Date)

    static let presets: [TraceabilityPeriod] = [.all, .last7, .last30, .thisMonth]

    var isCustom: Bool {
        if case .custom = self { return true }
        return false
    }

    var label: String {
        switch self {
        case .all: "Tot"
        case .last7: "7 zile"
        case .last30: "30 zile"
        case .thisMonth: "Luna asta"
        case .custom(let from, let to): "\(from.dottedDate) – \(to.dottedDate)"
        }
    }

    /// Inclusive [start-of-day, end-of-day] bounds in the Romanian calendar; nil = open.
    func bounds(now: Date = Date()) -> (from: Date?, to: Date?) {
        let cal = Calendar.traceability
        let endOfDay: (Date) -> Date = { day in
            cal.date(byAdding: DateComponents(day: 1, second: -1), to: cal.startOfDay(for: day)) ?? day
        }
        switch self {
        case .all:
            return (nil, nil)
        case .last7:
            return (cal.date(byAdding: .day, value: -6, to: cal.startOfDay(for: now)), endOfDay(now))
        case .last30:
            return (cal.date(byAdding: .day, value: -29, to: cal.startOfDay(for: now)), endOfDay(now))
        case .thisMonth:
            return (cal.dateInterval(of: .month, for: now)?.start, endOfDay(now))
        case .custom(let from, let to):
            return (cal.startOfDay(for: from), endOfDay(to))
        }
    }
}

@MainActor
@Observable
final class ProductTraceabilityViewModel {
    let kind: TraceabilityItemKind
    let itemId: String

    var period: TraceabilityPeriod = .all
    var data: StockTraceability?
    var isLoading = false
    var error: APIError?

    private var loadTask: Task<Void, Never>?

    init(kind: TraceabilityItemKind, itemId: String) {
        self.kind = kind
        self.itemId = itemId
    }

    var customFrom: Date? {
        if case .custom(let from, _) = period { return from }
        return nil
    }

    var customTo: Date? {
        if case .custom(_, let to) = period { return to }
        return nil
    }

    func select(_ period: TraceabilityPeriod) {
        guard period != self.period else { return }
        self.period = period
        loadTask?.cancel()
        loadTask = Task { await load() }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        let requested = period
        let (from, to) = requested.bounds()
        do {
            let result = try await StockService.shared.fetchTraceability(
                kind: kind, id: itemId, from: from, to: to)
            // Drop a stale answer when the user switched period meanwhile.
            guard requested == period, !Task.isCancelled else { return }
            data = result
        } catch is CancellationError {
            return
        } catch let err as APIError {
            if !Task.isCancelled { error = err }
        } catch {
            if !Task.isCancelled { self.error = .networkError(error) }
        }
    }
}

private extension Calendar {
    /// Romanian calendar: Monday-first, Europe/Bucharest.
    static let traceability: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "ro_RO")
        cal.firstWeekday = 2
        cal.timeZone = TimeZone(identifier: "Europe/Bucharest") ?? .current
        return cal
    }()
}
