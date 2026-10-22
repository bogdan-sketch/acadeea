package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * Scădere stoc din vânzări (sales → stock deductions).
 * Mirrors apps/api/src/modules/sales-deductions/dto/sales-deduction.dto.ts.
 * Enum-ish fields stay raw strings here; map them via the domain enums in
 * `domain/model/Enums.kt` (SalesDeductionSource / Status / Decision).
 */

@JsonClass(generateAdapter = true)
data class SalesFeatureResponse(
    val enabled: Boolean,
)

/** Sellable product (active FINAL recipe) with its stock at the chosen location. */
@JsonClass(generateAdapter = true)
data class SalesProductOptionDto(
    val id: String,
    val name: String,
    val unit: String,
    val type: String,
    val category: String? = null,
    val stock: Double,
)

@JsonClass(generateAdapter = true)
data class SalesMatchCandidateDto(
    val id: String,
    val name: String,
    val score: Double,
    val kind: String,
)

@JsonClass(generateAdapter = true)
data class SalesDeductionLineDto(
    val id: String,
    val position: Int,
    val rawName: String,
    val rawUnit: String? = null,
    val quantityReported: Double? = null,
    val recipeId: String? = null,
    val recipeName: String? = null,
    val recipeUnit: String? = null,
    val matchScore: Double? = null,
    val matchKind: String? = null,
    val decision: String,
    val quantity: Double? = null,
    val stockOverride: Double? = null,
    val shortfall: Double? = null,
    val stockBefore: Double? = null,
    val stockAfter: Double? = null,
    /** DRAFT only: live stock of the matched product at the location. */
    val currentStock: Double? = null,
    /** DRAFT only: best name matches. */
    val candidates: List<SalesMatchCandidateDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class SalesDeductionSummaryDto(
    val total: Int = 0,
    val accepted: Int = 0,
    val declined: Int = 0,
    val created: Int = 0,
    val shortfalls: Int = 0,
    val overrides: Int = 0,
    val unmatched: Int = 0,
)

@JsonClass(generateAdapter = true)
data class SalesDeductionDto(
    val id: String,
    val locationId: String,
    val locationName: String,
    val source: String,
    val status: String,
    val fileName: String? = null,
    val periodFrom: String? = null,
    val periodTo: String? = null,
    val note: String? = null,
    val createdByName: String = "",
    val confirmedByName: String? = null,
    val createdAt: String,
    val confirmedAt: String? = null,
    val revertedAt: String? = null,
    /** Earlier CONFIRMED sessions built from the same file (same sha256). */
    val duplicateOf: List<String> = emptyList(),
    val summary: SalesDeductionSummaryDto = SalesDeductionSummaryDto(),
    val lines: List<SalesDeductionLineDto>? = null,
)

// ── Requests ─────────────────────────────────────────────────────────────

@JsonClass(generateAdapter = true)
data class CreateManualSalesDeductionRequest(
    val locationId: String,
)

@JsonClass(generateAdapter = true)
data class CreateWooSalesDeductionRequest(
    val locationId: String,
    /** ISO date-time, inclusive. */
    val from: String,
    /** ISO date-time, inclusive. */
    val to: String,
)

@JsonClass(generateAdapter = true)
data class SalesNewProductRequest(
    val name: String,
    val unit: String,
    /** PRODUS_FINIT category (null = Misc). */
    val category: String? = null,
    val initialStock: Double,
)

/** Nulls are omitted on the wire (Moshi default) → "undefined" for class-validator. */
@JsonClass(generateAdapter = true)
data class ConfirmSalesDeductionLineRequest(
    val id: String? = null,
    val rawName: String,
    val decision: String,
    val recipeId: String? = null,
    /** >0 = scade din stoc (vândut), <0 = adaugă înapoi (retur/corecție). */
    val quantity: Double? = null,
    /** Absolute stock to leave at the location after this line. */
    val stockOverride: Double? = null,
    /** User confirmed selling more than is in stock — stock is clamped at 0. */
    val acceptShortfall: Boolean? = null,
    val newProduct: SalesNewProductRequest? = null,
)

@JsonClass(generateAdapter = true)
data class ConfirmSalesDeductionRequest(
    val lines: List<ConfirmSalesDeductionLineRequest>,
    val note: String? = null,
)
