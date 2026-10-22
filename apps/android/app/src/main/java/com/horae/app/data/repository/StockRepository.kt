package com.horae.app.data.repository

import com.horae.app.data.remote.dto.SupplierDto
import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.api.StockApi
import com.horae.app.data.remote.dto.ConsumableResponse
import com.horae.app.data.remote.dto.CreateRecipeMovementRequest
import com.horae.app.data.remote.dto.CreateStockMovementRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.RawMaterialDeleteInfoDto
import com.horae.app.data.remote.dto.RawMaterialDeleteResponse
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.remote.dto.RecipeStockResponse
import com.horae.app.data.remote.dto.StockItemAvailabilityResponse
import com.horae.app.data.remote.dto.StockMovementResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StockRepository @Inject constructor(
    private val api: StockApi,
) {

    suspend fun getRawMaterial(id: String): RawMaterialResponse = api.getRawMaterial(id)

    suspend fun getRawMaterialDeleteInfo(id: String): RawMaterialDeleteInfoDto =
        api.getRawMaterialDeleteInfo(id)

    suspend fun deleteRawMaterial(id: String): RawMaterialDeleteResponse =
        api.deleteRawMaterial(id, hard = true)

    suspend fun getConsumable(id: String): ConsumableResponse = api.getConsumable(id)

    suspend fun getRawMaterialPriceHistory(id: String) = api.getRawMaterialPriceHistory(id)

    suspend fun getRawMaterials(
        page: Int = 1,
        limit: Int = 20,
        search: String? = null,
        storageType: String? = null,
        status: String? = null,
    ): PaginatedResponse<RawMaterialResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        search?.takeIf { it.isNotBlank() }?.let { query["search"] = it }
        storageType?.let { query["storageType"] = it }
        status?.let { query["status"] = it }
        return api.getRawMaterials(query)
    }

    suspend fun getConsumables(
        page: Int = 1,
        limit: Int = 20,
        search: String? = null,
        status: String? = null,
    ): PaginatedResponse<ConsumableResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        search?.takeIf { it.isNotBlank() }?.let { query["search"] = it }
        status?.let { query["status"] = it }
        return api.getConsumables(query)
    }

    suspend fun getMovements(
        page: Int = 1,
        limit: Int = 20,
        rawMaterialId: String? = null,
        consumableId: String? = null,
        recipeId: String? = null,
        movementType: String? = null,
    ): PaginatedResponse<StockMovementResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        rawMaterialId?.let { query["rawMaterialId"] = it }
        consumableId?.let { query["consumableId"] = it }
        recipeId?.let { query["recipeId"] = it }
        movementType?.let { query["movementType"] = it }
        return api.getMovements(query)
    }

    suspend fun movementsXlsx(movementType: String? = null, from: String? = null, to: String? = null): ByteArray {
        val query = mutableMapOf<String, String>()
        movementType?.let { query["movementType"] = it }
        from?.let { query["from"] = it }
        to?.let { query["to"] = it }
        return api.exportMovements(query).bytes()
    }

    suspend fun stockReviewXlsx(): ByteArray = api.exportStockReview().bytes()

    suspend fun getRecipeStock(
        page: Int = 1,
        limit: Int = 20,
        type: String? = null,
        category: String? = null,
        search: String? = null,
    ): PaginatedResponse<RecipeStockResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        type?.let { query["type"] = it }
        category?.let { query["category"] = it }
        search?.takeIf { it.isNotBlank() }?.let { query["search"] = it }
        return api.getRecipeStock(query)
    }

    suspend fun getItemAvailability(
        rawMaterialId: String? = null,
        consumableId: String? = null,
        recipeId: String? = null,
    ): StockItemAvailabilityResponse =
        api.getItemAvailability(
            rawMaterialId = rawMaterialId,
            consumableId = consumableId,
            recipeId = recipeId,
        )

    suspend fun createMovement(body: CreateStockMovementRequest): StockMovementResponse =
        api.createMovement(body)

    suspend fun createRecipeMovement(body: CreateRecipeMovementRequest): StockMovementResponse =
        api.createRecipeMovement(body)

    /** Deletes every id independently; see `BulkDeleteResultDto.failed` for the ones that could not go. */
    /** Preview step before [bulkDeleteRawMaterials]: dependents the delete would touch. */
    suspend fun bulkDeletePreviewRawMaterials(ids: List<String>): BulkDeletePreviewDto =
        api.bulkDeletePreviewRawMaterials(BulkDeletePreviewRequest(ids))

    suspend fun bulkDeleteRawMaterials(ids: List<String>): BulkDeleteResultDto =
        api.bulkDeleteRawMaterials(BulkDeleteRequest(ids = ids, cascade = true))

    /** Apply one action to every id (per-row failures in `failed`). */
    suspend fun bulkActionRawMaterials(ids: List<String>, action: String, params: Map<String, Any?>? = null): BulkActionResultDto =
        api.bulkActionRawMaterials(BulkActionRequest(ids = ids, action = action, params = params))

    /** Preview step before [bulkDeleteConsumables]: dependents the delete would touch. */
    suspend fun bulkDeletePreviewConsumables(ids: List<String>): BulkDeletePreviewDto =
        api.bulkDeletePreviewConsumables(BulkDeletePreviewRequest(ids))

    suspend fun bulkDeleteConsumables(ids: List<String>): BulkDeleteResultDto =
        api.bulkDeleteConsumables(BulkDeleteRequest(ids = ids, cascade = true))

    /** Apply one action to every id (per-row failures in `failed`). */
    suspend fun bulkActionConsumables(ids: List<String>, action: String, params: Map<String, Any?>? = null): BulkActionResultDto =
        api.bulkActionConsumables(BulkActionRequest(ids = ids, action = action, params = params))

    suspend fun getSuppliers(): List<SupplierDto> = api.getSuppliers()

    suspend fun getExpiring(days: Int): List<com.horae.app.data.remote.dto.ExpiringItemDto> = api.getExpiring(days)

    suspend fun testConsumption(body: com.horae.app.data.remote.dto.TestConsumptionRequest): List<StockMovementResponse> =
        api.testConsumption(body)

    suspend fun requirementsPlan(
        items: List<com.horae.app.data.remote.dto.RequirementsPlanItemDto>,
    ): com.horae.app.data.remote.dto.RequirementsPlanResponse =
        api.requirementsPlan(com.horae.app.data.remote.dto.RequirementsPlanRequest(items))
}
