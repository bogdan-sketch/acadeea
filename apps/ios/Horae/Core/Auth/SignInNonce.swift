import Foundation
import CryptoKit

/// Nonce helpers for Sign in with Apple.
///
/// Apple's flow is: generate a cryptographically-random RAW nonce, send its
/// SHA-256 hash in the authorization request (`ASAuthorizationAppleIDRequest.nonce`),
/// then forward the RAW nonce together with the returned `identityToken` to the
/// backend. The server re-hashes the raw nonce and compares it to the `nonce`
/// claim inside the signed identity token to prevent replay attacks.
enum SignInNonce {
    /// Cryptographically-secure random string usable as an OAuth/OIDC nonce.
    static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset: [Character] =
            Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length

        while remaining > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            precondition(status == errSecSuccess, "Unable to generate secure random bytes")

            for random in randoms where remaining > 0 {
                if random < UInt8(charset.count) * (UInt8.max / UInt8(charset.count)) {
                    result.append(charset[Int(random) % charset.count])
                    remaining -= 1
                }
            }
        }
        return result
    }

    /// SHA-256 of the input, hex-encoded lowercase (what Apple expects in the request).
    static func sha256(_ input: String) -> String {
        let hashed = SHA256.hash(data: Data(input.utf8))
        return hashed.map { String(format: "%02x", $0) }.joined()
    }
}
