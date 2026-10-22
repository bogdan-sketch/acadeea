package com.horae.app.data.repository

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.api.OrderApi
import com.horae.app.data.remote.dto.AddOrderItemRequest
import com.horae.app.data.remote.dto.CreateOrderRequest
import com.horae.app.data.remote.dto.DeliveryMethodAliasRequest
import com.horae.app.data.remote.dto.DeliveryMethodDto
import com.horae.app.data.remote.dto.DeliveryMethodKindRequest
import com.horae.app.data.remote.dto.DeliveryNoteResponseDto
import com.horae.app.data.remote.dto.OrderItemResponseDto
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.UpdateOrderItemRequest
import com.horae.app.data.remote.dto.UpdateOrderRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val api: OrderApi,
) {

    suspend fun getOrders(
        page: Int = 1,
        limit: Int = 20,
        status: String? = null,
        assignedToId: String? = null,
        search: String? = null,
        /** "intrari" | "livrari" — server ordering (null = API default). */
        view: String? = null,
        /** Exact delivery-method `name` (not the label). */
        deliveryMethod: String? = null,
        /** PICKUP | DELIVERY — orders whose method has that kind. */
        deliveryKind: String? = null,
        /** OrderStatus names → `statuses=NOUA,PREGATITA` (null/empty = every status). */
        statuses: List<String>? = null,
    ): PaginatedResponse<OrderResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        status?.let { query["status"] = it }
        assignedToId?.let { query["assignedToId"] = it }
        search?.takeIf { it.isNotBlank() }?.let { query["search"] = it }
        view?.let { query["view"] = it }
        deliveryMethod?.let { query["deliveryMethod"] = it }
        deliveryKind?.let { query["deliveryKind"] = it }
        statuses?.takeIf { it.isNotEmpty() }?.let { query["statuses"] = it.joinToString(",") }
        return api.getOrders(query)
    }

    /** Status counts for the list-header stat cards (unfiltered totals). */
    suspend fun getStatusCounts(): Map<String, Int> = api.getStats().statusCounts

    /** Orders grouped by day (`yyyy-MM-dd` → orders), only [statuses] (`status=` comma list). */
    suspend fun getCalendar(
        from: String,
        to: String,
        statuses: List<String>,
        view: String? = null,
        deliveryMethod: String? = null,
        deliveryKind: String? = null,
    ): Map<String, List<OrderResponse>> {
        val query = mutableMapOf("from" to from, "to" to to, "status" to statuses.joinToString(","))
        view?.let { query["view"] = it }
        deliveryMethod?.let { query["deliveryMethod"] = it }
        deliveryKind?.let { query["deliveryKind"] = it }
        return api.getCalendar(query)
    }

    /** Shop delivery methods (name, shortName, label, count), most used first. */
    suspend fun getDeliveryMethods(): List<DeliveryMethodDto> = api.getDeliveryMethods()

    /** Admin: set (or clear with null/blank → "") a method's short name; kind untouched. Returns the full list. */
    suspend fun setDeliveryMethodAlias(name: String, shortName: String?): List<DeliveryMethodDto> =
        api.setDeliveryMethodAlias(DeliveryMethodAliasRequest(name, shortName?.trim().orEmpty()))

    /** Admin: set a method's kind (PICKUP | DELIVERY), or null = back to auto; short name untouched. */
    suspend fun setDeliveryMethodKind(name: String, kind: String?): List<DeliveryMethodDto> =
        api.setDeliveryMethodKind(DeliveryMethodKindRequest(name, kind))

    suspend fun getOrder(id: String): OrderResponse =
        api.getOrder(id)

    suspend fun createOrder(body: CreateOrderRequest): OrderResponse =
        api.createOrder(body)

    suspend fun updateOrder(id: String, body: UpdateOrderRequest): OrderResponse =
        api.updateOrder(id, body)

    suspend fun addItem(orderId: String, body: AddOrderItemRequest): OrderItemResponseDto =
        api.addItem(orderId, body)

    suspend fun updateItem(orderId: String, itemId: String, body: UpdateOrderItemRequest): OrderItemResponseDto =
        api.updateItem(orderId, itemId, body)

    suspend fun removeItem(orderId: String, itemId: String) =
        api.removeItem(orderId, itemId)

    suspend fun createDeliveryNote(orderId: String): DeliveryNoteResponseDto =
        api.createDeliveryNote(orderId)

    suspend fun getDeliveryNote(orderId: String): DeliveryNoteResponseDto =
        api.getDeliveryNote(orderId)

    suspend fun signDeliveryNote(
        orderId: String,
        signedByName: String,
        signatureImagePng: ByteArray,
    ): DeliveryNoteResponseDto {
        val namePart = signedByName.toRequestBody("text/plain".toMediaType())
        val imagePart = MultipartBody.Part.createFormData(
            "signatureImage",
            "signature.png",
            signatureImagePng.toRequestBody("image/png".toMediaType()),
        )
        return api.signDeliveryNote(orderId, namePart, imagePart)
    }

    /** Deletes every id independently; see `BulkDeleteResultDto.failed` for the ones that could not go. */
    /** Preview step before [bulkDelete]: dependents the delete would touch. */
    suspend fun bulkDeletePreview(ids: List<String>): BulkDeletePreviewDto =
        api.bulkDeletePreview(BulkDeletePreviewRequest(ids))

    suspend fun bulkDelete(ids: List<String>): BulkDeleteResultDto =
        api.bulkDelete(BulkDeleteRequest(ids = ids, cascade = true))

    /** Apply one action to every id (per-row failures in `failed`). */
    suspend fun bulkAction(ids: List<String>, action: String, params: Map<String, Any?>? = null): BulkActionResultDto =
        api.bulkAction(BulkActionRequest(ids = ids, action = action, params = params))
}
