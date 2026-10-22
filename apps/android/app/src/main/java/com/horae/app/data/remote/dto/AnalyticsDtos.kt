package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class AnalyticsPeriodDto(
    val from: String? = null,
    val to: String? = null,
)

@JsonClass(generateAdapter = true)
data class ProductionAnalyticsDto(
    // API sends period as an object { from, to }, not a string — a String field
    // here crashed Moshi decode.
    val period: AnalyticsPeriodDto? = null,
    val totalTasksCompleted: Int = 0,
    val totalTasksCancelled: Int = 0,
    val averageCompletionHours: Double? = null,
    val yieldVarianceAvg: Double? = null,
)

@JsonClass(generateAdapter = true)
data class StockAnalyticsTopMaterialDto(
    val name: String,
    val totalConsumed: Double,
    val unit: String,
)

@JsonClass(generateAdapter = true)
data class StockAnalyticsDto(
    val topConsumedMaterials: List<StockAnalyticsTopMaterialDto>,
    val lowStockCount: Int,
    val totalMovements: Int,
)

@JsonClass(generateAdapter = true)
data class OrderAnalyticsProductDto(
    val name: String,
    val quantity: Double,
)

@JsonClass(generateAdapter = true)
data class OrderAnalyticsDto(
    val totalOrders: Int = 0,
    val ordersByStatus: Map<String, Int> = emptyMap(),
    val onTimeRate: Double? = null,
    val popularProducts: List<OrderAnalyticsProductDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class UserProductivityDto(
    val userId: String,
    val firstName: String = "",
    val lastName: String = "",
    val tasksCompleted: Int = 0,
    val avgCompletionHours: Double? = null,
) {
    val fullName: String get() = "$firstName $lastName".trim()
}

@JsonClass(generateAdapter = true)
data class AnalyticsSummaryDto(
    val tasksCompletedToday: Int = 0,
    val ordersToday: Int = 0,
    val lowStockItems: Int = 0,
    val activeUsers: Int = 0,
)
