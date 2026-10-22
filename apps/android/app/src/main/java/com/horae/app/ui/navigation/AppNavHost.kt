package com.horae.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.ui.graphics.compositeOver
import com.horae.app.ui.common.accentGradientBackground
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.horae.app.domain.model.User
import com.horae.app.domain.model.UserRole
import com.horae.app.observability.Analytics
import androidx.compose.animation.Crossfade
import com.horae.app.ui.auth.LoginViewModel
import com.horae.app.ui.common.PRELOADER_HOLD_MS
import com.horae.app.ui.common.PRELOADER_MIN_DURATION_MS
import com.horae.app.ui.common.PreloaderScreen
import com.horae.app.ui.common.SplashLoginScreen
import com.horae.app.ui.dashboard.DashboardScreen
import com.horae.app.ui.equipment.EquipmentListScreen
import com.horae.app.ui.locations.LocationDashboardScreen
import com.horae.app.ui.locations.LocationListScreen
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import com.horae.app.ui.changelog.ChangelogScreen
import com.horae.app.ui.changelog.WhatsNewViewModel
import com.horae.app.ui.help.HelpCenterScreen
import com.horae.app.ui.settings.DataResetScreen
import com.horae.app.ui.profile.CurrentUserStore
import com.horae.app.ui.profile.ProfileScreen
import com.horae.app.ui.tutorial.TutorialOverlay
import com.horae.app.ui.tasks.tasksGraph
import com.horae.app.ui.stock.stockGraph
import com.horae.app.ui.recipes.recipesGraph
import com.horae.app.ui.orders.ordersGraph
import com.horae.app.ui.roles.RoleEditorScreen
import com.horae.app.ui.roles.RoleListScreen
import com.horae.app.ui.users.UserDetailScreen
import com.horae.app.ui.users.UserListScreen
import kotlinx.coroutines.delay

/**
 * Root navigation host. Handles auth gate and main app shell with bottom nav.
 */
@Composable
fun AppNavHost() {
    val loginViewModel: LoginViewModel = hiltViewModel()
    val uiState by loginViewModel.uiState.collectAsState()

    val isAuthenticated = uiState.isAuthenticated
    val isRestoringSession = uiState.isRestoringSession

    // Designer's splash plays for AT LEAST the 2.5s formation + a ~400ms hold on the finished
    // vortex (fixed duration, continues automatically — never "until tap"). Once it's done we
    // either reveal the login form (logged out) or fade into the app (logged in).
    // rememberSaveable so a config change (rotation) doesn't replay the splash.
    var formationDone by rememberSaveable { mutableStateOf(false) }

    // Attempt session restore on first composition + arm the formation timer.
    LaunchedEffect(Unit) {
        loginViewModel.tryRestoreSession()
        if (!formationDone) {
            delay(PRELOADER_MIN_DURATION_MS + PRELOADER_HOLD_MS)
            formationDone = true
        }
    }

    val accentColor = loginViewModel.brandingManager.accentColor
    // Only enter the app once authenticated AND the brand moment has played.
    val showApp = isAuthenticated && formationDone

    Crossfade(targetState = showApp, label = "rootSplashToApp") { inApp ->
        when {
            inApp -> MainAppShell(
                // A Profil edit (name, photo) shows at once, before the next /auth/me.
                user = CurrentUserStore.resolve(uiState.user),
                role = uiState.user?.role ?: UserRole.AJUTOR_COFETAR,
                // Logout flips isAuthenticated → the crossfade returns to the splash/login;
                // formation already played, so the login form is shown straight away.
                onLogout = { loginViewModel.logout() },
            )
            // Still deciding whether a session exists — plain brand splash, no form yet.
            isRestoringSession -> PreloaderScreen(accentColor = accentColor)
            // Logged out: the same splash reveals the login form once the vortex has formed.
            else -> SplashLoginScreen(
                accentColor = accentColor,
                showLogin = formationDone,
                viewModel = loginViewModel,
            )
        }
    }
}

@Composable
private fun MainAppShell(
    user: User?,
    role: UserRole,
    onLogout: () -> Unit,
) {
    val innerNavController = rememberNavController()
    val navBackStackEntry by innerNavController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // PostHog screen tracking: emit a `$screen` event whenever the active route changes.
    // Null-safe and a no-op when analytics is disabled.
    LaunchedEffect(currentRoute) {
        currentRoute?.let { Analytics.screen(it) }
    }

    // Tutorial content is a small public payload (same shape as changelog) — prefetch it once
    // per session so a live coachmark can start the moment the user opens the help center or an
    // anchored screen, no matter whether tutorial mode ends up on for this org.
    val tutorialCenter = com.horae.app.ui.tutorial.rememberTutorialCenter()
    LaunchedEffect(Unit) { tutorialCenter.ensureContentLoaded() }
    // Tutorial mode is a per-user, per-device local preference — (re)load this user's
    // enabled/dismissed state whenever the signed-in user changes.
    LaunchedEffect(user?.id) { tutorialCenter.setCurrentUser(user?.id) }
    // Per-screen "Ascunde sfaturile" + any lingering long-press peek only apply to the screen
    // they were triggered on — clear both whenever the active route changes (same signal PostHog
    // screen-tracking already uses above).
    LaunchedEffect(currentRoute) { tutorialCenter.onRouteChanged(currentRoute) }

    // Determine which tabs are bottom-nav roots
    val bottomNavRoutes = bottomNavItems(role).map { it.route }.toSet()

    // One-time "Ce e nou" popup (staging builds), with a link to the full
    // multi-version changelog so tracking works from mobile too.
    val whatsNewViewModel: WhatsNewViewModel = hiltViewModel()
    val whatsNewEntry by whatsNewViewModel.entry.collectAsState()
    whatsNewEntry?.let { entry ->
        AlertDialog(
            onDismissRequest = { whatsNewViewModel.markSeen() },
            title = { Text("Ce e nou în v${entry.version}") },
            text = {
                Column {
                    Text(entry.title, style = MaterialTheme.typography.bodyMedium)
                    entry.highlights.forEach { h ->
                        Spacer(Modifier.height(6.dp))
                        Text("• $h", style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { whatsNewViewModel.markSeen() }) { Text("Am înțeles") }
            },
            dismissButton = {
                TextButton(onClick = {
                    whatsNewViewModel.markSeen()
                    innerNavController.navigate(Screen.Changelog.route)
                }) { Text("Vezi toate noutățile") }
            },
        )
    }

    // Panou: the accent gradient starts behind the status bar (spec T8); other screens
    // keep the paper there.
    val scheme = com.horae.app.ui.theme.HoraeTheme.scheme
    val shellColor = if (currentRoute == Screen.Dashboard.route) {
        scheme.primary.copy(alpha = 0.30f).compositeOver(scheme.background)
    } else {
        scheme.background
    }

    Box(Modifier.fillMaxSize()) {
    Scaffold(
        containerColor = shellColor,
        bottomBar = {
            if (currentRoute in bottomNavRoutes) {
                BottomNavBar(
                    currentRoute = currentRoute,
                    role = role,
                    onNavigate = { route ->
                        val start = innerNavController.graph.findStartDestination()
                        if (route == start.route) {
                            // "Acasă" = the start destination: navigate(start) with
                            // saveState/restoreState is a no-op in some stack states
                            // (the home button "did nothing"). Pop back to it instead.
                            innerNavController.popBackStack(start.id, inclusive = false)
                        } else {
                            innerNavController.navigate(route) {
                                popUpTo(start.id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    },
                )
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = innerNavController,
            startDestination = Screen.Dashboard.route,
            // consumeWindowInsets: a screen's own TopAppBar must not add the status bar
            // inset a second time (B17, the empty band under the status bar).
            modifier = Modifier.padding(innerPadding).consumeWindowInsets(innerPadding),
        ) {
            // Dashboard
            composable(Screen.Dashboard.route) {
                Box(Modifier.fillMaxSize().accentGradientBackground()) {
                    DashboardScreen(navController = innerNavController, user = user, role = role)
                }
            }

            composable(Screen.Notifications.route) {
                com.horae.app.ui.notifications.NotificationInboxScreen(navController = innerNavController)
            }

            composable(Screen.Analytics.route) {
                com.horae.app.ui.analytics.AnalyticsDashboardScreen(navController = innerNavController)
            }

            composable(Screen.IntegrationList.route) {
                com.horae.app.ui.integrations.IntegrationsListScreen(navController = innerNavController)
            }
            composable(Screen.IntegrationDetail.route) {
                com.horae.app.ui.integrations.IntegrationDetailScreen(navController = innerNavController)
            }

            // Tasks
            tasksGraph(innerNavController, role)

            // Recipes
            recipesGraph(innerNavController, role)

            // Stock, Vânzări → stoc, transfers
            stockGraph(innerNavController, role)

            // Orders
            ordersGraph(innerNavController, role)

            // Users
            composable(Screen.UserList.route) {
                UserListScreen(navController = innerNavController, role = role)
            }
            composable(Screen.UserDetail.route) {
                UserDetailScreen(navController = innerNavController)
            }

            // Roles (admin — entry point gated in UserListScreen)
            composable(Screen.RoleList.route) {
                RoleListScreen(navController = innerNavController)
            }
            composable(Screen.RoleCreate.route) {
                RoleEditorScreen(navController = innerNavController)
            }
            composable(Screen.RoleEdit.route) {
                RoleEditorScreen(navController = innerNavController)
            }

            // Profil & setări (Date | Setări)
            composable(Screen.Settings.route) {
                ProfileScreen(
                    navController = innerNavController,
                    user = user,
                    role = role,
                    onLogout = onLogout,
                )
            }
            composable(Screen.DataReset.route) {
                DataResetScreen(navController = innerNavController)
            }

            composable(Screen.Changelog.route) {
                ChangelogScreen()
            }

            // Locations
            composable(Screen.LocationList.route) {
                LocationListScreen(navController = innerNavController, role = role)
            }
            composable(Screen.LocationDashboard.route) { backStackEntry ->
                val locationId = backStackEntry.arguments?.getString("id") ?: ""
                LocationDashboardScreen(
                    locationId = locationId,
                    onBack = { innerNavController.popBackStack() },
                )
            }

            // Equipment
            composable(Screen.EquipmentList.route) {
                EquipmentListScreen(
                    onBack = { innerNavController.popBackStack() },
                    onDetail = {},
                )
            }

            // Tutorial / help center
            composable(Screen.HelpCenter.route) {
                HelpCenterScreen(onBack = { innerNavController.popBackStack() })
            }
        }
    }
    TutorialOverlay()
    }
}
