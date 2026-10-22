import Foundation

/// Romanian number formatting shared by every screen: comma decimal, no
/// thousands dot for small values, a space before "%" (ro_RO typography,
/// same as web `Intl.NumberFormat('ro-RO', { style: 'percent' })`).
enum RoFormat {
    private static let locale = Locale(identifier: "ro_RO")

    /// "12,5 %", "30 %", "-4,2 %", "0,1 %". `fractionDigits` = max decimals
    /// (trailing zeros dropped).
    static func percent(_ value: Double, fractionDigits: Int = 1) -> String {
        "\(number(value, fractionDigits: fractionDigits)) %"
    }

    /// Plain number with a Romanian comma: "1,5", "1.250,75" (thousands dot
    /// from 10.000 up, as ro_RO does), never "-0".
    static func number(_ value: Double, fractionDigits: Int = 2) -> String {
        let f = NumberFormatter()
        f.locale = locale
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = fractionDigits
        let rounded = (value * pow(10, Double(fractionDigits))).rounded() / pow(10, Double(fractionDigits))
        let clean = rounded == 0 ? 0 : rounded
        return f.string(from: NSNumber(value: clean)) ?? String(clean)
    }

    /// Parse a number typed by a Romanian user (same rules as Android
    /// `RoFormat.parseDecimal` and web `parseDecimal`): "1,5", "1.5", " 2 ",
    /// "-0,25", "1.250,5", "1 000,5". A lone '.' or ',' is the decimal
    /// separator; when both appear the LAST one is decimal and the other is
    /// grouping; spaces (also non-breaking) are grouping. nil for blank or
    /// invalid text — including what `Double(_:)` would accept but a person
    /// never means: "1e5", "0x10", "inf", "nan".
    static func parseDecimal(_ text: String?) -> Double? {
        guard let text else { return nil }
        let s = String(text.unicodeScalars.filter { !$0.properties.isWhitespace })
        if s.isEmpty { return nil }
        let commas = s.filter { $0 == "," }.count
        let dots = s.filter { $0 == "." }.count
        let normalized: String
        if commas > 0, dots > 0 {
            let lastComma = s.lastIndex(of: ",")!
            let lastDot = s.lastIndex(of: ".")!
            normalized = lastComma > lastDot
                ? s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
                : s.replacingOccurrences(of: ",", with: "")
            // "1.250,5,3" / "1,250.5.3": more than one decimal separator.
            if normalized.filter({ $0 == "." }).count > 1 { return nil }
        } else if commas > 0 {
            if commas > 1 { return nil }
            normalized = s.replacingOccurrences(of: ",", with: ".")
        } else {
            if dots > 1 { return nil }
            normalized = s
        }
        guard normalized.range(of: #"^[+-]?(\d+\.?\d*|\.\d+)$"#, options: .regularExpression) != nil
        else { return nil }
        return Double(normalized).flatMap { $0.isFinite ? $0 : nil }
    }

    /// Stored value → text for an editable numeric field: Romanian comma, up
    /// to `fractionDigits` decimals, no grouping, never "-0". Unlike
    /// `qtyFormatted` (2 decimals, for display) it keeps 0,125 as "0,125", so
    /// opening and saving a form never rounds a stored quantity.
    static func inputText(_ value: Double, fractionDigits: Int = 6) -> String {
        number(value, fractionDigits: fractionDigits).replacingOccurrences(of: ".", with: "")
    }
}
