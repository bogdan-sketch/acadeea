package com.horae.app.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.horae.app.BuildConfig
import com.horae.app.domain.model.User
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.HIconButton
import com.horae.app.ui.common.HSegmentedControl
import com.horae.app.ui.common.HoraeMetrics
import com.horae.app.ui.theme.AppFont
import com.horae.app.ui.theme.HoraeTheme
import com.horae.app.ui.tutorial.tutorialAnchor
import kotlinx.coroutines.launch

/** The two tabs of Profil & setări. */
enum class ProfileTab(val label: String) { DATE("Date"), SETARI("Setări") }

/** Tabs [role] sees: everyone gets Date; only administrators also get Setări (the organisation). */
fun profileTabs(role: UserRole): List<ProfileTab> =
    if (role == UserRole.ADMINISTRATOR) ProfileTab.entries.toList() else listOf(ProfileTab.DATE)

/**
 * Profil & setări — ONE screen with two tabs, like web `/profil` and iOS `ProfileView`:
 * **Date** (the person: name, photo, security, preferences, delete account, Deconectare)
 * and **Setări** (the organisation; administrators only).
 */
@Composable
fun ProfileScreen(
    navController: NavController,
    user: User?,
    role: UserRole,
    onLogout: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val s = HoraeTheme.scheme
    val tabs = profileTabs(role)
    val isAdmin = ProfileTab.SETARI in tabs
    var tab by rememberSaveable { mutableStateOf(ProfileTab.DATE) }
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    /** Section id → y offset inside the scrolling column (Setări anchor chips). */
    val anchors = remember { mutableStateMapOf<String, Int>() }
    var viewportTop by remember { mutableStateOf(0f) }

    LaunchedEffect(viewModel.message) {
        viewModel.message?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }
    LaunchedEffect(tab, isAdmin) {
        if (tab == ProfileTab.SETARI && isAdmin) viewModel.loadSettings(isRoot = isAdmin)
    }

    Box(Modifier.fillMaxSize().onGloballyPositioned { viewportTop = it.positionInRoot().y }) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(horizontal = HoraeMetrics.screenPadding)
                .padding(top = 4.dp, bottom = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(Modifier.widthIn(max = 680.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                HIconButton(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    "Înapoi",
                    { navController.popBackStack() },
                )
                ProfileHeader(user, viewModel.brandingManager.organizationName)
                if (tabs.size > 1) {
                    HSegmentedControl(
                        options = tabs,
                        selected = tab,
                        onSelect = { tab = it },
                        label = { it.label },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (tab == ProfileTab.SETARI && isAdmin) {
                    ProfileSettingsTab(
                        viewModel = viewModel,
                        navController = navController,
                        isRoot = isAdmin,
                        onAnchor = { id, rootY -> anchors[id] = (rootY + scroll.value - viewportTop).toInt() },
                        onJump = { id -> anchors[id]?.let { y -> scope.launch { scroll.animateScrollTo(y) } } },
                    )
                } else {
                    ProfileDateTab(
                        viewModel = viewModel,
                        navController = navController,
                        user = user,
                        role = role,
                        onLogout = onLogout,
                    )
                }
                Text(
                    versionLabel(),
                    style = AppFont.body(12f),
                    color = s.muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(16.dp))
    }
}

/** 64dp avatar, "email" over "rol · firmă", the name in Fraunces. */
@Composable
private fun ProfileHeader(user: User?, orgName: String) {
    if (user == null) return
    val s = HoraeTheme.scheme
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp)
            .semantics(mergeDescendants = true) {}
            .tutorialAnchor("auth.basics.account"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        UserAvatar(user, 64.dp)
        Spacer(Modifier.padding(start = 14.dp))
        Column(Modifier.weight(1f)) {
            Text(user.email, style = AppFont.body(13f, FontWeight.SemiBold), color = s.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(user.roleLabel, orgName).filter { it.isNotBlank() }.joinToString(" · "),
                style = AppFont.body(13f, FontWeight.SemiBold),
                color = s.muted,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                user.fullName.ifBlank { user.email },
                style = AppFont.title(28f),
                color = s.ink,
                modifier = Modifier.semantics { heading() },
            )
        }
    }
}

/** "Horae 1.35.0 (49) · test". */
private fun versionLabel(): String {
    val env = if (BuildConfig.BASE_URL.contains("api-test")) " · test" else ""
    return "${BuildConfig.BRAND_NAME} ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})$env"
}
