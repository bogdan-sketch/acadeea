package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.OrderRevenueResponseDto
import com.horae.app.data.remote.dto.PriceHistoryResponseDto
import com.horae.app.data.remote.dto.RecipeMarginResponseDto
import com.horae.app.data.remote.dto.SetSellingPriceRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

interface PricingApi {

    @GET("api/v1/recipes/{id}/margin")
    suspend fun getRecipeMargin(@Path("id") recipeId: String): RecipeMarginResponseDto

    @PATCH("api/v1/recipes/{id}/selling-price")
    suspend fun setSellingPrice(
        @Path("id") recipeId: String,
        @Body body: SetSellingPriceRequest,
    ): RecipeMarginResponseDto

    @GET("api/v1/pricing/history")
    suspend fun getPriceHistory(
        @Query("rawMaterialId") rawMaterialId: String? = null,
        @Query("consumableId") consumableId: String? = null,
        @Query("recipeId") recipeId: String? = null,
    ): List<PriceHistoryResponseDto>

    @GET("api/v1/orders/{id}/revenue")
    suspend fun getOrderRevenue(@Path("id") orderId: String): OrderRevenueResponseDto
}
