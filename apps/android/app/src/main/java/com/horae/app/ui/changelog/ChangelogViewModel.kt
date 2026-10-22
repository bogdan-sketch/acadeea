package com.horae.app.ui.changelog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.horae.app.data.remote.dto.ChangelogEntryDto
import com.horae.app.data.repository.ChangelogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

data class ChangelogUiState(
    val entries: List<ChangelogEntryDto> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class ChangelogViewModel @Inject constructor(
    private val repository: ChangelogRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChangelogUiState())
    val uiState: StateFlow<ChangelogUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                val response = repository.getChangelog()
                _uiState.update { it.copy(entries = response.entries, isLoading = false) }
            } catch (e: Exception) {
                Timber.w(e, "Changelog load failed")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }
}
