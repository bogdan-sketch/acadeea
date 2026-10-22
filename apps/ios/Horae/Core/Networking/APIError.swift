import Foundation

/// Maps API error codes from the backend to typed Swift errors.
/// Source: packages/shared-types/src/error-codes.ts
enum APIError: LocalizedError {
    // Auth
    case invalidCredentials      // AUTH_001
    case accountLocked           // ACCOUNT_LOCKED
    case tokenExpired            // AUTH_002
    case tokenRevoked            // AUTH_003
    case insufficientPermissions // AUTH_004
    case authRequired
    // Social sign-in (Apple / Google)
    case providerNoAccount(provider: String) // PROVIDER_NO_ACCOUNT
    case providerAlreadyLinked               // PROVIDER_ALREADY_LINKED
    case lastLoginMethod                     // LAST_LOGIN_METHOD

    // Stock
    case insufficientStock       // STOCK_001
    case reservationFailed       // STOCK_002
    case concurrentModification  // STOCK_003

    // Task
    case invalidStateTransition  // TASK_001
    case taskAlreadyAssigned     // TASK_002
    case cannotCancelCompleted   // TASK_003

    // Recipe
    case circularDependency      // RECIPE_001
    case maxRecursionDepth       // RECIPE_002
    case invalidIngredientRef    // RECIPE_003

    // Sales deductions (Vanzari → stoc). The server message is kept when present:
    // SALES_001 lists the offending products ("vândut X, stoc Y").
    case salesExceedsStock(String?)      // SALES_001
    case salesAlreadyFinalized(String?)  // SALES_002

    // Generic
    case notFound
    case tooManyRequests         // HTTP 429 (login/API throttle)
    case conflict(String)
    case validationError(String)
    case serverError(Int)
    case networkError(Error)
    case unknown(String)

    var errorDescription: String? {
        switch self {
        case .invalidCredentials: "Email sau parolă invalide"
        case .accountLocked: "Cont blocat după prea multe încercări. Resetează parola din \"Ai uitat parola?\"."
        case .tokenExpired: "Sesiunea a expirat"
        case .tokenRevoked: "Sesiunea a fost revocată"
        case .insufficientPermissions: "Permisiuni insuficiente"
        case .authRequired: "Autentificare necesară"
        case .providerNoAccount(let provider):
            "Nu există cont pentru acest cont \(provider). Ai nevoie de o invitație pentru a te înregistra."
        case .providerAlreadyLinked:
            "Acest cont este deja conectat la un alt utilizator."
        case .lastLoginMethod:
            "Nu poți deconecta ultima metodă de autentificare. Adaugă o parolă sau alt cont mai întâi."
        case .insufficientStock: "Stoc insuficient"
        case .reservationFailed: "Rezervarea a eșuat"
        case .concurrentModification: "Altcineva a modificat între timp. Reîncarcă și încearcă din nou."
        case .invalidStateTransition: "Tranziție de stare invalidă"
        case .taskAlreadyAssigned: "Taskul este deja asignat"
        case .cannotCancelCompleted: "Nu se poate anula un task finalizat"
        case .circularDependency: "Dependență circulară detectată"
        case .maxRecursionDepth: "Adâncime maximă de recursie depășită"
        case .invalidIngredientRef: "Referință de ingredient invalidă"
        case .salesExceedsStock(let msg):
            msg ?? "Vânzările depășesc stocul. Confirmă scăderea până la 0 sau suprascrie stocul."
        case .salesAlreadyFinalized(let msg):
            msg ?? "Scăderea a fost deja confirmată sau anulată."
        case .notFound: "Resursa nu a fost găsită"
        case .tooManyRequests: "Prea multe încercări, încearcă din nou într-un minut"
        case .conflict(let msg): msg
        case .validationError(let msg): msg
        case .serverError(let code): "Eroare de server (\(code)). Încearcă din nou."
        case .networkError(let err): err.localizedDescription
        case .unknown(let msg): msg
        }
    }

    /// Parse error code string from API response body.
    static func from(code: String, message: String? = nil) -> APIError {
        switch code {
        case "AUTH_001": .invalidCredentials
        case "ACCOUNT_LOCKED": .accountLocked
        case "AUTH_002": .tokenExpired
        case "AUTH_003": .tokenRevoked
        case "AUTH_004": .insufficientPermissions
        case "PROVIDER_NO_ACCOUNT": .providerNoAccount(provider: "Apple sau Google")
        case "PROVIDER_ALREADY_LINKED": .providerAlreadyLinked
        case "LAST_LOGIN_METHOD": .lastLoginMethod
        case "STOCK_001": .insufficientStock
        case "STOCK_002": .reservationFailed
        case "STOCK_003": .concurrentModification
        case "TASK_001": .invalidStateTransition
        case "TASK_002": .taskAlreadyAssigned
        case "TASK_003": .cannotCancelCompleted
        case "RECIPE_001": .circularDependency
        case "RECIPE_002": .maxRecursionDepth
        case "RECIPE_003": .invalidIngredientRef
        case "SALES_001": .salesExceedsStock(message)
        case "SALES_002": .salesAlreadyFinalized(message)
        default: .unknown(code)
        }
    }

    /// Parse from HTTP status code when no error code available.
    static func from(statusCode: Int, message: String? = nil) -> APIError {
        switch statusCode {
        case 400: .validationError(message ?? "Cerere invalidă")
        case 401: .authRequired
        case 403: .insufficientPermissions
        case 404: .notFound
        case 409: .conflict(message ?? "Resursa există deja")
        case 422: .validationError(message ?? "Date invalide")
        case 429: .tooManyRequests
        default: .serverError(statusCode)
        }
    }

    /// Parse from response body data + status code.
    /// Tries to extract errorCode and message from the JSON body.
    static func from(data: Data, statusCode: Int) -> APIError {
        if let parsed = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
            if let code = parsed.errorCode {
                let mapped = APIError.from(code: code, message: parsed.message)
                if case .unknown = mapped {
                    return .from(statusCode: statusCode, message: parsed.message)
                }
                return mapped
            }
            return .from(statusCode: statusCode, message: parsed.message)
        }
        return .from(statusCode: statusCode)
    }
}

extension APIError {
    /// A request cancelled by the system (pull-to-refresh released, view left,
    /// task replaced) is not a failure the user should see.
    var isCancellation: Bool {
        guard case .networkError(let err) = self else { return false }
        if err is CancellationError { return true }
        if let urlError = err as? URLError, urlError.code == .cancelled { return true }
        return (err as NSError).code == NSURLErrorCancelled
    }
}
