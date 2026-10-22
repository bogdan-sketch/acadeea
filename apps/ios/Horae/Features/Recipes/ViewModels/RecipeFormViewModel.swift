import Foundation
import Observation

enum RecipeFormMode: Hashable {
    case create
    case edit(String)
}

/// Byproduct semipreparat collected in the mini-form, created after save.
struct PendingByproduct: Equatable {
    var name: String
    var unit: UnitType
    var yieldQuantity: Double
}

/// Shelf-life options offered in the recipe form. Declared in menu order.
enum ShelfLifePreset: Int, CaseIterable, Identifiable, Hashable {
    case untracked = 0
    case m1 = 1
    case m2 = 2
    case m3 = 3
    case m6 = 6
    case m12 = 12
    case custom = -1

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .untracked: "Fără urmărire"
        case .m1: "1 lună"
        case .m2: "2 luni"
        case .m3: "3 luni"
        case .m6: "6 luni"
        case .m12: "12 luni"
        case .custom: "Personalizat"
        }
    }
}

@Observable
final class RecipeFormViewModel {
    let mode: RecipeFormMode

    // Basic info
    var name = ""
    var unit: UnitType = .BUCATI
    var quantityPerPiece: Double = 1
    var yieldQuantity: Double = 1
    var recipeType: RecipeType = .FINAL
    var category: String?
    var estimatedLossPercent: Double = 0
    /// Finished-batch weight in grams after preparation (nil = not set / cleared).
    /// Used as the per-100g nutrition denominator.
    var finishedWeightGrams: Double?
    /// Semipreparat bridge: what one bucată represents (e.g. 2 kg), only used
    /// when `unit == .BUCATI`. nil quantity = no bridge.
    var pieceEquivalentQuantity: Double?
    var pieceEquivalentUnit: UnitType = .KILOGRAME
    var availableCategories: [String] = []

    // Shelf life (termen de valabilitate)
    var shelfLifePreset: ShelfLifePreset = .untracked
    var shelfLifeCustomText: String = ""

    /// Months to persist: nil when untracked, otherwise the preset value or the
    /// parsed custom entry (nil if the custom field is empty/invalid).
    var shelfLifeMonths: Int? {
        switch shelfLifePreset {
        case .untracked: return nil
        case .custom:
            let value = Int(shelfLifeCustomText.trimmingCharacters(in: .whitespaces))
            return (value ?? 0) > 0 ? value : nil
        default: return shelfLifePreset.rawValue
        }
    }

    // Nested sections
    var components: [ComponentFormData] = []

    // Byproduct: existing ones (edit mode, from the API) + one pending new one
    // collected in the mini-form and created right after the recipe saves.
    var existingByproducts: [RecipeByproductSummary] = []
    var pendingByproduct: PendingByproduct?

    // UI state
    var isSaving = false
    var didSave = false
    var error: APIError?

    var navigationTitle: String {
        switch mode {
        case .create: "Reteta noua"
        case .edit: "Editeaza reteta"
        }
    }

    var isFormValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && yieldQuantity > 0
    }

    init(mode: RecipeFormMode) {
        self.mode = mode
    }

    // MARK: - Unsaved-changes tracking

    /// A snapshot of the user-editable fields (transient UI state — isSaving /
    /// didSave / error / availableCategories — excluded) used to detect edits.
    private struct Snapshot: Equatable {
        var name: String
        var unit: UnitType
        var quantityPerPiece: Double
        var yieldQuantity: Double
        var recipeType: RecipeType
        var category: String?
        var estimatedLossPercent: Double
        var finishedWeightGrams: Double?
        var pieceEquivalentQuantity: Double?
        var pieceEquivalentUnit: UnitType
        var shelfLifePreset: ShelfLifePreset
        var shelfLifeCustomText: String
        var components: [ComponentFormData]
        var pendingByproduct: PendingByproduct?
    }

    private var initialSnapshot: Snapshot?

    private var currentSnapshot: Snapshot {
        Snapshot(
            name: name,
            unit: unit,
            quantityPerPiece: quantityPerPiece,
            yieldQuantity: yieldQuantity,
            recipeType: recipeType,
            category: category,
            estimatedLossPercent: estimatedLossPercent,
            finishedWeightGrams: finishedWeightGrams,
            pieceEquivalentQuantity: pieceEquivalentQuantity,
            pieceEquivalentUnit: pieceEquivalentUnit,
            shelfLifePreset: shelfLifePreset,
            shelfLifeCustomText: shelfLifeCustomText,
            components: components,
            pendingByproduct: pendingByproduct
        )
    }

    /// Whether the form has unsaved changes relative to its initial snapshot.
    var isDirty: Bool {
        guard let initialSnapshot else { return false }
        return currentSnapshot != initialSnapshot
    }

    /// Capture the baseline for change detection. Called by the view once the
    /// initial load (edit) or defaults (create) are settled.
    func captureSnapshot() {
        initialSnapshot = currentSnapshot
    }

    // MARK: - Load for editing

    func loadIfEditing() async {
        guard case .edit(let id) = mode else { return }
        do {
            let recipe = try await RecipeService.shared.fetchRecipe(id: id)
            name = recipe.name
            unit = recipe.unit
            quantityPerPiece = recipe.quantityPerPiece
            yieldQuantity = recipe.yieldQuantity
            recipeType = recipe.type
            category = recipe.category
            estimatedLossPercent = recipe.estimatedLossPercent
            finishedWeightGrams = recipe.finishedWeightGrams
            pieceEquivalentQuantity = recipe.pieceEquivalentQuantity
            if let peu = recipe.pieceEquivalentUnit { pieceEquivalentUnit = peu }
            existingByproducts = recipe.byproducts

            // Prefill shelf life: match a known preset, else fall back to custom.
            if let months = recipe.shelfLifeMonths {
                if let preset = ShelfLifePreset(rawValue: months), preset != .untracked, preset != .custom {
                    shelfLifePreset = preset
                } else {
                    shelfLifePreset = .custom
                    shelfLifeCustomText = "\(months)"
                }
            } else {
                shelfLifePreset = .untracked
            }

            components = recipe.components
                .sorted(by: { $0.sortOrder < $1.sortOrder })
                .map { comp in
                    ComponentFormData(
                        name: comp.name,
                        ingredients: comp.ingredients
                            .sorted(by: { $0.sortOrder < $1.sortOrder })
                            .map { ing in
                                IngredientFormItem(
                                    rawMaterialId: ing.rawMaterialId,
                                    semipreparatRecipeId: ing.semipreparatRecipeId,
                                    name: ing.name,
                                    quantity: ing.quantity,
                                    unit: ing.unit,
                                    prepMethod: ing.prepMethod ?? ""
                                )
                            }
                    )
                }

        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Fetch available categories from the server.
    /// Category kind for the current recipe type: final recipes use the
    /// "Produse finite" list, semipreparate use the "Semipreparate" list.
    var categoryKind: String {
        recipeType == .SEMIPREPARAT ? "SEMIPREPARAT" : "PRODUS_FINIT"
    }

    func loadCategories() async {
        do {
            availableCategories = try await RecipeService.shared.fetchCategories(kind: categoryKind)
            // Drop a selected category that doesn't belong to the new list.
            if let c = category, !availableCategories.contains(c) { category = nil }
        } catch {
            // Fallback — don't block the form
        }
    }

    // MARK: - Save

    /// Save the recipe. `asDraft` only applies on create — it flags the new
    /// recipe as a draft (hidden from default lists until published).
    func save(asDraft: Bool = false) async {
        isSaving = true
        defer { isSaving = false }

        let body = buildRequest(asDraft: asDraft)
        do {
            let savedId: String
            switch mode {
            case .create:
                savedId = try await RecipeService.shared.createRecipe(body).id
            case .edit(let id):
                _ = try await RecipeService.shared.updateRecipe(id: id, body)
                savedId = id
            }
            await createPendingByproduct(sourceRecipeId: savedId)
            didSave = true
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Create the collected byproduct as a SEMIPREPARAT linked to the saved
    /// recipe. A failure must not fail the whole save — the recipe is already
    /// persisted; surface the error and keep the pending entry for retry.
    private func createPendingByproduct(sourceRecipeId: String) async {
        guard let pending = pendingByproduct else { return }
        let body = CreateRecipeRequest(
            name: pending.name,
            unit: pending.unit,
            quantityPerPiece: 1,
            yieldQuantity: pending.yieldQuantity,
            type: .SEMIPREPARAT,
            category: nil,
            flavors: nil,
            components: nil,
            isByproduct: true,
            sourceRecipeId: sourceRecipeId
        )
        do {
            let created = try await RecipeService.shared.createRecipe(body)
            existingByproducts.append(RecipeByproductSummary(id: created.id, name: created.name))
            pendingByproduct = nil
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    private func buildRequest(asDraft: Bool = false) -> CreateRecipeRequest {
        // Ignore empty rows on submit: an ingredient counts only if it has a
        // source selected; a component is dropped if it has no real ingredients.
        let realComponents = components.compactMap { comp -> (ComponentFormData, [IngredientFormItem])? in
            let real = comp.ingredients.filter {
                $0.rawMaterialId != nil || $0.semipreparatRecipeId != nil
            }
            return real.isEmpty ? nil : (comp, real)
        }

        let compList: [CreateComponentRequest]? = realComponents.isEmpty ? nil :
            realComponents.enumerated().map { ci, pair in
                let (comp, ingredients) = pair
                return CreateComponentRequest(
                    name: comp.name,
                    sortOrder: ci,
                    ingredients: ingredients.enumerated().map { ii, ing in
                        CreateIngredientRequest(
                            rawMaterialId: ing.rawMaterialId,
                            semipreparatRecipeId: ing.semipreparatRecipeId,
                            name: ing.name,
                            quantity: ing.quantity,
                            unit: ing.unit,
                            prepMethod: ing.prepMethod.isEmpty ? nil : ing.prepMethod,
                            sortOrder: ii
                        )
                    }
                )
            }

        return CreateRecipeRequest(
            name: name,
            unit: unit,
            quantityPerPiece: quantityPerPiece,
            yieldQuantity: yieldQuantity,
            type: recipeType,
            category: category,
            estimatedLossPercent: estimatedLossPercent,
            finishedWeightGrams: (finishedWeightGrams ?? 0) > 0 ? finishedWeightGrams : nil,
            // Only bridge when yield is in bucăți + a positive value is set; else clear.
            pieceEquivalentQuantity:
                (unit == .BUCATI && (pieceEquivalentQuantity ?? 0) > 0) ? pieceEquivalentQuantity : nil,
            pieceEquivalentUnit:
                (unit == .BUCATI && (pieceEquivalentQuantity ?? 0) > 0) ? pieceEquivalentUnit : nil,
            shelfLifeMonths: shelfLifeMonths,
            flavors: nil,
            components: compList,
            // Only send the flag when creating a draft; nil keeps the field out
            // of the payload (edits go through the dedicated draft endpoint).
            isDraft: asDraft ? true : nil
        )
    }

    // MARK: - Section Mutations

    func addComponent() {
        components.append(ComponentFormData())
    }

    func removeComponent(at offsets: IndexSet) {
        components.remove(atOffsets: offsets)
    }

    func addIngredient(to componentIndex: Int) {
        guard components.indices.contains(componentIndex) else { return }
        components[componentIndex].ingredients.append(IngredientFormItem())
    }

    func removeIngredient(from componentIndex: Int, at offsets: IndexSet) {
        guard components.indices.contains(componentIndex) else { return }
        components[componentIndex].ingredients.remove(atOffsets: offsets)
    }

}
