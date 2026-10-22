package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.SupplierDto
import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.dto.BatchReceiveRequest
import com.horae.app.data.remote.dto.ConsumableResponse
import com.horae.app.data.remote.dto.CreateRecipeMovementRequest
import com.horae.app.data.remote.dto.CreateStockMovementRequest
import com.horae.app.data.remote.dto.ExpiringItemDto
import com.horae.app.data.remote.dto.RawMaterialPriceHistoryDto
import com.horae.app.data.remote.dto.LowStockItemDto
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.RawMaterialDeleteInfoDto
import com.horae.app.data.remote.dto.RawMaterialDeleteResponse
import com.horae.app.data.remote.dto.RawMaterialResponse
import com.horae.app.data.remote.dto.RecipeStockResponse
import com.horae.app.data.remote.dto.StockItemAvailabilityResponse
import com.horae.app.data.remote.dto.StockLotResponseDto
import com.horae.app.data.remote.dto.StockMovementResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.QueryMap

interface StockApi {

    @GET("api/v1/raw-materials")
    suspend fun getRawMaterials(@QueryMap query: Map<String, String>): PaginatedResponse<RawMaterialResponse>

    @GET("api/v1/raw-materials/{id}")
    suspend fun getRawMaterial(@Path("id") id: String): RawMaterialResponse

    @GET("api/v1/raw-materials/{id}/price-history")
    suspend fun getRawMaterialPriceHistory(@Path("id") id: String): List<RawMaterialPriceHistoryDto>

    @GET("api/v1/raw-materials/{id}/delete-info")
    suspend fun getRawMaterialDeleteInfo(@Path("id") id: String): RawMaterialDeleteInfoDto

    @DELETE("api/v1/raw-materials/{id}")
    suspend fun deleteRawMaterial(
        @Path("id") id: String,
        @Query("hard") hard: Boolean = true,
    ): RawMaterialDeleteResponse

    /** Bulk HARD delete raw materials (stock history goes too; blocked while on a transfer) — per-row failures reported in `failed`, batch never aborts. */
    /** What else a bulk delete of these ids would touch (dependents summed over the selection). */
    @POST("api/v1/raw-materials/bulk-delete/preview")
    suspend fun bulkDeletePreviewRawMaterials(@Body body: BulkDeletePreviewRequest): BulkDeletePreviewDto

    @POST("api/v1/raw-materials/bulk-delete")
    suspend fun bulkDeleteRawMaterials(@Body body: BulkDeleteRequest): BulkDeleteResultDto

    /** Bulk action (status / assign / category / …) — per-row isolation, see `BulkActionCatalog`. */
    @POST("api/v1/raw-materials/bulk-action")
    suspend fun bulkActionRawMaterials(@Body body: BulkActionRequest): BulkActionResultDto

    /** Bulk HARD delete consumables (stock history goes too) — per-row failures reported in `failed`, batch never aborts. */
    /** What else a bulk delete of these ids would touch (dependents summed over the selection). */
    @POST("api/v1/consumables/bulk-delete/preview")
    suspend fun bulkDeletePreviewConsumables(@Body body: BulkDeletePreviewRequest): BulkDeletePreviewDto

    @POST("api/v1/consumables/bulk-delete")
    suspend fun bulkDeleteConsumables(@Body body: BulkDeleteRequest): BulkDeleteResultDto

    /** Bulk action (status / assign / category / …) — per-row isolation, see `BulkActionCatalog`. */
    @POST("api/v1/consumables/bulk-action")
    suspend fun bulkActionConsumables(@Body body: BulkActionRequest): BulkActionResultDto

    @GET("api/v1/suppliers")
    suspend fun getSuppliers(): List<SupplierDto>

    @GET("api/v1/consumables")
    suspend fun getConsumables(@QueryMap query: Map<String, String>): PaginatedResponse<ConsumableResponse>

    @GET("api/v1/consumables/{id}")
    suspend fun getConsumable(@Path("id") id: String): ConsumableResponse

    @GET("api/v1/stock/movements")
    suspend fun getMovements(@QueryMap query: Map<String, String>): PaginatedResponse<StockMovementResponse>

    /** Movement log as .xlsx — same filters as the list, last 30 days when no range. */
    @GET("api/v1/stock/movements/export")
    suspend fun exportMovements(@QueryMap query: Map<String, String>): okhttp3.ResponseBody

    /** "Revizie stocuri": every stock row per lot, 4 sheets (admin only). */
    @GET("api/v1/stock/review/export")
    suspend fun exportStockReview(): okhttp3.ResponseBody

    @GET("api/v1/stock/recipes")
    suspend fun getRecipeStock(@QueryMap query: Map<String, String>): PaginatedResponse<RecipeStockResponse>

    @POST("api/v1/stock/movements")
    suspend fun createMovement(@Body body: CreateStockMovementRequest): StockMovementResponse

    @POST("api/v1/stock/recipe-movements")
    suspend fun createRecipeMovement(@Body body: CreateRecipeMovementRequest): StockMovementResponse

    @POST("api/v1/stock/movements/batch")
    suspend fun batchReceive(@Body body: BatchReceiveRequest): List<StockMovementResponse>

    @GET("api/v1/stock/low-stock")
    suspend fun getLowStock(): List<LowStockItemDto>

    /** Consume stock for tests / R&D (one IESIRE_TESTE movement per item, FIFO on lots). */
    @POST("api/v1/stock/test-consumption")
    suspend fun testConsumption(@Body body: com.horae.app.data.remote.dto.TestConsumptionRequest): List<StockMovementResponse>

    /** Raw-material needs for an ad-hoc production plan (200, a computation). */
    @POST("api/v1/stock/requirements-plan")
    suspend fun requirementsPlan(
        @Body body: com.horae.app.data.remote.dto.RequirementsPlanRequest,
    ): com.horae.app.data.remote.dto.RequirementsPlanResponse

    @GET("api/v1/stock/expiring")
    suspend fun getExpiring(@Query("days") days: Int = 30): List<ExpiringItemDto>

    @GET("api/v1/stock/item-availability")
    suspend fun getItemAvailability(
        @Query("rawMaterialId") rawMaterialId: String? = null,
        @Query("consumableId") consumableId: String? = null,
        @Query("recipeId") recipeId: String? = null,
    ): StockItemAvailabilityResponse

    @GET("api/v1/stock/lots")
    suspend fun getLots(
        @Query("rawMaterialId") rawMaterialId: String? = null,
        @Query("consumableId") consumableId: String? = null,
    ): List<StockLotResponseDto>
}
