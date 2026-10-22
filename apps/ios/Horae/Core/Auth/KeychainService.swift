import Foundation
import KeychainAccess

/// Secure token storage using Keychain.
final class KeychainService: Sendable {
    static let shared = KeychainService()

    private let keychain = Keychain(service: "dev.tigan.acadeea")
    private let accessTokenKey = "accessToken"
    private let refreshTokenKey = "refreshToken"

    var accessToken: String? {
        get { try? keychain.get(accessTokenKey) }
        set {
            if let value = newValue {
                try? keychain.set(value, key: accessTokenKey)
            } else {
                try? keychain.remove(accessTokenKey)
            }
        }
    }

    var refreshToken: String? {
        get { try? keychain.get(refreshTokenKey) }
        set {
            if let value = newValue {
                try? keychain.set(value, key: refreshTokenKey)
            } else {
                try? keychain.remove(refreshTokenKey)
            }
        }
    }

    var hasTokens: Bool {
        accessToken != nil && refreshToken != nil
    }

    func clearTokens() {
        accessToken = nil
        refreshToken = nil
    }
}
