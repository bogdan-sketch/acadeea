package com.horae.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Assignment
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.tutorial.tutorialAnchor

/**
 * Bottom navigation tab definition.
 */
data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val route: String,
)

/**
 * Bottom nav tabs, like iOS: Acasă / Producție / Comenzi / Stoc / Rețete. Profil & setări
 * opens from the Panou user bubble (no Setări tab). Each tab is permission-gated, so a
 * limited role sees fewer. No count badges (spec N1).
 */
fun bottomNavItems(role: UserRole): List<BottomNavItem> {
    val items = mutableListOf<BottomNavItem>()

    items.add(BottomNavItem("Acasă", Icons.Outlined.Home, Screen.Dashboard.route))

    if (PermissionManager.can(role, CASLAction.READ, CASLSubject.TASK)) {
        items.add(BottomNavItem("Producție", Icons.AutoMirrored.Outlined.Assignment, Screen.TaskList.route))
    }

    if (PermissionManager.can(role, CASLAction.READ, CASLSubject.ORDER)) {
        items.add(BottomNavItem("Comenzi", Icons.Outlined.ShoppingBag, Screen.OrderList.route))
    }

    if (PermissionManager.can(role, CASLAction.READ, CASLSubject.RAW_MATERIAL) &&
        role != UserRole.AJUTOR_COFETAR
    ) {
        items.add(BottomNavItem("Stoc", Icons.Outlined.Inventory2, Screen.StockOverview.route))
    }

    if (PermissionManager.can(role, CASLAction.READ, CASLSubject.RECIPE)) {
        items.add(BottomNavItem("Rețete", Icons.AutoMirrored.Outlined.MenuBook, Screen.RecipeList.route))
    }

    return items
}

@Composable
fun BottomNavBar(
    currentRoute: String?,
    role: UserRole,
    onNavigate: (String) -> Unit,
) {
    val items = bottomNavItems(role)
    val s = HoraeTheme.scheme

    NavigationBar(
        modifier = Modifier.tutorialAnchor("auth.basics.sidebar"),
        containerColor = s.tabBar,
        tonalElevation = 0.dp,
    ) {
        items.forEach { item ->
            val selected = currentRoute == item.route
            NavigationBarItem(
                // The label already names the tab; no duplicate content description.
                icon = { Icon(item.icon, contentDescription = null) },
                label = {
                    // Always one line, otherwise "Producție" wraps.
                    Text(
                        item.label,
                        style = AppFont.body(12f, if (selected) FontWeight.Bold else FontWeight.SemiBold),
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Visible,
                    )
                },
                selected = selected,
                onClick = { onNavigate(item.route) },
                colors = NavigationBarItemDefaults.colors(
                    indicatorColor = s.primary.copy(alpha = 0.14f),
                    selectedIconColor = s.primaryText,
                    selectedTextColor = s.primaryText,
                    unselectedIconColor = s.ink,
                    unselectedTextColor = s.ink,
                ),
            )
        }
    }
}
