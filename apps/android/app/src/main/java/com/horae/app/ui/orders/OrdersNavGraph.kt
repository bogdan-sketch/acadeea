package com.horae.app.ui.orders

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.horae.app.domain.model.UserRole

/**
 * Order routes (slice C). The strings match `Screen.Order*` so existing links from other
 * screens keep working; new order routes are added here, not in AppNavHost.
 */
object OrdersRoutes {
    const val LIST = "orders"
    const val CREATE = "orders/create"
    const val STATS = "orders/stats"
    const val CALENDAR = "orders/calendar"
    const val DETAIL = "orders/{orderId}"
    const val DELIVERY_NOTE = "orders/{orderId}/delivery-note"

    fun detail(orderId: String) = "orders/$orderId"
    fun deliveryNote(orderId: String) = "orders/$orderId/delivery-note"
}

fun NavGraphBuilder.ordersGraph(navController: NavController, role: UserRole) {
    composable(OrdersRoutes.LIST) { OrderListScreen(navController = navController, role = role) }
    composable(OrdersRoutes.CREATE) { OrderCreateScreen(navController = navController) }
    composable(OrdersRoutes.STATS) { OrderStatsScreen(navController = navController) }
    composable(OrdersRoutes.CALENDAR) { OrderCalendarScreen(navController = navController, role = role) }
    composable(OrdersRoutes.DETAIL) { OrderDetailScreen(navController = navController) }
    composable(OrdersRoutes.DELIVERY_NOTE) { DeliveryNoteScreen(navController = navController) }
}
