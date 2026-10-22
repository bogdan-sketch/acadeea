package com.horae.app.data.repository

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.api.LocationApi
import com.horae.app.data.remote.dto.CreateTransferRequest
import com.horae.app.data.remote.dto.LocationResponse
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.TransferResponse
import com.horae.app.data.remote.dto.UpdateTransferApprovalRequest
import com.horae.app.data.remote.dto.UpdateTransferStatusRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thin repository over the transfer endpoints of [LocationApi]
 * (`/api/v1/stock/transfers`). Mirrors the style of [RecipeRepository].
 */
@Singleton
class TransferRepository @Inject constructor(
    private val api: LocationApi,
) {

    suspend fun getTransfers(
        page: Int = 1,
        limit: Int = 100,
        status: String? = null,
        fromLocationId: String? = null,
        toLocationId: String? = null,
    ): PaginatedResponse<TransferResponse> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        status?.let { query["status"] = it }
        fromLocationId?.let { query["fromLocationId"] = it }
        toLocationId?.let { query["toLocationId"] = it }
        return api.getTransfers(query)
    }

    suspend fun getTransfer(id: String): TransferResponse = api.getTransfer(id)

    suspend fun createTransfer(body: CreateTransferRequest): TransferResponse =
        api.createTransfer(body)

    /** Advance the transfer lifecycle (IN_TRANZIT / FINALIZAT / ANULAT). */
    suspend fun updateTransferStatus(id: String, status: String): TransferResponse =
        api.updateTransferStatus(id, UpdateTransferStatusRequest(status = status))

    /** Approve / reject a pending transfer, with an optional reason. */
    suspend fun updateTransferApproval(
        id: String,
        status: String,
        reason: String? = null,
    ): TransferResponse =
        api.updateTransferApproval(id, UpdateTransferApprovalRequest(status = status, reason = reason))

    /** Source / destination location choices for the transfer form. */
    suspend fun getLocations(): List<LocationResponse> = api.getLocations()

    /** Aviz de însoțire a mărfii — printable payload. */
    suspend fun getAviz(id: String) = api.getTransferAviz(id)

    /** Declarație de conformitate — printable payload. */
    suspend fun getConformity(id: String) = api.getTransferConformity(id)

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
