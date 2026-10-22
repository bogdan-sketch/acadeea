import Foundation
import Observation

@Observable
final class LoginViewModel {
    var email = ""
    var password = ""
    var isLoading = false
    var errorMessage: String?

    private let log = AppLogger.shared

    var isFormValid: Bool {
        !email.isEmpty && password.count >= 6
    }

    func login() async {
        log.log("LoginViewModel.login: email=\(email) passwordLen=\(password.count)")
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await AuthManager.shared.login(email: email, password: password)
            log.log("LoginViewModel.login: success")
        } catch let error as APIError {
            log.log("LoginViewModel.login: APIError=\(error.errorDescription ?? "nil")", level: .error)
            errorMessage = error.errorDescription
        } catch {
            log.log("LoginViewModel.login: error=\(error)", level: .error)
            errorMessage = error.localizedDescription
        }
    }
}
