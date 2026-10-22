package com.horae.app.ui.common

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

/**
 * Reusable error dialog matching the iOS ErrorAlertModifier pattern.
 */
@Composable
fun ErrorDialog(
    title: String = "Eroare",
    message: String,
    confirmText: String = "Am înțeles",
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(confirmText)
            }
        },
    )
}
