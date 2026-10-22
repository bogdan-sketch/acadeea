import Foundation

extension Date {
    /// Cached — DateFormatter construction is an iOS hotspot and `dayMonth` is
    /// read per row in lists.
    private static let dayMonthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.setLocalizedDateFormatFromTemplate("d MMM")
        return f
    }()

    /// Data scurta europeana pentru randuri de lista: "15 iul." (zi inainte
    /// de luna, fara an).
    var dayMonth: String {
        Self.dayMonthFormatter.string(from: self)
    }

    private static let dottedDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "dd.MM.yyyy"
        return f
    }()

    /// Data numerica romaneasca: "08.08.2026". Pentru loturi si alte randuri
    /// unde luna scrisa ar ocupa prea mult.
    var dottedDate: String {
        Self.dottedDateFormatter.string(from: self)
    }

    private static let dottedDateTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ro_RO")
        f.dateFormat = "dd.MM.yyyy HH:mm"
        return f
    }()

    /// Data + ora numerica romaneasca: "08.08.2026 01:30". Pentru backup-uri si
    /// alte randuri unde minutul conteaza.
    var dottedDateTime: String {
        Self.dottedDateTimeFormatter.string(from: self)
    }

    /// Relative time string (e.g. "acum 2 ore").
    var relativeString: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "ro_RO")
        return formatter.localizedString(for: self, relativeTo: Date())
    }

    /// ISO 8601 string for API requests.
    var iso8601String: String {
        ISO8601DateFormatter().string(from: self)
    }
}
