package com.horae.app.data.repository

import com.horae.app.data.remote.api.AnalyticsApi
import com.horae.app.data.remote.dto.AnalyticsSummaryDto
import com.horae.app.data.remote.dto.OrderAnalyticsDto
import com.horae.app.data.remote.dto.ProductionAnalyticsDto
import com.horae.app.data.remote.dto.UserProductivityDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AnalyticsRepository @Inject constructor(
    private val api: AnalyticsApi,
) {
    suspend fun getSummary(): AnalyticsSummaryDto = api.getSummary()
    suspend fun getProduction(): ProductionAnalyticsDto = api.getProductionAnalytics()
    suspend fun getOrders(): OrderAnalyticsDto = api.getOrderAnalytics()
    suspend fun getUserProductivity(): List<UserProductivityDto> = api.getUserProductivity()
}
