package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.dto.ConfirmSalesDeductionRequest
import com.horae.app.data.remote.dto.CreateManualSalesDeductionRequest
import com.horae.app.data.remote.dto.CreateWooSalesDeductionRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.SalesDeductionDto
import com.horae.app.data.remote.dto.SalesFeatureResponse
import com.horae.app.data.remote.dto.SalesProductOptionDto
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Scădere stoc din vânzări — `/api/v1/sales-deductions`.
 * Reads need `read StockMovement`, writes `create StockMovement`; every route
 * except `feature` 404s where the API's feature flag is off (test-env only).
 */
interface SalesDeductionApi {

    @GET("api/v1/sales-deductions/feature")
    suspend fun feature(): SalesFeatureResponse

    @GET("api/v1/sales-deductions/products")
    suspend fun products(@Query("locationId") locationId: String): List<SalesProductOptionDto>

    @GET("api/v1/sales-deductions")
    suspend fun list(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): PaginatedResponse<SalesDeductionDto>

    @GET("api/v1/sales-deductions/template")
    suspend fun template(@Query("locationId") locationId: String): okhttp3.ResponseBody

    @Multipart
    @POST("api/v1/sales-deductions/excel")
    suspend fun fromExcel(
        @Part file: MultipartBody.Part,
        @Part("locationId") locationId: RequestBody,
    ): SalesDeductionDto

    @POST("api/v1/sales-deductions/manual")
    suspend fun manual(@Body body: CreateManualSalesDeductionRequest): SalesDeductionDto

    @POST("api/v1/sales-deductions/woocommerce")
    suspend fun fromWoo(@Body body: CreateWooSalesDeductionRequest): SalesDeductionDto

    @GET("api/v1/sales-deductions/{id}")
    suspend fun get(@Path("id") id: String): SalesDeductionDto

    @POST("api/v1/sales-deductions/{id}/confirm")
    suspend fun confirm(
        @Path("id") id: String,
        @Body body: ConfirmSalesDeductionRequest,
    ): SalesDeductionDto

    /** 204 No Content. */
    @POST("api/v1/sales-deductions/{id}/discard")
    suspend fun discard(@Path("id") id: String): Response<Unit>

    @POST("api/v1/sales-deductions/{id}/revert")
    suspend fun revert(@Path("id") id: String): SalesDeductionDto

    /** Bulk delete (confirmed deductions are reverted first) — per-row failures reported in `failed`, batch never aborts. */
    /** What else a bulk delete of these ids would touch (dependents summed over the selection). */
    @POST("api/v1/sales-deductions/bulk-delete/preview")
    suspend fun bulkDeletePreview(@Body body: BulkDeletePreviewRequest): BulkDeletePreviewDto

    @POST("api/v1/sales-deductions/bulk-delete")
    suspend fun bulkDelete(@Body body: BulkDeleteRequest): BulkDeleteResultDto

    /** Bulk action (status / assign / category / …) — per-row isolation, see `BulkActionCatalog`. */
    @POST("api/v1/sales-deductions/bulk-action")
    suspend fun bulkAction(@Body body: BulkActionRequest): BulkActionResultDto
}
