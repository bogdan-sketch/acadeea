package com.horae.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class RecipeCostIngredientDto(
    val rawMaterialId: String,
    val name: String,
    val quantity: Double,
    val unit: String,
    val unitPrice: Double?,
    val totalCost: Double?,
)

@JsonClass(generateAdapter = true)
data class RecipeCostResponseDto(
    val recipeId: String,
    val recipeName: String,
    val totalCost: Double?,
    val sellingPrice: Double?,
    val margin: Double?,
    val marginPercent: Double?,
    val ingredients: List<RecipeCostIngredientDto>,
)

@JsonClass(generateAdapter = true)
data class RecipeVersionResponseDto(
    val id: String,
    val recipeId: String,
    val version: Int,
    val changedById: String,
    val createdAt: String,
)
