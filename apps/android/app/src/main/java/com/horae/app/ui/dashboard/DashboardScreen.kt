package com.horae.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import coil.compose.SubcomposeAsyncImage
import com.horae.app.data.local.BrandingManager
import com.horae.app.data.remote.dto.DashboardOrderDto
import com.horae.app.data.remote.dto.DashboardRecentTaskDto
import com.horae.app.data.remote.dto.LowStockMaterialDto
import com.horae.app.domain.model.CASLAction
import com.horae.app.domain.model.CASLSubject
import com.horae.app.domain.model.OrderStatus
import com.horae.app.domain.model.PermissionManager
import com.horae.app.domain.model.StatusKind
import com.horae.app.domain.model.TaskStatus
import com.horae.app.domain.model.UnitType
import com.horae.app.domain.model.User
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HCard
import com.horae.app.ui.common.HChip
import com.horae.app.ui.common.HFab
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HStatusChip
import com.horae.app.ui.common.HoraeMetrics
import com.horae.app.ui.common.HoraeRefreshBox
import com.horae.app.ui.common.RoFormat
import com.horae.app.ui.common.formatQty
import com.horae.app.ui.common.qtyFormatted
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.navigation.hasExactRoute
import com.horae.app.ui.notifications.NotificationBellViewModel
import com.horae.app.ui.profile.HoraeImages
import com.horae.app.ui.profile.UserAvatar
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.theme.StatusPalette
import com.horae.app.ui.tutorial.tutorialAnchor

/**
 * Panou (Acasă), 1:1 with the current iOS `DashboardView`:
 * user bubble (→ Profil & setări) + search + notifications, the org logo instead of a
 * greeting (no org name/date/time in the bar), location chips, four KPI cards
 * (Taskuri azi · Comenzi azi · Alerte stoc · Expiră în 3 zile), "Producție acum"
 * (active tasks only), "Comenzile de azi" (products · quantities, then the customer —
 * never the order number), amber stock alerts and a "+" for quick create.
 * The accent gradient fades from the top into the paper.
 */
@Composable
fun DashboardScreen(
    navController: NavController,
    user: User?,
    role: UserRole,
    viewModel: DashboardViewModel = hiltViewModel(),
    bellViewModel: NotificationBellViewModel = hiltViewModel(),
) {
    val canSeeStock = PermissionManager.can(role, CASLAction.READ, CASLSubject.RAW_MATERIAL) &&
        PermissionManager.can(role, CASLAction.READ, CASLSubject.CONSUMABLE)
    val canSeeOrders = PermissionManager.can(role, CASLAction.READ, CASLSubject.ORDER)
    LaunchedEffect(role) { viewModel.start(canSeeOrders = canSeeOrders, canSeeStock = canSeeStock) }
    LaunchedEffect(Unit) { bellViewModel.refresh() }
    val unread by bellViewModel.unread.collectAsState()
    var showCreate by rememberSaveable { mutableStateOf(false) }

    val createActions = remember(role) { quickCreateActions(role, canSeeStock) }
        .filter { navController.hasExactRoute(it.route) }

    Box(Modifier.fillMaxSize()) {
        // The top bar (profile bubble + search/notifications) stays pinned; the rest scrolls.
        Column(Modifier.fillMaxSize()) {
            DashboardHeader(
                user = user,
                roleLabel = user?.roleLabel ?: role.displayName,
                unread = unread,
                showSearch = canSeeStock,
                onProfile = { navController.navigate(Screen.Settings.route) },
                onSearch = { navController.navigate(Screen.StockOverview.route) },
                onNotifications = { navController.navigate(Screen.Notifications.route) },
                modifier = Modifier
                    .padding(horizontal = HoraeMetrics.screenPadding)
                    .padding(top = 8.dp, bottom = 4.dp),
            )
            HoraeRefreshBox(
                isRefreshing = viewModel.isRefreshing,
                onRefresh = viewModel::refresh,
                modifier = Modifier.fillMaxWidth().weight(1f).clipToBounds(),
            ) {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    val isWide = maxWidth >= 720.dp
                    val kpiInOneRow = maxWidth >= 600.dp
                    Column(
                        Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = HoraeMetrics.screenPadding)
                            .padding(top = 8.dp, bottom = 96.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        OrgWordmark(viewModel.brandingManager, Modifier.padding(horizontal = 4.dp, vertical = 4.dp))

                        if (viewModel.locations.size > 1) {
                            LocationChips(
                                locations = viewModel.locations.map { it.id to it.name },
                                selected = viewModel.selectedLocationId,
                                onSelect = viewModel::selectLocation,
                            )
                        }

                        KpiGrid(
                            viewModel = viewModel,
                            inOneRow = kpiInOneRow,
                            canSeeStock = canSeeStock,
                            onTasks = { navController.navigate(Screen.TaskList.route) },
                            onOrders = { navController.navigate(Screen.OrderList.route) },
                            onAlerts = { navController.navigate(Screen.LowStock.route) },
                            onExpiring = navController.routeIfPresent(com.horae.app.ui.stock.StockRoutes.EXPIRING),
                        )

                        val rowLimit = if (isWide) 8 else 4
                        val taskLimit = if (isWide) 6 else 3
                        val stockMaterials = viewModel.stats?.lowStockMaterials.orEmpty()
                        val showsStock = canSeeStock && stockMaterials.isNotEmpty()
                        val production: @Composable (Modifier) -> Unit = { m ->
                            ProductionCard(
                                tasks = viewModel.activeTasks.take(taskLimit),
                                onAll = { navController.navigate(Screen.TaskList.route) },
                                onTask = { navController.navigate(Screen.TaskDetail.createRoute(it)) },
                                modifier = m,
                            )
                        }
                        val orders: @Composable (Modifier) -> Unit = { m ->
                            OrdersCard(
                                orders = viewModel.todayOrders.take(rowLimit),
                                onAll = { navController.navigate(Screen.OrderList.route) },
                                onOrder = { navController.navigate(Screen.OrderDetail.createRoute(it)) },
                                modifier = m,
                            )
                        }
                        val stock: @Composable (Modifier) -> Unit = { m ->
                            StockAlertsCard(
                                materials = stockMaterials.take(rowLimit),
                                outOfStock = viewModel.outOfStockCount,
                                lowStock = viewModel.lowStockCount,
                                onOpen = { navController.navigate(Screen.LowStock.route) },
                                onMaterial = { navController.navigate(Screen.RawMaterialDetail.createRoute(it)) },
                                modifier = m,
                            )
                        }
                        if (isWide) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    production(Modifier.fillMaxWidth())
                                    if (showsStock) stock(Modifier.fillMaxWidth())
                                }
                                if (canSeeOrders) orders(Modifier.weight(1f))
                            }
                        } else {
                            production(Modifier.fillMaxWidth())
                            if (canSeeOrders) orders(Modifier.fillMaxWidth())
                            if (showsStock) stock(Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        }

        if (createActions.isNotEmpty()) {
            HFab(
                contentDescription = "Adaugă: task, comandă, rețetă sau stoc",
                onClick = { showCreate = true },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(HoraeMetrics.screenPadding)
                    .tutorialAnchor("tasks.create.open"),
            )
        }
    }

    if (showCreate) {
        QuickCreateSheet(
            actions = createActions,
            onPick = { action ->
                showCreate = false
                navController.navigate(action.route)
            },
            onDismiss = { showCreate = false },
        )
    }

    viewModel.error?.let { message ->
        // Only when nothing could be shown; with data on screen a failed refresh stays quiet.
        if (viewModel.stats == null) {
            ErrorDialog(message = message, onDismiss = viewModel::dismissError)
        } else {
            LaunchedEffect(message) { viewModel.dismissError() }
        }
    }
}

private fun NavController.routeIfPresent(route: String): (() -> Unit)? =
    if (hasExactRoute(route)) ({ navigate(route) }) else null

// ── Header ─────────────────────────────────────────────────────────────

@Composable
private fun DashboardHeader(
    user: User?,
    roleLabel: String,
    unread: Int,
    showSearch: Boolean,
    onProfile: () -> Unit,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = HoraeTheme.scheme
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) {
            if (user != null) {
                Row(
                    Modifier
                        .clip(CircleShape)
                        .background(s.card)
                        .border(1.dp, s.border, CircleShape)
                        .clickable(role = Role.Button, onClickLabel = "Profil & setări", onClick = onProfile)
                        .defaultMinSize(minHeight = 48.dp)
                        .padding(4.dp)
                        .semantics(mergeDescendants = true) {
                            contentDescription = "Profil & setări, ${user.fullName}, $roleLabel"
                        }
                        .tutorialAnchor("auth.basics.account"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    UserAvatar(user, 34.dp, ring = true)
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.padding(end = 10.dp).widthIn(max = 200.dp)) {
                        Text(
                            user.fullName.ifBlank { user.email },
                            style = AppFont.body(13f, FontWeight.Bold),
                            color = s.ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            roleLabel,
                            style = AppFont.body(11f),
                            color = s.muted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
        if (showSearch) {
            HIconButton(Icons.Outlined.Search, "Caută în stoc", onSearch)
            Spacer(Modifier.width(4.dp))
        }
        HIconButton(
            Icons.Outlined.Notifications,
            if (unread > 0) "Notificări: $unread necitite" else "Notificări",
            onNotifications,
            badge = unread > 0,
        )
    }
}

/** The org logo (dark variant on dark schemes), else the org name in Fraunces. */
@Composable
private fun OrgWordmark(branding: BrandingManager, modifier: Modifier = Modifier) {
    val s = HoraeTheme.scheme
    val raw = if (s.isDark) {
        branding.logoFor(true) ?: branding.logoFor(false)
    } else {
        branding.logoFor(false)
    } ?: branding.logoUrl?.takeIf { it.isNotBlank() }
    val revision = HoraeImages.logoRevision
    val model = remember(raw, revision) { HoraeImages.model(raw, revision) }
    val name: @Composable () -> Unit = {
        Text(
            branding.organizationName,
            style = AppFont.title(32f),
            color = s.ink,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.semantics { heading() },
        )
    }
    Box(modifier.fillMaxWidth()) {
        if (model == null) {
            name()
        } else {
            SubcomposeAsyncImage(
                model = model,
                contentDescription = branding.organizationName,
                contentScale = ContentScale.Fit,
                alignment = Alignment.CenterStart,
                modifier = Modifier.widthIn(max = 280.dp).height(48.dp).semantics { heading() },
                error = { name() },
            )
        }
    }
}

@Composable
private fun LocationChips(
    locations: List<Pair<String, String>>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .semantics { contentDescription = "Locație" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HChip("Toate", selected = selected == null, onClick = { onSelect(null) }, role = Role.RadioButton)
        locations.forEach { (id, name) ->
            HChip(
                name,
                selected = selected == id,
                onClick = { onSelect(if (selected == id) null else id) },
                role = Role.RadioButton,
            )
        }
    }
}

// ── KPI cards ──────────────────────────────────────────────────────────

@Composable
private fun KpiGrid(
    viewModel: DashboardViewModel,
    inOneRow: Boolean,
    canSeeStock: Boolean,
    onTasks: () -> Unit,
    onOrders: () -> Unit,
    onAlerts: () -> Unit,
    onExpiring: (() -> Unit)?,
) {
    val stats = viewModel.stats
    val cards = buildList<@Composable (Modifier) -> Unit> {
        val inProgress = stats?.taskCounts?.get("IN_LUCRU") ?: 0
        val blocked = stats?.taskCounts?.get("BLOCAT") ?: 0
        val tasksHint = "$inProgress în lucru" + if (blocked > 0) " · $blocked blocate" else ""
        add { m -> StatCard("Taskuri azi", "${stats?.todayTasksDue ?: 0}", tasksHint, StatusKind.IN_PROGRESS, onTasks, m) }
        val ordersHint = roCount(stats?.todayPickups ?: 0, "ridicare", "ridicări") + " · " +
            roCount(stats?.todayDeliveries ?: 0, "livrare", "livrări")
        add { m -> StatCard("Comenzi azi", "${stats?.todayOrdersDue ?: 0}", ordersHint, StatusKind.NEW, onOrders, m) }
        if (canSeeStock) {
            val out = viewModel.outOfStockCount
            val low = viewModel.lowStockCount
            add { m -> StatCard("Alerte stoc", "${out + low}", "$out epuizat · $low sub minim", StatusKind.WARNING, onAlerts, m) }
            val expiring = viewModel.expiringSoon
            val hint = if (expiring.isEmpty()) "Nimic nu expiră" else expiring.take(2).joinToString(" · ") { it.materialTitle }
            add { m -> StatCard("Expiră în 3 zile", "${expiring.size}", hint, StatusKind.READY, onExpiring, m) }
        } else {
            val sales = stats?.todaySalesAmount ?: 0.0
            add { m -> StatCard("Vânzări azi", "${RoFormat.number(sales, 2)} RON", " ", StatusKind.READY, null, m) }
        }
    }
    val perRow = if (inOneRow) 4 else 2
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        cards.chunked(perRow).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { card -> card(Modifier.weight(1f)) }
                repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun StatCard(
    label: String,
    value: String,
    hint: String,
    kind: StatusKind,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val s = HoraeTheme.scheme
    HCard(modifier = modifier, padding = androidx.compose.foundation.layout.PaddingValues(14.dp), onClick = onClick, onClickLabel = "Deschide") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(StatusPalette.fg(kind, s.isDark)))
            Spacer(Modifier.width(6.dp))
            Text(label, style = AppFont.body(13f, FontWeight.SemiBold), color = s.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(6.dp))
        Text(value, style = AppFont.display(34f), color = s.ink, maxLines = 1)
        Spacer(Modifier.height(4.dp))
        Text(hint, style = AppFont.body(12f), color = s.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Romanian count: "1 livrare", "3 livrări", "20 de livrări". */
internal fun roCount(n: Int, one: String, many: String): String {
    if (n == 1) return "1 $one"
    val rest = n % 100
    val de = n >= 20 && (rest == 0 || rest >= 20)
    return if (de) "$n de $many" else "$n $many"
}

// ── List cards ─────────────────────────────────────────────────────────

@Composable
private fun ListCard(
    title: String,
    onAll: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val s = HoraeTheme.scheme
    HCard(modifier = modifier, padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                title,
                style = AppFont.body(17f, FontWeight.Bold),
                color = s.ink,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            Row(
                Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(role = Role.Button, onClickLabel = "Vezi toate", onClick = onAll)
                    .heightIn(min = 48.dp)
                    .padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Toate", style = AppFont.body(14f, FontWeight.SemiBold), color = s.primaryText)
                Spacer(Modifier.width(4.dp))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = s.primaryText, modifier = Modifier.size(16.dp))
            }
        }
        content()
    }
}

@Composable
private fun CardDivider(color: Color = HoraeTheme.scheme.border) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(color))
}

@Composable
private fun EmptyRow(text: String) {
    Text(
        text,
        style = AppFont.body(13f),
        color = HoraeTheme.scheme.muted,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
    )
}

@Composable
private fun ProductionCard(
    tasks: List<DashboardRecentTaskDto>,
    onAll: () -> Unit,
    onTask: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    ListCard("Producție acum", onAll, modifier) {
        if (tasks.isEmpty()) {
            CardDivider()
            EmptyRow("Niciun task activ")
        }
        tasks.forEach { task ->
            CardDivider()
            TaskRow(task, onClick = { onTask(task.id) })
        }
    }
}

@Composable
private fun TaskRow(task: DashboardRecentTaskDto, onClick: () -> Unit) {
    val s = HoraeTheme.scheme
    val status = TaskStatus.fromString(task.status)
    val name = task.displayName ?: task.recipeName
    val qty = qtyBadge(task.targetQuantity, task.targetUnit)
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .defaultMinSize(minWidth = 44.dp, minHeight = 44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(s.background)
                .padding(horizontal = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(qty, style = AppFont.display(14f), color = s.ink, maxLines = 1)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(name, style = AppFont.body(14f, FontWeight.SemiBold), color = s.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(task.assignedToName ?: "Nealocat", style = AppFont.body(12f), color = s.muted, maxLines = 1)
            if (status != null) {
                Spacer(Modifier.height(4.dp))
                StageBar(stageFraction(status), StatusPalette.color(status.kind, s))
            }
        }
        if (status != null) {
            Spacer(Modifier.width(10.dp))
            HStatusChip(status)
        }
    }
}

@Composable
private fun StageBar(fraction: Float, tint: Color) {
    val s = HoraeTheme.scheme
    Box(
        Modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(s.border),
    ) {
        if (fraction > 0f) {
            Box(Modifier.fillMaxWidth(fraction).height(4.dp).clip(RoundedCornerShape(2.dp)).background(tint))
        }
    }
}

private fun stageFraction(status: TaskStatus): Float = when (status) {
    TaskStatus.DE_FACUT -> 0f
    TaskStatus.IN_LUCRU -> 0.5f
    TaskStatus.BLOCAT -> 0.5f
    TaskStatus.FINALIZAT -> 1f
    else -> 0f
}

/** "×2" for pieces, "1,5 kg" for weights and volumes. */
private fun qtyBadge(quantity: Double, unitRaw: String?): String {
    val unit = UnitType.fromString(unitRaw)
    return if (unit == null || unit == UnitType.BUCATI) "×${quantity.qtyFormatted()}" else formatQty(quantity, unit)
}

@Composable
private fun OrdersCard(
    orders: List<DashboardOrderDto>,
    onAll: () -> Unit,
    onOrder: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    ListCard("Comenzile de azi", onAll, modifier) {
        if (orders.isEmpty()) {
            CardDivider()
            EmptyRow("Nicio comandă pentru azi")
        }
        orders.forEach { order ->
            CardDivider()
            OrderRow(order, onClick = { onOrder(order.id) })
        }
    }
}

/** Row lines in the owner's order: products, quantities, customer. No order number, no time. */
@Composable
private fun OrderRow(order: DashboardOrderDto, onClick: () -> Unit) {
    val s = HoraeTheme.scheme
    val status = OrderStatus.fromString(order.status)
    val products = order.productNamesLine()
    val quantities = order.quantitiesLine()
    val customer = order.rowCustomer()
    val a11y = listOfNotNull(products, quantities, customer, status?.displayName).joinToString(", ")
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp)
            .clearAndSetSemantics { contentDescription = a11y },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(products, style = AppFont.body(14f, FontWeight.Bold), color = s.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (quantities != null) {
                Text(quantities, style = AppFont.body(12f, FontWeight.SemiBold), color = s.primaryText, maxLines = 1)
            }
            if (customer != null) {
                Text(customer, style = AppFont.body(12f), color = s.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (status != null) {
            Spacer(Modifier.width(10.dp))
            HStatusChip(status)
        }
    }
}

private fun DashboardOrderDto.productNamesLine(): String {
    if (items.isEmpty()) return productCount(itemCount)
    val shown = items.take(2).map { it.recipeName.trim().ifEmpty { it.label.orEmpty().trim() } }
    val rest = items.size - shown.size
    return shown.joinToString(" · ") + if (rest > 0) " +$rest" else ""
}

private fun DashboardOrderDto.quantitiesLine(): String? {
    if (items.isEmpty()) return null
    return items.take(2).joinToString(" · ") { formatQty(it.quantity, it.unit) }
}

private fun DashboardOrderDto.rowCustomer(): String? {
    customerName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val point = deliveryPoint?.trim().orEmpty()
    return point.takeIf { it.isNotEmpty() && !it.equals("WooCommerce", ignoreCase = true) }
}

private fun productCount(n: Int): String = if (n == 1) "1 produs" else roCount(n, "produs", "produse")

// ── Stock alerts (amber) ───────────────────────────────────────────────

@Composable
private fun StockAlertsCard(
    materials: List<LowStockMaterialDto>,
    outOfStock: Int,
    lowStock: Int,
    onOpen: () -> Unit,
    onMaterial: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = HoraeTheme.scheme
    val amber = StatusPalette.fg(StatusKind.WARNING, s.isDark)
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier
            .clip(shape)
            .background(s.card)
            .background(amber.copy(alpha = 0.08f))
            .border(1.dp, amber.copy(alpha = 0.45f), shape),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Warning, null, tint = amber, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                "Alerte stoc",
                style = AppFont.body(15f, FontWeight.Bold),
                color = amber,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            Row(
                Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(role = Role.Button, onClickLabel = "Deschide stocul", onClick = onOpen)
                    .heightIn(min = 48.dp)
                    .padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Stoc", style = AppFont.body(13f, FontWeight.SemiBold), color = amber)
                Spacer(Modifier.width(3.dp))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = amber, modifier = Modifier.size(14.dp))
            }
        }
        Text(
            "$outOfStock epuizat · $lowStock sub minim",
            style = AppFont.body(12f, FontWeight.SemiBold),
            color = s.muted,
            modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 8.dp),
        )
        materials.forEach { m ->
            CardDivider(amber.copy(alpha = 0.2f))
            val isOut = m.status == "OUT_OF_STOCK"
            val tint = StatusPalette.fg(if (isOut) StatusKind.DANGER else StatusKind.WARNING, s.isDark)
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable(role = Role.Button) { onMaterial(m.id) }
                    .heightIn(min = 48.dp)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
                    .semantics(mergeDescendants = true) {},
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(tint))
                Spacer(Modifier.width(10.dp))
                Text(m.name, style = AppFont.body(13f, FontWeight.SemiBold), color = s.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(
                    "${formatQty(m.currentStock, m.unit)} / min ${formatQty(m.minimumStock, m.unit)}",
                    style = AppFont.body(12f, FontWeight.Bold),
                    color = tint,
                    maxLines = 1,
                )
            }
        }
    }
}

// ── Quick create ───────────────────────────────────────────────────────

private data class QuickCreate(val title: String, val icon: ImageVector, val route: String)

private fun quickCreateActions(role: UserRole, canSeeStock: Boolean): List<QuickCreate> = buildList {
    if (PermissionManager.can(role, CASLAction.CREATE, CASLSubject.TASK)) {
        add(QuickCreate("Task nou", Icons.Filled.Assignment, Screen.TaskCreate.route))
    }
    if (PermissionManager.can(role, CASLAction.CREATE, CASLSubject.ORDER)) {
        add(QuickCreate("Comandă nouă", Icons.Filled.ShoppingBag, com.horae.app.ui.orders.OrdersRoutes.CREATE))
    }
    if (PermissionManager.can(role, CASLAction.CREATE, CASLSubject.RECIPE)) {
        add(QuickCreate("Rețetă nouă", Icons.AutoMirrored.Filled.MenuBook, Screen.RecipeCreate.route))
    }
    if (canSeeStock) {
        add(QuickCreate("Intrare în stoc", Icons.Filled.Inventory2, Screen.StockMovementCreate.route))
        add(QuickCreate("Transfer", Icons.Filled.SwapHoriz, Screen.TransferCreate.route))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickCreateSheet(
    actions: List<QuickCreate>,
    onPick: (QuickCreate) -> Unit,
    onDismiss: () -> Unit,
) {
    val s = HoraeTheme.scheme
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = s.card,
    ) {
        Column(Modifier.padding(bottom = 24.dp)) {
            Text(
                "Adaugă",
                style = AppFont.title(22f),
                color = s.ink,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp).semantics { heading() },
            )
            actions.forEach { action ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button) { onPick(action) }
                        .heightIn(min = 56.dp)
                        .padding(horizontal = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(s.primary.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(action.icon, null, tint = s.primaryText, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Text(action.title, style = AppFont.body(16f, FontWeight.SemiBold), color = s.ink)
                }
            }
        }
    }
}
