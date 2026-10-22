package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

/**
 * Lean projection of the backend RecipeResponseDto (GET /recipes).
 * Moshi ignores the extra fields (components, cost info, etc.) we don't need.
 */
@JsonClass(generateAdapter = true)
data class RecipeListItemDto(
    val id: String,
    val name: String,
    val unit: String,
    val type: String,
    val category: String? = null,
    // Weight of the finished batch in grams after preparation; used for
    // nutrition per-100g. Nullable — not all recipes have it recorded.
    val finishedWeightGrams: Double? = null,
    // Archived recipes are hidden by the server's default listing; kept here
    // so a future archive UI can read the flag.
    val isArchived: Boolean = false,
    /** Batch yield in [unit] ("1 kg / șarjă"). */
    val yieldQuantity: Double? = null,
    /** Finished stock in [unit] (all locations). */
    val stockCount: Double? = null,
    val sellingPrice: Double? = null,
    val isDraft: Boolean = false,
)

// ── Full recipe detail (GET /recipes/:id) ──────────────────────────────
// Mirrors the backend RecipeResponseDto with nested components + ingredients.
// Nullable-tolerant (defaults) so an unexpected/absent field never crashes decode.

@JsonClass(generateAdapter = true)
data class RecipeIngredientDto(
    val id: String,
    val componentId: String? = null,
    val rawMaterialId: String? = null,
    val semipreparatRecipeId: String? = null,
    val name: String,
    val quantity: Double,
    val unit: String,
    val prepMethod: String? = null,
    val sortOrder: Int = 0,
    // Stock info — only populated for raw-material ingredients.
    val rawMaterialStockCount: Double? = null,
    val rawMaterialReservedCount: Double? = null,
    val rawMaterialUnit: String? = null,
) {
    val isSemipreparat: Boolean get() = semipreparatRecipeId != null
    val isRawMaterial: Boolean get() = rawMaterialId != null
}

@JsonClass(generateAdapter = true)
data class RecipeComponentDto(
    val id: String,
    val recipeId: String? = null,
    val name: String,
    val sortOrder: Int = 0,
    val ingredients: List<RecipeIngredientDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class RecipeByproductSummaryDto(
    val id: String,
    val name: String,
)

@JsonClass(generateAdapter = true)
data class RecipeDetailResponse(
    val id: String,
    val name: String,
    val photoUrl: String? = null,
    val unit: String,
    val quantityPerPiece: Double = 1.0,
    val yieldQuantity: Double = 0.0,
    val finishedWeightGrams: Double? = null,
    val pieceEquivalentQuantity: Double? = null,
    val pieceEquivalentUnit: String? = null,
    val type: String,
    val stockCount: Double = 0.0,
    val reservedCount: Double = 0.0,
    val category: String? = null,
    val estimatedLossPercent: Double = 0.0,
    val shelfLifeMonths: Int? = null,
    val sellingPrice: Double? = null,
    val flavors: List<String> = emptyList(),
    val version: Int = 1,
    val isArchived: Boolean = false,
    val isDraft: Boolean = false,
    val isByproduct: Boolean = false,
    val sourceRecipeId: String? = null,
    val byproducts: List<RecipeByproductSummaryDto> = emptyList(),
    val createdById: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val components: List<RecipeComponentDto> = emptyList(),
)

// ── Create / update payloads (POST /recipes, PATCH /recipes/:id) ────────
// Mirrors CreateRecipeDto. Moshi omits null fields by default, so optional
// (nullable, default-null) properties are simply left out of the JSON body —
// matching the backend's @IsOptional validators.

@JsonClass(generateAdapter = true)
data class CreateRecipeIngredientRequest(
    val rawMaterialId: String? = null,
    val semipreparatRecipeId: String? = null,
    val name: String,
    val quantity: Double,
    val unit: String,
    val prepMethod: String? = null,
    val sortOrder: Int,
)

@JsonClass(generateAdapter = true)
data class CreateRecipeComponentRequest(
    val name: String,
    val sortOrder: Int,
    val ingredients: List<CreateRecipeIngredientRequest>,
)

@JsonClass(generateAdapter = true)
data class CreateRecipeRequest(
    val name: String,
    val unit: String,
    val quantityPerPiece: Double? = null,
    val yieldQuantity: Double,
    val finishedWeightGrams: Double? = null,
    val pieceEquivalentQuantity: Double? = null,
    val pieceEquivalentUnit: String? = null,
    val type: String? = null,
    val category: String? = null,
    val estimatedLossPercent: Double? = null,
    val shelfLifeMonths: Int? = null,
    val flavors: List<String>? = null,
    val isDraft: Boolean? = null,
    val isByproduct: Boolean? = null,
    val sourceRecipeId: String? = null,
    val components: List<CreateRecipeComponentRequest>? = null,
)

@JsonClass(generateAdapter = true)
data class RecipeYieldHistoryResponse(
    val id: String,
    val recipeId: String,
    val taskId: String,
    val targetQuantity: Double,
    val actualYield: Double,
    val varianceAbsolute: Double,
    val variancePercent: Double,
    val scaleFactor: Double,
    val recordedAt: String,
)

/** GET /recipes/categories/carousel — every category in admin order; sub-categories carry parentName. */
@JsonClass(generateAdapter = true)
data class CarouselCategoryDto(
    val name: String,
    val kind: String,
    val color: String? = null,
    val parentName: String? = null,
)
