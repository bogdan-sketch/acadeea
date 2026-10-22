package com.horae.app.ui.users

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import com.horae.app.ui.common.ChoiceChips
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.horae.app.data.repository.UserRepository
import com.horae.app.domain.model.UserRole
import com.horae.app.ui.common.ErrorDialog
import dagger.hilt.android.EntryPointAccessors
import androidx.compose.ui.platform.LocalContext
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Hilt entry point so the dialog can grab [UserRepository] without its own ViewModel.
 * This keeps the dialog composable lightweight and self-contained.
 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface InviteUserDialogEntryPoint {
    fun userRepository(): UserRepository
}

/**
 * Dialog for inviting a new user via email with a selected role.
 *
 * @param onDismiss Called when the dialog is cancelled.
 * @param onSuccess Called after a successful invitation; the caller should reload data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InviteUserDialog(
    onDismiss: () -> Unit,
    onSuccess: () -> Unit,
) {
    val context = LocalContext.current.applicationContext
    val entryPoint = remember {
        EntryPointAccessors.fromApplication(context, InviteUserDialogEntryPoint::class.java)
    }
    val userRepository = remember { entryPoint.userRepository() }
    val scope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var selectedRole by remember { mutableStateOf(UserRole.COFETAR) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = {
            if (!isLoading) onDismiss()
        },
        title = { Text("Invită utilizator") },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                // Email field
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        capitalization = KeyboardCapitalization.None,
                    ),
                    enabled = !isLoading,
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Role: chips, never a dropdown.
                Text("Rol", style = MaterialTheme.typography.labelLarge)
                Spacer(modifier = Modifier.height(8.dp))
                ChoiceChips(
                    options = UserRole.entries.toList(),
                    selected = selectedRole,
                    onSelect = { if (!isLoading) selectedRole = it },
                    label = { it.displayName },
                    wrap = true,
                )

                // Inline error message
                if (errorMessage != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = errorMessage!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    scope.launch {
                        isLoading = true
                        errorMessage = null
                        try {
                            userRepository.inviteUser(
                                email = email.trim(),
                                role = selectedRole.name,
                            )
                            isLoading = false
                            onSuccess()
                        } catch (e: Exception) {
                            Timber.e(e, "InviteUserDialog: invite failed")
                            isLoading = false
                            errorMessage = com.horae.app.data.remote.ApiErrors.userMessage(e, "Eroare la trimiterea invitației")
                        }
                    }
                },
                enabled = email.isNotBlank() && !isLoading,
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Trimite")
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isLoading,
            ) {
                Text("Renunta")
            }
        },
    )
}
