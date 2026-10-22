import Foundation
import Observation

@Observable
final class RecipeDetailViewModel {
    let recipeId: String
    var recipe: RecipeResponse?
    var isLoading = false
    var error: APIError?
    var isUploadingPhoto = false
    /// Cost / price / margin for the stat tiles (only with RecipeCost read).
    var cost: RecipeCostResponse?
    /// Produced stock per location ("Stoc pe locații").
    var availability: StockItemAvailability?

    private let service = RecipeService.shared

    init(recipeId: String) {
        self.recipeId = recipeId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            recipe = try await service.fetchRecipe(id: recipeId)
            await loadExtras()
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Secondary data for the stat tiles and the per-location card — best
    /// effort: a missing permission or a failure just hides those parts.
    private func loadExtras() async {
        let canReadCost = AuthManager.shared.permissionManager.can(.read, .RecipeCost)
        async let costResult: RecipeCostResponse? = canReadCost
            ? (try? await service.fetchRecipeCost(id: recipeId)) : nil
        async let availabilityResult = try? await StockService.shared.fetchItemAvailability(recipeId: recipeId)
        cost = await costResult
        availability = await availabilityResult
    }

    /// Archive/unarchive the recipe (hidden from default lists, history kept).
    func toggleArchived() async {
        guard let current = recipe else { return }
        do {
            recipe = try await service.setArchived(id: recipeId, archived: !current.isArchived)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    /// Publish/unpublish the recipe as a draft (hidden from default lists until published).
    func toggleDraft() async {
        guard let current = recipe else { return }
        do {
            recipe = try await service.setDraft(id: recipeId, draft: !current.isDraft)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    // MARK: - Photo

    /// Downscales on-device (≤2000 px, JPEG 0.9) then uploads; the server
    /// re-encodes to WebP and returns the updated recipe.
    func uploadPhoto(_ original: Data) async {
        isUploadingPhoto = true
        defer { isUploadingPhoto = false }
        do {
            let payload = await Task.detached(priority: .userInitiated) {
                ImageUploadPreparer.prepare(original)
            }.value
            recipe = try await service.uploadPhoto(
                recipeId: recipeId,
                data: payload.data,
                filename: payload.filename,
                mime: payload.mime
            )
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func deletePhoto() async {
        isUploadingPhoto = true
        defer { isUploadingPhoto = false }
        do {
            recipe = try await service.deletePhoto(recipeId: recipeId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
