package com.horae.app.data.repository

import com.horae.app.data.remote.api.IntegrationApi
import com.horae.app.data.remote.dto.CreateIntegrationRequest
import com.horae.app.data.remote.dto.CreateProductMappingRequest
import com.horae.app.data.remote.dto.ExternalOrderResponseDto
import com.horae.app.data.remote.dto.IntegrationResponseDto
import com.horae.app.data.remote.dto.ProductMappingResponseDto
import com.horae.app.data.remote.dto.SyncResultDto
import com.horae.app.data.remote.dto.UpdateIntegrationRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class IntegrationRepository @Inject constructor(
    private val api: IntegrationApi,
) {
    suspend fun getAll(): List<IntegrationResponseDto> = api.getAll()
    suspend fun getById(id: String): IntegrationResponseDto = api.getById(id)
    suspend fun create(provider: String): IntegrationResponseDto =
        api.create(CreateIntegrationRequest(provider = provider))
    suspend fun setStatus(id: String, status: String): IntegrationResponseDto =
        api.update(id, UpdateIntegrationRequest(status = status))
    suspend fun delete(id: String) = api.delete(id)

    suspend fun getMappings(id: String): List<ProductMappingResponseDto> = api.getMappings(id)
    suspend fun createMapping(id: String, request: CreateProductMappingRequest): ProductMappingResponseDto =
        api.createMapping(id, request)
    suspend fun deleteMapping(id: String, mappingId: String) = api.deleteMapping(id, mappingId)

    suspend fun getExternalOrders(id: String): List<ExternalOrderResponseDto> = api.getExternalOrders(id)
    suspend fun triggerSync(id: String): SyncResultDto = api.triggerSync(id)
}
