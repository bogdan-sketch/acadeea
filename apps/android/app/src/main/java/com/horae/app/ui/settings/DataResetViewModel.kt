package com.horae.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.remote.dto.ResetCategoryPreviewDto
import com.horae.app.data.repository.DataResetRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import retrofit2.HttpException
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject

data class DataResetUiState(
    val categories: List<ResetCategoryPreviewDto> = emptyList(),
    val selected: Set<String> = emptySet(),
    val isLoading: Boolean = true,
    val isRunning: Boolean = false,
    val errorMessage: String? = null,
    /** Set after a successful run — the screen shows a snackbar and clears it. */
    val successMessage: String? = null,
) {
    val operational: List<ResetCategoryPreviewDto> get() = categories.filter { !it.danger }
    val danger: List<ResetCategoryPreviewDto> get() = categories.filter { it.danger }

    /** Selection + every transitive dependency. */
    val effectiveKeys: Set<String>
        get() {
            val byKey = categories.associateBy { it.key }
            val out = mutableSetOf<String>()
            fun visit(key: String) {
                if (!out.add(key)) return
                byKey[key]?.requires?.forEach(::visit)
            }
            selected.forEach(::visit)
            return out
        }

    val effective: List<ResetCategoryPreviewDto>
        get() = effectiveKeys.let { keys -> categories.filter { it.key in keys } }

    val effectiveTotal: Int get() = effective.sumOf { it.total }
    val includesDanger: Boolean get() = effective.any { it.danger }

    fun isImplied(category: ResetCategoryPreviewDto): Boolean =
        category.key !in selected && category.key in effectiveKeys

    fun isChecked(category: ResetCategoryPreviewDto): Boolean =
        category.key in selected || isImplied(category)
}

@HiltViewModel
class DataResetViewModel @Inject constructor(
    private val repository: DataResetRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DataResetUiState())
    val uiState: StateFlow<DataResetUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val categories = repository.preview()
                _uiState.update { it.copy(categories = categories, isLoading = false) }
            } catch (e: Exception) {
                Timber.e(e, "DataResetViewModel: preview failed")
                _uiState.update {
                    it.copy(isLoading = false, errorMessage = extractApiMessage(e, "Nu am putut încărca categoriile de date"))
                }
            }
        }
    }

    fun setSelected(key: String, on: Boolean) {
        _uiState.update {
            it.copy(selected = if (on) it.selected + key else it.selected - key)
        }
    }

    fun run() {
        val state = _uiState.value
        if (state.isRunning || state.selected.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isRunning = true, errorMessage = null) }
            try {
                val result = repository.run(state.selected.toList())
                _uiState.update {
                    it.copy(
                        isRunning = false,
                        selected = emptySet(),
                        successMessage = "Datele au fost resetate (${result.total} înregistrări). S-a salvat un backup înainte.",
                    )
                }
                load()
            } catch (e: Exception) {
                Timber.e(e, "DataResetViewModel: run failed")
                _uiState.update {
                    it.copy(isRunning = false, errorMessage = extractApiMessage(e, "Resetarea a eșuat — datele NU au fost modificate"))
                }
            }
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(errorMessage = null, successMessage = null) }
    }

    private fun extractApiMessage(e: Exception, fallback: String): String {
        if (e is HttpException) {
            try {
                val body = e.response()?.errorBody()?.string()
                if (!body.isNullOrBlank()) {
                    when (val message = JSONObject(body).opt("message")) {
                        is String -> if (message.isNotBlank()) return message
                        is JSONArray -> if (message.length() > 0) return message.getString(0)
                    }
                }
            } catch (_: Exception) {
                // fall through
            }
        }
        return if (e is IOException) "Verifică conexiunea la internet" else fallback
    }
}
