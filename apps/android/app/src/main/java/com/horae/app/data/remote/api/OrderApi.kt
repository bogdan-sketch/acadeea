package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.dto.AddOrderItemRequest
import com.horae.app.data.remote.dto.CreateOrderRequest
import com.horae.app.data.remote.dto.DeliveryMethodAliasRequest
import com.horae.app.data.remote.dto.DeliveryMethodDto
import com.horae.app.data.remote.dto.DeliveryMethodKindRequest
import com.horae.app.data.remote.dto.DeliveryNoteResponseDto
import com.horae.app.data.remote.dto.OrderItemResponseDto
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.remote.dto.OrderStatsResponseDto
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.UpdateOrderItemRequest
import com.horae.app.data.remote.dto.UpdateOrderRequest
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.PUT
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.QueryMap

interface OrderApi {

    @GET("api/v1/orders")
    suspend fun getOrders(@QueryMap query: Map<String, String>): PaginatedResponse<OrderResponse>

    /** Deliveries grouped by day: `{ "yyyy-MM-dd": [orders] }` (same contract as iOS). */
    @GET("api/v1/orders/calendar")
    suspend fun getCalendar(@QueryMap query: Map<String, String>): Map<String, List<OrderResponse>>

    /** Shop delivery methods with short names + active counts, most used first. */
    @GET("api/v1/orders/delivery-methods")
    suspend fun getDeliveryMethods(): List<DeliveryMethodDto>

    /** Admin (manage Organization): set/clear a method's short name; returns the full list. */
    @PUT("api/v1/orders/delivery-methods/alias")
    suspend fun setDeliveryMethodAlias(@Body body: DeliveryMethodAliasRequest): List<DeliveryMethodDto>

    /** Admin: set (or reset to auto with null) a method's Ridicare/Livrare kind; returns the full list. */
    @PUT("api/v1/orders/delivery-methods/alias")
    suspend fun setDeliveryMethodKind(@Body body: DeliveryMethodKindRequest): List<DeliveryMethodDto>

    @GET("api/v1/orders/stats")
    suspend fun getStats(
        @retrofit2.http.Query("dateFrom") dateFrom: String? = null,
        @retrofit2.http.Query("dateTo") dateTo: String? = null,
    ): OrderStatsResponseDto

    @GET("api/v1/orders/{id}")
    suspend fun getOrder(@Path("id") id: String): OrderResponse

    @POST("api/v1/orders")
    suspend fun createOrder(@Body body: CreateOrderRequest): OrderResponse

    @PATCH("api/v1/orders/{id}")
    suspend fun updateOrder(@Path("id") id: String, @Body body: UpdateOrderRequest): OrderResponse

    @POST("api/v1/orders/{id}/items")
    suspend fun addItem(@Path("id") orderId: String, @Body body: AddOrderItemRequest): OrderItemResponseDto

    @PATCH("api/v1/orders/{id}/items/{itemId}")
    suspend fun updateItem(
        @Path("id") orderId: String,
        @Path("itemId") itemId: String,
        @Body body: UpdateOrderItemRequest,
    ): OrderItemResponseDto

    @DELETE("api/v1/orders/{id}/items/{itemId}")
    suspend fun removeItem(@Path("id") orderId: String, @Path("itemId") itemId: String)

    @POST("api/v1/orders/{id}/delivery-note")
    suspend fun createDeliveryNote(@Path("id") orderId: String): DeliveryNoteResponseDto

    @GET("api/v1/orders/{id}/delivery-note")
    suspend fun getDeliveryNote(@Path("id") orderId: String): DeliveryNoteResponseDto

    @Multipart
    @PATCH("api/v1/orders/{id}/delivery-note/sign")
    suspend fun signDeliveryNote(
        @Path("id") orderId: String,
        @Part("signedByName") signedByName: RequestBody,
        @Part signatureImage: MultipartBody.Part,
    ): DeliveryNoteResponseDto

    /** Bulk delete — per-row failures reported in `failed`, batch never aborts. */
    /** What else a bulk delete of these ids would touch (dependents summed over the selection). */
    @POST("api/v1/orders/bulk-delete/preview")
    suspend fun bulkDeletePreview(@Body body: BulkDeletePreviewRequest): BulkDeletePreviewDto

    @POST("api/v1/orders/bulk-delete")
    suspend fun bulkDelete(@Body body: BulkDeleteRequest): BulkDeleteResultDto

    /** Bulk action (status / assign / category / …) — per-row isolation, see `BulkActionCatalog`. */
    @POST("api/v1/orders/bulk-action")
    suspend fun bulkAction(@Body body: BulkActionRequest): BulkActionResultDto
}
