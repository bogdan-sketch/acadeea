package com.horae.app.ui.notifications

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.repository.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class NotificationBellViewModel @Inject constructor(
    private val repository: NotificationRepository,
) : ViewModel() {

    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            runCatching { repository.getUnreadCount() }.onSuccess { _unread.value = it }
        }
    }
}

/** Bell button with an unread badge; navigates to the notifications inbox. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationBell(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotificationBellViewModel = hiltViewModel(),
) {
    val unread by viewModel.unread.collectAsState()

    IconButton(onClick = onClick, modifier = modifier) {
        BadgedBox(
            badge = {
                if (unread > 0) {
                    Badge(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ) { Text(if (unread > 99) "99+" else "$unread") }
                }
            },
        ) {
            Icon(
                Icons.Outlined.Notifications,
                contentDescription = "Notificări",
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
