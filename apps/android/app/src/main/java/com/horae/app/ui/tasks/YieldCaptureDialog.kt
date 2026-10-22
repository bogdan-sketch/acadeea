package com.horae.app.ui.tasks

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.horae.app.ui.theme.Success
import com.horae.app.ui.theme.Warning
import kotlin.math.abs
import com.horae.app.ui.common.qtyFormatted

/** How far the real yield is from the target: ≤ 5 % on target, ≤ 15 % warning, else off. */
enum class YieldBand { ON_TARGET, WARNING, OFF }

/** Live preview of a typed yield ("1,5" and "1.5" both parse — B7) against [target]. */
data class YieldPreview(
    val actual: Double?,
    val varianceAbsolute: Double?,
    val variancePercent: Double?,
) {
    val band: YieldBand?
        get() = variancePercent?.let {
            // Band on the percent as shown (1 decimal): 1,9 of 2 is "-5 %" = on target, even
            // though the double is -5.000000000000004.
            val shown = Math.round(abs(it) * 10.0) / 10.0
            when {
                shown <= 5.0 -> YieldBand.ON_TARGET
                shown <= 15.0 -> YieldBand.WARNING
                else -> YieldBand.OFF
            }
        }
    val isValid: Boolean get() = actual != null && actual > 0
}

fun yieldPreview(text: String, target: Double): YieldPreview {
    val actual = com.horae.app.ui.common.RoFormat.parseDecimal(text)
    val absolute = if (actual != null && target > 0) actual - target else null
    val percent = if (absolute != null) absolute / target * 100.0 else null
    return YieldPreview(actual, absolute, percent)
}

/**
 * Dialog for capturing actual yield when completing a production task.
 * Shows live variance preview with color-coded feedback.
 */
@Composable
fun YieldCaptureDialog(
    targetQuantity: Double,
    targetUnit: String,
    onConfirm: (actualYield: Double) -> Unit,
    onDismiss: () -> Unit,
) {
    var yieldText by remember { mutableStateOf("") }
    val preview = yieldPreview(yieldText, targetQuantity)
    val actualYield = preview.actual
    val varianceAbsolute = preview.varianceAbsolute
    val variancePercent = preview.variancePercent

    val varianceColor = when (preview.band) {
        null -> Color.Unspecified
        YieldBand.ON_TARGET -> Success
        YieldBand.WARNING -> Warning
        YieldBand.OFF -> MaterialTheme.colorScheme.error
    }

    val isValid = preview.isValid

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Înregistrează randamentul")
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                // Target quantity (read-only)
                Text(
                    text = "Cantitate țintă",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "${targetQuantity.qtyFormatted()} $targetUnit",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Actual yield input
                OutlinedTextField(
                    value = yieldText,
                    onValueChange = { newValue ->
                        yieldText = com.horae.app.ui.common.RoFormat.sanitizeDecimalInput(newValue)
                    },
                    label = { Text("Randament efectiv ($targetUnit)") },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Decimal,
                    ),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                // Live variance preview
                if (varianceAbsolute != null && variancePercent != null) {
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = "Varianță: ",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "${if (varianceAbsolute >= 0) "+" else ""}${varianceAbsolute.qtyFormatted()} $targetUnit",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = varianceColor,
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                    ) {
                        Text(
                            text = "Procentaj: ",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = com.horae.app.ui.common.RoFormat.signedPercent(variancePercent),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = varianceColor,
                        )
                    }
                }
            }
        },
        // tasks.transitions.finalize is anchored on the "Finalizează" trigger button in
        // TaskDetailScreen (the one that opens this dialog), not in here — this dialog's content
        // renders in its own Android Window (AlertDialog), so a `.tutorialAnchor()` on this
        // confirm button would report bounds in the wrong root and could stomp the working anchor
        // (same id) with a bogus position while the dialog is open. See CreateOrderDialog.kt for
        // the same reasoning.
        confirmButton = {
            TextButton(
                onClick = { actualYield?.let(onConfirm) },
                enabled = isValid,
            ) {
                Text("Confirmă")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Renunță")
            }
        },
    )
}
