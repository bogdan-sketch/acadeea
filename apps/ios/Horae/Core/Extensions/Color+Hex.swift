import SwiftUI
import UIKit

extension Color {
    /// Parse a hex color string. Accepts the same formats the API sanitizer and
    /// the web/Android clients accept: `#RGB` (3), `#RRGGBB` (6), `#RRGGBBAA` (8).
    /// The leading `#` is optional. Any other length ⇒ nil.
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.hasPrefix("#") ? String(hexSanitized.dropFirst()) : hexSanitized

        // Expand #RGB shorthand → #RRGGBB.
        if hexSanitized.count == 3 {
            hexSanitized = hexSanitized.map { "\($0)\($0)" }.joined()
        }

        guard let rgba = UInt64(hexSanitized, radix: 16) else { return nil }

        let r, g, b, a: Double
        switch hexSanitized.count {
        case 6:
            r = Double((rgba >> 16) & 0xFF) / 255.0
            g = Double((rgba >> 8) & 0xFF) / 255.0
            b = Double(rgba & 0xFF) / 255.0
            a = 1.0
        case 8:
            r = Double((rgba >> 24) & 0xFF) / 255.0
            g = Double((rgba >> 16) & 0xFF) / 255.0
            b = Double((rgba >> 8) & 0xFF) / 255.0
            a = Double(rgba & 0xFF) / 255.0
        default:
            return nil
        }

        self.init(red: r, green: g, blue: b, opacity: a)
    }

    var hexString: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        // getRed handles RGB, grayscale, and other color spaces safely, unlike
        // reading cgColor.components (which is 2-wide for grayscale).
        UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a)
        let clamp = { (v: CGFloat) -> Int in Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", clamp(r), clamp(g), clamp(b))
    }
}
