package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class RecipeMarginResponseDto(
    val recipeId: String,
    val recipeName: String,
    val sellingPrice: Double?,
    val recipeCost: Double?,
    val margin: Double?,
    val marginPercent: Double?,
)

@JsonClass(generateAdapter = true)
data class PriceHistoryResponseDto(
    val id: String,
    val rawMaterialId: String?,
    val consumableId: String?,
    val recipeId: String?,
    val priceType: String,
    val oldPrice: Double?,
    val newPrice: Double,
    val changedById: String,
    val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class SetSellingPriceRequest(
    val sellingPrice: Double,
)

@JsonClass(generateAdapter = true)
data class OrderRevenueResponseDto(
    val orderId: String,
    val totalRevenue: Double?,
)
