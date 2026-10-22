#if DEBUG
import SwiftUI

/// Sample DRAFT / CONFIRMED deductions for #Preview only.
enum SalesDeductionPreviewData {
    static func deduction(status: SalesDeductionStatus) -> SalesDeduction {
        let json = """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "locationId": "00000000-0000-0000-0000-0000000000aa",
          "locationName": "Magazin Centru",
          "source": "EXCEL",
          "status": "\(status.rawValue)",
          "fileName": "vanzari-ebriza.xlsx",
          "periodFrom": null, "periodTo": null, "note": null,
          "createdByName": "Ana Pop",
          "confirmedByName": \(status == .DRAFT ? "null" : "\"Ana Pop\""),
          "createdAt": "2026-10-04T08:00:00.000Z",
          "confirmedAt": \(status == .DRAFT ? "null" : "\"2026-10-04T09:00:00.000Z\""),
          "revertedAt": null,
          "duplicateOf": ["00000000-0000-0000-0000-000000000002"],
          "summary": {"total": 3, "accepted": 2, "declined": 1, "created": 0,
                      "shortfalls": 1, "overrides": 0, "unmatched": 1},
          "lines": [
            {"id": "l1", "position": 0, "rawName": "Tort Ciocolata", "rawUnit": "buc",
             "quantityReported": 3, "recipeId": "r1", "recipeName": "Tort ciocolată",
             "recipeUnit": "BUCATI", "matchScore": 0.97, "matchKind": "EXACT",
             "decision": "ACCEPT", "quantity": 3, "stockOverride": null, "shortfall": 1,
             "stockBefore": 2, "stockAfter": 0, "currentStock": 2, "candidates": []},
            {"id": "l2", "position": 1, "rawName": "Eclere vanilie", "rawUnit": "buc",
             "quantityReported": 6, "recipeId": null, "recipeName": null, "recipeUnit": null,
             "matchScore": 0.6, "matchKind": "FUZZY", "decision": "ACCEPT", "quantity": 6,
             "stockOverride": null, "shortfall": null, "stockBefore": null, "stockAfter": null,
             "currentStock": null,
             "candidates": [{"id": "r2", "name": "Ecler vanilie", "score": 0.6, "kind": "FUZZY"}]},
            {"id": "l3", "position": 2, "rawName": "Cafea", "rawUnit": "buc",
             "quantityReported": 10, "recipeId": null, "recipeName": null, "recipeUnit": null,
             "matchScore": null, "matchKind": "NONE", "decision": "DECLINE", "quantity": null,
             "stockOverride": null, "shortfall": null, "stockBefore": null, "stockAfter": null,
             "currentStock": null, "candidates": []}
          ]
        }
        """
        // swiftlint:disable:next force_try
        return try! APIClient.makeDecoder().decode(SalesDeduction.self, from: Data(json.utf8))
    }
}

#Preview("Confirmer (DRAFT)") {
    NavigationStack {
        SalesDeductionConfirmerView(deduction: SalesDeductionPreviewData.deduction(status: .DRAFT)) { _ in }
    }
}

#Preview("Log entry (CONFIRMED)") {
    NavigationStack {
        SalesDeductionLogDetailView(
            viewModel: SalesDeductionDetailViewModel(deductionId: "preview"),
            deduction: SalesDeductionPreviewData.deduction(status: .CONFIRMED)
        )
    }
}

#Preview("Confirm sheet") {
    SalesConfirmSheet(
        viewModel: SalesDeductionConfirmViewModel(deduction: SalesDeductionPreviewData.deduction(status: .DRAFT))
    ) { _ in }
}
#endif
