package com.horae.app.ui.recipes

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.navigation.Screen

/**
 * Recipe photos are off for now (owner decision 17.10.2026): the upload code stays,
 * every entry point is hidden while this is false. Same flag as iOS `RecipePhotos.enabled`.
 */
const val RECIPE_PHOTOS_ENABLED = false

/**
 * THE decision for every recipe photo entry point (list thumbnail, detail header, form
 * upload): shown only while [RECIPE_PHOTOS_ENABLED] is on AND the role may edit recipes
 * (for upload) — today always false.
 */
fun recipePhotoEntryVisible(canEditRecipe: Boolean, enabled: Boolean = RECIPE_PHOTOS_ENABLED): Boolean =
    enabled && canEditRecipe

/** Rețete destinations. AppNavHost only calls `recipesGraph(navController, role)`. */
fun NavGraphBuilder.recipesGraph(navController: NavController, role: UserRole) {
    composable(Screen.RecipeList.route) {
        RecipeListScreen(navController, role = role)
    }
    composable(Screen.RecipeDetail.route) { backStackEntry ->
        val recipeId = backStackEntry.arguments?.getString("recipeId").orEmpty()
        RecipeDetailScreen(navController = navController, recipeId = recipeId, role = role)
    }
    composable(Screen.RecipeCreate.route) {
        RecipeFormScreen(navController = navController, recipeId = null)
    }
    composable(Screen.RecipeEdit.route) { backStackEntry ->
        val recipeId = backStackEntry.arguments?.getString("recipeId")
        RecipeFormScreen(navController = navController, recipeId = recipeId)
    }
    composable(Screen.RecipeYieldHistory.route) { backStackEntry ->
        val recipeId = backStackEntry.arguments?.getString("recipeId").orEmpty()
        RecipeYieldHistoryScreen(navController = navController, recipeId = recipeId)
    }
}
