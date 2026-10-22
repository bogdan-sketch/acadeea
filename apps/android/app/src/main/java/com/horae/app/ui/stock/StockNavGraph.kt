package com.horae.app.ui.stock

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.sales.SalesDeductionDetailScreen
import com.horae.app.ui.sales.SalesDeductionListScreen
import com.horae.app.ui.transfers.TransferCreateScreen
import com.horae.app.ui.transfers.TransferDetailScreen
import com.horae.app.ui.transfers.TransferListScreen

/**
 * Stock, Vânzări → stoc and transfer destinations. AppNavHost only calls
 * `stockGraph(navController, role)`; other features link via [StockRoutes].
 */
fun NavGraphBuilder.stockGraph(navController: NavController, role: UserRole) {
    composable(Screen.StockOverview.route) {
        StockOverviewScreen(navController = navController, role = role)
    }
    composable(Screen.RawMaterialList.route) {
        RawMaterialListScreen(navController = navController, role = role)
    }
    composable(Screen.RawMaterialDetail.route) {
        RawMaterialDetailScreen(navController = navController, role = role)
    }
    composable(Screen.ConsumableList.route) {
        ConsumableListScreen(navController = navController, role = role)
    }
    composable(Screen.ConsumableDetail.route) {
        ConsumableDetailScreen(navController = navController, role = role)
    }
    composable(Screen.StockMovementList.route) {
        StockMovementListScreen(navController = navController)
    }
    composable(Screen.StockReview.route) {
        StockReviewScreen(navController = navController)
    }
    // Legacy route (home "Recepție" tile) — same screen as Recepție.
    composable(Screen.StockMovementCreate.route) {
        StockMovementCreateScreen(navController = navController, receiveMode = true)
    }
    composable(
        StockRoutes.RECEIVE,
        arguments = listOf(
            navArgument(StockRoutes.ARG_MATERIAL_ID) { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
    ) {
        StockMovementCreateScreen(navController = navController, receiveMode = true)
    }
    composable(
        StockRoutes.MOVEMENT_NEW,
        arguments = listOf(
            navArgument(StockRoutes.ARG_TYPE) { type = NavType.StringType; nullable = true; defaultValue = null },
            navArgument(StockRoutes.ARG_MATERIAL_ID) { type = NavType.StringType; nullable = true; defaultValue = null },
        ),
    ) {
        StockMovementCreateScreen(navController = navController, receiveMode = false)
    }
    composable(StockRoutes.TEST_CONSUMPTION) {
        TestConsumptionScreen(navController = navController)
    }
    composable(StockRoutes.EXPIRING) {
        ExpiringScreen(navController = navController)
    }
    composable(StockRoutes.REQUIREMENTS) {
        RequirementsPlanScreen(navController = navController)
    }
    composable(StockRoutes.SUPPLIERS) {
        SuppliersScreen(navController = navController)
    }
    composable(Screen.SemipreparateList.route) {
        SemipreparateListScreen(navController = navController)
    }
    composable(Screen.ProductList.route) {
        ProductListScreen(navController = navController, role = role)
    }
    composable(Screen.RecipeStockDetail.route) {
        RecipeStockDetailScreen(navController = navController)
    }
    composable(Screen.LowStock.route) {
        LowStockScreen(onBack = { navController.popBackStack() })
    }

    // Vânzări → stoc (entry points are feature-gated; the API 404s when off)
    composable(Screen.SalesDeductionList.route) {
        SalesDeductionListScreen(navController = navController, role = role)
    }
    composable(Screen.SalesDeductionDetail.route) {
        SalesDeductionDetailScreen(navController = navController, role = role)
    }

    // Transfers (stock transfers between locations)
    composable(Screen.TransferList.route) {
        TransferListScreen(navController = navController, role = role)
    }
    composable(Screen.TransferDetail.route) { backStackEntry ->
        val id = backStackEntry.arguments?.getString("id").orEmpty()
        TransferDetailScreen(navController = navController, transferId = id, role = role)
    }
    composable(Screen.TransferCreate.route) {
        TransferCreateScreen(navController = navController)
    }
}
