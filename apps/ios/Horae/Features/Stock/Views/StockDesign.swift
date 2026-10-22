import SwiftUI

// Shared building blocks of the redesigned stock screens (material and
// consumable detail, forms, transfers, journals). Names carry a `Stock`
// prefix so they never collide with the cross-app H* components or with
// helpers other features add in parallel.

// MARK: - Dates (ro_RO, day before month, 24h)

enum StockDate {
    private static func formatter(_ format: String, utc: Bool = false) -> DateFormatter {
        let f = DateFormatter()
        f.locale = RoDate.locale
        f.calendar = RoDate.calendar
        f.timeZone = utc ? (TimeZone(identifier: "UTC") ?? .gmt) : .current
        f.dateFormat = format
        return f
    }

    private static let fullLocal = formatter("d MMMM yyyy")
    private static let fullUTC = formatter("d MMMM yyyy", utc: true)
    private static let shortLocal = formatter("d MMM yyyy")
    private static let shortUTC = formatter("d MMM yyyy", utc: true)
    private static let dayMonthTime = formatter("d MMM, HH:mm")

    /// True for date-only API values (stored at 00:00 UTC): they are shown in
    /// UTC so a device west of Greenwich never moves them to the day before.
    private static func isDateOnly(_ date: Date) -> Bool {
        RoDate.meaningfulTime(date) == nil
    }

    /// "25 martie 2027" — date-only values (expiry, invoice) stay on their day.
    static func full(_ date: Date) -> String {
        (isDateOnly(date) ? fullUTC : fullLocal).string(from: date)
    }

    /// "25 mar. 2027".
    static func short(_ date: Date) -> String {
        (isDateOnly(date) ? shortUTC : shortLocal).string(from: date)
    }

    /// "17 octombrie 2026, 12:52" — timestamps (created, updated, moved).
    static func fullTime(_ date: Date) -> String {
        "\(fullLocal.string(from: date)), \(RoDate.time(date))"
    }

    /// "17 oct., 12:52" — compact timestamp for journal rows.
    static func shortTime(_ date: Date) -> String {
        dayMonthTime.string(from: date)
    }
}

// MARK: - Numbers

extension Double {
    /// Romanian percent: "0,1 %", "5 %".
    var stockPercent: String { RoFormat.percent(self) }

    /// "8,26 RON/kg".
    func stockPrice(per unit: String?) -> String {
        unit.map { "\(ronFormatted)/\($0)" } ?? ronFormatted
    }
}

// MARK: - Labels with diacritics

enum StockText {
    /// Group/chip label for items without a category (the API stores null).
    static let noCategory = "Fără categorie"

    /// Legacy English movement notes (written by the API before 17.10.2026)
    /// mapped to Romanian, like the web `localizeNote`.
    static func localizedNote(_ note: String) -> String {
        let rules: [(pattern: String, template: (String?) -> String)] = [
            (#"^Reservation for task "(.+)"$"#, { "Rezervare pentru taskul „\($0 ?? "")”" }),
            (#"^Production output for task "(.+)"$"#, { "Producție din taskul „\($0 ?? "")”" }),
            (#"^Production output for task (.+)$"#, { "Producție din taskul „\($0 ?? "")”" }),
            (#"^Production consumption for task.*$"#, { _ in "Consum în producție" }),
            (#"^Released reservation for cancelled task.*$"#, { _ in "Rezervare eliberată (task anulat)" }),
            (#"^Byproduct din producția "(.+)"$"#, { "Rest din producția „\($0 ?? "")”" }),
        ]
        for rule in rules {
            guard let regex = try? NSRegularExpression(pattern: rule.pattern) else { continue }
            let range = NSRange(note.startIndex..., in: note)
            guard let match = regex.firstMatch(in: note, range: range) else { continue }
            var capture: String?
            if match.numberOfRanges > 1, let r = Range(match.range(at: 1), in: note) {
                capture = String(note[r])
            }
            return rule.template(capture)
        }
        return note
    }
}

// MARK: - Status pill

/// Status chip for a material/consumable; neutral pill for "Întrerupt".
struct StockStatusPill: View {
    let status: MaterialStatus

    var body: some View {
        if let kind = status.kind {
            HStatusChip(status.displayName, kind: kind)
        } else {
            NeutralPill(title: status.displayName)
        }
    }
}

// MARK: - Cards

/// Card title row (15pt bold) with an optional trailing view.
struct StockCardTitle<Trailing: View>: View {
    private let title: String
    private let trailing: Trailing

    init(_ title: String, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(AppFont.body(15, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
    }
}

/// Key / value row: muted label left, semibold value right; wraps at large
/// Dynamic Type sizes instead of truncating.
struct StockInfoRow<Value: View>: View {
    private let label: String
    private let value: Value

    init(_ label: String, @ViewBuilder value: () -> Value) {
        self.label = label
        self.value = value()
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                labelText
                Spacer(minLength: 8)
                value
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
                    .multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: 2) {
                labelText
                value
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.label)
            }
        }
        .frame(minHeight: 28)
        .accessibilityElement(children: .combine)
    }

    private var labelText: some View {
        Text(label)
            .font(AppFont.body(13))
            .foregroundStyle(AppTheme.Colors.secondaryLabel)
    }
}

extension StockInfoRow where Value == Text {
    init(_ label: String, _ value: String) {
        self.init(label) { Text(value) }
    }
}

/// Hairline between rows inside a card.
struct StockDivider: View {
    var body: some View {
        Rectangle()
            .fill(AppTheme.Colors.border)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// Big number block ("În stoc 12 kg").
struct StockMiniStat: View {
    let label: String
    let value: String
    var tone: AppTheme.Status.Kind?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(AppFont.body(11, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            Text(value)
                .font(AppFont.title(24))
                .foregroundStyle(tone.map { AppTheme.Status.fg($0) } ?? AppTheme.Colors.label)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Tappable "chooser" value (opens a chip sheet): current value + chevron.
struct StockChooserButton: View {
    let value: String
    let isPlaceholder: Bool
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(value)
                    .font(AppFont.body(13, weight: .semibold))
                    .foregroundStyle(isPlaceholder ? AppTheme.Colors.secondaryLabel : AppTheme.Colors.label)
                    .lineLimit(2)
                    .multilineTextAlignment(.trailing)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(AppTheme.Colors.appBackground, in: Capsule())
            .overlay(Capsule().strokeBorder(AppTheme.Colors.border, lineWidth: 1))
            .contentShape(.interaction, Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label): \(value)")
        .accessibilityHint("Deschide lista de opțiuni")
        .help(label)
    }
}

// MARK: - Chips

/// Wrapping row layout for chips (no horizontal scroll needed).
struct StockFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            var size = view.sizeThatFits(.unspecified)
            size.width = min(size.width, bounds.width)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// One option of a chip choice.
struct StockChoice<ID: Hashable>: Identifiable {
    let id: ID
    let title: String
    var subtitle: String?
}

/// Single choice as wrapping chips (owner's rule: no dropdowns). Tapping the
/// selected chip again keeps it (use an explicit "none" option to clear).
struct StockChipChoice<ID: Hashable>: View {
    let options: [StockChoice<ID>]
    @Binding var selection: ID

    var body: some View {
        StockFlowLayout(spacing: 8) {
            ForEach(options) { option in
                HChip(option.title, isSelected: option.id == selection) {
                    selection = option.id
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Searchable chip chooser in a sheet, for long lists (suppliers, locations,
/// materials). `noneTitle` adds a clearing option at the top.
struct StockChipPickerSheet<ID: Hashable>: View {
    let title: String
    let options: [StockChoice<ID>]
    let selection: ID?
    var noneTitle: String?
    let onPick: (ID?) -> Void

    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    private var filtered: [StockChoice<ID>] {
        guard !query.isEmpty else { return options }
        return options.filter {
            $0.title.localizedCaseInsensitiveContains(query)
                || ($0.subtitle?.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if options.count > 8 {
                        HInlineSearchField(text: $query, prompt: "Caută…", focusOnAppear: false)
                    }
                    StockFlowLayout(spacing: 8) {
                        if let noneTitle, query.isEmpty {
                            HChip(noneTitle, isSelected: selection == nil) { pick(nil) }
                        }
                        ForEach(filtered) { option in
                            HChip(option.title, isSelected: option.id == selection) { pick(option.id) }
                        }
                    }
                    if filtered.isEmpty {
                        Text(query.isEmpty ? "Nu există opțiuni." : "Nimic găsit pentru „\(query)”.")
                            .font(AppFont.body(13))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    }
                }
                .padding(16)
            }
            .background(AppTheme.Colors.appBackground.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Închide") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func pick(_ id: ID?) {
        onPick(id)
        dismiss()
    }
}

// MARK: - Form row with chips

/// Form row: caption + a chooser that opens a `StockChipPickerSheet`. Used in
/// `Form`s where a `Menu` used to be.
struct StockChooserRow<ID: Hashable>: View {
    let label: String
    let options: [StockChoice<ID>]
    @Binding var selection: ID?
    var noneTitle: String?
    var placeholder = "Alege"

    @State private var showSheet = false

    private var current: String {
        options.first { $0.id == selection }?.title ?? noneTitle ?? placeholder
    }

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(AppTheme.Colors.label)
            Spacer(minLength: 8)
            StockChooserButton(
                value: current,
                isPlaceholder: selection == nil,
                label: label
            ) { showSheet = true }
        }
        .sheet(isPresented: $showSheet) {
            StockChipPickerSheet(
                title: label,
                options: options,
                selection: selection,
                noneTitle: noneTitle
            ) { selection = $0 }
        }
    }
}

/// Chooser without its own caption (for `FormField`s that already label it):
/// full-width capsule showing the current value, opening a chip sheet.
struct StockChooserField<ID: Hashable>: View {
    let title: String
    let options: [StockChoice<ID>]
    @Binding var selection: ID?
    var noneTitle: String?
    var placeholder = "Alege"

    @State private var showSheet = false

    private var current: String {
        options.first { $0.id == selection }?.title ?? noneTitle ?? placeholder
    }

    var body: some View {
        Button { showSheet = true } label: {
            HStack {
                Text(current)
                    .foregroundStyle(selection == nil ? AppTheme.Colors.secondaryLabel : AppTheme.Colors.label)
                    .lineLimit(2)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title): \(current)")
        .accessibilityHint("Deschide lista de opțiuni")
        .sheet(isPresented: $showSheet) {
            StockChipPickerSheet(
                title: title,
                options: options,
                selection: selection,
                noneTitle: noneTitle
            ) { selection = $0 }
        }
    }
}

// MARK: - Empty list state

/// Screen-specific empty state for stock lists: search miss vs. truly empty
/// (with a "first item" call to action when the user may create).
struct StockListEmptyState: View {
    let searchText: String
    let emptyTitle: String
    let emptyMessage: String
    let systemImage: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        Group {
            if !searchText.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                ContentUnavailableView {
                    Label(emptyTitle, systemImage: systemImage)
                } description: {
                    Text(emptyMessage)
                } actions: {
                    if let actionTitle, let action {
                        Button(action: action) {
                            Text(actionTitle)
                                .font(AppFont.body(14, weight: .bold))
                                .foregroundStyle(AppTheme.Colors.onPrimary)
                                .padding(.horizontal, 18)
                                .frame(minHeight: 44)
                                .background(AppTheme.Colors.primary, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AppTheme.Colors.appBackground)
    }
}

#Preview("Stock design") {
    @Previewable @State var unit: UnitType = .KILOGRAME
    ScrollView {
        VStack(alignment: .leading, spacing: 12) {
            HCard {
                VStack(alignment: .leading, spacing: 8) {
                    StockCardTitle("Informații") { StockStatusPill(status: .LOW_STOCK) }
                    StockInfoRow("Expiră", StockDate.full(Date()))
                    StockDivider()
                    StockInfoRow("Pierderi estimate", 0.1.stockPercent)
                    StockDivider()
                    StockInfoRow("Preț", 8.26.stockPrice(per: "kg"))
                }
            }
            StockChipChoice(
                options: UnitType.allCases.map { StockChoice(id: $0, title: $0.abbreviation) },
                selection: $unit
            )
        }
        .padding()
    }
    .background(AppTheme.Colors.appBackground)
}
