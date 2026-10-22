import Foundation

/// Generic paginated response matching API's PaginatedDto<T>.
/// Source: apps/api/src/common/dto/paginated.dto.ts
struct PaginatedResponse<T: Decodable & Sendable>: Decodable, Sendable {
    let data: [T]
    let total: Int
    let page: Int
    let limit: Int
    let totalPages: Int

    var hasNextPage: Bool { page < totalPages }
    var hasPreviousPage: Bool { page > 1 }
}
