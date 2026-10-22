package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.DashboardExpiringDto
import com.horae.app.data.remote.dto.DashboardOrderDto
import com.horae.app.data.remote.dto.DashboardStatsResponse
import retrofit2.http.GET
import retrofit2.http.Query

interface DashboardApi {

    /** [locationId] null = every location ("Toate"). */
    @GET("api/v1/dashboard/stats")
    suspend fun getStats(@Query("locationId") locationId: String? = null): DashboardStatsResponse

    /** Lots expiring within [days] (Panou › "Expiră în 3 zile"). */
    @GET("api/v1/stock/expiring")
    suspend fun getExpiring(@Query("days") days: Int = 3): List<DashboardExpiringDto>

    /** Orders due between [from] and [to] (yyyy-MM-dd), grouped by day. */
    @GET("api/v1/orders/calendar")
    suspend fun getCalendar(
        @Query("from") from: String,
        @Query("to") to: String,
    ): Map<String, List<DashboardOrderDto>>
}
