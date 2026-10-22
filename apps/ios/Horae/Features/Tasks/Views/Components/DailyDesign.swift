import SwiftUI

// Shared building blocks of the redesigned daily screens (Panou, Producție,
// Task, Calendar). Feature-local on purpose: the cross-app H* components stay
// untouched while other screens are being restyled in parallel.

// MARK: - Dates (ro_RO, Monday-first, 24h)

enum RoDate {
    static let locale = Locale(identifier: "ro_RO")

    /// Gregorian calendar with weeks running Monday → Sunday regardless of the
    /// device region (a US-region phone would otherwise start on Sunday).
    static let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = locale
        cal.firstWeekday = 2
        cal.minimumDaysInFirstWeek = 4
        cal.timeZone = .current
        return cal
    }()

    /// Two-letter weekday labels, Monday first.
    static let weekdayInitials = ["LU", "MA", "MI", "JO", "VI", "SÂ", "DU"]

    private static func formatter(_ format: String, posix: Bool = false) -> DateFormatter {
        let f = DateFormatter()
        f.locale = posix ? Locale(identifier: "en_US_POSIX") : locale
        f.calendar = calendar
        f.timeZone = .current
        f.dateFormat = format
        return f
    }

    private static let timeFormatter = formatter("HH:mm")
    private static let longDayFormatter = formatter("EEEE, d MMMM")
    private static let shortDayFormatter = formatter("EEEE, d MMM")
    private static let dayMonthFormatter = formatter("d MMMM")
    private static let dayFormatter = formatter("d")
    private static let isoDayFormatter = formatter("yyyy-MM-dd", posix: true)
    private static let shortDateFormatter = formatter("d MMM yyyy")
    private static let fullDateFormatter = formatter("d MMMM yyyy")

    /// "08:40".
    static func time(_ date: Date) -> String { timeFormatter.string(from: date) }
    /// "Joi, 16 octombrie".
    static func longDay(_ date: Date) -> String { capitalizedFirst(longDayFormatter.string(from: date)) }
    /// "Joi, 16 oct.".
    static func shortDay(_ date: Date) -> String { capitalizedFirst(shortDayFormatter.string(from: date)) }
    /// True for date-only values: the API stores those at 00:00 UTC (Woo
    /// imports, web date pickers) and the iOS date pickers at 00:00 local.
    /// Either must read as "no time" — never a fake "00:00" / "03:00".
    static func isDateOnly(_ date: Date) -> Bool {
        let local = calendar.dateComponents([.hour, .minute, .second], from: date)
        if local.hour == 0 && local.minute == 0 && local.second == 0 { return true }
        let c = utcCalendar.dateComponents([.hour, .minute, .second], from: date)
        return c.hour == 0 && c.minute == 0 && c.second == 0
    }

    /// Local start of the intended calendar day. A UTC-midnight date-only
    /// value keeps its UTC day (west of UTC it would otherwise slip a day).
    static func calendarDay(_ date: Date) -> Date {
        let local = calendar.dateComponents([.hour, .minute, .second], from: date)
        let isLocalMidnight = local.hour == 0 && local.minute == 0 && local.second == 0
        if !isLocalMidnight && isDateOnly(date) {
            let c = utcCalendar.dateComponents([.year, .month, .day], from: date)
            return calendar.date(from: c) ?? calendar.startOfDay(for: date)
        }
        return calendar.startOfDay(for: date)
    }

    /// A deadline is overdue after its time, or — date-only — after its day ends.
    static func isPastDeadline(_ date: Date, now: Date = .now) -> Bool {
        guard isDateOnly(date) else { return date < now }
        let end = calendar.date(byAdding: .day, value: 1, to: calendarDay(date)) ?? date
        return end <= now
    }

    /// "08:40", or nil for date-only values (see `isDateOnly`).
    static func meaningfulTime(_ date: Date) -> String? {
        isDateOnly(date) ? nil : time(date)
    }

    /// "Joi, 16 octombrie, 08:40", or "Joi, 16 octombrie" for date-only values.
    static func stamp(_ date: Date) -> String {
        let day = longDay(calendarDay(date))
        return meaningfulTime(date).map { "\(day), \($0)" } ?? day
    }

    /// "16 oct. 2026" — compact date with the year, for history rows.
    static func shortDate(_ date: Date) -> String { shortDateFormatter.string(from: date) }
    /// "16 oct. 2026, 08:40".
    static func shortDateTime(_ date: Date) -> String { "\(shortDate(date)), \(time(date))" }
    /// "16 octombrie 2026" — printed documents.
    static func fullDate(_ date: Date) -> String { fullDateFormatter.string(from: date) }
    /// "16 octombrie 2026, 08:40" — printed documents.
    static func fullDateTime(_ date: Date) -> String { "\(fullDate(date)), \(time(date))" }

    private static let utcCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return cal
    }()

    /// "16 octombrie".
    static func dayMonth(_ date: Date) -> String { dayMonthFormatter.string(from: date) }
    /// "16".
    static func day(_ date: Date) -> String { dayFormatter.string(from: date) }
    /// API day key, "2026-10-16".
    static func isoDay(_ date: Date) -> String { isoDayFormatter.string(from: date) }
    static func date(fromISODay key: String) -> Date? { isoDayFormatter.date(from: key) }

    /// Monday 00:00 of the week containing `date`.
    static func startOfWeek(_ date: Date) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    }

    /// The seven days (Monday → Sunday) of the week containing `date`.
    static func weekDays(containing date: Date) -> [Date] {
        let start = startOfWeek(date)
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    /// "13 – 19 octombrie", or "29 sept. – 5 oct." across a month boundary.
    static func weekRange(_ days: [Date]) -> String {
        guard let first = days.first, let last = days.last else { return "" }
        if calendar.isDate(first, equalTo: last, toGranularity: .month) {
            return "\(day(first)) – \(dayMonth(last))"
        }
        let short = formatter("d MMM")
        return "\(short.string(from: first)) – \(short.string(from: last))"
    }

    static func capitalizedFirst(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
    }
}

// MARK: - Romanian numbers

enum RoPercent {
    /// Variance-style percent on top of `RoFormat.percent`: "+12,5 %", "-4 %".
    static func format(_ value: Double, decimals: Int = 1, signed: Bool = false) -> String {
        let text = RoFormat.percent(value, fractionDigits: decimals)
        return signed && value > 0 && text.first != "0" ? "+" + text : text
    }
}

// MARK: - Romanian counts

enum RoCount {
    /// "1 comandă", "3 comenzi", "21 de comenzi" (Romanian "de" from 20 up).
    static func format(_ n: Int, one: String, many: String) -> String {
        if n == 1 { return "1 \(one)" }
        let rest = n % 100
        let needsDe = n != 0 && (rest == 0 || rest >= 20)
        return needsDe ? "\(n) de \(many)" : "\(n) \(many)"
    }
}

// MARK: - Quantities

enum QtyBadge {
    /// "×6" for pieces, "2,5 kg" for measured quantities.
    static func text(_ value: Double, unitRaw: String) -> String {
        if unitRaw == UnitType.BUCATI.rawValue { return "×\(value.qtyFormatted)" }
        return UnitType.formatQty(value, unitRaw: unitRaw)
    }
}

// MARK: - Task status (redesign)

extension TaskStatus {
    /// Dot/bar colour; the neutral status uses the muted ink.
    var hColor: Color {
        kind.map { AppTheme.Status.fg($0) } ?? AppTheme.Colors.secondaryLabel
    }

    /// Stage of the status flow, for the progress bar (not a measured percent).
    var hStageFraction: Double {
        switch self {
        case .DE_FACUT: 0
        case .BLOCAT: 0.15
        case .IN_LUCRU: 0.5
        case .FINALIZAT, .ANULAT: 1
        }
    }
}

extension TaskVisibility {
    /// Short chip label (web wording: "Doar alocații").
    var chipLabel: String {
        switch self {
        case .ASSIGNED: "Doar alocații"
        case .EVERYONE: "Toată lumea"
        case .SELECTED: "Anumite persoane"
        }
    }
}

extension TaskStatus {
    /// FINALIZAT / ANULAT: the task is closed and read-only (web parity).
    var isClosed: Bool { self == .FINALIZAT || self == .ANULAT }
}

// MARK: - Status pill

/// `HStatusChip` for coloured statuses, a quiet neutral pill for "De făcut".
struct TaskStatusPill: View {
    let status: TaskStatus

    var body: some View {
        if let kind = status.kind {
            HStatusChip(status.displayName, kind: kind)
        } else {
            NeutralPill(title: status.displayName)
        }
    }
}

/// Neutral pill (no status colour): "De făcut", "Rezervat din stoc"…
struct NeutralPill: View {
    let title: String
    var systemImage: String?

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .bold))
                    .accessibilityHidden(true)
            }
            Text(title)
                .font(AppFont.body(11, weight: .bold))
                .lineLimit(1)
        }
        .foregroundStyle(AppTheme.Colors.secondaryLabel)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(AppTheme.Colors.border.opacity(0.6), in: Capsule())
    }
}

// MARK: - Progress bar

struct HProgressBar: View {
    let value: Double
    let tint: Color
    var height: CGFloat = 5

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(AppTheme.Colors.border.opacity(0.7))
                Capsule()
                    .fill(tint)
                    .frame(width: geo.size.width * min(max(value, 0), 1))
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

// MARK: - Initials avatar

struct InitialsAvatar: View {
    let name: String?
    var size: CGFloat = 22

    private static let palette: [AppTheme.Status.Kind] = [.inProgress, .ready, .new, .warning]

    private var initials: String {
        guard let name else { return "–" }
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    private var fill: Color {
        guard let name else { return AppTheme.Colors.secondaryLabel }
        let sum = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return AppTheme.Status.fg(Self.palette[sum % Self.palette.count])
    }

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.4, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(fill, in: Circle())
            .accessibilityHidden(true)
    }
}

// MARK: - Card header

/// Title row of a list card: bold 15 title + optional "Toate →" link.
struct CardHeader: View {
    let title: String
    var trailing: String?
    var route: Route?

    var body: some View {
        HStack {
            Text(title)
                .font(AppFont.body(15, weight: .bold))
                .foregroundStyle(AppTheme.Colors.label)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if let trailing, let route {
                NavigationLink(value: route) {
                    HStack(spacing: 3) {
                        Text(trailing)
                        Image(systemName: "arrow.right").imageScale(.small)
                    }
                    .font(AppFont.body(12, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.primaryText)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else if let trailing {
                Text(trailing)
                    .font(AppFont.body(12, weight: .semibold))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 40)
    }
}

/// Hairline between rows inside a card.
struct CardDivider: View {
    var body: some View {
        Rectangle()
            .fill(AppTheme.Colors.border.opacity(0.7))
            .frame(height: 1)
    }
}

/// Card shell without inner padding — for cards whose rows run edge to edge.
struct HListCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        HCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) { content }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// MARK: - Dot filter chip

/// Filter chip with a leading status dot and a count (Producție status row).
/// Selected = primary fill, like `HChip`.
struct DotFilterChip: View {
    let title: String
    let dot: Color
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Circle()
                    .fill(isSelected ? AppTheme.Colors.onPrimary : dot)
                    .frame(width: 8, height: 8)
                Text(title)
                    .font(AppFont.body(13, weight: .semibold))
                Text("\(count)")
                    .font(AppFont.body(12, weight: .bold))
                    .monospacedDigit()
                    .opacity(0.65)
            }
            .lineLimit(1)
            .foregroundStyle(isSelected ? AppTheme.Colors.onPrimary : AppTheme.Colors.label)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(isSelected ? AppTheme.Colors.primary : AppTheme.Colors.card, in: Capsule())
            .overlay(Capsule().strokeBorder(
                isSelected ? AppTheme.Colors.primary : AppTheme.Colors.border, lineWidth: 1))
            .contentShape(.interaction, Rectangle().inset(by: -6))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title), \(count)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .sensoryFeedback(.selection, trigger: isSelected)
    }
}

#Preview("Daily design") {
    VStack(alignment: .leading, spacing: 12) {
        HStack {
            TaskStatusPill(status: .DE_FACUT)
            TaskStatusPill(status: .IN_LUCRU)
            TaskStatusPill(status: .BLOCAT)
            TaskStatusPill(status: .FINALIZAT)
        }
        HProgressBar(value: 0.6, tint: AppTheme.Status.fg(.inProgress))
        HStack {
            InitialsAvatar(name: "Mihai Rusu")
            InitialsAvatar(name: nil)
            DotFilterChip(title: "În lucru", dot: AppTheme.Status.fg(.inProgress), count: 2, isSelected: false) {}
        }
        Text(RoDate.weekRange(RoDate.weekDays(containing: .now)))
        Text(RoCount.format(21, one: "comandă", many: "comenzi"))
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
