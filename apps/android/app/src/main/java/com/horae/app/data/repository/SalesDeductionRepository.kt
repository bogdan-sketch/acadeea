package com.horae.app.data.repository

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.api.SalesDeductionApi
import com.horae.app.data.remote.dto.ConfirmSalesDeductionLineRequest
import com.horae.app.data.remote.dto.ConfirmSalesDeductionRequest
import com.horae.app.data.remote.dto.CreateManualSalesDeductionRequest
import com.horae.app.data.remote.dto.CreateWooSalesDeductionRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.SalesDeductionDto
import com.horae.app.data.remote.dto.SalesProductOptionDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SalesDeductionRepository @Inject constructor(
    private val api: SalesDeductionApi,
) {
    /** Cached once per process — the flag is per-environment, not per-user. */
    @Volatile
    private var featureEnabled: Boolean? = null

    /** `GET /sales-deductions/feature`; false on any failure (entry stays hidden). */
    suspend fun isFeatureEnabled(): Boolean {
        featureEnabled?.let { return it }
        return try {
            api.feature().enabled.also { featureEnabled = it }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }
    }

    suspend fun list(page: Int = 1, limit: Int = 20): PaginatedResponse<SalesDeductionDto> =
        api.list(page, limit)

    suspend fun get(id: String): SalesDeductionDto = api.get(id)

    suspend fun products(locationId: String): List<SalesProductOptionDto> = api.products(locationId)

    /** CSV template: every sellable product, quantity blank (for manual deductions). */
    suspend fun templateCsv(locationId: String): ByteArray = api.template(locationId).bytes()

    suspend fun fromExcel(
        bytes: ByteArray,
        fileName: String,
        mimeType: String?,
        locationId: String,
    ): SalesDeductionDto {
        val filePart = MultipartBody.Part.createFormData(
            "file",
            fileName,
            bytes.toRequestBody((mimeType ?: "application/octet-stream").toMediaTypeOrNull()),
        )
        val locationPart = locationId.toRequestBody("text/plain".toMediaType())
        return api.fromExcel(filePart, locationPart)
    }

    suspend fun manual(locationId: String): SalesDeductionDto =
        api.manual(CreateManualSalesDeductionRequest(locationId))

    suspend fun fromWoo(locationId: String, fromIso: String, toIso: String): SalesDeductionDto =
        api.fromWoo(CreateWooSalesDeductionRequest(locationId, fromIso, toIso))

    suspend fun confirm(
        id: String,
        lines: List<ConfirmSalesDeductionLineRequest>,
        note: String?,
    ): SalesDeductionDto = api.confirm(id, ConfirmSalesDeductionRequest(lines, note))

    suspend fun discard(id: String) {
        val res = api.discard(id)
        if (!res.isSuccessful) throw HttpException(res)
    }

    suspend fun revert(id: String): SalesDeductionDto = api.revert(id)

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
