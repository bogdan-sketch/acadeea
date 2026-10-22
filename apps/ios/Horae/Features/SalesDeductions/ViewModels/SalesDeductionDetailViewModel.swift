import Foundation
import Observation

/// Loads one deduction and decides between the confirmer (DRAFT) and the
/// read-only log entry (CONFIRMED / ANULAT). Owns the revert action.
@Observable
final class SalesDeductionDetailViewModel {
    let deductionId: String
    var deduction: SalesDeduction?
    var loadError: String?
    var isReverting = false
    var error: APIError?

    private let service = SalesDeductionService.shared

    init(deductionId: String) {
        self.deductionId = deductionId
    }

    func load() async {
        do {
            deduction = try await service.fetchDeduction(id: deductionId)
            loadError = nil
        } catch {
            loadError = (error as? APIError)?.errorDescription ?? "Scăderea nu a fost găsită"
        }
    }

    /// Puts the deducted quantities back on today's stock.
    func revert() async -> Bool {
        isReverting = true
        defer { isReverting = false }
        do {
            deduction = try await service.revert(id: deductionId)
            await ToastCenter.shared.show("Scăderea a fost anulată — stocul a fost pus la loc")
            return true
        } catch let err as APIError {
            error = err
            return false
        } catch {
            self.error = .networkError(error)
            return false
        }
    }
}
