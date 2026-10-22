package com.horae.app.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Task priority (1–5) as a colored triangle with the level drawn inside
 * (mirrors iOS `PriorityBadge` + the web priority badge). Priority 0 (none)
 * renders nothing.
 */
@Composable
fun PriorityBadge(
    priority: Int,
    modifier: Modifier = Modifier,
) {
    if (priority <= 0) return

    val triangleColor = priorityColor(priority)
    // Yellow is too light for a white digit.
    val digitColor = if (priority == 3) Color.Black else Color.White

    Box(
        modifier = modifier
            .size(22.dp)
            .semantics { contentDescription = "Prioritate $priority" },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(22.dp)) {
            val path = Path().apply {
                moveTo(size.width / 2f, 0f)
                lineTo(size.width, size.height)
                lineTo(0f, size.height)
                close()
            }
            drawPath(path = path, color = triangleColor, style = Fill)
        }
        Text(
            text = priority.toString(),
            color = digitColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            // Optical center of a triangle sits below its geometric one.
            modifier = Modifier.offset(y = 3.dp),
        )
    }
}

/** Shared priority color scale (1 blue … 5 red). */
fun priorityColor(level: Int): Color = when (level) {
    1 -> Color(0xFF2196F3) // blue
    2 -> Color(0xFF4CAF50) // green
    3 -> Color(0xFFFFEB3B) // yellow
    4 -> Color(0xFFFF9800) // orange
    5 -> Color(0xFFF44336) // red
    else -> Color(0xFF9E9E9E) // gray (unused for 0 — badge renders nothing)
}
