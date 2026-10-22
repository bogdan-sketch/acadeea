package com.horae.app.data.remote.api

import com.horae.app.data.remote.dto.CarouselCategoryDto
import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.dto.CreateRecipeRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.RecipeCostResponseDto
import com.horae.app.data.remote.dto.RecipeDetailResponse
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.remote.dto.RecipeVersionResponseDto
import com.horae.app.data.remote.dto.RecipeYieldHistoryResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.QueryMap

interface RecipeApi {

    @GET("api/v1/recipes")
    suspend fun getRecipes(@QueryMap query: Map<String, String>): PaginatedResponse<RecipeListItemDto>

    @GET("api/v1/recipes/{id}")
    suspend fun getRecipe(@Path("id") recipeId: String): RecipeDetailResponse

    @POST("api/v1/recipes")
    suspend fun createRecipe(@Body body: CreateRecipeRequest): RecipeDetailResponse

    @PATCH("api/v1/recipes/{id}")
    suspend fun updateRecipe(
        @Path("id") recipeId: String,
        @Body body: CreateRecipeRequest,
    ): RecipeDetailResponse

    @GET("api/v1/recipes/categories")
    suspend fun getCategories(@Query("kind") kind: String? = null): List<String>

    @GET("api/v1/recipes/categories/carousel")
    suspend fun getCategoryCarousel(): List<CarouselCategoryDto>

    @GET("api/v1/recipes/{id}/yield-history")
    suspend fun getYieldHistory(
        @Path("id") recipeId: String,
        @QueryMap query: Map<String, String>,
    ): PaginatedResponse<RecipeYieldHistoryResponse>

    @GET("api/v1/recipes/{id}/cost")
    suspend fun getRecipeCost(@Path("id") recipeId: String): RecipeCostResponseDto

    @GET("api/v1/recipes/{id}/versions")
    suspend fun getRecipeVersions(@Path("id") recipeId: String): List<RecipeVersionResponseDto>

    /** Bulk delete (recipes with tasks/orders in history are reported as failed) — per-row failures reported in `failed`, batch never aborts. */
    /** What else a bulk delete of these ids would touch (dependents summed over the selection). */
    @POST("api/v1/recipes/bulk-delete/preview")
    suspend fun bulkDeletePreview(@Body body: BulkDeletePreviewRequest): BulkDeletePreviewDto

    @POST("api/v1/recipes/bulk-delete")
    suspend fun bulkDelete(@Body body: BulkDeleteRequest): BulkDeleteResultDto

    /** Bulk action (status / assign / category / …) — per-row isolation, see `BulkActionCatalog`. */
    @POST("api/v1/recipes/bulk-action")
    suspend fun bulkAction(@Body body: BulkActionRequest): BulkActionResultDto
}
