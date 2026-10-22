package com.horae.app.data.repository

import com.horae.app.data.remote.dto.BulkActionResultDto
import com.horae.app.data.remote.dto.BulkActionRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewRequest
import com.horae.app.data.remote.dto.BulkDeletePreviewDto
import com.horae.app.data.remote.dto.BulkDeleteResultDto
import com.horae.app.data.remote.dto.BulkDeleteRequest
import com.horae.app.data.remote.api.RecipeApi
import com.horae.app.data.remote.dto.CarouselCategoryDto
import com.horae.app.data.remote.dto.CreateRecipeRequest
import com.horae.app.data.remote.dto.PaginatedResponse
import com.horae.app.data.remote.dto.RecipeCostResponseDto
import com.horae.app.data.remote.dto.RecipeDetailResponse
import com.horae.app.data.remote.dto.RecipeListItemDto
import com.horae.app.data.remote.dto.RecipeYieldHistoryResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RecipeRepository @Inject constructor(
    private val api: RecipeApi,
) {

    suspend fun getRecipes(
        page: Int = 1,
        limit: Int = 100,
        type: String? = null,
        search: String? = null,
    ): PaginatedResponse<RecipeListItemDto> {
        val query = mutableMapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        type?.let { query["type"] = it }
        search?.takeIf { it.isNotBlank() }?.let { query["search"] = it }
        return api.getRecipes(query)
    }

    suspend fun getRecipe(id: String): RecipeDetailResponse = api.getRecipe(id)

    suspend fun createRecipe(body: CreateRecipeRequest): RecipeDetailResponse =
        api.createRecipe(body)

    suspend fun updateRecipe(id: String, body: CreateRecipeRequest): RecipeDetailResponse =
        api.updateRecipe(id, body)

    suspend fun getRecipeCost(id: String): RecipeCostResponseDto = api.getRecipeCost(id)

    /** Category names for a kind (SEMIPREPARAT | PRODUS_FINIT); powers the form picker. */
    suspend fun getCategories(kind: String? = null): List<String> = api.getCategories(kind)

    /** Every category with its parent (admin order) — the category dial lists parents only. */
    suspend fun getCategoryCarousel(): List<CarouselCategoryDto> = api.getCategoryCarousel()

    suspend fun getYieldHistory(
        recipeId: String,
        page: Int = 1,
        limit: Int = 20,
    ): PaginatedResponse<RecipeYieldHistoryResponse> {
        val query = mapOf(
            "page" to page.toString(),
            "limit" to limit.toString(),
        )
        return api.getYieldHistory(recipeId, query)
    }

    /** Deletes every id independently; see `BulkDeleteResultDto.failed` for the ones that could not go. */
    /** Preview step before [bulkDelete]: dependents the delete would touch. */
    suspend fun bulkDeletePreview(ids: List<String>): BulkDeletePreviewDto =
        api.bulkDeletePreview(BulkDeletePreviewRequest(ids))

    suspend fun bulkDelete(ids: List<String>): BulkDeleteResultDto =
        api.bulkDelete(BulkDeleteRequest(ids = ids, cascade = true))

    /** Apply one action to every id (per-row failures in `failed`). */
    suspend fun bulkAction(ids: List<String>, action: String, params: Map<String, Any?>? = null): BulkActionResultDto =
        api.bulkAction(BulkActionRequest(ids = ids, action = action, params = params))
}
