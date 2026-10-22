package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class DashboardStatsResponse(
    val taskCounts: Map<String, Int>,
    val orderCounts: Map<String, Int>,
    val lowStockMaterials: List<LowStockMaterialDto>,
    val recentTasks: List<DashboardRecentTaskDto>,
    val todayTasksDue: Int,
    val todayOrdersDue: Int,
    /** Uncapped alert totals — lowStockMaterials is truncated to 10 for display. */
    val lowStockCount: Int? = null,
    val outOfStockCount: Int? = null,
    /** Today's orders split by fulfilment (Panou › Comenzi azi hint). */
    val todayDeliveries: Int? = null,
    val todayPickups: Int? = null,
    val todaySalesAmount: Double? = null,
)

@JsonClass(generateAdapter = true)
data class LowStockMaterialDto(
    val id: String,
    val name: String,
    val status: String,
    val currentStock: Double,
    val minimumStock: Double,
    val unit: String? = null,
)

@JsonClass(generateAdapter = true)
data class DashboardRecentTaskDto(
    val id: String,
    val recipeName: String,
    /** Custom task name when set, else the recipe name (null on an older API). */
    val displayName: String? = null,
    val status: String,
    val targetQuantity: Double,
    val targetUnit: String,
    val assignedToName: String? = null,
    val createdAt: String,
)

/** GET /stock/expiring?days=3 row (Panou › "Expiră în 3 zile"). */
@JsonClass(generateAdapter = true)
data class DashboardExpiringDto(
    val lotId: String,
    val materialTitle: String,
    val quantity: Double = 0.0,
    val expiryDate: String,
    val daysUntilExpiry: Int,
)

/**
 * The subset of an order the Panou "Comenzile de azi" card needs (GET /orders/calendar).
 * Read through DashboardApi so the home does not depend on the Comenzi DTOs.
 * Rows show products · quantities, then the customer — never the order number.
 */
@JsonClass(generateAdapter = true)
data class DashboardOrderDto(
    val id: String,
    val orderNumber: String = "",
    val status: String,
    val customerName: String? = null,
    val deliveryPoint: String? = null,
    val createdAt: String = "",
    val itemCount: Int = 0,
    val items: List<DashboardOrderItemDto> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class DashboardOrderItemDto(
    val id: String,
    val recipeName: String = "",
    val label: String? = null,
    val quantity: Double = 0.0,
    val unit: String? = null,
)
