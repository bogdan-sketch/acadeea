import Foundation
import Observation

/// Rollout switch for "Vânzări → stoc" (test environment only for now). Read from
/// `GET /sales-deductions/feature` instead of a compile flag, so prod lights up the
/// moment the API flag flips. Every entry point checks `isAvailable(...)`.
@MainActor
@Observable
final class SalesDeductionFeature {
    static let shared = SalesDeductionFeature()

    /// Last server answer (false until checked / on failure).
    private(set) var enabled = false
    private var lastChecked: Date?

    /// Refreshes at most once a minute (the flag is env-level, not per user).
    func refresh(force: Bool = false) async {
        if !force, let lastChecked, Date().timeIntervalSince(lastChecked) < 60 { return }
        do {
            enabled = try await SalesDeductionService.shared.fetchFeature()
            lastChecked = Date()
        } catch {
            // Network hiccup: keep the previous answer, retry on the next appear.
        }
    }

    /// Feature on AND the user may read stock movements (the API's read gate).
    func isAvailable(_ permissions: PermissionManager) -> Bool {
        enabled && permissions.can(.read, .StockMovement)
    }
}
