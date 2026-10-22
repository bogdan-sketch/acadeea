package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.dto.AssignUserLocationRequest
import com.horae.app.data.remote.dto.CreateLocationRequest
import com.horae.app.data.remote.dto.CreateTransferRequest
import com.horae.app.data.remote.dto.TransferAvizDto
import com.horae.app.data.remote.dto.TransferConformityDto
import com.horae.app.data.remote.dto.LocationDashboardResponse
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.LocationStockResponse
import com.horae.app.data.remote.dto.LocationUserResponse
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.TransferResponse
import com.horae.app.data.remote.dto.UpdateTransferApprovalRequest
import com.horae.app.data.remote.dto.UpdateTransferStatusRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.QueryMap

interface LocationApi {

    // Locations
    @GET("api/v1/locations")
    suspend fun getLocations(): List<LocationResponse>

    @GET("api/v1/locations/my-locations")
    suspend fun getMyLocations(): List<LocationResponse>

    @GET("api/v1/locations/{id}")
    suspend fun getLocation(@Path("id") id: String): LocationResponse

    @POST("api/v1/locations")
    suspend fun createLocation(@Body body: CreateLocationRequest): LocationResponse

    @GET("api/v1/locations/{id}/stock")
    suspend fun getLocationStock(@Path("id") id: String): List<LocationStockResponse>

    // Location Users
    @GET("api/v1/locations/{id}/users")
    suspend fun getLocationUsers(@Path("id") id: String): List<LocationUserResponse>

    @POST("api/v1/locations/{id}/users")
    suspend fun assignUserToLocation(
        @Path("id") id: String,
        @Body body: AssignUserLocationRequest,
    ): LocationUserResponse

    @DELETE("api/v1/locations/{id}/users/{userId}")
    suspend fun removeUserFromLocation(
        @Path("id") id: String,
        @Path("userId") userId: String,
    )

    // Location Dashboard
    @GET("api/v1/locations/{id}/dashboard")
    suspend fun getLocationDashboard(@Path("id") id: String): LocationDashboardResponse

    // Transfers
    @GET("api/v1/stock/transfers")
    suspend fun getTransfers(@QueryMap query: Map<String, String>): PaginatedResponse<TransferResponse>

    @GET("api/v1/stock/transfers/{id}")
    suspend fun getTransfer(@Path("id") id: String): TransferResponse

    @POST("api/v1/stock/transfers")
    suspend fun createTransfer(@Body body: CreateTransferRequest): TransferResponse

    /** Bulk delete transfers (active ones return stock to source first) — per-row failures reported in `failed`, batch never aborts. */
    /** What else a bulk delete of these ids would touch (dependents summed over the selection). */
    @POST("api/v1/stock/transfers/bulk-delete/preview")
    suspend fun bulkDeletePreview(@Body body: BulkDeletePreviewRequest): BulkDeletePreviewDto

    @POST("api/v1/stock/transfers/bulk-delete")
    suspend fun bulkDelete(@Body body: BulkDeleteRequest): BulkDeleteResultDto

    /** Bulk action (status / assign / category / …) — per-row isolation, see `BulkActionCatalog`. */
    @POST("api/v1/stock/transfers/bulk-action")
    suspend fun bulkAction(@Body body: BulkActionRequest): BulkActionResultDto

    @PATCH("api/v1/stock/transfers/{id}")
    suspend fun updateTransferStatus(
        @Path("id") id: String,
        @Body body: UpdateTransferStatusRequest,
    ): TransferResponse

    @PATCH("api/v1/stock/transfers/{id}/approval")
    suspend fun updateTransferApproval(
        @Path("id") id: String,
        @Body body: UpdateTransferApprovalRequest,
    ): TransferResponse

    @GET("api/v1/stock/transfers/{id}/aviz")
    suspend fun getTransferAviz(@Path("id") id: String): TransferAvizDto

    @GET("api/v1/stock/transfers/{id}/conformity")
    suspend fun getTransferConformity(@Path("id") id: String): TransferConformityDto
}
