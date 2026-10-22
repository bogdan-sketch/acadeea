package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.CreateEquipmentRequest
import com.horae.app.data.remote.dto.CreateMaintenanceLogRequest
import com.horae.app.data.remote.dto.EquipmentResponse
import com.horae.app.data.remote.dto.MaintenanceLogResponse
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface EquipmentApi {

    @GET("api/v1/equipment")
    suspend fun getEquipment(
        @Query("type") type: String? = null,
        @Query("status") status: String? = null,
        @Query("locationId") locationId: String? = null,
    ): List<EquipmentResponse>

    @GET("api/v1/equipment/{id}")
    suspend fun getEquipmentById(@Path("id") id: String): EquipmentResponse

    @POST("api/v1/equipment")
    suspend fun createEquipment(@Body body: CreateEquipmentRequest): EquipmentResponse

    @DELETE("api/v1/equipment/{id}")
    suspend fun deleteEquipment(@Path("id") id: String)

    @GET("api/v1/equipment/{id}/maintenance")
    suspend fun getMaintenanceLogs(@Path("id") id: String): List<MaintenanceLogResponse>

    @POST("api/v1/equipment/{id}/maintenance")
    suspend fun addMaintenanceLog(
        @Path("id") id: String,
        @Body body: CreateMaintenanceLogRequest,
    ): MaintenanceLogResponse
}
