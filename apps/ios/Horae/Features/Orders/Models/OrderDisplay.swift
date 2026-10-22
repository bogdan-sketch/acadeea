import SwiftUI

// MARK: - Status presentation

extension OrderStatus {
    /// The forward lifecycle shown by the stepper (cancel is off-track).
    static let lifecycle: [OrderStatus] = [.NOUA, .IN_PREGATIRE, .PREGATITA, .IN_TRANZIT, .LIVRATA]

    /// Next forward step the primary button offers, if any.
    var nextForward: OrderStatus? {
        allowedTransitions.first { $0 != .ANULATA }
    }

    var isOpen: Bool { self != .LIVRATA && self != .ANULATA }
}

// MARK: - Order facts

extension OrderResponse {
    /// Pickup when the server says so; delivery otherwise (server default).
    var isPickup: Bool { fulfillmentType == .PICKUP }

    var modeTitle: String { isPickup ? "Ridicare" : "Livrare" }

    /// WooCommerce order number ("11643") for imported orders.
    var wooNumber: String? {
        guard orderNumber.uppercased().hasPrefix("WOO-") else { return nil }
        return String(orderNumber.dropFirst(4))
    }

    var isFromSite: Bool { wooNumber != nil || externalStatus != nil }

    /// Delivery point unless it is the importer's placeholder ("WooCommerce").
    var meaningfulDeliveryPoint: String? {
        let point = deliveryPoint.trimmingCharacters(in: .whitespaces)
        guard !point.isEmpty, point.caseInsensitiveCompare("WooCommerce") != .orderedSame else { return nil }
        return point
    }

    /// Customer when known, else the delivery point.
    var displayCustomer: String {
        if let customerName, !customerName.isEmpty { return customerName }
        return deliveryPoint
    }

    /// Order number as people say it: the site number without "WOO-"
    /// ("11644"); manual orders keep theirs.
    var displayNumber: String { wooNumber ?? orderNumber }

    /// Row line 1: product names, first two then "+N".
    var productNamesLine: String {
        guard !items.isEmpty else { return OrderFormat.productCount(itemCount) }
        let shown = items.prefix(2).map { $0.recipeName.trimmingCharacters(in: .whitespaces) }
        let rest = items.count - shown.count
        return shown.joined(separator: " · ") + (rest > 0 ? " +\(rest)" : "")
    }

    /// Row line 2: ordered quantities of the same items ("2 buc · 1,5 kg").
    var quantitiesLine: String? {
        guard !items.isEmpty else { return nil }
        let shown = items.prefix(2).map { $0.unit.formatQty($0.quantity) }
        return shown.joined(separator: " · ")
    }

    /// Row line 3: the customer, else a real delivery point; nil when neither.
    /// Shop delivery method, when the order came with one.
    var meaningfulDeliveryMethod: String? {
        guard let method = deliveryMethod?.trimmingCharacters(in: .whitespaces), !method.isEmpty else { return nil }
        return method
    }

    /// The shop method as the team reads it: each " + "-joined part mapped
    /// to its admin short name (`OrdersAreaState`), raw name otherwise.
    var deliveryMethodLabel: String? {
        meaningfulDeliveryMethod.map { OrdersAreaState.shared.label(forMethod: $0) }
    }

    /// Row line "Ridicare Napoca 15 · mâine" — method (else Ridicare/Livrare) + due day.
    var rowDelivery: String? {
        guard meaningfulDeliveryMethod != nil || dueRelative != nil else { return nil }
        return [deliveryMethodLabel ?? modeTitle, dueRelative].compactMap { $0 }.joined(separator: " · ")
    }

    var rowCustomer: String? {
        if let customerName, !customerName.trimmingCharacters(in: .whitespaces).isEmpty {
            return customerName
        }
        return displayDeliveryPoint
    }

    /// The delivery point, shown with the method's short name when the
    /// importer copied the raw method into it (site orders).
    var displayDeliveryPoint: String? {
        guard let point = meaningfulDeliveryPoint else { return nil }
        if point == meaningfulDeliveryMethod { return deliveryMethodLabel ?? point }
        return point
    }

    /// Numeric part of the order number ("WOO-11644" → 11644, "CMD-0412" → 412).
    var orderNumberValue: Int {
        Int(orderNumber.filter(\.isNumber).prefix(18)) ?? 0
    }

    /// Newest order first: createdAt desc, then order number desc, then id.
    /// A total order, so rows never reshuffle between refreshes or pages.
    static func newestFirst(_ a: OrderResponse, _ b: OrderResponse) -> Bool {
        if a.createdAt != b.createdAt { return a.createdAt > b.createdAt }
        if a.orderNumberValue != b.orderNumberValue { return a.orderNumberValue > b.orderNumberValue }
        return a.id > b.id
    }

    /// Day the order belongs to in a view: `intrari` = the day it was placed,
    /// `livrari` = its delivery day (undated → today). Local start of day.
    func groupDay(for view: OrderAreaView, today: Date) -> Date {
        switch view {
        case .intrari: RoDate.calendar.startOfDay(for: createdAt)
        case .livrari: dueDay ?? today
        }
    }

    /// Same order as the server for a view. `intrari`: placed newest first.
    /// `livrari`: delivery day desc (undated = today), then dueDate desc with
    /// undated after dated, then createdAt desc.
    static func sorted(_ orders: [OrderResponse], view: OrderAreaView) -> [OrderResponse] {
        guard view == .livrari else { return orders.sorted(by: newestFirst) }
        let today = RoDate.calendar.startOfDay(for: Date())
        return orders
            .map { ($0, $0.groupDay(for: .livrari, today: today)) }
            .sorted { lhs, rhs in
                let (a, dayA) = lhs, (b, dayB) = rhs
                if dayA != dayB { return dayA > dayB }
                switch (a.dueDate, b.dueDate) {
                case let (x?, y?) where x != y: return x > y
                case (.some, nil): return true
                case (nil, .some): return false
                default: return newestFirst(a, b)
                }
            }
            .map(\.0)
    }

    /// What was ordered — the list row's primary line:
    /// "Tort vis de fistic 1 kg · Macarons ×12 +2". Pieces as "×N", weights
    /// and volumes with their unit (ro_RO comma), first two items then "+N".
    var productsLine: String {
        guard !items.isEmpty else { return OrderFormat.productCount(itemCount) }
        let shown = items.prefix(2).map { item -> String in
            let qty = item.unit == .BUCATI
                ? "×\(item.quantity.qtyFormatted)"
                : item.unit.formatQty(item.quantity)
            return "\(item.recipeName.trimmingCharacters(in: .whitespaces)) \(qty)"
        }
        let rest = items.count - shown.count
        return shown.joined(separator: " · ") + (rest > 0 ? " +\(rest)" : "")
    }

    /// Date-only deadlines (site orders at 00:00 UTC, iOS pickers at 00:00
    /// local) have no meaningful time and must not render as "00:00"/"03:00".
    var hasDueTime: Bool {
        guard let dueDate else { return false }
        return !RoDate.isDateOnly(dueDate)
    }

    /// Local start of the due day (date-only deadlines keep their intended day).
    var dueDay: Date? {
        dueDate.map(RoDate.calendarDay)
    }

    var isOverdue: Bool {
        guard let dueDate, status.isOpen else { return false }
        return RoDate.isPastDeadline(dueDate)
    }

    var isDueToday: Bool { dueDay.map(RoDate.calendar.isDateInToday) ?? false }

    /// "Joi, 16 oct, 11:30" or "Joi, 16 oct" for date-only deadlines.
    var dueFull: String? {
        guard let dueDate, let day = dueDay else { return nil }
        return hasDueTime ? OrderFormat.full(dueDate) : OrderFormat.fullDay(day)
    }

    /// "azi, 11:30" or "azi" for date-only deadlines.
    var dueRelative: String? {
        guard let dueDate, let day = dueDay else { return nil }
        return hasDueTime ? OrderFormat.relative(dueDate) : OrderFormat.relativeDay(day)
    }
}

// MARK: - Formatting (ro_RO, 24h, day before month)

enum OrderFormat {
    private static let locale = Locale(identifier: "ro_RO")

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = locale
        f.calendar = RoDate.calendar
        f.dateFormat = format
        return f
    }

    private static let timeF = formatter("HH:mm")
    private static let weekday = formatter("EEEE")
    private static let dayMonthF = formatter("d MMM")
    private static let dayMonthYear = formatter("d MMM yyyy")
    private static let weekdayDayMonth = formatter("EEEE, d MMM")
    private static let weekdayDayMonthYear = formatter("EEEE, d MMM yyyy")

    /// "11:30"
    static func time(_ date: Date) -> String { timeF.string(from: date) }

    /// "16 oct" (ro abbreviations carry a trailing dot — dropped, as in the design).
    static func dayMonth(_ date: Date) -> String {
        clean(RoDate.calendar.isDate(date, equalTo: Date(), toGranularity: .year)
            ? dayMonthF.string(from: date) : dayMonthYear.string(from: date))
    }

    /// "Joi, 16 oct, 11:30"
    static func full(_ date: Date) -> String {
        capitalized(clean(weekdayDayMonth.string(from: date))) + ", " + time(date)
    }

    /// "Joi, 16 oct"
    static func fullDay(_ date: Date) -> String {
        capitalized(clean(weekdayDayMonth.string(from: date)))
    }

    /// Group header: "Azi", "Mâine", "Ieri", "Sâmbătă" (this week ahead), else "Joi, 23 oct".
    static func dayLabel(_ date: Date) -> String {
        let cal = RoDate.calendar
        if cal.isDateInToday(date) { return "Azi" }
        if cal.isDateInTomorrow(date) { return "Mâine" }
        if cal.isDateInYesterday(date) { return "Ieri" }
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: date)).day ?? 0
        if (2...6).contains(days) { return capitalized(weekday.string(from: date)) }
        return capitalized(clean(weekdayDayMonth.string(from: date)))
    }

    /// List group header for a day past tomorrow: "luni, 19 oct" (year only
    /// when it isn't this year: "luni, 4 ian 2027").
    static func groupDay(_ date: Date) -> String {
        let sameYear = RoDate.calendar.isDate(date, equalTo: Date(), toGranularity: .year)
        return clean((sameYear ? weekdayDayMonth : weekdayDayMonthYear).string(from: date))
    }

    /// Inline phrase: "azi, 11:30", "mâine, 09:00", "joi, 23 oct, 12:00".
    static func relative(_ date: Date) -> String {
        "\(relativeDay(date)), \(time(date))"
    }

    /// "azi", "mâine", "ieri", "joi, 23 oct".
    static func relativeDay(_ date: Date) -> String {
        let cal = RoDate.calendar
        if cal.isDateInToday(date) { return "azi" }
        if cal.isDateInTomorrow(date) { return "mâine" }
        if cal.isDateInYesterday(date) { return "ieri" }
        return clean(weekdayDayMonth.string(from: date))
    }

    /// Romanian plural: "1 produs", "2 produse", "20 de produse".
    static func productCount(_ n: Int) -> String {
        if n == 1 { return "1 produs" }
        let rest = n % 100
        return (n >= 20 && (rest == 0 || rest >= 20)) ? "\(n) de produse" : "\(n) produse"
    }

    private static func clean(_ s: String) -> String {
        s.replacingOccurrences(of: ".", with: "")
    }

    private static func capitalized(_ s: String) -> String {
        s.prefix(1).uppercased() + s.dropFirst()
    }
}
