package com.horae.app.ui.navigation

/*
 * Cross-feature route helpers. Feature routes live with their feature
 * (StockRoutes, OrdersRoutes, Screen.kt); this file only holds the shell's own
 * Profil route and the exact-route check used to hide links to unmounted screens.
 */

/** Profil & setări (Date | Setări) — opened from the Panou user bubble. */
const val ROUTE_PROFILE = "settings"

/**
 * True when [route] is mounted with exactly this pattern. Unlike `graph.findNode(route)`,
 * "orders/create" does not match "orders/{orderId}".
 */
fun androidx.navigation.NavController.hasExactRoute(route: String): Boolean =
    graph.any { it.route == route }
