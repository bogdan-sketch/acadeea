package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * Backend pagination envelope: `{ data, total, page, limit, totalPages }`.
 * The API does NOT send `hasNextPage` — declaring it a required decoded field
 * made EVERY paginated screen (tasks, orders, stock, users) throw
 * "Required value 'hasNextPage' missing" on decode. It's computed now.
 */
@JsonClass(generateAdapter = true)
data class PaginatedResponse<T>(
    val data: List<T>,
    val total: Int,
    val page: Int,
    val limit: Int,
    val totalPages: Int,
) {
    val hasNextPage: Boolean get() = page < totalPages
}
