package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.CreateIntegrationRequest
import com.horae.app.data.remote.dto.CreateProductMappingRequest
import com.horae.app.data.remote.dto.ExternalOrderResponseDto
import com.horae.app.data.remote.dto.IntegrationResponseDto
import com.horae.app.data.remote.dto.ProductMappingResponseDto
import com.horae.app.data.remote.dto.SyncResultDto
import com.horae.app.data.remote.dto.UpdateIntegrationRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface IntegrationApi {

    @GET("api/v1/integrations")
    suspend fun getAll(): List<IntegrationResponseDto>

    @GET("api/v1/integrations/{id}")
    suspend fun getById(@Path("id") id: String): IntegrationResponseDto

    @POST("api/v1/integrations")
    suspend fun create(@Body request: CreateIntegrationRequest): IntegrationResponseDto

    @PATCH("api/v1/integrations/{id}")
    suspend fun update(
        @Path("id") id: String,
        @Body request: UpdateIntegrationRequest,
    ): IntegrationResponseDto

    @DELETE("api/v1/integrations/{id}")
    suspend fun delete(@Path("id") id: String)

    @GET("api/v1/integrations/{id}/mappings")
    suspend fun getMappings(@Path("id") id: String): List<ProductMappingResponseDto>

    @POST("api/v1/integrations/{id}/mappings")
    suspend fun createMapping(
        @Path("id") id: String,
        @Body request: CreateProductMappingRequest,
    ): ProductMappingResponseDto

    @DELETE("api/v1/integrations/{id}/mappings/{mappingId}")
    suspend fun deleteMapping(
        @Path("id") id: String,
        @Path("mappingId") mappingId: String,
    )

    @GET("api/v1/integrations/{id}/orders")
    suspend fun getExternalOrders(@Path("id") id: String): List<ExternalOrderResponseDto>

    @POST("api/v1/integrations/{id}/sync")
    suspend fun triggerSync(@Path("id") id: String): SyncResultDto
}
