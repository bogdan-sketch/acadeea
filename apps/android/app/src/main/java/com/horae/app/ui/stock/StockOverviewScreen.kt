package com.horae.app.ui.stock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.HourglassBottom
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.ShoppingBasket
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.CollapsingHeaderLayout
import com.horae.app.ui.common.HChip
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HIconButtonVariant
import com.horae.app.ui.common.HScreenTitle
import com.horae.app.ui.common.accentGradientBackground
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette
import kotlinx.coroutines.launch

private val stockTabs = listOf("Baze", "Semipreparate", "Produse", "Consumabile")

/** The Stoc quick-action strip, in display order (iOS `StockOverviewView`). */
enum class StockQuickAction(val label: String) {
    RECEPTIE("Recepție"),
    TRANSFER("Transfer"),
    MISCARE("Mișcare"),
    TESTE("Teste"),
    EXPIRARI("Expirări"),
    NECESAR("Necesar"),
    FURNIZORI("Furnizori");

    val route: String
        get() = when (this) {
            RECEPTIE -> StockRoutes.receive()
            TRANSFER -> StockRoutes.TRANSFER_CREATE
            MISCARE -> StockRoutes.movementNew()
            TESTE -> StockRoutes.TEST_CONSUMPTION
            EXPIRARI -> StockRoutes.EXPIRING
            NECESAR -> StockRoutes.REQUIREMENTS
            FURNIZORI -> StockRoutes.SUPPLIERS
        }
}

private val StockQuickAction.icon: ImageVector
    get() = when (this) {
        StockQuickAction.RECEPTIE -> Icons.Filled.ArrowDownward
        StockQuickAction.TRANSFER -> Icons.Filled.SwapHoriz
        StockQuickAction.MISCARE -> Icons.Filled.Tune
        StockQuickAction.TESTE -> Icons.Outlined.Science
        StockQuickAction.EXPIRARI -> Icons.Outlined.HourglassBottom
        StockQuickAction.NECESAR -> Icons.Outlined.ShoppingBasket
        StockQuickAction.FURNIZORI -> Icons.Outlined.LocalShipping
    }

/**
 * Quick actions [role] may use: Recepție/Mișcare need `create StockMovement`, Transfer
 * `create StockTransfer`, Teste `update RawMaterial` or `update Consumable`; Expirări,
 * Necesar and Furnizori are read-only views open to everyone on Stoc.
 */
fun stockQuickActions(role: UserRole): List<StockQuickAction> {
    val canMove = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_MOVEMENT)
    val canTransfer = PermissionManager.can(role, CASLAction.CREATE, CASLSubject.STOCK_TRANSFER)
    val canTest = PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.RAW_MATERIAL) ||
        PermissionManager.can(role, CASLAction.UPDATE, CASLSubject.CONSUMABLE)
    return StockQuickAction.entries.filter {
        when (it) {
            StockQuickAction.RECEPTIE, StockQuickAction.MISCARE -> canMove
            StockQuickAction.TRANSFER -> canTransfer
            StockQuickAction.TESTE -> canTest
            else -> true
        }
    }
}

/**
 * Stoc tab root (mirrors iOS StockOverviewView): title, the quick-action strip
 * Recepție · Transfer · Mișcare · Teste · Expirări · Necesar · Furnizori, the
 * "Epuizate" filter chip, then the four stock tabs. The signed-in [role] reaches
 * every tab (bulk select/delete only where the role may). Revizie stocuri and
 * Vânzări → stoc are linked from Profil › Setări ([StockRoutes]).
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun StockOverviewScreen(
    navController: NavController,
    role: UserRole = UserRole.AJUTOR_COFETAR,
) {
    val pagerState = rememberPagerState(pageCount = { stockTabs.size })
    val scope = rememberCoroutineScope()
    var outOfStockOnly by rememberSaveable { mutableStateOf(false) }
    val s = HoraeTheme.scheme

    val canReadMovements = PermissionManager.can(role, CASLAction.READ, CASLSubject.STOCK_MOVEMENT)

    // Title + quick-action strip hide on scroll down (back on scroll up); the "Epuizate" pill and
    // the tabs stay pinned (1.39.0). Each tab page has its own collapsing search under these.
    CollapsingHeaderLayout(
        modifier = Modifier
            .fillMaxSize()
            // The shell Scaffold already pads for the status bar.
            .accentGradientBackground(),
        header = {
            HScreenTitle(
                title = "Stoc",
                modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp),
                trailing = {
                    if (canReadMovements) {
                        HIconButton(
                            Icons.AutoMirrored.Filled.ListAlt, "Mișcări de stoc",
                            { navController.navigate(StockRoutes.MOVEMENTS) },
                            variant = HIconButtonVariant.PLAIN,
                        )
                    }
                    HIconButton(
                        Icons.AutoMirrored.Filled.CompareArrows, "Transferuri",
                        { navController.navigate(StockRoutes.TRANSFERS) },
                        variant = HIconButtonVariant.PLAIN,
                    )
                    if (role == UserRole.ADMINISTRATOR) {
                        HIconButton(
                            Icons.Outlined.FactCheck, "Revizie stocuri",
                            { navController.navigate(StockRoutes.STOCK_REVIEW) },
                            variant = HIconButtonVariant.PLAIN,
                        )
                    }
                },
            )
            Spacer(Modifier.height(6.dp))

            StockActionRow {
                stockQuickActions(role).forEach { action ->
                    StockActionChip(action.label, action.icon, { navController.navigate(action.route) })
                }
            }
        },
        pinned = {
            // "Epuizate": only what is at 0 in every tab — tap again for everything.
            StockActionRow(Modifier.padding(top = 2.dp)) {
                HChip(
                    label = "Epuizate",
                    selected = outOfStockOnly,
                    onClick = { outOfStockOnly = !outOfStockOnly },
                    dot = StatusPalette.fg(StatusKind.DANGER, s.isDark),
                )
            }

            ScrollableTabRow(
                selectedTabIndex = pagerState.currentPage,
                containerColor = Color.Transparent,
                contentColor = s.primaryText,
                edgePadding = 12.dp,
                divider = {},
                indicator = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        modifier = Modifier.tabIndicatorOffset(tabPositions[pagerState.currentPage]),
                        color = s.primary,
                    )
                },
            ) {
                stockTabs.forEachIndexed { index, title ->
                    val selected = pagerState.currentPage == index
                    Tab(
                        selected = selected,
                        onClick = { scope.launch { pagerState.animateScrollToPage(index) } },
                        selectedContentColor = s.primaryText,
                        unselectedContentColor = s.muted,
                        text = {
                            Text(
                                text = title,
                                style = AppFont.body(14f, if (selected) FontWeight.SemiBold else FontWeight.Medium),
                                maxLines = 1,
                                softWrap = false,
                            )
                        },
                    )
                }
            }
        },
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
            verticalAlignment = androidx.compose.ui.Alignment.Top,
        ) { page ->
            Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Top) {
                when (page) {
                    0 -> RawMaterialListScreen(navController = navController, role = role, outOfStockOnly = outOfStockOnly)
                    1 -> SemipreparateListScreen(navController = navController, outOfStockOnly = outOfStockOnly)
                    2 -> ProductListScreen(navController = navController, role = role, outOfStockOnly = outOfStockOnly)
                    3 -> ConsumableListScreen(navController = navController, role = role, outOfStockOnly = outOfStockOnly)
                }
            }
        }
    }
}
