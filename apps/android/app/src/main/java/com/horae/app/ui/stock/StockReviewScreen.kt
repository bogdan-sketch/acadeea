package com.horae.app.ui.stock

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.horae.app.data.repository.StockRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * "Revizie stocuri": one Excel with everything the app keeps as stock, one row
 * per lot, on four sheets. The phone exports and shares it; the corrected file
 * is uploaded back on the web (Stoc › Revizie stocuri). Mirrors iOS StockReviewView.
 */
data class StockReviewUiState(
    val isExporting: Boolean = false,
    val file: ByteArray? = null,
    val error: String? = null,
)

@HiltViewModel
class StockReviewViewModel @Inject constructor(
    private val repository: StockRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(StockReviewUiState())
    val uiState: StateFlow<StockReviewUiState> = _uiState.asStateFlow()

    fun export() {
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true, error = null) }
            try {
                val bytes = repository.stockReviewXlsx()
                _uiState.update { it.copy(isExporting = false, file = bytes) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _uiState.update { it.copy(isExporting = false, error = com.horae.app.data.remote.ApiErrors.userMessage(e, "Exportul a eșuat")) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockReviewScreen(
    navController: NavController,
    viewModel: StockReviewViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Revizie stocuri", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Înapoi")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { pad ->
        Column(
            modifier = Modifier.fillMaxSize().padding(pad).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Materii prime · Consumabile · Semipreparate · Produse finite",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Un lot = un rând, cu furnizor, factură, data expirării, preț de achiziție și cantitate. Stocul fără lot apare ca rând „STOC”.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            val file = state.file
            if (file != null) {
                Button(
                    onClick = { shareXlsx(context, file, "revizie-stocuri", "Revizie stocuri") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text("Trimite fișierul Excel")
                }
                OutlinedButton(onClick = viewModel::export, modifier = Modifier.fillMaxWidth(), enabled = !state.isExporting) {
                    Text("Exportă din nou")
                }
            } else {
                Button(onClick = viewModel::export, modifier = Modifier.fillMaxWidth(), enabled = !state.isExporting) {
                    if (state.isExporting) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                    }
                    Spacer(Modifier.size(8.dp))
                    Text("Exportă Excel")
                }
            }
            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Text(
                "Corectează Cantitate, Preț achiziție, Data expirare sau Furnizor și încarcă fișierul pe web, la Stoc › Revizie stocuri. Se ajustează doar rândurile din fișier, iar aplicația arată raportul cu ce s-a schimbat.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Writes the .xlsx into the cache dir and opens the system share sheet (FileProvider). */
internal fun shareXlsx(context: android.content.Context, bytes: ByteArray, baseName: String, title: String) {
    try {
        val date = java.time.LocalDate.now().toString()
        val file = java.io.File(context.cacheDir, "$baseName-$date.xlsx")
        file.writeBytes(bytes)
        val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            putExtra(android.content.Intent.EXTRA_STREAM, uri)
            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(android.content.Intent.createChooser(intent, title))
    } catch (e: Exception) {
        timber.log.Timber.e(e, "Failed to share the Excel file")
    }
}
