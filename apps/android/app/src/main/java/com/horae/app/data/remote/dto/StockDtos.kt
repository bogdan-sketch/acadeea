package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class RawMaterialResponse(
    val id: String,
    val title: String,
    val category: String? = null,
    val lotNumber: String? = null,
    val expiryDate: String? = null,
    val producer: String?,
    val unit: String,
    val quantityPerPiece: Double,
    val pieceType: String?,
    // Counts are quantities — stock can be fractional (e.g. 12.5 kg), so the API
    // sends JSON numbers that may be non-integer. Moshi's Int adapter throws on a
    // decimal, which silently killed the whole limit=200 raw-materials page (the
    // ingredient picker). Doubles, like RecipeDtos already uses.
    val stockCount: Double,
    val openedCount: Double,
    val orderedCount: Double,
    val reservedCount: Double,
    val storageType: String,
    val status: String,
    val minimumStock: Double,
    val createdAt: String,
    val updatedAt: String,
    val supplierId: String? = null,
    val supplierName: String? = null,
    /** Current purchase price per [unit] (RON), null when never set. */
    val purchasePrice: Double? = null,
    val estimatedLossPercent: Double? = null,
)

@JsonClass(generateAdapter = true)
data class ConsumableResponse(
    val id: String,
    val title: String,
    val category: String? = null,
    val stockCount: Double,
    val orderedCount: Double,
    val reservedCount: Double,
    val status: String,
    val minimumStock: Double,
    val createdAt: String,
    val updatedAt: String,
)

/** Purchase-price change entry (`GET /raw-materials/:id/price-history`, newest first). */
@JsonClass(generateAdapter = true)
data class RawMaterialPriceHistoryDto(
    val id: String,
    val priceType: String? = null,
    val oldPrice: Double? = null,
    val newPrice: Double? = null,
    val createdAt: String,
    val changedBy: PriceHistoryUserDto? = null,
)

@JsonClass(generateAdapter = true)
data class PriceHistoryUserDto(
    val id: String,
    val firstName: String = "",
    val lastName: String = "",
) {
    val fullName: String get() = "$firstName $lastName".trim()
}

@JsonClass(generateAdapter = true)
data class StockMovementResponse(
    val id: String,
    val rawMaterialId: String?,
    val consumableId: String?,
    val recipeId: String?,
    val movementType: String,
    val quantity: Double,
    val unit: String,
    val taskId: String?,
    val referenceNote: String?,
    val performedById: String,
    val createdByName: String? = null,
    val locationName: String? = null,
    val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class ItemLocationStockDto(
    val locationId: String,
    val locationName: String,
    val quantity: Double,
    val reservedCount: Double,
)

@JsonClass(generateAdapter = true)
data class ItemPendingTransferDto(
    val id: String,
    val status: String,
    val fromLocationId: String,
    val fromLocationName: String,
    val toLocationId: String,
    val toLocationName: String,
    val quantity: Double,
    val unit: String,
)

@JsonClass(generateAdapter = true)
data class StockItemAvailabilityResponse(
    val totalQuantity: Double,
    val reservedForTasks: Double,
    val activeTaskCount: Int,
    val locations: List<ItemLocationStockDto>,
    val pendingTransfers: List<ItemPendingTransferDto>,
)

@JsonClass(generateAdapter = true)
data class RecipeStockResponse(
    val id: String,
    val name: String,
    val type: String,
    val category: String?,
    val flavors: List<String>,
    // Fractional for semipreparate measured by weight — Double, not Int (see the
    // RawMaterialResponse note above; same Moshi decode trap).
    val stockCount: Double,
    val reservedCount: Double,
    val unit: String,
    val photoUrl: String?,
    val expiryDate: String? = null,
)

@JsonClass(generateAdapter = true)
data class CreateStockMovementRequest(
    val rawMaterialId: String? = null,
    val consumableId: String? = null,
    val movementType: String,
    val quantity: Double,
    val unit: String,
    val referenceNote: String? = null,
    // INTRARE only — the API records a StockLot from these.
    val lotNumber: String? = null,
    val expiryDate: String? = null,
    val purchasePrice: Double? = null,
)

@JsonClass(generateAdapter = true)
data class CreateRecipeMovementRequest(
    val recipeId: String,
    val movementType: String,
    val quantity: Double,
    val unit: String,
    val referenceNote: String? = null,
)

@JsonClass(generateAdapter = true)
data class BatchReceiveItemDto(
    val rawMaterialId: String? = null,
    val consumableId: String? = null,
    val quantity: Double,
    val unit: String,
    val lotNumber: String? = null,
    val barcode: String? = null,
    val expiryDate: String? = null,
    val purchasePrice: Double? = null,
    val supplierInvoice: String? = null,
    val referenceNote: String? = null,
)

@JsonClass(generateAdapter = true)
data class BatchReceiveRequest(
    val items: List<BatchReceiveItemDto>,
)

@JsonClass(generateAdapter = true)
data class LowStockItemDto(
    val id: String,
    val title: String,
    val type: String,
    val currentStock: Double,
    val minimumStock: Double,
    val unit: String,
) {
    val stockPercentage: Float
        get() = if (minimumStock > 0) (currentStock / minimumStock).toFloat() else 1f
}

@JsonClass(generateAdapter = true)
data class ExpiringItemDto(
    val lotId: String,
    val materialTitle: String,
    val quantity: Double,
    val expiryDate: String,
    val daysUntilExpiry: Int,
    /** "MATERIE" (raw-material lot) or "PRODUS" (produced good); null on old payloads. */
    val itemType: String? = null,
    /** Location holding the item (produced goods). */
    val locationName: String? = null,
    /** Raw unit of [quantity] ("KILOGRAME"); null on old payloads. */
    val unit: String? = null,
)

/** One item of `POST /stock/test-consumption` — exactly one of the ids; quantity in [unit]. */
@JsonClass(generateAdapter = true)
data class TestConsumptionItemDto(
    val rawMaterialId: String? = null,
    val consumableId: String? = null,
    val quantity: Double,
    val unit: String,
)

@JsonClass(generateAdapter = true)
data class TestConsumptionRequest(
    val locationId: String,
    val items: List<TestConsumptionItemDto>,
    val notes: String? = null,
)

/** "Make [quantity] of this recipe" — one product line of the requirements plan. */
@JsonClass(generateAdapter = true)
data class RequirementsPlanItemDto(
    val recipeId: String,
    val quantity: Double,
)

@JsonClass(generateAdapter = true)
data class RequirementsPlanRequest(
    val items: List<RequirementsPlanItemDto>,
)

@JsonClass(generateAdapter = true)
data class PlanProductDto(
    val recipeId: String,
    val recipeName: String,
    val quantity: Double,
    val unit: String,
)

/** Aggregated raw-material need; every quantity is in [unit]. */
@JsonClass(generateAdapter = true)
data class PlanRequirementDto(
    val rawMaterialId: String,
    val title: String,
    val category: String? = null,
    val needed: Double,
    val unit: String,
    val currentStock: Double = 0.0,
    val available: Double = 0.0,
    val deficit: Double = 0.0,
    val supplierId: String? = null,
    val supplierName: String? = null,
)

@JsonClass(generateAdapter = true)
data class RequirementsPlanResponse(
    val products: List<PlanProductDto> = emptyList(),
    val requirements: List<PlanRequirementDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class StockLotResponseDto(
    val id: String,
    val rawMaterialId: String?,
    val consumableId: String?,
    val materialTitle: String?,
    val lotNumber: String?,
    val barcode: String?,
    val quantity: Double,
    val expiryDate: String?,
    val purchasePrice: Double?,
    val supplierInvoice: String?,
    val receivedAt: String,
)

@JsonClass(generateAdapter = true)
data class RawMaterialDeleteInfoDto(
    val currentStock: Double,
    val canDelete: Boolean,
    val everUsed: Boolean,
    /** Live transfers (in asteptare / in tranzit) carrying the material — block delete at stock 0. */
    val activeTransfers: Int? = null,
)

@JsonClass(generateAdapter = true)
data class RawMaterialDeleteResponse(
    val deleted: Boolean,
)
