package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.AnalyticsSummaryDto
import com.horae.app.data.remote.dto.OrderAnalyticsDto
import com.horae.app.data.remote.dto.ProductionAnalyticsDto
import com.horae.app.data.remote.dto.StockAnalyticsDto
import com.horae.app.data.remote.dto.UserProductivityDto
import retrofit2.http.GET
import retrofit2.http.Query

interface AnalyticsApi {

    @GET("api/v1/analytics/production")
    suspend fun getProductionAnalytics(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): ProductionAnalyticsDto

    @GET("api/v1/analytics/stock")
    suspend fun getStockAnalytics(): StockAnalyticsDto

    @GET("api/v1/analytics/orders")
    suspend fun getOrderAnalytics(
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
    ): OrderAnalyticsDto

    @GET("api/v1/analytics/users")
    suspend fun getUserProductivity(): List<UserProductivityDto>

    @GET("api/v1/analytics/summary")
    suspend fun getSummary(): AnalyticsSummaryDto
}
