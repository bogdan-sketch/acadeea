import Foundation
import Observation

/// State pentru ecranul "Resetare date" (Setari → Administrare, doar admini).
///
/// Selectia e dublu-gardata: confirmare cu rezumatul a ce se sterge + cuvantul
/// `RESETEAZA` tastat manual. Dependentele (ex. Retete → taskuri, stocuri…)
/// se bifeaza automat si nu pot fi debifate cat timp parintele e selectat.
@Observable
@MainActor
final class DataResetViewModel {
    static let confirmWord = DataResetService.confirmWord

    var categories: [ResetCategoryPreview] = []
    var selected: Set<String> = []
    var isLoading = true
    var isRunning = false
    var error: APIError?

    private let service = DataResetService.shared
    private let log = AppLogger.shared

    var operational: [ResetCategoryPreview] { categories.filter { !$0.danger } }
    var danger: [ResetCategoryPreview] { categories.filter(\.danger) }

    /// Selectia + toate dependentele ei (recursiv), in ordinea din API.
    var effectiveKeys: Set<String> {
        var out = Set<String>()
        func visit(_ key: String) {
            guard !out.contains(key) else { return }
            out.insert(key)
            categories.first { $0.key == key }?.requires.forEach(visit)
        }
        selected.forEach(visit)
        return out
    }

    var effective: [ResetCategoryPreview] {
        let keys = effectiveKeys
        return categories.filter { keys.contains($0.key) }
    }

    var effectiveTotal: Int { effective.reduce(0) { $0 + $1.total } }
    var includesDanger: Bool { effective.contains { $0.danger } }

    func isImplied(_ category: ResetCategoryPreview) -> Bool {
        !selected.contains(category.key) && effectiveKeys.contains(category.key)
    }

    func isChecked(_ category: ResetCategoryPreview) -> Bool {
        selected.contains(category.key) || isImplied(category)
    }

    func setSelected(_ category: ResetCategoryPreview, _ on: Bool) {
        if on { selected.insert(category.key) } else { selected.remove(category.key) }
    }

    // MARK: - Load

    func load() async {
        do {
            categories = try await service.fetchPreview()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
        isLoading = false
    }

    // MARK: - Run

    /// Ruleaza resetarea pentru selectia curenta. `true` la succes.
    func run() async -> Bool {
        guard !selected.isEmpty else { return false }
        isRunning = true
        defer { isRunning = false }
        do {
            let result = try await service.run(categories: Array(selected))
            ToastCenter.shared.show(
                "Datele au fost resetate (\(result.total) inregistrari)",
                lines: ["S-a salvat un backup inainte"]
            )
            log.log("Data reset ok: \(result.categories.joined(separator: ",")) rows=\(result.total)")
            selected = []
            await load()
            return true
        } catch let err as APIError {
            error = err
            log.log("Data reset failed: \(err)", level: .error)
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }
}
