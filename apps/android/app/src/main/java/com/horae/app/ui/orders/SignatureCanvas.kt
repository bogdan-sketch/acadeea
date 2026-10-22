package com.horae.app.ui.orders

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import java.io.ByteArrayOutputStream

/**
 * Compose canvas for capturing a handwritten signature.
 */
@Composable
fun SignatureCanvas(
    modifier: Modifier = Modifier,
    paths: List<List<Offset>>,
    currentPath: List<Offset>,
    onDragStart: () -> Unit = {},
    onDrag: (Offset) -> Unit = {},
    onDragEnd: () -> Unit = {},
) {
    Canvas(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { onDragStart() },
                    onDrag = { change, _ ->
                        change.consume()
                        onDrag(change.position)
                    },
                    onDragEnd = { onDragEnd() },
                )
            },
    ) {
        val stroke = Stroke(width = 3f)

        fun drawPathPoints(points: List<Offset>) {
            if (points.size < 2) return
            val path = Path().apply {
                moveTo(points[0].x, points[0].y)
                for (i in 1 until points.size) {
                    lineTo(points[i].x, points[i].y)
                }
            }
            drawPath(path, Color.Black, style = stroke)
        }

        paths.forEach { drawPathPoints(it) }
        if (currentPath.isNotEmpty()) drawPathPoints(currentPath)
    }
}

/**
 * Export signature paths to PNG byte array.
 */
fun exportSignatureAsPng(
    paths: List<List<Offset>>,
    width: Int = 350,
    height: Int = 200,
): ByteArray {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    canvas.drawColor(android.graphics.Color.WHITE)

    val paint = android.graphics.Paint().apply {
        color = android.graphics.Color.BLACK
        strokeWidth = 3f
        style = android.graphics.Paint.Style.STROKE
        isAntiAlias = true
        strokeCap = android.graphics.Paint.Cap.ROUND
        strokeJoin = android.graphics.Paint.Join.ROUND
    }

    for (points in paths) {
        if (points.size < 2) continue
        val path = android.graphics.Path()
        path.moveTo(points[0].x, points[0].y)
        for (i in 1 until points.size) {
            path.lineTo(points[i].x, points[i].y)
        }
        canvas.drawPath(path, paint)
    }

    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
    bitmap.recycle()
    return stream.toByteArray()
}

// ---------------------------------------------------------------------------
// Signature capture dialog
// ---------------------------------------------------------------------------

@Composable
fun SignatureCaptureDialog(
    onDismiss: () -> Unit,
    onSign: (name: String, imageData: ByteArray) -> Unit,
) {
    var signedByName by remember { mutableStateOf("") }
    val paths = remember { mutableStateListOf<List<Offset>>() }
    var currentPath by remember { mutableStateOf<List<Offset>>(emptyList()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Semnătură la predare") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = signedByName,
                    onValueChange = { signedByName = it },
                    label = { Text("Numele persoanei") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                SignatureCanvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    paths = paths,
                    currentPath = currentPath,
                    onDragStart = { currentPath = emptyList() },
                    onDrag = { offset -> currentPath = currentPath + offset },
                    onDragEnd = {
                        if (currentPath.isNotEmpty()) {
                            paths.add(currentPath.toList())
                            currentPath = emptyList()
                        }
                    },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    OutlinedButton(onClick = {
                        paths.clear()
                        currentPath = emptyList()
                    }) { Text("Șterge") }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val imageData = exportSignatureAsPng(paths)
                    onSign(signedByName, imageData)
                },
                enabled = signedByName.isNotBlank() && paths.isNotEmpty(),
            ) { Text("Confirmă") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Anulează") }
        },
    )
}
