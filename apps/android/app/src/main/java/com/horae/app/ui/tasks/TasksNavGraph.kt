package com.horae.app.ui.tasks

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.horae.app.domain.model.UserRole

/**
 * Producție routes (slice C). The strings match `Screen.Task*` so existing links keep
 * working; new task routes are added here, not in AppNavHost.
 */
object TasksRoutes {
    const val BOARD = "tasks"
    const val CREATE = "tasks/create"
    /** Task nou with the recipe preselected (Rețetă → "Pornește producția"). */
    const val CREATE_FROM_RECIPE = "tasks/create/from/{recipeId}"
    const val DETAIL = "tasks/{taskId}"
    const val EDIT = "tasks/{taskId}/edit"

    fun detail(taskId: String) = "tasks/$taskId"
    fun edit(taskId: String) = "tasks/$taskId/edit"
    fun createFromRecipe(recipeId: String) = "tasks/create/from/$recipeId"
}

fun NavGraphBuilder.tasksGraph(navController: NavController, role: UserRole) {
    composable(TasksRoutes.BOARD) { TaskListScreen(navController = navController, role = role) }
    composable(TasksRoutes.DETAIL) { TaskDetailScreen(navController = navController) }
    composable(TasksRoutes.CREATE) { TaskCreateScreen(navController = navController) }
    composable(TasksRoutes.CREATE_FROM_RECIPE) { backStackEntry ->
        val recipeId = backStackEntry.arguments?.getString("recipeId").orEmpty()
        TaskCreateScreen(navController = navController, recipeId = recipeId)
    }
    composable(TasksRoutes.EDIT) { backStackEntry ->
        val taskId = backStackEntry.arguments?.getString("taskId").orEmpty()
        TaskCreateScreen(navController = navController, editTaskId = taskId)
    }
}
