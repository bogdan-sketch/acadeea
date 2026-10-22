package com.horae.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.horae.app.domain.model.MaterialStatus

/** Small coloured badge with a label in [color]. For statuses prefer [HStatusChip]. */
@Composable
fun StatusBadge(
    label: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/**
 * Convenience overload that maps a [MaterialStatus] enum-name string
 * to the correct label and colour automatically.
 */
@Composable
fun StatusBadge(
    statusString: String,
    modifier: Modifier = Modifier,
) {
    val status = MaterialStatus.fromString(statusString)
    if (status != null) HStatusChip(status, modifier) else HStatusChip(statusString, null, modifier)
}
