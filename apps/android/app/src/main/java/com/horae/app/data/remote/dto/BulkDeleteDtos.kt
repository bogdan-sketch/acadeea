package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * Shared shape of every `POST /api/v1/<resource>/bulk-delete[/preview]` endpoint.
 * Mirrors apps/api/src/common/dto/bulk-delete.dto.ts.
 *
 * Flow: preview (what else the delete touches) → user confirms → run with
 * `cascade = true`. Rows are deleted independently: failures land in
 * `failed` with a Romanian reason instead of aborting the batch.
 */

@JsonClass(generateAdapter = true)
data class BulkDeletePreviewRequest(
    val ids: List<String>,
)

/** One kind of dependent row the delete would touch, summed over the selection. */
@JsonClass(generateAdapter = true)
data class BulkDependentDto(
    val key: String,
    /** Romanian, e.g. "Taskuri de producție (se șterg, cu istoricul lor)". */
    val label: String,
    val count: Int,
)

@JsonClass(generateAdapter = true)
data class BulkDeletePreviewDto(
    val found: Int = 0,
    /** Ids that no longer exist (deleted meanwhile) — ignored by the run. */
    val missing: List<String> = emptyList(),
    /** Empty = clean delete, nothing else affected. */
    val dependents: List<BulkDependentDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class BulkDeleteRequest(
    val ids: List<String>,
    /** The UI always sends true — the user confirmed the preview. Without it the API refuses rows with dependents. */
    val cascade: Boolean = true,
)

@JsonClass(generateAdapter = true)
data class BulkDeleteFailureDto(
    val id: String,
    val reason: String,
)

@JsonClass(generateAdapter = true)
data class BulkDeleteResultDto(
    val deleted: List<String> = emptyList(),
    val failed: List<BulkDeleteFailureDto> = emptyList(),
)

// ── Bulk actions (besides delete) ────────────────────────────────────────

/**
 * `POST /<resource>/bulk-action`. `action` + `params` are per resource (see
 * `BulkActionCatalog` in ui/common); the API reuses each resource's
 * single-row rules per id and isolates failures.
 */
@JsonClass(generateAdapter = true)
data class BulkActionRequest(
    val ids: List<String>,
    val action: String,
    val params: Map<String, Any?>? = null,
)

@JsonClass(generateAdapter = true)
data class BulkActionResultDto(
    val done: List<String> = emptyList(),
    val failed: List<BulkDeleteFailureDto> = emptyList(),
)
