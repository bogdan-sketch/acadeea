import Foundation
import Observation

/// Upload / delete the signed-in user's avatar and keep `AuthManager.currentUser` in sync.
@Observable
final class ProfileAvatarViewModel {
    var isWorking = false
    var error: APIError?
    var successCount = 0

    private let service = UserService.shared

    @MainActor
    func upload(_ original: Data) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let payload = await Task.detached(priority: .userInitiated) {
                ImageUploadPreparer.prepare(original)
            }.value
            let url = try await service.uploadMyAvatar(
                data: payload.data,
                filename: payload.filename,
                mime: payload.mime
            )
            AuthManager.shared.updateAvatarUrl(url)
            successCount += 1
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    @MainActor
    func delete() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await service.deleteMyAvatar()
            AuthManager.shared.updateAvatarUrl(nil)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
