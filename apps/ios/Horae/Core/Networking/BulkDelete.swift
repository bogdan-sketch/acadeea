import Foundation

/// Body of every `POST /<resource>/bulk-delete` endpoint. `cascade` = the user
/// confirmed the dependents listed by the preview; the UI always sends true.
/// Source: apps/api/src/common/dto/bulk-delete.dto.ts
struct BulkDeleteRequest: Encodable, Sendable {
    let ids: [String]
    var cascade: Bool = true
}

/// Body of `POST /<resource>/bulk-delete/preview` (ids only).
struct BulkDeletePreviewRequest: Encodable, Sendable {
    let ids: [String]
}

/// One kind of dependent row the delete would also touch, summed over the selection.
struct BulkDependent: Decodable, Sendable, Identifiable, Equatable {
    let key: String
    /// Romanian label, e.g. "Taskuri de producție (se șterg, cu istoricul lor)".
    let label: String
    let count: Int

    var id: String { key }
}

/// `POST /<resource>/bulk-delete/preview` → what a cascade delete would affect.
/// `dependents` empty = clean delete.
struct BulkDeletePreview: Decodable, Sendable, Equatable {
    let found: Int
    let missing: [String]
    let dependents: [BulkDependent]
}

struct BulkDeleteFailure: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    /// Romanian, user-facing reason from the per-row delete error.
    let reason: String
}

/// Result of a bulk delete: which ids went through and which did not (and why).
struct BulkDeleteResult: Decodable, Sendable, Equatable {
    let deleted: [String]
    let failed: [BulkDeleteFailure]
}

// MARK: - Bulk actions (other than delete)

/// JSON value for `BulkActionRequest.params` (string / number / bool / null).
enum BulkParamValue: Encodable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case int(Int)
    case bool(Bool)
    case null

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .int(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
}

typealias BulkParams = [String: BulkParamValue]

/// Body of `POST /<resource>/bulk-action` — one action applied to many rows.
/// Source: apps/api/src/modules/bulk-actions/dto/bulk-action.dto.ts
struct BulkActionRequest: Encodable, Sendable {
    let ids: [String]
    let action: String
    let params: BulkParams
}

/// Result of a bulk action: rows it went through on, and per-row failures.
struct BulkActionResult: Decodable, Sendable {
    let done: [String]
    let failed: [BulkDeleteFailure]
}
