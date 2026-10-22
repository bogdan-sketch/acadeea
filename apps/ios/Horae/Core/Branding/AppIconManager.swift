import UIKit

/// A selectable app icon. `id` is the alternate icon name bundled in the asset
/// catalog + Info.plist `CFBundleAlternateIcons`; empty `id` means the primary
/// (default) icon.
struct AppIconOption: Identifiable, Sendable {
    let id: String
    let displayName: String

    var alternateName: String? { id.isEmpty ? nil : id }
}

@MainActor
enum AppIconManager {
    /// The bundled icon set. Add an entry here AND the matching icon to the
    /// Xcode project (asset catalog / project.yml `CFBundleAlternateIcons`) to
    /// offer a new icon — icons cannot come from an upload, only from the build.
    static let options: [AppIconOption] = [
        AppIconOption(id: "", displayName: "Implicit"),
        // Example, once artwork is bundled:
        // AppIconOption(id: "AppIconGold", displayName: "Gold"),
    ]

    static var isSupported: Bool { UIApplication.shared.supportsAlternateIcons }

    /// Name of the currently active alternate icon ("" if the default is set).
    static var currentId: String { UIApplication.shared.alternateIconName ?? "" }

    /// Apply an icon by alternate name ("" / nil = default). No-op if unsupported,
    /// already set, or the name isn't bundled (the completion error is ignored).
    static func apply(_ name: String?) {
        guard UIApplication.shared.supportsAlternateIcons else { return }
        let target = (name?.isEmpty ?? true) ? nil : name
        guard target != UIApplication.shared.alternateIconName else { return }
        // Only attempt names we actually bundle, so an unknown value can't error.
        if let target, !options.contains(where: { $0.id == target }) { return }
        UIApplication.shared.setAlternateIconName(target) { _ in }
    }
}
