package com.horae.app.ui.users

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PersonOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.UserResponse
import com.horae.app.data.repository.UserRepository
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import com.horae.app.ui.common.HoraeStatusBadge
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.navigation.Screen
import com.horae.app.ui.theme.Error
import com.horae.app.ui.tutorial.tutorialAnchor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

data class UserListUiState(
    val users: List<UserResponse> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val showActive: Boolean = true,
    val hasNextPage: Boolean = false,
    val page: Int = 1,
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@OptIn(FlowPreview::class)
@HiltViewModel
class UserListViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(UserListUiState())
    val uiState: StateFlow<UserListUiState> = _uiState.asStateFlow()

    /** Separate flow so we can debounce search independently. */
    private val _searchQuery = MutableStateFlow("")

    init {
        loadInitial()

        // Debounce search input, then reload from page 1
        viewModelScope.launch {
            _searchQuery
                .debounce(350)
                .distinctUntilChanged()
                .collectLatest { query ->
                    _uiState.update { it.copy(search = query, page = 1, users = emptyList()) }
                    fetchUsers(page = 1, append = false)
                }
        }
    }

    // -- Public actions ------------------------------------------------------

    fun loadInitial() {
        _uiState.update { it.copy(page = 1, users = emptyList()) }
        fetchUsers(page = 1, append = false)
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoading || state.isLoadingMore || !state.hasNextPage) return
        val nextPage = state.page + 1
        fetchUsers(page = nextPage, append = true)
    }

    fun onSearchChange(query: String) {
        _searchQuery.value = query
        // Update the displayed text immediately (fetch is debounced)
        _uiState.update { it.copy(search = query) }
    }

    fun toggleActive() {
        val newValue = !_uiState.value.showActive
        _uiState.update {
            it.copy(showActive = newValue, page = 1, users = emptyList())
        }
        fetchUsers(page = 1, append = false)
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    // -- Private helpers -----------------------------------------------------

    private fun fetchUsers(page: Int, append: Boolean) {
        viewModelScope.launch {
            _uiState.update {
                if (append) it.copy(isLoadingMore = true)
                else it.copy(isLoading = true)
            }
            try {
                val response = userRepository.getUsers(
                    page = page,
                    isActive = _uiState.value.showActive,
                    search = _uiState.value.search.takeIf { it.isNotBlank() },
                )
                _uiState.update { state ->
                    state.copy(
                        users = if (append) state.users + response.data else response.data,
                        isLoading = false,
                        isLoadingMore = false,
                        hasNextPage = response.hasNextPage,
                        page = page,
                        error = null,
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "UserListViewModel: failed to fetch users")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isLoadingMore = false,
                        error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la încărcarea utilizatorilor"),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Screen Composable
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserListScreen(
    navController: NavController,
    role: UserRole = UserRole.AJUTOR_COFETAR,
    viewModel: UserListViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var showInviteDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Utilizatori") },
                actions = {
                    // Roles administration — admin only (same gate as other admin UI)
                    if (role == UserRole.ADMINISTRATOR) {
                        TextButton(
                            onClick = { navController.navigate(Screen.RoleList.route) },
                            modifier = Modifier.tutorialAnchor("users.roles.permissions"),
                        ) {
                            Text("Roluri")
                        }
                    }
                    IconButton(
                        onClick = { showInviteDialog = true },
                        modifier = Modifier.tutorialAnchor("users.roles.invite"),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Invită utilizator",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // Segmented button: Activi / Inactivi
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                SegmentedButton(
                    selected = uiState.showActive,
                    onClick = { if (!uiState.showActive) viewModel.toggleActive() },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                ) {
                    Text("Activi")
                }
                SegmentedButton(
                    selected = !uiState.showActive,
                    onClick = { if (uiState.showActive) viewModel.toggleActive() },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                ) {
                    Text("Inactivi")
                }
            }

            // Search field
            OutlinedTextField(
                value = uiState.search,
                onValueChange = viewModel::onSearchChange,
                placeholder = { Text("Caută utilizatori...") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Content
            when {
                uiState.isLoading && uiState.users.isEmpty() -> {
                    LoadingOverlay()
                }

                !uiState.isLoading && uiState.users.isEmpty() -> {
                    EmptyUserState()
                }

                else -> {
                    UserList(
                        users = uiState.users,
                        isLoadingMore = uiState.isLoadingMore,
                        hasNextPage = uiState.hasNextPage,
                        onLoadMore = viewModel::loadMore,
                        onUserClick = { user ->
                            navController.navigate(Screen.UserDetail.createRoute(user.id))
                        },
                    )
                }
            }
        }
    }

    // Error dialog
    uiState.error?.let { errorMessage ->
        ErrorDialog(
            message = errorMessage,
            onDismiss = viewModel::clearError,
        )
    }

    // Invite dialog
    if (showInviteDialog) {
        InviteUserDialog(
            onDismiss = { showInviteDialog = false },
            onSuccess = {
                showInviteDialog = false
                viewModel.loadInitial()
            },
        )
    }
}

// ---------------------------------------------------------------------------
// User list with infinite scroll
// ---------------------------------------------------------------------------

@Composable
private fun UserList(
    users: List<UserResponse>,
    isLoadingMore: Boolean,
    hasNextPage: Boolean,
    onLoadMore: () -> Unit,
    onUserClick: (UserResponse) -> Unit,
) {
    val listState = rememberLazyListState()

    // Detect when the user scrolls near the end
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            val totalItems = listState.layoutInfo.totalItemsCount
            lastVisibleItem >= totalItems - 3 && hasNextPage && !isLoadingMore
        }
    }

    LaunchedEffect(shouldLoadMore) {
        snapshotFlow { shouldLoadMore }.collectLatest { load ->
            if (load) onLoadMore()
        }
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
    ) {
        items(
            items = users,
            key = { it.id },
        ) { user ->
            UserListItem(
                user = user,
                onClick = { onUserClick(user) },
            )
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
        }

        // Loading more indicator
        if (isLoadingMore) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Single user row — avatar + name/email + role badge (+ inactive badge)
// ---------------------------------------------------------------------------

@Composable
private fun UserListItem(
    user: UserResponse,
    onClick: () -> Unit,
) {
    val roleLabel = user.role?.name?.takeIf { it.isNotBlank() }
        ?: UserRole.fromString(user.role?.slug ?: "").displayName

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        InitialsAvatar(user.firstName, user.lastName, faded = !user.isActive)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = user.fullName,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = user.email,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        if (user.isActive) {
            HoraeStatusBadge(label = roleLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            HoraeStatusBadge(label = "Inactiv", color = Error)
        }
    }
}

@Composable
private fun InitialsAvatar(firstName: String, lastName: String, faded: Boolean) {
    val initials = buildString {
        firstName.firstOrNull()?.let { append(it.uppercaseChar()) }
        lastName.firstOrNull()?.let { append(it.uppercaseChar()) }
    }.ifBlank { "?" }
    Box(
        modifier = Modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(
                if (faded) MaterialTheme.colorScheme.surfaceVariant
                else MaterialTheme.colorScheme.primary,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = if (faded) MaterialTheme.colorScheme.onSurfaceVariant
            else MaterialTheme.colorScheme.onPrimary,
        )
    }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

@Composable
private fun EmptyUserState() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.PersonOff,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Niciun utilizator",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
