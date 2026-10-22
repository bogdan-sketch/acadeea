package com.horae.app.ui.orders

import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.remote.dto.OrderResponse
import com.horae.app.data.repository.OrderRepository
import com.horae.app.ui.common.LoadingOverlay
import com.horae.app.ui.common.formatUnitQty
import com.horae.app.ui.common.qtyFormatted
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import java.io.File
import java.io.FileOutputStream
import javax.inject.Inject

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

@HiltViewModel
class DeliveryNoteViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val orderRepository: OrderRepository,
) : ViewModel() {

    private val orderId: String = savedStateHandle["orderId"] ?: ""

    private val _order = MutableStateFlow<OrderResponse?>(null)
    val order: StateFlow<OrderResponse?> = _order.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadOrder()
    }

    private fun loadOrder() {
        viewModelScope.launch {
            _isLoading.update { true }
            try {
                _order.update { orderRepository.getOrder(orderId) }
            } catch (e: Exception) {
                Timber.e(e, "DeliveryNoteViewModel: failed to load order")
            }
            _isLoading.update { false }
        }
    }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryNoteScreen(
    navController: NavController,
    viewModel: DeliveryNoteViewModel = hiltViewModel(),
) {
    val order by viewModel.order.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                windowInsets = androidx.compose.foundation.layout.WindowInsets(0),
title = { Text("Foaie de parcurs") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Înapoi")
                    }
                },
                actions = {
                    order?.let { o ->
                        IconButton(onClick = { generateAndSharePdf(context, o) }) {
                            Icon(Icons.Default.Share, contentDescription = "Exportă PDF")
                        }
                    }
                },
            )
        },
    ) { innerPadding ->
        when {
            isLoading -> LoadingOverlay()
            order != null -> {
                val o = order!!
                val note = o.deliveryNote

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    if (note != null) {
                        // Delivery info
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Detalii livrare", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                NoteInfoRow("Punct livrare", note.deliveryPoint)
                                NoteInfoRow("Adresă", note.deliveryAddress)
                                NoteInfoRow("Generat la", com.horae.app.ui.common.RoDate.shortDateTime(note.generatedAt))
                            }
                        }

                        // Items
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Produse", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Spacer(modifier = Modifier.height(8.dp))
                                o.items.forEachIndexed { index, item ->
                                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                        Text(item.recipeName, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                        Text(
                                            formatUnitQty(item.quantity, item.unit),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    if (index < o.items.lastIndex) {
                                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                                    }
                                }
                            }
                        }

                        // Signature
                        if (note.hasSignature) {
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("Semnătură", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                    NoteInfoRow("Semnat de", note.signedByName ?: "-")
                                    note.signedAt?.let { NoteInfoRow("Data", com.horae.app.ui.common.RoDate.shortDateTime(it)) }
                                }
                            }
                        }
                    } else {
                        Text("Foaia de parcurs nu a fost generată.", style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun NoteInfoRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(end = 12.dp),
        )
        Text(text = value, style = MaterialTheme.typography.bodyMedium)
    }
}

// ---------------------------------------------------------------------------
// PDF Generation + Share
// ---------------------------------------------------------------------------

private fun generateAndSharePdf(context: Context, order: OrderResponse) {
    val note = order.deliveryNote ?: return

    val pageWidth = 595 // A4
    val pageHeight = 842
    val margin = 50f

    val document = PdfDocument()
    val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
    val page = document.startPage(pageInfo)
    val canvas = page.canvas

    val titlePaint = Paint().apply {
        textSize = 22f
        isFakeBoldText = true
        isAntiAlias = true
    }
    val boldPaint = Paint().apply {
        textSize = 12f
        isFakeBoldText = true
        isAntiAlias = true
    }
    val bodyPaint = Paint().apply {
        textSize = 12f
        isAntiAlias = true
    }
    val headerPaint = Paint().apply {
        textSize = 11f
        isFakeBoldText = true
        isAntiAlias = true
    }
    val cellPaint = Paint().apply {
        textSize = 11f
        isAntiAlias = true
    }
    val linePaint = Paint().apply {
        strokeWidth = 0.5f
        color = android.graphics.Color.GRAY
    }

    var y = margin + titlePaint.textSize

    // Title
    canvas.drawText("${com.horae.app.BuildConfig.BRAND_NAME} — Foaie de parcurs", margin, y, titlePaint)
    y += 35f

    // Order info
    canvas.drawText("Comanda: ${order.displayNumber}", margin, y, boldPaint)
    y += 20f
    canvas.drawText("Data: ${com.horae.app.ui.common.RoDate.fullDateTime(order.createdAt)}", margin, y, bodyPaint)
    y += 20f
    canvas.drawText("Punct livrare: ${order.deliveryPoint}", margin, y, bodyPaint)
    y += 20f
    order.deliveryAddress?.let {
        canvas.drawText("Adresă: $it", margin, y, bodyPaint)
        y += 20f
    }
    y += 15f

    // Table header
    canvas.drawText("Produs", margin, y, headerPaint)
    canvas.drawText("Cantitate", 350f, y, headerPaint)
    canvas.drawText("Unitate", 440f, y, headerPaint)
    y += 18f

    // Separator
    canvas.drawLine(margin, y, pageWidth - margin.toFloat(), y, linePaint)
    y += 8f

    // Items
    for (item in order.items) {
        canvas.drawText(item.recipeName, margin, y, cellPaint)
        canvas.drawText(item.quantity.qtyFormatted(), 350f, y, cellPaint)
        canvas.drawText(com.horae.app.domain.model.UnitType.fromString(item.unit)?.abbreviation ?: item.unit, 440f, y, cellPaint)
        y += 18f
    }

    y += 30f

    // Signature
    if (note.hasSignature) {
        canvas.drawText("Semnat de: ${note.signedByName ?: "-"}", margin, y, boldPaint)
        y += 20f
        note.signedAt?.let {
            canvas.drawText("Data semnarii: $it", margin, y, bodyPaint)
        }
    } else {
        canvas.drawText("Semnătură: ___________________________", margin, y, bodyPaint)
        y += 30f
        canvas.drawText("Numele: ___________________________", margin, y, bodyPaint)
        y += 30f
        canvas.drawText("Data: ___________________________", margin, y, bodyPaint)
    }

    document.finishPage(page)

    // Write to file + share
    try {
        val file = File(context.cacheDir, "FoaieParcurs_${order.orderNumber}.pdf")
        FileOutputStream(file).use { document.writeTo(it) }
        document.close()

        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(shareIntent, "Exportă foaia de parcurs"))
    } catch (e: Exception) {
        Timber.e(e, "Failed to generate/share PDF")
        document.close()
    }
}
