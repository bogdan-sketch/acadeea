import Foundation
import Observation

@Observable
final class UserDetailViewModel {
    var user: UserResponse?
    var isLoading = false
    var error: APIError?
    var roles: [RoleResponse] = []

    private let userId: String
    private let service = UserService.shared

    init(userId: String) {
        self.userId = userId
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            async let userResult = service.fetchUser(id: userId)
            async let rolesResult = service.fetchRoles()
            user = try await userResult
            roles = try await rolesResult
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func changeRole(to roleId: String) async {
        do {
            user = try await service.changeRole(userId: userId, roleId: roleId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func deactivate() async {
        do {
            user = try await service.deactivateUser(id: userId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }

    func reactivate() async {
        do {
            user = try await service.reactivateUser(id: userId)
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .networkError(error)
        }
    }
}
