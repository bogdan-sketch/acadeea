import Foundation

/// Response of the public GET /api/v1/changelog endpoint (curated, Romanian).
struct ChangelogResponse: Codable {
    let currentVersion: String
    let entries: [ChangelogEntry]
}

/// One change, tagged with the platforms it applies to (rendered as badges).
struct ChangelogItem: Codable, Hashable {
    let text: String
    let platforms: [String]
}

struct ChangelogEntry: Codable, Identifiable {
    let version: String
    let date: String // ISO yyyy-mm-dd
    let title: String
    let highlights: [String]
    let nou: [ChangelogItem]
    let imbunatatiri: [ChangelogItem]
    let reparat: [ChangelogItem]
    let platforms: [String]

    var id: String { version }

    var formattedDate: String {
        let iso = DateFormatter()
        iso.dateFormat = "yyyy-MM-dd"
        // Pin parsing to Gregorian/POSIX — device calendars (Persian, Buddhist)
        // would misparse the ISO date otherwise.
        iso.locale = Locale(identifier: "en_US_POSIX")
        iso.calendar = Calendar(identifier: .gregorian)
        guard let d = iso.date(from: date) else { return date }
        let out = DateFormatter()
        out.locale = Locale(identifier: "ro_RO")
        out.dateFormat = "d MMMM yyyy"
        return out.string(from: d)
    }
}

/// Display names for platform badges.
enum ChangelogPlatformLabel {
    static func label(_ raw: String) -> String {
        switch raw {
        case "web": return "Web"
        case "ios": return "iOS"
        case "android": return "Android"
        case "api": return "API"
        default: return raw
        }
    }
}
