package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * Resetare date (selective per-org wipe).
 * Mirrors apps/api/src/modules/data-reset/dto/data-reset.dto.ts.
 * Category keys stay raw strings so a new server category never breaks decoding.
 */

@JsonClass(generateAdapter = true)
data class ResetCategoryPreviewDto(
    val key: String,
    val label: String,
    val description: String,
    /** Categories auto-included (FK dependencies) when this one is selected. */
    val requires: List<String> = emptyList(),
    /** Master data (recipes / raw materials) — extra warning. */
    val danger: Boolean = false,
    /** Rows per Prisma model that would be deleted, e.g. {"Task": 120}. */
    val counts: Map<String, Int> = emptyMap(),
    val total: Int = 0,
)

@JsonClass(generateAdapter = true)
data class DataResetPreviewResponse(
    val categories: List<ResetCategoryPreviewDto>,
)

@JsonClass(generateAdapter = true)
data class RunDataResetRequest(
    val categories: List<String>,
    val confirm: String,
)

@JsonClass(generateAdapter = true)
data class DataResetResultDto(
    val categories: List<String>,
    val snapshotId: String? = null,
    val deleted: Map<String, Int> = emptyMap(),
    val total: Int,
)
