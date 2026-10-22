package com.horae.app.ui.navigation

/**
 * All navigable destinations in the app.
 * Mirrors the iOS Route enum.
 */
sealed class Screen(val route: String) {

    // Auth
    data object Login : Screen("login")

    // Main (bottom nav tabs: Acasă / Producție / Comenzi / Stoc / Rețete)
    data object Dashboard : Screen("dashboard")

    /** Profil & setări (tabs Date | Setări) — from the Panou user bubble. */
    data object Settings : Screen(ROUTE_PROFILE)
    data object DataReset : Screen("settings/reset")
    data object Changelog : Screen("settings/changelog")
    data object HelpCenter : Screen("help")
    data object Notifications : Screen("notifications")
    data object Analytics : Screen("analytics")
    data object IntegrationList : Screen("integrations")
    data object IntegrationDetail : Screen("integrations/{integrationId}") {
        fun createRoute(integrationId: String) = "integrations/$integrationId"
    }

    // Tasks
    data object TaskList : Screen("tasks")
    data object TaskDetail : Screen("tasks/{taskId}") {
        fun createRoute(taskId: String) = "tasks/$taskId"
    }
    data object TaskCreate : Screen("tasks/create")
    data object TaskEdit : Screen("tasks/{taskId}/edit") {
        fun createRoute(taskId: String) = "tasks/$taskId/edit"
    }

    // Recipes
    data object RecipeList : Screen("recipes")
    data object RecipeDetail : Screen("recipes/{recipeId}") {
        fun createRoute(recipeId: String) = "recipes/$recipeId"
    }
    data object RecipeCreate : Screen("recipes/create")
    data object RecipeEdit : Screen("recipes/{recipeId}/edit") {
        fun createRoute(recipeId: String) = "recipes/$recipeId/edit"
    }
    data object RecipeYieldHistory : Screen("recipes/{recipeId}/yield-history") {
        fun createRoute(recipeId: String) = "recipes/$recipeId/yield-history"
    }

    // Stock
    data object StockOverview : Screen("stock")
    data object RawMaterialList : Screen("stock/raw-materials")
    data object RawMaterialDetail : Screen("stock/raw-materials/{materialId}") {
        fun createRoute(materialId: String) = "stock/raw-materials/$materialId"
    }
    data object ConsumableList : Screen("stock/consumables")
    data object ConsumableDetail : Screen("stock/consumables/{consumableId}") {
        fun createRoute(consumableId: String) = "stock/consumables/$consumableId"
    }
    data object StockMovementList : Screen("stock/movements")
    data object StockReview : Screen("stock/review")
    data object StockMovementCreate : Screen("stock/movements/create")
    data object LowStock : Screen("stock/low-stock")
    data object SemipreparateList : Screen("stock/semipreparate")
    data object ProductList : Screen("stock/products")
    data object RecipeStockDetail : Screen("stock/recipe-stock/{recipeStockId}") {
        fun createRoute(recipeStockId: String) = "stock/recipe-stock/$recipeStockId"
    }

    // Vânzări → stoc (sales → stock deductions; gated by GET /sales-deductions/feature)
    data object SalesDeductionList : Screen("stock/sales")
    data object SalesDeductionDetail : Screen("stock/sales/{id}") {
        fun createRoute(id: String) = "stock/sales/$id"
    }

    // Transfers (stock transfers between locations)
    data object TransferList : Screen("transfers")
    data object TransferDetail : Screen("transfers/{id}") {
        fun createRoute(id: String) = "transfers/$id"
    }
    data object TransferCreate : Screen("transfers/create")

    // Orders
    data object OrderList : Screen("orders")
    data object OrderDetail : Screen("orders/{orderId}") {
        fun createRoute(orderId: String) = "orders/$orderId"
    }
    data object OrderCreate : Screen("orders/create")
    data object OrderStats : Screen("orders/stats")
    data object OrderCalendar : Screen("orders/calendar")
    data object OrderDeliveryNote : Screen("orders/{orderId}/delivery-note") {
        fun createRoute(orderId: String) = "orders/$orderId/delivery-note"
    }

    // Users
    data object UserList : Screen("users")
    data object UserDetail : Screen("users/{userId}") {
        fun createRoute(userId: String) = "users/$userId"
    }

    // Roles (admin)
    data object RoleList : Screen("roles")
    data object RoleCreate : Screen("roles/create")
    data object RoleEdit : Screen("roles/{roleId}/edit") {
        fun createRoute(roleId: String) = "roles/$roleId/edit"
    }

    // Locations
    data object LocationList : Screen("locations")
    data object LocationDashboard : Screen("locations/{id}") {
        fun createRoute(id: String) = "locations/$id"
    }

    // Equipment
    data object EquipmentList : Screen("equipment")
}
